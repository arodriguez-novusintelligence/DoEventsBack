const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.getEventType = async (event) => {
  let response;

  try {
    // Obtener el id de el tipo de evento de los parametros de la ruta

    // Configurar los parametros para la consulta
    const params = {
      TableName: process.env.EVENT_TYPE_TABLE || "TipoEvento",
    };

    //ejecutar la consulta
    const data = await dynamoDb.scan(params).promise();

    //Respueta exitosa

    if (data.Items) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "EventType fetched successfully!",
          data: data.Items,
        }),
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Tipo de evento no encontrada" }),
      };
    }
  } catch (error) {
    console.error("Error al consultar el tipo de evento: ", error);

    let errorMensage = "Error interno del servidor";
    let statusCode = 500;

    if (error.message === "El id del tipo de evento es obligatorio") {
      errorMensage = error.message;
      statusCode = 400;
    } else if (errorMensage === "Tipo de evento no encontrado") {
      errorMensage = error.message;
      statusCode = 404;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: errorMensage,
        statusCode,
      }),
    };
  }

  return response;
};
