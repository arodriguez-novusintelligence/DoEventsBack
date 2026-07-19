const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getOrdersByEventAndUser = async (event) => {
  let response;
  try {
    const { eventId, userId } = event.pathParameters;
    if (!eventId || !userId) {
      throw new Error("El id del evento y el id del usuario son obligatorios");
    }

    const params = {
      TableName: "Orders",
      IndexName: "user_id-created_at-index",
      KeyConditionExpression: "user_id = :user_id",
      ExpressionAttributeValues: {
        ":user_id": userId,
      },
    };

    const data = await dynamodb.query(params).promise();

    const filteredItems = data.Items.filter(item => item.event_id === eventId);

    if (filteredItems.length === 0) {
      throw new Error("Órdenes no encontradas para el evento y usuario indicados");
    }

    response = {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filteredItems),
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