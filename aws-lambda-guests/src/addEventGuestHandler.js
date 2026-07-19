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
    const guestId = v4();
    const now = new Date().toISOString();

    const item = {
      eventId,
      guestId,
      name: body.name || "",
      createdAt: now,
      updatedAt: now,
    };
    // Omitir atributos vacíos: DynamoDB no permite NULL en claves de GSI (p. ej. GSI-userId).
    if (body.email) item.email = body.email;
    if (body.phone) item.phone = body.phone;
    if (body.userId) item.userId = body.userId;
    if (body.favoriteId) item.favoriteId = body.favoriteId;

    await dynamodb
      .put({
        TableName: process.env.EVENT_GUESTS_TABLE || "EventGuests",
        Item: item,
      })
      .promise();

    return guestResponse(201, { guestId });
  } catch (error) {
    console.error("addEventGuest error:", error);
    return guestResponse(500, { error: "Error adding guest", message: error.message });
  }
};
