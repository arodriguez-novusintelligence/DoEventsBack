const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamodb = new AWS.DynamoDB.DocumentClient();

const getUserData = async (userId) => {
  try {
    const userResult = await dynamodb
      .get({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        ProjectionExpression: "#usr, fotoPerfilUrl, #platform",
        ExpressionAttributeNames: { "#usr": "user", "#platform": "platform" },
      })
      .promise();

    if (!userResult.Item) {
      return { userName: "Usuario desconocido", userImage: null };
    }

    let userImageUrl = null;
    if (userResult.Item.fotoPerfilUrl) {
      userImageUrl = userResult.Item.fotoPerfilUrl;
    }

    return {
      userName: userResult.Item.user || "Usuario sin nombre",
      userImage: userImageUrl,
      userPlatform: userResult.Item.platform || userResult.Item.PLATFORM || null,
    };
  } catch (error) {
    console.error("Error obteniendo datos del usuario:", error);
    return { userName: "Usuario desconocido", userImage: null, userPlatform: null };
  }
};

exports.handler = async (event) => {
  try {
    const { commentId } = event.pathParameters;
    const { userId, comment, createdAt } = JSON.parse(event.body); // Añadir createdAt

    if (!commentId || !userId || !comment || !createdAt) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "commentId, userId, comment y createdAt son obligatorios",
        }),
      };
    }

    // Verificar que el comentario existe usando clave compuesta
    const existingComment = await dynamodb
      .get({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt, // Usar la fecha del comentario original
        },
      })
      .promise();

    if (!existingComment.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Comentario no encontrado",
        }),
      };
    }

    if (existingComment.Item.reply) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Este comentario ya tiene una respuesta",
        }),
      };
    }

    // Obtener datos del usuario que responde
    const userData = await getUserData(userId);

    const reply = {
      id: uuidv4(),
      userId,
      userName: userData.userName,
      userImage: userData.userImage,
      userPlatform: userData.userPlatform,
      comment,
      createdAt: new Date().toISOString(),
    };

    await dynamodb
      .update({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt, // Usar la fecha del comentario original
        },
        UpdateExpression: "SET reply = :reply",
        ExpressionAttributeValues: {
          ":reply": reply,
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Respuesta agregada exitosamente",
        data: reply,
      }),
    };
  } catch (error) {
    console.error("Error agregando respuesta:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
};
