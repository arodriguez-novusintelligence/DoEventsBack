const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const {
  idsMatch,
  extractParticipantIds,
  getActiveRoomByRoomId,
} = require("./chatRoomAdmin");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "ChatMessage";
const MAX_UNREAD_SCAN = 1500;
const MAX_UNREAD_BADGE = 999;

function resolveUnreadMap(room = {}) {
  const raw = room.unreadByUser && typeof room.unreadByUser === "object"
    ? room.unreadByUser
    : {};
  const next = {};
  Object.entries(raw).forEach(([key, value]) => {
    const id = String(key || "").trim();
    if (!id) return;
    const count = Number(value);
    next[id] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  });
  return next;
}

function resolveUnreadCount(room, userId) {
  if (!room || !userId) return 0;
  const map = resolveUnreadMap(room);
  const exact = map[String(userId).trim()];
  if (typeof exact === "number") return exact;
  const matchKey = Object.keys(map).find((key) => idsMatch(key, userId));
  return matchKey ? map[matchKey] : 0;
}

function participantIdsForUnread(room, senderId) {
  const participantIds = extractParticipantIds(room?.participants);
  const pendingIds = Array.isArray(room?.pendingParticipants)
    ? room.pendingParticipants.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const adminIds = [
    ...(Array.isArray(room?.adminId) ? room.adminId : room?.adminId ? [room.adminId] : []),
    ...(Array.isArray(room?.administrators) ? room.administrators : []),
  ].map((id) => String(id).trim()).filter(Boolean);

  return [...new Set([...participantIds, ...pendingIds, ...adminIds])]
    .filter((id) => id && !idsMatch(id, senderId));
}

function chatItemKey(room) {
  if (!room?.id || !room?.updatedAt) return null;
  return { id: room.id, updatedAt: room.updatedAt };
}

