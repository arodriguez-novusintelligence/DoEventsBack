const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

const sendChatMessage = require("../gateways/sendChatMessage");
const { invokeTriggerNotification } = require("../utils/invokeNotificationsLambda");
const { getClientByUserId } = require("../utils/clientUserLookup");
const { broadcastJsonToRoomChannel } = require("../utils/wsBroadcastRoom");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");

const ADMIN_PROMOTION_CHANNELS = ["push", "inApp", "email"];

function resolveEventOwnerUserId(eventItem = {}) {
  const candidateUserId =
    eventItem.userId ||
    eventItem.createdBy ||
    eventItem.user_id ||
    eventItem.id_usuario ||
    "";

  return String(candidateUserId || "").trim();
}

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

function parseWsRequestContextFromEnv() {
  const endpoint = String(process.env.WS_API_ENDPOINT || "").trim();
  if (!endpoint) return null;

  try {
    const url = new URL(endpoint);
    const stage = url.pathname.replace(/^\/+/, "").split("/")[0] || process.env.STAGE || "dev";
    if (!url.hostname) return null;
    return { domainName: url.hostname, stage };
  } catch (err) {
    console.warn("WS_API_ENDPOINT invalido, no se hara broadcast en vivo:", endpoint, err.message);
    return null;
  }
}

function normalizeAdminIds(roomData) {
  const adminIdValues = Array.isArray(roomData.adminId)
    ? roomData.adminId
    : roomData.adminId
      ? [roomData.adminId]
      : [];

  const administratorsValues = Array.isArray(roomData.administrators)
    ? roomData.administrators
    : [];

  return [...new Set([...adminIdValues, ...administratorsValues].map((id) => String(id).trim()).filter(Boolean))];
}

async function resolveRoomOwnerUserId(roomData) {
  const roomOwnerCandidate =
    roomData?.ownerId ||
    roomData?.ownerUserId ||
    roomData?.eventOwnerUserId ||
    "";

  if (String(roomOwnerCandidate || "").trim()) {
    return String(roomOwnerCandidate).trim();
  }

  const eventId = String(roomData?.event || "").trim();
  if (!eventId) return null;

  const eventResult = await docClient
    .get({
      TableName: "Eventos",
      Key: { id: eventId },
    })
    .promise();

  return resolveEventOwnerUserId(eventResult?.Item || {}) || null;
}

exports.handler = async (event) => {
  try {
    const {
      roomId,
      userId,
      requestedByUserId,
      requesterUserId,
      actorUserId,
    } = parseHttpBody(event);

    const targetUserId = String(userId || "").trim();
    const roomIdValue = String(roomId || "").trim();
    const promoterId = String(
      requestedByUserId || requesterUserId || actorUserId || "",
    ).trim();

    if (!targetUserId || !roomIdValue || !promoterId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "roomId, userId y requestedByUserId son requeridos",
        }),
      };
    }

    const roomResult = await docClient
      .query({
        TableName: "Chats",
        IndexName: "roomId-index",
        KeyConditionExpression: "roomId = :roomId",
        ExpressionAttributeValues: {
          ":roomId": roomIdValue,
        },
      })
      .promise();

    const roomData = roomResult.Items && roomResult.Items.length > 0 ? roomResult.Items[0] : null;

    if (!roomData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Sala no encontrada" }),
      };
    }

    await assertEventChatRoomIsOpen(docClient, roomData);

    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    const admins = normalizeAdminIds(roomData);

    const ownerUserId = await resolveRoomOwnerUserId(roomData);

    if (!ownerUserId) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "No se pudo identificar el owner del evento para esta sala",
        }),
      };
    }

    if (promoterId !== ownerUserId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Solo el owner del evento puede asignar administradores",
        }),
      };
    }

    if (!participants.includes(targetUserId)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "El usuario no esta en esta sala" }),
      };
    }

    if (admins.includes(targetUserId)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "El usuario ya es administrador" }),
      };
    }

    const updatedAdmins = [...new Set([...admins, targetUserId])];

    await docClient
      .update({
        TableName: "Chats",
        Key: {
          id: roomData.id,
          updatedAt: roomData.updatedAt,
        },
        UpdateExpression: "SET adminId = :updatedAdmins, administrators = :updatedAdmins",
        ExpressionAttributeValues: {
          ":updatedAdmins": updatedAdmins,
        },
      })
      .promise();

    const [promotedUser, promoterUser] = await Promise.all([
      getClientByUserId(targetUserId),
      getClientByUserId(promoterId),
    ]);

    const promotedUserName =
      promotedUser?.name ||
      [promotedUser?.firstName, promotedUser?.lastName].filter(Boolean).join(" ") ||
      promotedUser?.email ||
      targetUserId;

    const promoterName =
      promoterUser?.name ||
      [promoterUser?.firstName, promoterUser?.lastName].filter(Boolean).join(" ") ||
      promoterUser?.email ||
      promoterId;

    const messagePayload = {
      roomId: roomIdValue,
      message: {
        action: "user-promoted-admin",
        text: `${promotedUserName} ahora es administrador de la sala.`,
        sender: promoterId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: "message-role-update",
        deletedAt: null,
      },
    };

    const wsRequestContext = parseWsRequestContextFromEnv();

    await sendChatMessage.handler({
      body: JSON.stringify(messagePayload),
      ...(wsRequestContext ? { requestContext: wsRequestContext } : {}),
    });

    if (wsRequestContext) {
      await broadcastJsonToRoomChannel({
        docClient,
        domainName: wsRequestContext.domainName,
        stage: wsRequestContext.stage,
        channelId: roomIdValue,
        payload: {
          channel: "chat",
          action: "chatRoleUpdated",
          status: "active",
          event: "chat.role.updated",
          payload: {
            roomId: roomIdValue,
            targetUserId,
            actorUserId: promoterId,
            operation: "promote",
            role: "admin",
            admins: updatedAdmins,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    }

    const eventLabel = roomData?.eventName || roomData?.roomName || "Evento";
    const resolvedRoomId = roomData?.roomId || roomData?.id || roomIdValue;

    try {
      await invokeTriggerNotification({
        templateKey: "CHAT_USER_PROMOTED_TO_ADMIN",
        channels: ADMIN_PROMOTION_CHANNELS,
        metadata: {
          userId: targetUserId,
          eventName: eventLabel,
          promotedBy: promoterName,
          promotedUserName,
          roomId: resolvedRoomId,
          link: resolvedRoomId,
          status: "user-promoted-admin",
          type: "chat-room-moderation",
        },
      });
    } catch (notifyErr) {
      console.error(
        "promoteUserToAdminChatRoom: error al enviar notificacion (promocion aplicada)",
        notifyErr,
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Usuario promovido a administrador",
        roomId: roomIdValue,
        userId: targetUserId,
        promotedBy: promoterId,
        adminId: updatedAdmins,
      }),
    };
  } catch (error) {
    console.error("Error en promoteUserToAdminChatRoom:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
};