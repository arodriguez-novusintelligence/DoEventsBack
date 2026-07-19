const AWS = require("aws-sdk");
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const docClient = new AWS.DynamoDB.DocumentClient();

async function findRoomByRoomId(roomId) {
  const result = await docClient
    .query({
      TableName: CHATS_TABLE,
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: { ":roomId": roomId },
    })
    .promise();
  const items = (result.Items || []).filter((room) => !room.deletedAt);
  return items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))[0] || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const body = parseLambdaJsonBody(event);
    const userId = String(body.userId || "").trim();
    const roomId = String(body.roomId || "").trim();
    if (!userId || !roomId) {
      return jsonResponse(400, { error: "userId y roomId son obligatorios" });
    }

    const room = await findRoomByRoomId(roomId);
    if (!room) return jsonResponse(404, { error: "Sala no encontrada" });

    const archivedBy = (Array.isArray(room.archivedBy) ? room.archivedBy : []).filter((id) => id !== userId);

    await docClient
      .update({
        TableName: CHATS_TABLE,
        Key: { id: room.id, updatedAt: room.updatedAt },
        UpdateExpression: "SET archivedBy = :archivedBy, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":archivedBy": archivedBy,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    return jsonResponse(200, { message: "Chat desarchivado", roomId, archivedBy });
  } catch (error) {
    console.error("unarchiveChatRoom:", error);
    return jsonResponse(500, { error: error.message || "Internal server error" });
  }
};
