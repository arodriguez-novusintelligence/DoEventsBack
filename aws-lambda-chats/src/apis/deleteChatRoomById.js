const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");

async function findRoomByRoomId(roomId) {
  const roomResult = await docClient
    .query({
      TableName: "Chats",
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": roomId,
      },
      Limit: 1,
    })
    .promise();

  return roomResult.Items && roomResult.Items.length > 0
    ? roomResult.Items[0]
    : null;
}

async function updateDeletedAt(roomData, deletedAt, deletedBy) {
  const exprValues = {
    ":deletedAt": deletedAt,
  };

  let updateExpression = "SET deletedAt = :deletedAt";
  if (deletedBy) {
    updateExpression += ", deletedBy = :deletedBy";
    exprValues[":deletedBy"] = deletedBy;
  }

  const keyCandidates = [];
  if (roomData.id && roomData.updatedAt) {
    keyCandidates.push({ id: roomData.id, updatedAt: roomData.updatedAt });
  }
  if (roomData.id) {
    keyCandidates.push({ id: roomData.id });
  }
  keyCandidates.push({ roomId: roomData.roomId });

  let lastError;
  for (const key of keyCandidates) {
    try {
      await docClient
        .update({
          TableName: "Chats",
          Key: key,
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: exprValues,
          ReturnValues: "ALL_NEW",
        })
        .promise();
      return;
    } catch (error) {
      lastError = error;
      if (!(error && error.code === "ValidationException")) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo actualizar deletedAt");
}

exports.handler = async (event) => {
  try {
    const body = parseLambdaJsonBody(event);
    const roomId = String(body.roomId || body.id || "").trim();
    const deletedBy = String(body.deletedBy || body.userId || "").trim() || null;

    if (!roomId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "roomId es obligatorio" }),
      };
    }

    const roomData = await findRoomByRoomId(roomId);
    if (!roomData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Sala no encontrada" }),
      };
    }

    if (roomData.deletedAt) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Sala ya estaba eliminada lógicamente",
          roomId,
          deletedAt: roomData.deletedAt,
        }),
      };
    }

    const deletedAt = new Date().toISOString();
    await updateDeletedAt(roomData, deletedAt, deletedBy);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Sala eliminada lógicamente",
        roomId,
        deletedAt,
        ...(deletedBy ? { deletedBy } : {}),
      }),
    };
  } catch (error) {
    console.error("Error en deleteChatRoomById:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Internal server error",
      }),
    };
  }
};
