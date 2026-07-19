const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

// GATEWAY FUNCTIONS
const sendChatMessage = require("../gateways/sendChatMessage");
const { invokeTriggerNotification } = require("../utils/invokeNotificationsLambda");
const { getClientByUserId } = require("../utils/clientUserLookup");
const {
  getActiveRoomByRoomId,
  assertRoomAdmin,
  idsMatch,
  normalizeAdminIds,
} = require("../utils/chatRoomAdmin");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");
const { optionsResponse } = require("../utils/corsHttp");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";

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
    console.warn("WS_API_ENDPOINT inválido, no se hará broadcast en vivo:", endpoint, err.message);
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const { userId, roomId, requestedByUserId } = parseHttpBody(event);

    if (!userId || !roomId || !requestedByUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId, roomId y requestedByUserId son requeridos" }),
      };
    }

    const roomData = await getActiveRoomByRoomId(roomId);
    if (!roomData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Sala no encontrada" }),
      };
    }

    await assertEventChatRoomIsOpen(docClient, roomData);

    assertRoomAdmin(roomData, requestedByUserId);

    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    const admins = normalizeAdminIds(roomData);

    if (admins.some((adminId) => idsMatch(adminId, userId))) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "No puedes expulsar a un administrador" }),
      };
    }

    if (!participants.some((id) => idsMatch(id, userId))) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "El usuario no está en esta sala" }),
      };
    }

    const updatedParticipants = participants.filter((id) => !idsMatch(id, userId));
    const blacklist = Array.isArray(roomData.blacklist) ? roomData.blacklist : [];
    const updatedBlacklist = blacklist.some((id) => idsMatch(id, userId))
      ? blacklist
      : [...blacklist, userId];

    await docClient
      .update({
        TableName: CHATS_TABLE,
        Key: {
          id: roomData.id,
          updatedAt: roomData.updatedAt,
        },
        UpdateExpression: "SET #participants = :updatedParticipants, blacklist = :blacklist",
        ExpressionAttributeNames: {
          "#participants": "participants",
        },
        ExpressionAttributeValues: {
          ":updatedParticipants": updatedParticipants,
          ":blacklist": updatedBlacklist,
        },
      })
      .promise();

    //  docClient.delete({
    //     TableName: 'UserChannels',
    //     Key: {
    //       channelId: item.channelId,
    //       connectionId: item.connectionId
    //     }
    //   }).promise()

    const kickedUser = await getClientByUserId(userId);
    const kickedUserName =
      kickedUser?.name ||
      [kickedUser?.firstName, kickedUser?.lastName].filter(Boolean).join(" ") ||
      kickedUser?.email ||
      userId;

    // CREATE NOTIFICATION PAYLOAD
    const messagePayload = {
      roomId: roomId,
      message: {
        action: "user-kicked-out",
        text: `${kickedUserName} ha sido expulsado de la sala.`,
        sender: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: "message-kicked-out",
        deletedAt: null,
      },
    };

    const wsRequestContext = parseWsRequestContextFromEnv();

    // Inserta mensaje en DB y, si hay WS_API_ENDPOINT, también lo emite en vivo al room
    await sendChatMessage.handler({
      body: JSON.stringify(messagePayload),
      ...(wsRequestContext ? { requestContext: wsRequestContext } : {}),
    });

    // SEND NOTIFICATION TO KICKED USER USING SAME FLOW AS CHAT INVITES
    const eventLabel = roomData?.eventName || roomData?.roomName || "Evento";
    const resolvedRoomId = roomData?.roomId || roomData?.id || roomId;

    try {
      await invokeTriggerNotification({
        templateKey: "CHAT_USER_BANNED",
        metadata: {
          userId,
          eventName: eventLabel,
          roomId: resolvedRoomId,
          link: resolvedRoomId,
          status: "user-kicked-out",
          type: "chat-room-moderation",
        },
      });
    } catch (notifyErr) {
      console.error(
        "kickedOutUserByChatRoom: error al enviar notificación (usuario ya expulsado de la sala)",
        notifyErr,
      );
    }

    // RETURN SUCCESS RESPONSE
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Usuario expulsado del chat",
      }),
    };
  } catch (error) {
    console.error("Error al salir del chat:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
};
