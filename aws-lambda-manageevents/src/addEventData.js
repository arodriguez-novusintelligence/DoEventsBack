const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const {
  assertRefundCategoryConfigured,
} = require("./lib/refundPolicyValidation");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";

exports.addEventData = async (event) => {
  let response;

  const { eventId, categoriaReembolso } = JSON.parse(event.body);
  try {
    if (!eventId) {
      throw new Error("El eventId es obligatorio");
    }

    const normalizedRefundCategory = assertRefundCategoryConfigured(categoriaReembolso);

    const createDate = new Date().toISOString();

    const params = {
      TableName: EVENTS_TABLE,
      Key: {
        id: eventId,
      },

      UpdateExpression: "set categoriaReembolso = :categoriaReembolso",
      ExpressionAttributeValues: {
        ":categoriaReembolso": normalizedRefundCategory,
      },
    };

    // Intentar insertar el nuevo evento en DynamoDB
    const data = await dynamodb.update(params).promise();

    // Respuesta exitosa
    const statusDesc = "Evento actualizado exitosamente";
    response = {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "exitoso",
        data: {
          message: statusDesc,
          createDate: createDate,
        },
        //aforo: calendar,
      }),
    };
    //await logEvent("createEvent", event.body, response.body, 201);
  } catch (error) {
    console.error("Error al crear el evento:", error);

    // Manejo de errores
    let errorMessage = "Error interno del servidor";
    let errorDescription = error;
    let statusCode = 500;
    //await logEvent("createEvent", event.body, response.body, 500);
    if (error.message === "Todos los campos son obligatorios") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.statusCode === 400 || /reembolso/i.test(String(error.message || ""))) {
      errorMessage = error.message;
      statusCode = 400;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        statusDesc: errorMessage,
        statusMessage: error,
        statusCode,
        //cuerpo: nombre,
      }),
    };
  }

  return response;
};
