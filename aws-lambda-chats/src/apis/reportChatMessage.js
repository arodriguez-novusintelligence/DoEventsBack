const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { invokeTriggerNotification } = require("../utils/invokeNotificationsLambda");
const {
  getActiveRoomByRoomId,
  normalizeAdminIds,
  idsMatch,
} = require("../utils/chatRoomAdmin");
const { getClientByUserId } = require("../utils/clientUserLookup");
const { optionsResponse } = require("../utils/corsHttp");

const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "ChatMessage";

function parseHttpBody(event) {
  if (event.body == null) return {};
  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body || "{}");
    } catch {
      return {};
    }
  }
  return event.body;
}

async function loadMessage(roomId, messageId) {
  let lastKey;
  do {
    const res = await dynamodb
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const {
      roomId,
      messageId,
      reportedByUserId,
      reason,
    } = parseHttpBody(event);

    if (!roomId || !messageId || !reportedByUserId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "roomId, messageId y reportedByUserId son requeridos" }),
      };
    }

    const room = await getActiveRoomByRoomId(roomId);
    if (!room) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Sala no encontrada" }),
      };
    }

    const message = await loadMessage(String(roomId).trim(), messageId);
    if (!message) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Mensaje no encontrado" }),
      };
    }

    const reporter = await getClientByUserId(reportedByUserId);
    const reporterName = reporter?.name || reporter?.user || reporter?.email || "Usuario";
    const admins = normalizeAdminIds(room);
    const notifyUserId = admins[0] || room.ownerId || room.createdBy;

    if (!notifyUserId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No se encontró administrador para notificar" }),
      };
    }

    const eventName = room.eventName || room.roomName || "Chat del evento";
    const messagePreview = String(message.text || message.type || "Mensaje").slice(0, 200);

    await invokeTriggerNotification({
      templateKey: "ADMIN_USER_REPORTED",
      channels: ["inApp", "push", "email"],
      metadata: {
        userId: notifyUserId,
        eventName,
        reportedBy: reporterName,
        reportedByUserId,
        reportedUserId: message.sender,
        messageId,
        roomId,
        reason: reason || "Contenido inapropiado",
        messagePreview,
        type: "chat-room-report",
        route: `/chat?roomId=${encodeURIComponent(roomId)}`,
        status: "report-user-notification",
      },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        message: "Reporte enviado al administrador del chat",
        notifiedAdminId: notifyUserId,
      }),
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
