const {
  clearUnreadForUser,
} = require("../utils/chatUnread");
const { idsMatch } = require("../utils/chatRoomAdmin");

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Credentials": true,
};

function parseBody(event) {
  if (!event?.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const body = parseBody(event);
    const roomId = String(body.roomId || "").trim();
    const userId = String(body.userId || "").trim();

    if (!roomId || !userId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "roomId y userId son obligatorios" }),
      };
    }

    const claimsSub = event.requestContext?.authorizer?.claims?.sub
      || event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (claimsSub && !idsMatch(claimsSub, userId)) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "No autorizado" }),
      };
    }

    const room = await clearUnreadForUser(roomId, userId);
    if (!room) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Sala no encontrada" }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        roomId,
        unreadCount: 0,
      }),
    };
  } catch (error) {
    console.error("markChatRoomRead error:", error);
    return {
      statusCode: error.statusCode || 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || "Error interno" }),
    };
  }
};
