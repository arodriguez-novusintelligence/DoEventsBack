const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const {
  invokeTriggerNotification,
  CHAT_INVITE_ALL_CHANNELS,
} = require("../utils/invokeNotificationsLambda");
const { getClientByUserId } = require("../utils/clientUserLookup");
const { resolveAdminNotifyUserId } = require("../utils/chatRoomInviteHelpers");
const { idsMatch } = require("../utils/chatRoomAdmin");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");
const sendChatMessage = require("../gateways/sendChatMessage");

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
    const stage =
      url.pathname.replace(/^\/+/, "").split("/")[0] ||
      process.env.STAGE ||
      "dev";
    if (!url.hostname) return null;
    return { domainName: url.hostname, stage };
  } catch (err) {
    console.warn(
      "WS_API_ENDPOINT invalido, no se hara broadcast en vivo:",
      endpoint,
      err.message,
    );
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const { email, userId, roomId } = parseHttpBody(event);

    if (!userId || !roomId) {
      return jsonResponse(400, {
        message: "Los campos userId y roomId son obligatorios para aceptar la invitación",
        error: "Los campos userId y roomId son obligatorios para aceptar la invitación",
      });
    }

    const accepter = await getClientByUserId(userId);
    if (!accepter) {
      return jsonResponse(404, {
        message: "No se encontró el usuario",
        error:
          "No se encontró el usuario en Client (revisa userId: id de 10 caracteres o UUID completo del mismo usuario)",
      });
    }

    const resolvedUserId = accepter.id;
    const normalizedEmail = (
      (email || accepter.email || "")
        .trim()
        .toLowerCase()
    );

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

    if (activeRooms.length === 0) {
      return jsonResponse(404, {
        message: "Sala de chat no encontrada",
        error: "No se encontró ninguna sala de chat con el roomId proporcionado",
      });
    }

    const roomData = activeRooms.sort(
      (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
    )[0];

    try {
      await assertEventChatRoomIsOpen(dynamodb, roomData);
    } catch (closedErr) {
      return jsonResponse(closedErr.statusCode || 403, {
        message: closedErr.message,
        error: closedErr.message,
      });
    }

    const participantsList = Array.isArray(roomData.participants)
      ? roomData.participants
      : [];

    if (participantsList.some((id) => idsMatch(id, resolvedUserId))) {
      return jsonResponse(200, {
        statusCode: 200,
        statusDesc: "Ya eres participante de la sala",
        alreadyParticipant: true,
      });
    }

    const notifyUserId = resolveAdminNotifyUserId(roomData, participantsList);

    const pendingList = Array.isArray(roomData.pendingParticipants)
      ? roomData.pendingParticipants
      : [];
    const updatedPending = pendingList.filter((id) => !idsMatch(id, resolvedUserId));

    const nowIso = new Date().toISOString();
    const updateParams = {
      TableName: CHATS_TABLE,
      Key: {
        id: roomData.id,
        updatedAt: roomData.updatedAt,
      },
      UpdateExpression:
        "SET #participants = list_append(if_not_exists(#participants, :emptyList), :userId), pendingParticipants = :pending, directChatStatus = :active",
      ExpressionAttributeNames: {
        "#participants": "participants",
      },
      ExpressionAttributeValues: {
        ":userId": [resolvedUserId],
        ":emptyList": [],
        ":pending": updatedPending,
        ":active": "active",
      },
    };

    await dynamodb.update(updateParams).promise();

    const accepterDisplayName =
      (accepter.name ||
        [accepter.firstName, accepter.lastName].filter(Boolean).join(" ")) ||
      normalizedEmail ||
      "Usuario";

    const resolvedRoomId = roomData?.roomId || roomData?.id || roomId;
    const eventLabel =
      roomData?.eventName || roomData?.roomName || "Evento";
    const invitedByLabel =
      roomData?.hostName || roomData?.ownerName || "Organizador";

    const joinMessagePayload = {
      roomId: String(resolvedRoomId).trim(),
      message: {
        action: "user-added-to-chat",
        text: `${accepterDisplayName} se ha unido a la sala.`,
        sender: resolvedUserId,
        createdAt: nowIso,
        updatedAt: nowIso,
        type: "message-user-joined",
        deletedAt: null,
      },
    };

    const wsRequestContext = parseWsRequestContextFromEnv();

    try {
      const joinResult = await sendChatMessage.handler({
        body: JSON.stringify(joinMessagePayload),
        ...(wsRequestContext ? { requestContext: wsRequestContext } : {}),
      });
      if (joinResult?.statusCode && joinResult.statusCode >= 400) {
        console.error(
          "acceptInvitationChatRoom: mensaje de unión falló (usuario ya en la sala)",
          joinResult,
        );
      }
    } catch (joinErr) {
      console.error(
        "acceptInvitationChatRoom: error al publicar mensaje de unión (usuario ya en la sala)",
        joinErr,
      );
    }

    if (notifyUserId) {
      try {
        await invokeTriggerNotification({
          templateKey: "CHAT_USER_INVITE_ACCEPTED",
          channels: CHAT_INVITE_ALL_CHANNELS,
          metadata: {
            userId: notifyUserId,
            eventName: eventLabel,
            invitedBy: invitedByLabel,
            userName: accepterDisplayName,
            link: resolvedRoomId,
            roomId: resolvedRoomId,
            status: "active",
            inviteStatus: "invitation-accepted",
            type: "chat-room-invitation",
          },
        });
      } catch (notifyErr) {
        console.error(
          "acceptInvitationChatRoom: error al notificar (usuario ya añadido a la sala)",
          notifyErr,
        );
      }
    }

    return jsonResponse(200, {
      statusCode: 200,
      statusDesc: "Se ha aceptado la invitación a la sala de chat",
      roomId: resolvedRoomId,
      userId: resolvedUserId,
    });
  } catch (error) {
    console.error("Error al agregar el usuario:", error);

    return jsonResponse(error.statusCode || 500, {
      message: "No se pudo aceptar la invitación al chat",
      error: error.message,
    });
  }
};