async function updateRoomUnreadMap(room, unreadByUser, extraSet = {}) {
  const key = chatItemKey(room);
  if (!key) {
    throw new Error("Chat room key incompleta (id/updatedAt)");
  }
  const names = { "#unreadByUser": "unreadByUser" };
  const values = { ":unreadByUser": unreadByUser };
  const sets = ["#unreadByUser = :unreadByUser"];

  Object.entries(extraSet).forEach(([attr, value]) => {
    // Never mutate the range key `updatedAt`.
    if (attr === "updatedAt" || attr === "id") return;
    const nameKey = `#${attr}`;
    const valueKey = `:${attr}`;
    names[nameKey] = attr;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  });

  await dynamodb
    .update({
      TableName: CHATS_TABLE,
      Key: key,
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
    .promise();
}

async function incrementUnreadForParticipants(room, senderId) {
  if (!room?.id || !senderId) return;
  const recipients = participantIdsForUnread(room, senderId);
  if (!recipients.length) return;

  const unreadByUser = resolveUnreadMap(room);
  recipients.forEach((id) => {
    unreadByUser[id] = Math.min(MAX_UNREAD_BADGE, (unreadByUser[id] || 0) + 1);
  });

  try {
    await updateRoomUnreadMap(room, unreadByUser, {
      lastMessageAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("incrementUnreadForParticipants failed:", error.message);
  }
}

async function markMessagesReadForUser(roomId, userId) {
  if (!roomId || !userId) return;
  let lastKey;
  let scanned = 0;
  do {
    const res = await dynamodb
      .query({
        TableName: MESSAGES_TABLE,
        IndexName: "RoomIndex",
        KeyConditionExpression: "roomId = :rid",
        ExpressionAttributeValues: { ":rid": String(roomId).trim() },
        ExclusiveStartKey: lastKey,
        ProjectionExpression: "id, createdAt, sender, #reads, #st, deletedAt",
        ExpressionAttributeNames: {
          "#st": "status",
          "#reads": "reads",
        },
        Limit: 200,
        ScanIndexForward: false,
      })
      .promise();

    const items = res.Items || [];
    scanned += items.length;
    const updates = [];
    for (const message of items) {
      if (!messageIsUnreadForUser(message, userId)) continue;
      if (!message.id || !message.createdAt) continue;
      const reads = Array.isArray(message.reads) ? [...message.reads] : [];
      reads.push(String(userId).trim());
      updates.push(
        dynamodb
          .update({
            TableName: MESSAGES_TABLE,
            Key: { id: message.id, createdAt: message.createdAt },
            UpdateExpression: "SET #reads = :reads",
            ExpressionAttributeNames: { "#reads": "reads" },
            ExpressionAttributeValues: { ":reads": reads },
          })
          .promise()
          .catch((error) => {
            console.error("markMessagesReadForUser item failed:", error.message);
          }),
      );
    }
    if (updates.length) {
      await Promise.all(updates);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && scanned < MAX_UNREAD_SCAN);
}

async function clearUnreadForUser(roomId, userId) {
  const room = await getActiveRoomByRoomId(roomId);
  if (!room?.id || !userId) return room;

  // Persist read receipts so recount from messages stays consistent with the badge.
  try {
    await markMessagesReadForUser(room.roomId || roomId, userId);
  } catch (error) {
    console.error("markMessagesReadForUser failed:", error.message);
  }

  const unreadByUser = resolveUnreadMap(room);
  const keys = Object.keys(unreadByUser);
  let changed = false;
  keys.forEach((key) => {
    if (idsMatch(key, userId) && unreadByUser[key] !== 0) {
      unreadByUser[key] = 0;
      changed = true;
    }
  });
  if (!Object.prototype.hasOwnProperty.call(unreadByUser, String(userId).trim())) {
    unreadByUser[String(userId).trim()] = 0;
    changed = true;
  }

  if (!changed) {
    return { ...room, unreadByUser, unreadCount: 0 };
  }

  await updateRoomUnreadMap(room, unreadByUser);
  return { ...room, unreadByUser, unreadCount: 0 };
}

function messageIsUnreadForUser(message, userId) {
  if (!message || !userId) return false;
  if (message.status === "deleted" || message.deletedAt) return false;
  const sender = typeof message.sender === "object"
    ? message.sender?.id
    : message.sender;
  if (sender && idsMatch(sender, userId)) return false;
  const reads = Array.isArray(message.reads) ? message.reads : [];
  if (reads.some((id) => idsMatch(id, userId))) return false;
  return true;
}

async function countUnreadMessagesInRoom(roomId, userId) {
  if (!roomId || !userId) return 0;
  let count = 0;
  let scanned = 0;
  let lastKey;
  do {
    const res = await dynamodb
      .query({
        TableName: MESSAGES_TABLE,
        IndexName: "RoomIndex",
        KeyConditionExpression: "roomId = :rid",
        ExpressionAttributeValues: { ":rid": String(roomId).trim() },
        ExclusiveStartKey: lastKey,
        // `reads` y `status` son palabras reservadas en DynamoDB.
        ProjectionExpression: "id, sender, #reads, #st, deletedAt",
        ExpressionAttributeNames: {
          "#st": "status",
          "#reads": "reads",
        },
        Limit: 200,
        ScanIndexForward: false,
      })
      .promise();
    const items = res.Items || [];
    scanned += items.length;
    for (const message of items) {
      if (messageIsUnreadForUser(message, userId)) {
        count += 1;
        if (count >= MAX_UNREAD_BADGE) {
          return MAX_UNREAD_BADGE;
        }
      }
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && scanned < MAX_UNREAD_SCAN);
  return count;
}

async function persistUnreadCount(room, userId, counted) {
  if (!room?.id || !userId) return;
  const map = resolveUnreadMap(room);
  const unreadByUser = { ...map, [String(userId).trim()]: counted };
  try {
    await updateRoomUnreadMap(room, unreadByUser);
  } catch (error) {
    console.error("persistUnreadCount failed:", error.message);
  }
}

async function resolveRoomUnreadCount(room, userId) {
  if (!room || !userId) return 0;
  const map = resolveUnreadMap(room);
  const hasExact = Object.keys(map).some((key) => idsMatch(key, userId));
  if (hasExact) return resolveUnreadCount(room, userId);

  const roomId = room.roomId || room.id;
  if (!roomId) return 0;
  try {
    const counted = await countUnreadMessagesInRoom(roomId, userId);
    await persistUnreadCount(room, userId, counted);
    return counted;
  } catch (error) {
    console.error("resolveRoomUnreadCount failed:", error.message);
    return 0;
  }
}

module.exports = {
  resolveUnreadMap,
  resolveUnreadCount,
  incrementUnreadForParticipants,
  clearUnreadForUser,
  resolveRoomUnreadCount,
  messageIsUnreadForUser,
};
