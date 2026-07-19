const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { commentId } = event.pathParameters;
    const { userId, createdAt } = JSON.parse(event.body);

    if (!commentId || !userId || !createdAt) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "commentId, userId y createdAt son obligatorios",
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

    // Solo el dueño del perfil puede dar like
    if (existingComment.Item.userId !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: "Solo el dueño del perfil puede dar like a los comentarios",
        }),
      };
    }

    // Toggle del estado de like
    const currentLiked = existingComment.Item.liked || false;
    const newLiked = !currentLiked;

    // IMPORTANTE: Solo actualizar campos relacionados al like, NO marcar como editado
    await dynamodb
      .update({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt,
        },
        UpdateExpression:
          "SET liked = :liked, likedBy = :likedBy, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":liked": newLiked,
          ":likedBy": newLiked ? userId : null,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: newLiked
          ? "Like agregado exitosamente"
          : "Like removido exitosamente",
        data: {
          liked: newLiked,
          likedBy: newLiked ? userId : null,
          // NO incluir isEdited aquí porque dar like no cuenta como edición
        },
      }),
    };
  } catch (error) {
    console.error("Error actualizando like:", error);
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
