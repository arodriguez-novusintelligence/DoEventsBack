const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getOrderByEventId = async (event) => {
  let response;

  try {
    // Obtener el id del evento desde los parámetros de la solicitud
    const { eventId } = event.pathParameters;

    if (!eventId) {
      throw new Error("El id del evento es obligatorio");
    }

    // Parámetros de consulta para obtener las órdenes por el id del evento
    const params = {
      TableName: "Orders",
      IndexName: "event_id-created_at-index",
      KeyConditionExpression: "event_id = :event_id",
      ExpressionAttributeValues: {
        ":event_id": eventId,
      },
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.query(params).promise();

    // Verificar si se encontraron órdenes
    if (!data.Items || data.Items.length === 0) {
      throw new Error("Órdenes no encontradas");
    }

    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data.Items),
    };
  } catch (error) {
    console.error(error);
    response = {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: error.message }),
    };
  }

  return response;
}