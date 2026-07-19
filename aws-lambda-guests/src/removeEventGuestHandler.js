const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { guestResponse } = require("./guestResponse");

exports.handler = async (event) => {
  try {
    const { eventId, guestId } = event.pathParameters || {};
    if (!eventId || !guestId) {
      return guestResponse(400, { error: "eventId and guestId are required" });
    }

    const eventsTable = process.env.EVENTS_TABLE || process.env.EVENTS_ALT_TABLE || "Eventos";
    const eventData = await dynamodb
      .get({ TableName: eventsTable, Key: { id: eventId } })
      .promise();

    if (!eventData.Item) {
      return guestResponse(404, { error: "Event not found" });
    }

    await dynamodb
      .delete({
        TableName: process.env.EVENT_GUESTS_TABLE || "EventGuests",
        Key: { eventId, guestId },
      })
      .promise();

    return guestResponse(200, { deleted: true });
  } catch (error) {
    console.error("removeEventGuest error:", error);
    return guestResponse(500, { error: "Error removing guest", message: error.message });
  }
};
