const AWS = require("aws-sdk");

const doc = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION,
});
const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION || process.env.DYNAMODB_REGION,
});

function resolveChatsTable() {
  if (process.env.CHATS_TABLE) return process.env.CHATS_TABLE;
  const stage = String(process.env.STAGE || "dev").toLowerCase();
  if (stage === "qa") return "Chats-qa";
  if (stage === "dev" || stage === "devaws") return "Chats-dev";
  return "Chats";
}

function resolveClientTable() {
  if (process.env.CLIENT_TABLE) return process.env.CLIENT_TABLE;
  const stage = String(process.env.STAGE || "dev").toLowerCase();
  if (stage === "qa") return "Client-qa";
  if (stage === "dev" || stage === "devaws") return "Client-dev";
  return "Client";
}

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

async function resolveDisplayName(userId) {
  if (!userId) return "Un usuario";
  const table = resolveClientTable();
  try {
    const result = await doc.get({ TableName: table, Key: { id: userId } }).promise();
    const client = result.Item;
    if (!client) return "Un usuario";
    return (
      [client.nombre, client.apellido].filter(Boolean).join(" ").trim()
      || client.name
      || client.user
      || client.firstName
      || "Un usuario"
    );
  } catch (err) {
    console.warn("[CHAT] resolveDisplayName failed:", err.message);
    return "Un usuario";
  }
}

async function emitUserAddedToChatMessage({ roomId, userId, displayName }) {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName =
      process.env.CHAT_SEND_MESSAGE_FUNCTION
      || `chat-room-events-${stage}-sendChatMessage`;
    const name = displayName || (await resolveDisplayName(userId));

    await lambda
      .invoke({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: JSON.stringify({
          body: JSON.stringify({
            roomId,
            message: {
              action: "user-added-to-chat",
              text: `${name} se ha unido a la sala.`,
              sender: String(userId),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              type: "message-user-joined",
              deletedAt: null,
            },
          }),
        }),
      })
      .promise();
  } catch (error) {
    console.error(
      `[CHAT] Error emitiendo mensaje de usuario añadido (${userId}) en sala ${roomId}:`,
      error.message,
    );
  }
}

/**
 * Une al comprador/receptor al chat del evento y emite el indicador de unión.
 */
async function joinUserToEventChat(eventId, userId) {
  const chatsTable = resolveChatsTable();
  try {
    if (!eventId || !userId) {
      return { success: false, reason: "MISSING_IDS" };
    }

    console.log(
      `[CHAT] Intentando unir usuario ${userId} al chat del evento ${eventId} (tabla ${chatsTable})`,
    );

    const roomResult = await doc
      .query({
        TableName: chatsTable,
        IndexName: "event-index",
        KeyConditionExpression: "#event = :event",
        ExpressionAttributeNames: { "#event": "event" },
        ExpressionAttributeValues: { ":event": String(eventId) },
      })
      .promise();

    const activeRooms = (roomResult.Items || []).filter((room) => !room.deletedAt);
    if (activeRooms.length === 0) {
      console.log(`[CHAT] No existe chat para el evento ${eventId}`);
      return { success: false, reason: "NO_CHAT_FOUND", table: chatsTable };
    }

    const roomData = activeRooms.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime()
        - new Date(a.updatedAt || a.createdAt || 0).getTime(),
    )[0];

    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    const alreadyParticipant = participants.some((id) => idsMatch(id, userId));
    if (alreadyParticipant) {
      console.log(`[CHAT] Usuario ${userId} ya es participante del chat ${roomData.roomId}`);
      return { success: true, reason: "ALREADY_PARTICIPANT", roomId: roomData.roomId };
    }

    const pending = Array.isArray(roomData.pendingParticipants)
      ? roomData.pendingParticipants.filter((id) => !idsMatch(id, userId))
      : [];

    await doc
      .update({
        TableName: chatsTable,
        Key: {
          id: roomData.id,
          updatedAt: roomData.updatedAt,
        },
        UpdateExpression:
          "SET #participants = list_append(if_not_exists(#participants, :emptyList), :userId), pendingParticipants = :pending",
        ExpressionAttributeNames: {
          "#participants": "participants",
        },
        ExpressionAttributeValues: {
          ":userId": [String(userId)],
          ":emptyList": [],
          ":pending": pending,
        },
      })
      .promise();

    const displayName = await resolveDisplayName(userId);
    await emitUserAddedToChatMessage({
      roomId: String(roomData.roomId || roomData.id),
      userId: String(userId),
      displayName,
    });

    console.log(
      `[CHAT] Usuario ${userId} unido al chat ${roomData.roomId} del evento ${eventId}`,
    );
    return {
      success: true,
      reason: "JOINED",
      roomId: roomData.roomId,
      displayName,
      table: chatsTable,
    };
  } catch (error) {
    console.error(
      `[CHAT] Error al unir usuario ${userId} al chat del evento ${eventId}:`,
      error.message,
    );
    return {
      success: false,
      reason: "ERROR",
      error: error.message,
      table: chatsTable,
    };
  }
}

module.exports = {
  joinUserToEventChat,
  resolveChatsTable,
};
