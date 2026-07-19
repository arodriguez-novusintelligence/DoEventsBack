const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getTicketsByEventAndOrder = async (event) => {
  let response;

  try {
    const { eventId, orderId } = event.pathParameters;

    if (!eventId || !orderId) {
      throw new Error("El eventId y el orderId son obligatorios");
    }

    const params = {
      TableName: "TicketsDistribution",
      IndexName: "eventIdIndex",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    };

    const data = await dynamodb.query(params).promise();

    if (!data.Items || data.Items.length === 0) {
      response = {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "No se encontraron tickets asociados al evento especificado" }),
      };
    } else {
      const filteredItems = data.Items.filter(item => item.orderId === orderId);

      if (filteredItems.length === 0) {
        response = {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "No se encontraron tickets para esa orden en el evento especificado" }),
        };
      } else {
        response = {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filteredItems),
        };
      }
    }
  } catch (error) {
    console.error(error);
    response = {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message }),
    };
  }

  return response;
};