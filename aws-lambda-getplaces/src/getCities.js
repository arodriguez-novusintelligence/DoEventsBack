const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getCitiesByStateId = async (event) => {
  let response;

  try {
    // Obtener el id del evento desde los parámetros de la solicitud
    let { id_state } = event.pathParameters;
    id_state = Number(id_state);

    if (!id_state) {
      throw new Error("El id del estado es obligatorio");
    }

    // Parámetros de consulta para obtener los tickets por el id del evento
    const params = {
      TableName: process.env.CITIES_TABLE || "Cities",
      IndexName: "id_state-index", // Nombre del índice secundario global
      KeyConditionExpression: "id_state = :id_state",
      ExpressionAttributeValues: {
        ":id_state": id_state,
      },
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.query(params).promise();

    if (!data.Items || data.Items.length === 0) {
      throw new Error("Ciudades no encontradas");
    }

    // Ordenar los resultados por el campo 'name' en orden alfabético
    data.Items.sort((a, b) => a.name.localeCompare(b.name));

    // Realizar la consulta a DynamoDB

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
    if (error.message === "El id del estado es obligatorio") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "Ciudades no encontradas") {
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
