const AWS = require("aws-sdk");

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
    const { userId, comment, createdAt } = JSON.parse(event.body);

    if (!commentId || !userId || !comment || !createdAt) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "commentId, userId, comment y createdAt son obligatorios",
        }),
      };
    }

    // Verificar que el comentario existe
    const existingComment = await dynamodb
      .get({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt,
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

    // Verificar que el comentario tiene una respuesta
    if (!existingComment.Item.reply) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Este comentario no tiene respuesta para editar",
        }),
      };
    }

    // Solo el autor de la respuesta puede editarla
    if (existingComment.Item.reply.userId !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: "Solo el autor de la respuesta puede editarla",
        }),
      };
    }

    // Verificar si el contenido de la respuesta realmente cambió
    if (comment === existingComment.Item.reply.comment) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El contenido de la respuesta no ha cambiado",
        }),
      };
    }

    // Obtener datos actualizados del usuario (por si cambió la imagen de perfil)
    const userData = await getUserData(userId);

    // Crear la respuesta actualizada con tracking de edición
    const updatedReply = {
      ...existingComment.Item.reply,
      comment: comment,
      userName: userData.userName,
      userImage: userData.userImage,
      userPlatform: userData.userPlatform,
      isEdited: true,
      editedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Actualizar el comentario con la respuesta editada
    await dynamodb
      .update({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt,
        },
        UpdateExpression: "SET reply = :reply, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":reply": updatedReply,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Respuesta editada exitosamente",
        data: {
          reply: updatedReply,
          isEdited: true,
          editedAt: updatedReply.editedAt,
        },
      }),
    };
  } catch (error) {
    console.error("Error editando respuesta:", error);
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
