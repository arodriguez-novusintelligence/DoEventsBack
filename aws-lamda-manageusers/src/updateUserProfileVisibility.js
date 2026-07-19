const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.updateUserProfileVisibility = async (event) => {
  let response;

  try {
    // Parsear el cuerpo de la solicitud
    const { id, isPublicProfile } = JSON.parse(event.body);

    if (!id || typeof isPublicProfile !== "boolean") {
      throw new Error(
        "El campo id y el estado isPublicProfile (boolean) son obligatorios"
      );
    }

    // Actualizar el campo isPublicProfile usando el id
    const params = {
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: { id },
      UpdateExpression: "SET isPublicProfile = :isPublicProfile",
      ExpressionAttributeValues: {
        ":isPublicProfile": isPublicProfile,
      },
      ReturnValues: "UPDATED_NEW",
    };

    const result = await dynamodb.update(params).promise();

    response = {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statusDesc: "Visibilidad de perfil actualizada exitosamente",
        statusCode: 200,
        updatedAttributes: result.Attributes,
      }),
    };
  } catch (error) {
    response = {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statusDesc: "Error al actualizar visibilidad de perfil",
        statusMessage: error.message,
        statusCode: 400,
      }),
    };
  }

  return response;
};
