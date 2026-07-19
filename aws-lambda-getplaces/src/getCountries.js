const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getCountries = async (event) => {
  let response;

  try {
    const params = {
      TableName: process.env.COUNTRIES_TABLE || "Countries",
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.scan(params).promise();
    console.log(data.Items);
    // Verificar si se encontraron Paises
    if (!data.Items || data.Items.length === 0) {
      throw new Error("No se encontraron paises");
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
    let errorMessage = "Error interno del servidor";
    let statusCode = 500;
    if (error.message === "No se encontraron paises") {
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
