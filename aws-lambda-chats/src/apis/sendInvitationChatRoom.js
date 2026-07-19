const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const {
  invokeTriggerNotification,
  CHAT_INVITE_ALL_CHANNELS,
} = require("../utils/invokeNotificationsLambda");
const { resolveClientUser } = require("../utils/clientUserLookup");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");
const {
  getActiveRoomByRoomId,
  assertRoomAdmin,
  idsMatch,
  isEventRoom,
} = require("../utils/chatRoomAdmin");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const {
      participants,
      roomId,
      eventName,
      requestedByUserId,
      usernames,
    } = parseHttpBody(event);

    if (!roomId || !eventName || !requestedByUserId) {
      throw new Error("roomId, eventName y requestedByUserId son obligatorios");
    }

    const roomData = await getActiveRoomByRoomId(roomId);
    if (!roomData) {
      throw new Error("No se encontró ninguna sala de chat con el roomId proporcionado");
    }

    await assertEventChatRoomIsOpen(dynamodb, roomData);

    assertRoomAdmin(roomData, requestedByUserId);

    const uniqueIds = [
      ...new Set(
        (Array.isArray(participants) ? participants : [])
          .map((p) => String(p ?? "").trim())
          .filter(Boolean),
      ),
    ];

    const uniqueUsernames = [
      ...new Set(
        (Array.isArray(usernames) ? usernames : [])
          .map((u) => String(u ?? "").trim().replace(/^@/, ""))
          .filter(Boolean),
      ),
    ];

    if (uniqueIds.length === 0 && uniqueUsernames.length === 0) {
      throw new Error("Debes indicar participants (ids) o usernames");
    }

    const resolvedRoomId = roomData?.roomId || roomData?.id || roomId;
    const participantsList = Array.isArray(roomData.participants) ? roomData.participants : [];
    const pendingList = Array.isArray(roomData.pendingParticipants) ? roomData.pendingParticipants : [];
    const eventId = roomData.event || roomData.eventId || "";
    const route = eventId
      ? `/chat?eventId=${encodeURIComponent(eventId)}&roomId=${encodeURIComponent(resolvedRoomId)}&invite=1`
      : `/chat?roomId=${encodeURIComponent(resolvedRoomId)}&invite=1`;

    const invitedUserIds = [];
    const newPendingIds = [...pendingList];
    const skipped = [];
    const failed = [];

    const inviterName =
      roomData?.hostName ||
      roomData?.ownerName ||
      roomData?.createdBy ||
      "Organizador";

    async function inviteUser(rawId) {
      const userGetNotification = await resolveClientUser(rawId);
      if (!userGetNotification) {
        failed.push({
          requestedId: rawId,
          reason: "Usuario no encontrado",
        });
        return;
      }

      const userId = userGetNotification.id;
      if (participantsList.some((id) => idsMatch(id, userId))) {
        skipped.push({ userId, reason: "Ya es participante de la sala" });
        return;
      }
      if (newPendingIds.some((id) => idsMatch(id, userId))) {
        skipped.push({ userId, reason: "Ya tiene invitación pendiente" });
        return;
      }

      const inviteeDisplayName =
        userGetNotification.name ||
        userGetNotification.user ||
        userGetNotification.firstName ||
        userGetNotification.email ||
        "Usuario";

      await invokeTriggerNotification({
        templateKey: "CHAT_USER_INVITE_SEND",
        channels: CHAT_INVITE_ALL_CHANNELS,
        metadata: {
          userId,
          userName: inviteeDisplayName,
          eventName,
          invitedBy: inviterName,
          link: resolvedRoomId,
          roomId: resolvedRoomId,
          eventId,
          route,
          status: "active",
          inviteStatus: "invitation-pending",
          type: "chat-room-invitation",
          chatType: isEventRoom(roomData) ? "event" : "group",
        },
      });

      invitedUserIds.push(userId);
      newPendingIds.push(userId);
    }

    for (const rawId of uniqueIds) {
      await inviteUser(rawId);
    }

    for (const username of uniqueUsernames) {
      await inviteUser(username);
    }

    if (invitedUserIds.length > 0) {
      await dynamodb
        .update({
          TableName: CHATS_TABLE,
          Key: {
            id: roomData.id,
            updatedAt: roomData.updatedAt,
          },
          UpdateExpression: "SET pendingParticipants = :pending",
          ExpressionAttributeValues: {
            ":pending": newPendingIds,
          },
        })
        .promise();
    }

    if (invitedUserIds.length === 0) {
      throw new Error(
        `No se envió ninguna invitación. Detalle: ${JSON.stringify({ failed, skipped })}`,
      );
    }

    return jsonResponse(200, {
      statusCode: 200,
      statusDesc: `Invitaciones enviadas: ${invitedUserIds.length}`,
      invitedUserIds,
      ...(failed.length > 0 && { failed }),
      ...(skipped.length > 0 && { skipped }),
    });
  } catch (error) {
    console.error("Error al invitar usuario:", error);
    return jsonResponse(error.statusCode || 500, {
      message: "Error al enviar invitaciones",
      error: error.message,
    });
  }
};
