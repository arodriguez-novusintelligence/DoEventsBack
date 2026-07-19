const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { guestResponse } = require("./guestResponse");

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    if (!eventId) {
      return guestResponse(400, { error: "eventId is required" });
    }

    const eventsTable = process.env.EVENTS_TABLE || process.env.EVENTS_ALT_TABLE || "Eventos";
    const eventData = await dynamodb
      .get({ TableName: eventsTable, Key: { id: eventId } })
      .promise();

    if (!eventData.Item) {
      return guestResponse(404, { error: "Event not found" });
    }

    const result = await dynamodb
      .query({
        TableName: process.env.EVENT_GROUPS_TABLE || "EventGroups",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
      })
      .promise();

    return guestResponse(200, { groups: result.Items || [] });
  } catch (error) {
    console.error("getEventGroups error:", error);
    return guestResponse(500, { error: "Error getting groups", message: error.message });
  }
};
