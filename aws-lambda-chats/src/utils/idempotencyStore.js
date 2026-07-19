const AWS = require("aws-sdk");

const IDEMPOTENCY_ENABLED =
  String(process.env.ENABLE_CHAT_IDEMPOTENCY || "true").toLowerCase() !==
  "false";
const IDEMPOTENCY_TABLE =
  process.env.CHAT_IDEMPOTENCY_TABLE || "ChatMessageIdempotency";
const IDEMPOTENCY_TTL_SECONDS = Number(process.env.CHAT_IDEMPOTENCY_TTL_SECONDS || 86400 * 7);

function buildIdempotencyKey({ roomId, userId, clientMessageId }) {
  return `${String(roomId)}#${String(userId)}#${String(clientMessageId)}`;
}

function isConditionalCheckFailed(error) {
  return (
    error &&
    (error.code === "ConditionalCheckFailedException" ||
      error.name === "ConditionalCheckFailedException")
  );
}

function isMissingTable(error) {
  return error && (error.code === "ResourceNotFoundException" || error.statusCode === 400);
}

async function reserveMessageIdempotency({
  docClient,
  roomId,
  userId,
  clientMessageId,
  serverMessageId,
}) {
  if (!IDEMPOTENCY_ENABLED || !clientMessageId) {
    return {
      enabled: false,
      reserved: false,
      duplicate: false,
      idempotencyKey: null,
      existingServerMessageId: null,
    };
  }

  const idempotencyKey = buildIdempotencyKey({ roomId, userId, clientMessageId });
  const now = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;

  try {
    await docClient
      .put({
        TableName: IDEMPOTENCY_TABLE,
        Item: {
          idempotencyKey,
          roomId: String(roomId),
          userId: String(userId),
          clientMessageId: String(clientMessageId),
          serverMessageId: String(serverMessageId),
          status: "processing",
          createdAt: now,
          updatedAt: now,
          ttl,
        },
        ConditionExpression: "attribute_not_exists(idempotencyKey)",
      })
      .promise();

    return {
      enabled: true,
      reserved: true,
      duplicate: false,
      idempotencyKey,
      existingServerMessageId: null,
    };
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      try {
        const existing = await docClient
          .get({
            TableName: IDEMPOTENCY_TABLE,
            Key: { idempotencyKey },
          })
          .promise();
        const item = existing && existing.Item ? existing.Item : null;
        return {
          enabled: true,
          reserved: false,
          duplicate: true,
          idempotencyKey,
          existingServerMessageId: item ? item.serverMessageId || null : null,
          existingStatus: item ? item.status || null : null,
        };
      } catch (readError) {
        console.error("idempotency reserve read existing failed:", readError);
      }

      return {
        enabled: true,
        reserved: false,
        duplicate: true,
        idempotencyKey,
        existingServerMessageId: null,
        existingStatus: null,
      };
    }

    if (isMissingTable(error)) {
      console.warn(
        "idempotency table missing; continuing without idempotency guard:",
        IDEMPOTENCY_TABLE,
      );
      return {
        enabled: false,
        reserved: false,
        duplicate: false,
        idempotencyKey: null,
        existingServerMessageId: null,
      };
    }

    throw error;
  }
}

async function markMessageIdempotencyCommitted({ docClient, idempotencyKey }) {
  if (!idempotencyKey) return;

  await docClient
    .update({
      TableName: IDEMPOTENCY_TABLE,
      Key: { idempotencyKey },
      UpdateExpression: "SET #st = :st, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":st": "committed",
        ":updatedAt": new Date().toISOString(),
      },
    })
    .promise();
}

async function releaseMessageIdempotency({ docClient, idempotencyKey }) {
  if (!idempotencyKey) return;

  await docClient
    .delete({
      TableName: IDEMPOTENCY_TABLE,
      Key: { idempotencyKey },
    })
    .promise();
}

module.exports = {
  reserveMessageIdempotency,
  markMessageIdempotencyCommitted,
  releaseMessageIdempotency,
};
