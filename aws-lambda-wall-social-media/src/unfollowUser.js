const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getClientByUserId } = require("./clientUserLookup");

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const { userId, follow_userId } = JSON.parse(event.body || "{}");

  if (!userId || !follow_userId) {
    return respond(400, {
      message: "Parámetros faltantes: userId y follow_userId son requeridos",
    });
  }

  try {
    const [followerUser, targetUser] = await Promise.all([
      getClientByUserId(userId),
      getClientByUserId(follow_userId),
    ]);

    if (!followerUser) {
      return respond(404, { message: "Usuario seguidor no encontrado" });
    }

    if (!targetUser) {
      return respond(404, { message: "Usuario a dejar de seguir no encontrado" });
    }

    const resolvedFollowerId = String(followerUser.id || userId).trim();
    const resolvedTargetId = String(targetUser.id || follow_userId).trim();
    const followId = `${resolvedFollowerId}_${resolvedTargetId}`;

    const existingFollow = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    if (!existingFollow.Item) {
      return respond(404, { message: "No sigues a este usuario" });
    }

    const wasPending = existingFollow.Item.status === "pending";

    await dynamodb
      .delete({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    return respond(200, {
      message: wasPending
        ? "Solicitud de seguimiento cancelada"
        : "Has dejado de seguir al usuario exitosamente",
      cancelledPending: wasPending,
    });
  } catch (error) {
    console.error("Error en unfollowUser:", error);
    return respond(500, { error: "Error interno del servidor", message: error.message });
  }
};
