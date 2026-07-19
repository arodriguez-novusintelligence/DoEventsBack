const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

const sendChatMessage = require("../gateways/sendChatMessage");
const { invokeTriggerNotification } = require("../utils/invokeNotificationsLambda");
const { getClientByUserId } = require("../utils/clientUserLookup");
const { broadcastJsonToRoomChannel } = require("../utils/wsBroadcastRoom");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");

const ADMIN_DEMOTION_CHANNELS = ["push", "inApp", "email"];

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
    const actorId = String(
      requestedByUserId || requesterUserId || actorUserId || "",
    ).trim();

    if (!targetUserId || !roomIdValue || !actorId) {
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

    if (actorId !== ownerUserId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Solo el owner del evento puede remover administradores",
        }),
      };
    }

    if (!admins.includes(targetUserId)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "El usuario no es administrador" }),
      };
    }

    const updatedAdmins = admins.filter((id) => id !== targetUserId);

    if (updatedAdmins.length === 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: "No puedes dejar la sala sin administradores",
        }),
      };
    }

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

    const [demotedUser, actorUser] = await Promise.all([
      getClientByUserId(targetUserId),
      getClientByUserId(actorId),
    ]);

    const demotedUserName =
      demotedUser?.name ||
      [demotedUser?.firstName, demotedUser?.lastName].filter(Boolean).join(" ") ||
      demotedUser?.email ||
      targetUserId;

    const actorName =
      actorUser?.name ||
      [actorUser?.firstName, actorUser?.lastName].filter(Boolean).join(" ") ||
      actorUser?.email ||
      actorId;

    const messagePayload = {
      roomId: roomIdValue,
      message: {
        action: "user-demoted-admin",
        text: `${demotedUserName} ya no es administrador de la sala.`,
        sender: actorId,
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
            actorUserId: actorId,
            operation: "demote",
            role: "participant",
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
        templateKey: "CHAT_USER_DEMOTED_FROM_ADMIN",
        channels: ADMIN_DEMOTION_CHANNELS,
        metadata: {
          userId: targetUserId,
          eventName: eventLabel,
          demotedBy: actorName,
          demotedUserName,
          roomId: resolvedRoomId,
          link: resolvedRoomId,
          status: "user-demoted-admin",
          type: "chat-room-moderation",
        },
      });
    } catch (notifyErr) {
      console.error(
        "demoteUserFromAdminChatRoom: error al enviar notificacion (degradacion aplicada)",
        notifyErr,
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Usuario degradado de administrador",
        roomId: roomIdValue,
        userId: targetUserId,
        demotedBy: actorId,
        adminId: updatedAdmins,
      }),
    };
  } catch (error) {
    console.error("Error en demoteUserFromAdminChatRoom:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
};