const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4 } = require("uuid");
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

    const body = JSON.parse(event.body || "{}");
    const groupId = v4();
    const now = new Date().toISOString();

    await dynamodb
      .put({
        TableName: process.env.EVENT_GROUPS_TABLE || "EventGroups",
        Item: {
          eventId,
          groupId,
          name: body.name || "Grupo",
          description: body.description || "",
          guestIds: body.guestIds || [],
          createdAt: now,
          updatedAt: now,
        },
      })
      .promise();

    return guestResponse(201, { groupId });
  } catch (error) {
    console.error("addEventGroup error:", error);
    return guestResponse(500, { error: "Error adding group", message: error.message });
  }
};
