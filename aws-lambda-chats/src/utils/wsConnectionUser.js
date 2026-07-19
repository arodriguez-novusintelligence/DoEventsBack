const { getClientByUserId } = require("./clientUserLookup");
const { resolveProfileAvatarUrl } = require("./profileAvatarUrl");
const { resolveDisplayName } = require("./resolveChatParticipants");
const {
  idsMatch,
  extractParticipantIds,
  isUserBlacklisted,
  isRoomAdmin,
  getActiveRoomByRoomId,
} = require("./chatRoomAdmin");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";

/**
 * userId registrado en $connect como channelId `notification-user-<id>`.
 */
async function getConnectionAuthenticatedUserId(docClient, connectionId) {
  if (!connectionId) return null;
  const res = await docClient
    .query({
      TableName: USER_CHANNELS_TABLE,
      IndexName: "ConnectionIndex",
      KeyConditionExpression: "connectionId = :cid",
      ExpressionAttributeValues: { ":cid": connectionId },
    })
    .promise();

  for (const item of res.Items || []) {
    const cid = item.channelId;
    if (typeof cid === "string" && cid.startsWith("notification-user-")) {
      return cid.slice("notification-user-".length);
    }
  }
  return null;
}

async function assertSenderMatchesConnection(docClient, event, senderId) {
  const connectionId = event.requestContext?.connectionId;
  const authId = await getConnectionAuthenticatedUserId(docClient, connectionId);
  const sender = String(senderId || "").trim();
  if (!authId) {
    const err = new Error(
      "Conexión no autenticada: falta userId en $connect (?userId=)",
    );
    err.statusCode = 403;
    throw err;
  }
  if (!sender || sender !== authId) {
    const err = new Error("sender no coincide con el usuario de la conexión");
    err.statusCode = 403;
    throw err;
  }
  return authId;
}

async function assertUserIsRoomParticipant(docClient, roomId, userId) {
  const room = await getActiveRoomByRoomId(roomId);
  if (!room) {
    const err = new Error("Sala no encontrada");
    err.statusCode = 404;
    throw err;
  }
  if (isUserBlacklisted(room, userId)) {
    const err = new Error("No tienes acceso a esta sala de chat");
    err.statusCode = 403;
    throw err;
  }
  const participantIds = extractParticipantIds(room.participants);
  const pending = Array.isArray(room.pendingParticipants) ? room.pendingParticipants : [];
  const isMember = participantIds.some((id) => idsMatch(id, userId));
  const isPending = pending.some((id) => idsMatch(id, userId));
  if (!isMember && !isPending) {
    const err = new Error("Usuario no es participante de esta sala");
    err.statusCode = 403;
    throw err;
  }
  return room;
}

async function assertUserIsRoomAdmin(docClient, roomId, userId) {
  const room = await assertUserIsRoomParticipant(docClient, roomId, userId);
  if (!isRoomAdmin(room, userId)) {
    const err = new Error("Solo los administradores pueden realizar esta acción");
    err.statusCode = 403;
    throw err;
  }
  return room;
}

async function loadSenderProfile(senderId) {
  return getClientByUserId(senderId);
}

/** Objeto sender para WS/REST: id, name, avatar (URL firmada o http). */
async function buildChatSenderDisplay(s3, senderId) {
  const sid = senderId != null ? String(senderId).trim() : "";
  const resultSender = await loadSenderProfile(senderId);
  if (!resultSender) {
    return sid
      ? { id: sid, name: "Usuario", avatar: null }
      : { id: "", name: "Usuario", avatar: null };
  }
  return {
    id: resultSender.id,
    name: resolveDisplayName(resultSender),
    avatar: resolveProfileAvatarUrl(
      s3,
      resultSender.fotoPerfilUrl,
      resultSender.platform,
    ),
  };
}

module.exports = {
  getConnectionAuthenticatedUserId,
  assertSenderMatchesConnection,
  assertUserIsRoomParticipant,
  assertUserIsRoomAdmin,
  buildChatSenderDisplay,
};
