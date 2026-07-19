const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const {
  getActiveRoomByRoomId,
  assertRoomAdmin,
  idsMatch,
} = require("../utils/chatRoomAdmin");
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

    assertRoomAdmin(roomData, requestedByUserId);

    const blacklist = Array.isArray(roomData.blacklist) ? roomData.blacklist : [];
    if (blacklist.some((id) => idsMatch(id, userId))) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "El usuario ya está bloqueado en esta sala" }),
      };
    }

    const participants = Array.isArray(roomData.participants) ? roomData.participants : [];
    const updatedParticipants = participants.filter((id) => !idsMatch(id, userId));

    await docClient
      .update({
        TableName: CHATS_TABLE,
        Key: {
          id: roomData.id,
          updatedAt: roomData.updatedAt,
        },
        UpdateExpression:
          "SET blacklist = list_append(if_not_exists(blacklist, :empty), :user), #participants = :participants",
        ExpressionAttributeNames: {
          "#participants": "participants",
        },
        ExpressionAttributeValues: {
          ":user": [userId],
          ":empty": [],
          ":participants": updatedParticipants,
        },
      })
      .promise();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ message: "Usuario bloqueado en la sala" }),
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
