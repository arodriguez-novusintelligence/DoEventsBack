const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getUser = async (event) => {
  let response;

  try {
    // Obtener el id del usuario de los parámetros de la ruta
    const { email } = event.pathParameters;
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      throw new Error("El email del usuario es obligatorio");
    }

    // Configurar los parámetros para la consulta
    const params = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "EmailIndex",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": normalizedEmail,
      },
    };

    // Ejecutar la consulta
    let result = await dynamodb.query(params).promise();

    if (
      (!result.Items || result.Items.length === 0) &&
      email !== normalizedEmail
    ) {
      const legacyParams = {
        ...params,
        ExpressionAttributeValues: { ":email": email },
      };
      result = await dynamodb.query(legacyParams).promise();
    }

    if (!result.Items) {
      throw new Error("Usuario no encontrado");
    }

    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // rquid: id,
      },
      body: JSON.stringify(result.Items),
    };
  } catch (error) {
    console.error("Error al consultar el usuario:", error);

    // Manejo de errores
    let errorMessage = "Error interno del servidor";
    let statusCode = 500;

    if (error.message === "El id del usuario es obligatorio") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "Usuario no encontrado") {
      errorMessage = error.message;
      statusCode = 404;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statusDesc: errorMessage,
        message: error.message,
        statusCode,
      }),
    };
  }

  return response;
};
