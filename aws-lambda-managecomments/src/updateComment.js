const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { commentId } = event.pathParameters;
    const { comment, userId, createdAt, liked } = JSON.parse(event.body);

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

    // Preparar la expresión de actualización
    let updateExpression = "SET updatedAt = :updatedAt";
    let expressionAttributeValues = {
      ":updatedAt": new Date().toISOString(),
    };
    let expressionAttributeNames = {};

    let wasTextEdited = false;

    // Si se quiere actualizar el texto del comentario
    if (comment !== undefined) {
      // Solo el commenterId puede editar el texto del comentario
      if (existingComment.Item.commenterId !== userId) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message: "Solo el autor del comentario puede editar el texto",
          }),
        };
      }

      // Verificar si el comentario realmente cambió
      if (comment !== existingComment.Item.comment) {
        updateExpression +=
          ", #cmnt = :comment, isEdited = :isEdited, editedAt = :editedAt";
        expressionAttributeNames["#cmnt"] = "comment";
        expressionAttributeValues[":comment"] = comment;
        expressionAttributeValues[":isEdited"] = true;
        expressionAttributeValues[":editedAt"] = new Date().toISOString();
        wasTextEdited = true;
      }
    }

    // Si se quiere actualizar el estado de like
    if (liked !== undefined) {
      // Solo el userId (dueño del perfil) puede dar/quitar like
      if (existingComment.Item.userId !== userId) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message:
              "Solo el dueño del perfil puede dar like a los comentarios",
          }),
        };
      }

      updateExpression += ", liked = :liked, likedBy = :likedBy";
      expressionAttributeValues[":liked"] = liked === true;
      expressionAttributeValues[":likedBy"] = liked === true ? userId : null;
    }

    // Si no hay nada que actualizar
    if (!comment && liked === undefined) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message:
            "Debe proporcionar al menos 'comment' o 'liked' para actualizar",
        }),
      };
    }

    const updateParams = {
      TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
      Key: {
        id: commentId,
        createdAt: createdAt,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    // Solo agregar ExpressionAttributeNames si hay nombres de atributos mapeados
    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }

    await dynamodb.update(updateParams).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: wasTextEdited
          ? "Comentario editado exitosamente"
          : "Comentario actualizado exitosamente",
        data: {
          isEdited: wasTextEdited || existingComment.Item.isEdited,
          editedAt: wasTextEdited
            ? expressionAttributeValues[":editedAt"]
            : existingComment.Item.editedAt,
        },
      }),
    };
  } catch (error) {
    console.error("Error actualizando comentario:", error);
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
