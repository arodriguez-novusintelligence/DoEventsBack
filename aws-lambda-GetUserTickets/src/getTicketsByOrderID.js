const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getTicketsByOrderId = async (event) => {
  let response;

  try {
    const { orderId } = event.pathParameters;

    if (!orderId) {
      throw new Error("El id de la orden es obligatorio");
    }

    const params = {
      TableName: "TicketsDistribution",
      IndexName: "order_id-created_at-index",
      KeyConditionExpression: "order_id = :order_id",
      ExpressionAttributeValues: {
        ":order_id": orderId,
      },
    };
x
    const data = await dynamodb.query(params).promise();

    if (!data.Items || data.Items.length === 0) {
      throw new Error("Tickets no encontrados para esta orden");
    }

    response = {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data.Items),
    };
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