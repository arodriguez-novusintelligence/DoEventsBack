const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";

function idsMatch(a, b) {
  if (!a || !b) return false;
  const left = String(a).trim();
  const right = String(b).trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const shortLeft = left.length === 36 && left.includes("-") ? left.substring(0, 10) : left;
  const shortRight = right.length === 36 && right.includes("-") ? right.substring(0, 10) : right;
  return shortLeft === shortRight;
}

function normalizeAdminIds(room = {}) {
  const adminIdValues = Array.isArray(room.adminId)
    ? room.adminId
    : room.adminId
      ? [room.adminId]
      : [];
  const administratorsValues = Array.isArray(room.administrators)
    ? room.administrators
    : [];
  return [...new Set([...adminIdValues, ...administratorsValues]
    .map((id) => String(id).trim())
    .filter(Boolean))];
}

function extractParticipantIds(participants) {
  if (!Array.isArray(participants)) return [];
  return participants
    .map((p) => (typeof p === "string" ? p : p?.id))
    .filter(Boolean)
    .map((id) => String(id).trim());
}

function isRoomAdmin(room, userId) {
  if (!room || !userId) return false;
  const admins = normalizeAdminIds(room);
  if (admins.some((adminId) => idsMatch(adminId, userId))) return true;
  const ownerId = room.ownerId || room.creatorId || room.organizerId;
  if (ownerId && idsMatch(ownerId, userId)) return true;
  return false;
}

function isUserBlacklisted(room, userId) {
  const blacklist = Array.isArray(room?.blacklist) ? room.blacklist : [];
  return blacklist.some((id) => idsMatch(id, userId));
}

function isEventRoom(room) {
  const target = Array.isArray(room?.target) ? room.target : [];
  return target.includes("room::event") || Boolean(room?.event);
}

async function getActiveRoomByRoomId(roomId) {
  const result = await dynamodb
    .query({
      TableName: CHATS_TABLE,
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: { ":roomId": String(roomId).trim() },
    })
    .promise();
  const rooms = (result.Items || []).filter((room) => !room.deletedAt);
  if (rooms.length === 0) return null;
  return rooms.sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
  )[0];
}

function assertRoomAdmin(room, userId) {
  if (!isRoomAdmin(room, userId)) {
    const err = new Error("Solo los administradores pueden realizar esta acción");
    err.statusCode = 403;
    throw err;
  }
}

function assertNotBlacklisted(room, userId) {
  if (isUserBlacklisted(room, userId)) {
    const err = new Error("No tienes acceso a esta sala de chat");
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  idsMatch,
  normalizeAdminIds,
  extractParticipantIds,
  isRoomAdmin,
  isUserBlacklisted,
  isEventRoom,
  getActiveRoomByRoomId,
  assertRoomAdmin,
  assertNotBlacklisted,
};
