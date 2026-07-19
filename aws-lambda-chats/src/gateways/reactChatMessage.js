const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const { buildReactionMessageWsPayload, nowIso } = require("../utils/chatMessageContract");
const {
  getConnectionAuthenticatedUserId,
  assertUserIsRoomParticipant,
} = require("../utils/wsConnectionUser");
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { broadcastJsonToRoomChannel } = require("../utils/wsBroadcastRoom");
const { resolveWsManagementApiEndpoint } = require("../utils/resolveWsManagementApiEndpoint");

const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "ChatMessage";

const ALLOWED_EMOJIS = new Set(["👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🔥"]);

async function loadMessageByRoomAndId(roomId, messageId) {
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

async function updateChatMessageItem(key, params) {
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

function normalizeReactions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const userId = String(item.userId || item.user_id || "").trim();
      const emoji = String(item.emoji || "").trim();
      if (!userId || !emoji) return null;
      return {
        userId,
        emoji,
        createdAt: item.createdAt || item.updatedAt || nowIso(),
      };
    })
    .filter(Boolean);
}

function toggleReaction(reactions, userId, emoji) {
  const list = normalizeReactions(reactions);
  const idx = list.findIndex((r) => r.userId === userId);
  const normalizedEmoji = String(emoji || "").trim();

  if (!normalizedEmoji || !ALLOWED_EMOJIS.has(normalizedEmoji)) {
    if (idx >= 0) list.splice(idx, 1);
    return list;
  }

  if (idx >= 0 && list[idx].emoji === normalizedEmoji) {
    list.splice(idx, 1);
    return list;
  }

  const entry = { userId, emoji: normalizedEmoji, createdAt: nowIso() };
  if (idx >= 0) {
    list[idx] = entry;
  } else {
    list.push(entry);
  }
  return list;
}

exports.handler = async (event) => {
  try {
    const body = parseLambdaJsonBody(event);
    const roomId = String(body.roomId ?? "").trim();
    const messageId = String(body.id ?? body.messageId ?? "").trim();
    const emoji = body.emoji == null ? "" : String(body.emoji).trim();

    if (!roomId || !messageId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "roomId e id son obligatorios" }),
      };
    }

    if (!event.requestContext?.connectionId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "reactChatMessage requiere conexión WebSocket",
        }),
      };
    }

    const existing = await loadMessageByRoomAndId(roomId, messageId);
    if (
      !existing ||
      (existing.roomId != null && String(existing.roomId).trim() !== roomId)
    ) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Mensaje no encontrado" }),
      };
    }

    if (existing.status === "deleted" || existing.deletedAt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No se puede reaccionar a un mensaje eliminado" }),
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

    await assertUserIsRoomParticipant(docClient, roomId, authId);

    const reactions = toggleReaction(existing.reactions, authId, emoji);
    const updatedAt = nowIso();
    const key = buildMessageKey(existing);

    const result = await updateChatMessageItem(key, {
      UpdateExpression: "SET reactions = :reactions, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":reactions": reactions,
        ":updatedAt": updatedAt,
      },
      ReturnValues: "ALL_NEW",
    });

    const attrs = result.Attributes || {};
    const requestContext = event.requestContext || {};
    const { domainName, stage } = resolveWsManagementApiEndpoint(requestContext);

    const payload = buildReactionMessageWsPayload({
      id: attrs.id,
      roomId: attrs.roomId || roomId,
      reactions: attrs.reactions || [],
      updatedAt: attrs.updatedAt || updatedAt,
    });

    if (domainName) {
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
        message: "Reaction updated",
        id: attrs.id,
        roomId: attrs.roomId || roomId,
        reactions: attrs.reactions || [],
        updatedAt: attrs.updatedAt || updatedAt,
      }),
    };
  } catch (error) {
    console.error("Error in reactChatMessage handler:", error);
    const code = error.statusCode || 500;
    return {
      statusCode: code,
      body: JSON.stringify({
        error: error.message || "Internal server error",
      }),
    };
  }
};
