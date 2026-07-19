const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const {
  buildEditMessageWsPayload,
  nowIso,
} = require("../utils/chatMessageContract");
const {
  getConnectionAuthenticatedUserId,
  assertUserIsRoomParticipant,
  buildChatSenderDisplay,
} = require("../utils/wsConnectionUser");
const { isRoomAdmin } = require("../utils/chatRoomAdmin");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { broadcastJsonToRoomChannel } = require("../utils/wsBroadcastRoom");
const { resolveWsManagementApiEndpoint } = require("../utils/resolveWsManagementApiEndpoint");

const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "ChatMessage";

async function loadMessageByRoomAndId(docClient, roomId, messageId) {
  let lastKey;
  do {
    const res = await docClient
      .query({
        TableName: MESSAGES_TABLE,
        IndexName: "RoomIndex",
        KeyConditionExpression: "roomId = :rid",
        ExpressionAttributeValues: { ":rid": roomId },
        ExclusiveStartKey: lastKey,
      })
      .promise();
    const found = (res.Items || []).find((m) => m.id === messageId);
    if (found) return found;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return null;
}

function buildMessageKey(existing) {
  const key = { id: existing.id };
  if (existing.createdAt != null && existing.createdAt !== "") {
    key.createdAt = existing.createdAt;
  }
  return key;
}

async function updateChatMessageItem(docClient, key, params) {
  try {
    return await docClient
      .update({
        TableName: MESSAGES_TABLE,
        Key: key,
        ...params,
      })
      .promise();
  } catch (e) {
    if (
      e &&
      e.code === "ValidationException" &&
      key.createdAt != null &&
      Object.keys(key).length > 1
    ) {
      return await docClient
        .update({
          TableName: MESSAGES_TABLE,
          Key: { id: key.id },
          ...params,
        })
        .promise();
    }
    throw e;
  }
}

exports.handler = async (event) => {
  try {
    const body = parseLambdaJsonBody(event);
    const roomId = String(body.roomId ?? "").trim();
    const { id, newText, deletedAt } = body;
    let { updatedAt } = body;

    if (!roomId || !id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "roomId e id son obligatorios" }),
      };
    }

    if (!event.requestContext?.connectionId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "editChatMessage requiere conexión WebSocket",
        }),
      };
    }

    const existing = await loadMessageByRoomAndId(docClient, roomId, id);
    if (
      !existing ||
      (existing.roomId != null && String(existing.roomId).trim() !== roomId)
    ) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Mensaje no encontrado" }),
      };
    }

    const authId = await getConnectionAuthenticatedUserId(
      docClient,
      event.requestContext.connectionId,
    );
    if (!authId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Conexión no autenticada" }),
      };
    }
    const room = await assertUserIsRoomParticipant(docClient, roomId, authId);
    await assertEventChatRoomIsOpen(docClient, room);
    const isAuthor = String(existing.sender || "").trim() === authId;
    const isDelete = Boolean(deletedAt);
    const isAdmin = isRoomAdmin(room, authId);

    if (isDelete && !isAuthor && !isAdmin) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Solo el autor o un administrador puede eliminar este mensaje",
        }),
      };
    }

    if (!isDelete && !isAuthor) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "No autorizado a editar este mensaje",
        }),
      };
    }

    const updatedAtFinal = updatedAt || nowIso();
    const textFinal = isDelete
      ? newText !== undefined && newText !== null
        ? String(newText)
        : ""
      : newText !== undefined && newText !== null
        ? String(newText)
        : existing.text;
    const statusFinal = isDelete ? "deleted" : "edited";
    const deletedAtFinal = isDelete ? deletedAt || updatedAtFinal : null;

    const key = buildMessageKey(existing);

    const exprNames = { "#T": "text", "#ST": "status" };
    const exprValues = {
      ":t": textFinal,
      ":s": statusFinal,
      ":updatedAt": updatedAtFinal,
      ":deletedAt": deletedAtFinal != null ? deletedAtFinal : "",
    };

    const updateExpression =
      "SET #T = :t, #ST = :s, updatedAt = :updatedAt, deletedAt = :deletedAt";

    const result = await updateChatMessageItem(docClient, key, {
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: "ALL_NEW",
    });

    const attrs = result.Attributes || {};

    const requestContext = event.requestContext || {};
    const { domainName, stage } = resolveWsManagementApiEndpoint(requestContext);
    const canBroadcastWs = Boolean(domainName);

    const sender = await buildChatSenderDisplay(s3, attrs.sender);

    const payload = buildEditMessageWsPayload({
      id: attrs.id,
      roomId: attrs.roomId || roomId,
      text: attrs.text,
      newText: attrs.text,
      status: attrs.status,
      updatedAt: attrs.updatedAt,
      deletedAt: attrs.deletedAt,
      createdAt: attrs.createdAt,
      sender,
      clientMessageId: attrs.clientMessageId ?? null,
      action: "editChatMessage",
    });

    if (canBroadcastWs) {
      await broadcastJsonToRoomChannel({
        docClient,
        domainName,
        stage,
        channelId: roomId,
        payload,
        requestContext,
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Message updated successfully",
        id: attrs.id,
        roomId: attrs.roomId || roomId,
        text: attrs.text,
        status: attrs.status,
        updatedAt: attrs.updatedAt,
        deletedAt: attrs.deletedAt,
        clientMessageId: attrs.clientMessageId ?? undefined,
        createdAt: attrs.createdAt,
      }),
    };
  } catch (error) {
    console.error("Error in editChatMessage handler:", error);
    const code = error.statusCode || 500;
    return {
      statusCode: code,
      body: JSON.stringify({
        error: error.message || "Internal server error",
      }),
    };
  }
};
