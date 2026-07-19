const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const { userId, followerId } = JSON.parse(event.body);

  if (!userId || !followerId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Parámetros faltantes: userId y followerId son requeridos",
      }),
    };
  }

  try {
    // Verificar que ambos usuarios existan
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
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Usuario no encontrado" }),
      };
    }

    if (!follower.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Seguidor no encontrado" }),
      };
    }

    // Buscar la relación de seguimiento bloqueada
    const followId = `${followerId}_${userId}`;
    const existingFollow = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    if (!existingFollow.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: "No existe una relación de seguimiento con este usuario",
        }),
      };
    }

    if (existingFollow.Item.status !== "blocked") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Este usuario no está bloqueado",
        }),
      };
    }

    // Eliminar la relación de seguimiento bloqueada
    await dynamodb
      .delete({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Usuario desbloqueado exitosamente",
        unblockedUser: {
          id: followerId,
          name: follower.Item.name,
          lastName: follower.Item.lastName,
          user: follower.Item.user,
        },
        followId: followId,
        unblockedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error("Error en unblockFollower:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
};
