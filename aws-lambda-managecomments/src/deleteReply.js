const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

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

    if (!existingComment.Item.reply) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "No hay respuesta para eliminar",
        }),
      };
    }

    // Verificar permisos: autor de la respuesta o dueño del perfil
    if (
      existingComment.Item.reply.userId !== userId &&
      existingComment.Item.userId !== userId
    ) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: "No tienes permisos para eliminar esta respuesta",
        }),
      };
    }

    await dynamodb
      .update({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Key: {
          id: commentId,
          createdAt: createdAt, // Obtener este valor del body
        },
        UpdateExpression: "REMOVE reply",
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Respuesta eliminada exitosamente",
      }),
    };
  } catch (error) {
    console.error("Error eliminando respuesta:", error);
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
