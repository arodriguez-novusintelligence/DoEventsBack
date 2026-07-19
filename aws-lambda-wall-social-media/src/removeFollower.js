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

    if (!existingFollow.Item) {
      return respond(404, { message: "Este usuario no te está siguiendo" });
    }

    if (existingFollow.Item.status !== "accepted") {
      return respond(400, {
        message: "No puedes eliminar un seguidor que no ha sido aceptado",
      });
    }

    await dynamodb
      .delete({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    return respond(200, {
      message: "Seguidor eliminado exitosamente",
      removedFollower: {
        id: followerId,
        name: follower.Item.name,
        lastName: follower.Item.lastName,
        user: follower.Item.user,
      },
    });
  } catch (error) {
    console.error("Error en removeFollower:", error);
    return respond(500, { error: "Error interno del servidor" });
  }
};
