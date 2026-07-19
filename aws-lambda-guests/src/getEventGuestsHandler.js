const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    // Validar existencia del evento sin romper si la tabla no esta accesible.
    try {
      const eventData = await dynamodb
        .get({
          TableName: process.env.EVENTS_TABLE || "Eventos",
          Key: { id: eventId },
        })
        .promise();

      if (!eventData.Item) {
        return response(404, { error: "Event not found" });
      }
    } catch (eventValidationError) {
      console.warn(
        "[getEventGuests] event validation warning:",
        eventValidationError.message
      );
    }

    const params = {
      TableName: process.env.EVENT_GUESTS_TABLE || "EventGuests",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
    };
    const result = await dynamodb.query(params).promise();

    return response(200, { guests: result.Items || [] });
  } catch (error) {
    console.error("getEventGuests error:", error);
    return response(500, {
      error: "Error getting event guests",
      message: error.message,
    });
  }
};
