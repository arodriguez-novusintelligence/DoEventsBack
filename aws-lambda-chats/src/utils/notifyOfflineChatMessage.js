const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";
const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const EVENTOS_TABLE = process.env.EVENTOS_TABLE || "Eventos";
const WEB_APP_BASE_URL =
  process.env.WEB_APP_BASE_URL || "https://qa.doeventsapp.com";

const CHAT_NOTIFY_CHANNELS = ["inApp", "push", "email"];

const {
  invokeTriggerNotification,
} = require("./invokeNotificationsLambda");

function truncatePreview(text, maxLen = 140) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trimEnd()}…`;
}

function buildChatDeepLink(roomId) {
  const route = `/chat?roomId=${encodeURIComponent(roomId)}`;
  const base = WEB_APP_BASE_URL.replace(/\/+$/, "");
  return { route, link: `${base}${route}` };
}

async function getRoomAndEventName(docClient, roomId) {
  const roomResult = await docClient
    .query({
      TableName: CHATS_TABLE,
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: { ":roomId": roomId },
    })
    .promise();

  const room =
    roomResult.Items && roomResult.Items.length > 0 ? roomResult.Items[0] : null;
  if (!room) {
    return { room: null, eventName: "Chat" };
  }

  let eventName = "Chat";
  if (room.event) {
    try {
      const ev = await docClient
        .get({
          TableName: EVENTOS_TABLE,
          Key: { id: room.event },
        })
        .promise();
      if (ev.Item && (ev.Item.name || ev.Item.nombre)) {
        eventName = ev.Item.name || ev.Item.nombre;
      }
    } catch (e) {
      console.warn("notifyOfflineChatMessage: Eventos get failed", e.message);
    }
  }

  return { room, eventName };
}

function recipientUserIds(room, senderId) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const pending = Array.isArray(room.pendingParticipants) ? room.pendingParticipants : [];
  const admins = Array.isArray(room.adminId) ? room.adminId : [];
  const set = new Set([...participants, ...pending, ...admins]);
  set.delete(senderId);
  return [...set];
}

/**
 * Usuarios con conexión WS al room que enviaron userId al hacer joinRoom.
 */
async function getOnlineUserIdsInRoom(docClient, roomId) {
  const conn = await docClient
    .query({
      TableName: USER_CHANNELS_TABLE,
      KeyConditionExpression: "channelId = :cid",
      ExpressionAttributeValues: { ":cid": roomId },
    })
    .promise();

  const items = conn.Items || [];
  const ids = items.map((i) => i.userId).filter(Boolean);
  return new Set(ids);
}

/**
 * Notifica inApp + push + email a participantes que no tienen el chat abierto en WS.
 */
async function notifyOfflineChatMessage({
  docClient,
  roomId,
  senderId,
  messageId,
  previewText,
  senderName,
  templateKey = "CHAT_USER_NEW_MESSAGE",
  channels = CHAT_NOTIFY_CHANNELS,
}) {
  try {
    const { room, eventName } = await getRoomAndEventName(docClient, roomId);
    if (!room) {
      console.warn("notifyOfflineChatMessage: room not found", roomId);
      return;
    }

    const recipients = recipientUserIds(room, senderId);
    if (!recipients.length) return;

    const onlineSet = await getOnlineUserIdsInRoom(docClient, roomId);
    const offline = recipients.filter((uid) => !onlineSet.has(uid));
    if (!offline.length) return;

    const senderLabel = senderName || "Alguien";
    const message = `${senderLabel} está intentando contactarte`;
    const displayRoomName = room.roomName?.startsWith("Chat con ")
      ? room.roomName.replace("Chat con ", "").trim()
      : (room.roomName || eventName);
    const targetArr = Array.isArray(room.target) ? room.target : [];
    const chatType = targetArr.includes("room::direct")
      ? "direct"
      : targetArr.includes("room::private-group")
        ? "private-group"
        : targetArr.includes("room::event")
          ? "event"
          : "chat";

    const { route, link } = buildChatDeepLink(roomId);

    const tasks = offline.map((userId) =>
      invokeTriggerNotification({
        templateKey,
        channels,
        metadata: {
          userId,
          eventName: displayRoomName,
          message,
          senderId,
          senderName: senderLabel,
          offlineContact: true,
          messageId,
          roomId,
          type: "chat-message",
          chatType,
          title: message,
          route,
          link,
        },
      }).catch((err) =>
        console.error(
          `notifyOfflineChatMessage user=${userId}:`,
          err.message || err,
        ),
      ),
    );

    await Promise.all(tasks);
  } catch (e) {
    console.error("notifyOfflineChatMessage:", e.message || e);
  }
}

module.exports = { notifyOfflineChatMessage, CHAT_NOTIFY_CHANNELS };
