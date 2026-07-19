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

    // Verificar que el comentario existe y pertenece al usuario
    const existingComment = await dynamodb
      .get({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt, // Obtener este valor del body
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

    // Permitir eliminar si es el autor del comentario o el dueño del perfil
    if (
      existingComment.Item.commenterId !== userId &&
      existingComment.Item.userId !== userId
    ) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: "No tienes permisos para eliminar este comentario",
        }),
      };
    }

    await dynamodb
      .delete({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt, // Obtener este valor del body
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Comentario eliminado exitosamente",
      }),
    };
  } catch (error) {
    console.error("Error eliminando comentario:", error);
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
