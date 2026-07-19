const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const { userId, followerId } = JSON.parse(event.body || "{}");

  if (!userId || !followerId) {
    return respond(400, {
      message: "Parámetros faltantes: userId y followerId son requeridos",
    });
  }

  try {
    const [user, follower] = await Promise.all([
      dynamodb
        .get({
          TableName: process.env.DYNAMODB_CLIENT_TABLE,
          Key: { id: userId },
        })
        .promise(),
      dynamodb
        .get({
          TableName: process.env.DYNAMODB_CLIENT_TABLE,
          Key: { id: followerId },
        })
        .promise(),
    ]);

    if (!user.Item) {
      return respond(404, { message: "Usuario no encontrado" });
    }

    if (!follower.Item) {
      return respond(404, { message: "Seguidor no encontrado" });
    }

    const followId = `${followerId}_${userId}`;
    const existingFollow = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    if (existingFollow.Item && existingFollow.Item.status === "blocked") {
      return respond(400, { message: "Este usuario ya está bloqueado" });
    }

    if (existingFollow.Item) {
      await dynamodb
        .update({
          TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
          Key: { follow_id: followId },
          UpdateExpression:
            "SET #status = :status, blocked_at = :blocked_at, updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "blocked",
            ":blocked_at": new Date().toISOString(),
            ":updated_at": new Date().toISOString(),
          },
        })
        .promise();
    } else {
      await dynamodb
        .put({
          TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
          Item: {
            follow_id: followId,
            userId: followerId,
            follow_userId: userId,
            status: "blocked",
            blocked_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        })
        .promise();
    }

    return respond(200, {
      message: "Usuario bloqueado exitosamente",
      blockedUser: {
        id: followerId,
        name: follower.Item.name,
        lastName: follower.Item.lastName,
        user: follower.Item.user,
      },
      followId,
      blockedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en blockFollower:", error);
    return respond(500, { error: "Error interno del servidor" });
  }
};
