const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getStatesByCountryId = async (event) => {
  let response;

  try {
    // Obtener el id del evento desde los parámetros de la solicitud
    let { id_country } = event.pathParameters;
    id_country = Number(id_country);

    if (!id_country) {
      throw new Error("El id del pais es obligatorio");
    }

    // Parámetros de consulta para obtener los tickets por el id del evento
    const params = {
      TableName: process.env.STATES_TABLE || "States",
      IndexName: "id_country-index", // Nombre del índice secundario global
      KeyConditionExpression: "id_country = :id_country",
      ExpressionAttributeValues: {
        ":id_country": id_country,
      },
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.query(params).promise();

    if (!data.Items || data.Items.length === 0) {
      throw new Error("Estados no encontrados");
    }
    data.Items.sort((a, b) => a.name.localeCompare(b.name));
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "consulta de listado de paises exitosa",
        data: data.Items,
      }),
    };
  } catch (error) {
    console.error("Error al obtener el evento:", error);
    let errorMessage = "Error interno del servidor";
    let statusCode = 500;
    if (error.message === "El id del pais es obligatorio") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "Estados no encontrados") {
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
