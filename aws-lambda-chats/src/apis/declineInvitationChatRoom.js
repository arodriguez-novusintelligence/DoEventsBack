const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getClientByUserId } = require("../utils/clientUserLookup");
const {
  invokeTriggerNotification,
  CHAT_INVITE_ALL_CHANNELS,
} = require("../utils/invokeNotificationsLambda");
const { resolveAdminNotifyUserId } = require("../utils/chatRoomInviteHelpers");
const { idsMatch } = require("../utils/chatRoomAdmin");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const { email, userId, roomId } = parseHttpBody(event);

    if (!userId || !roomId) {
      return jsonResponse(400, {
        message: "Los campos userId y roomId son obligatorios para rechazar la invitación",
        error: "Los campos userId y roomId son obligatorios para rechazar la invitación",
      });
    }

    const decliner = await getClientByUserId(userId);
    if (!decliner) {
      return jsonResponse(404, {
        message: "No se encontró el usuario",
        error: "No se encontró el usuario en Client (revisa userId)",
      });
    }
    const resolvedUserId = decliner.id;
    const displayEmail = (email || decliner.email || "").trim().toLowerCase();

    const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";

    const getRoomParams = {
      TableName: CHATS_TABLE,
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": String(roomId).trim(),
      },
    };

    const roomResult = await dynamodb.query(getRoomParams).promise();
    const activeRooms = (roomResult.Items || []).filter((room) => !room.deletedAt);
    const roomData = activeRooms.sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    )[0] || null;
    if (!roomData) {
      return jsonResponse(404, {
        message: "Sala de chat no encontrada",
        error: "No se encontró ninguna sala de chat con el roomId proporcionado",
      });
    }

    const participantsList = Array.isArray(roomData.participants)
      ? roomData.participants
      : [];

    if (participantsList.some((id) => idsMatch(id, resolvedUserId))) {
      return jsonResponse(400, {
        message: "Ya has aceptado la invitación a la sala de chat",
        error: "Ya has aceptado la invitación a la sala de chat del evento",
      });
    }

    const pendingList = Array.isArray(roomData.pendingParticipants)
      ? roomData.pendingParticipants
      : [];
    const updatedPending = pendingList.filter((id) => !idsMatch(id, resolvedUserId));

    if (updatedPending.length !== pendingList.length) {
      await dynamodb
        .update({
          TableName: CHATS_TABLE,
          Key: {
            id: roomData.id,
            updatedAt: roomData.updatedAt,
          },
          UpdateExpression: "SET pendingParticipants = :pending",
          ExpressionAttributeValues: {
            ":pending": updatedPending,
          },
        })
        .promise();
    }

    const notifyUserId = resolveAdminNotifyUserId(roomData, participantsList);

    const declinerDisplayName =
      (decliner.name ||
        [decliner.firstName, decliner.lastName].filter(Boolean).join(" ")) ||
      displayEmail ||
      "Usuario";

    const resolvedRoomId = roomData?.roomId || roomData?.id || roomId;
    const eventLabel =
      roomData?.eventName || roomData?.roomName || "Evento";
    const invitedByLabel =
      roomData?.hostName || roomData?.ownerName || "Organizador";

    if (notifyUserId) {
      try {
        await invokeTriggerNotification({
          templateKey: "CHAT_USER_INVITE_DECLINED",
          channels: CHAT_INVITE_ALL_CHANNELS,
          metadata: {
            userId: notifyUserId,
            eventName: eventLabel,
            invitedBy: invitedByLabel,
            userName: declinerDisplayName,
            link: resolvedRoomId,
            roomId: resolvedRoomId,
            status: "active",
            inviteStatus: "invitation-declined",
            type: "chat-room-invitation",
            declinerEmail: displayEmail || undefined,
            message: `${displayEmail || resolvedUserId} ha rechazado la invitación a la sala de chat del evento`,
          },
        });
      } catch (notifyErr) {
        console.error(
          "declineInvitationChatRoom: error al enviar notificación (operación de rechazo igualmente válida)",
          notifyErr,
        );
      }
    }

    return jsonResponse(200, {
      statusCode: 200,
      statusDesc: "Se ha rechazado la invitación a la sala de chat",
    });
  } catch (error) {
    console.error("Error en declineInvitationChatRoom:", error);

    return jsonResponse(error.statusCode || 500, {
      message: "No se pudo rechazar la invitación al chat",
      error: error.message,
    });
  }
};
