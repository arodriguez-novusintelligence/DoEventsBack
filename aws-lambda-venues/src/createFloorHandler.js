const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.createdBy;

    if (!body.name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    // Verificar que el venue existe
    const venueExists = await dynamodb
      .get({
        TableName: process.env.VENUE_TABLE || "Venues",
        Key: { venue_id: venueId },
      })
      .promise();

    if (!venueExists.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Venue not found" }),
      };
    }

    const floorId = body.floorId || uuidv4(); // Usar ID del frontend o generar uno nuevo
    const now = new Date().toISOString();

    const defaultEditorSettings = {
      showActionLabels: false,
      canvasGridVisible: true,
      canvasDarkMode: false,
      canvasGridVisualMode: "normal",
      workspaceExpansion: { left: 0, top: 0, right: 1800, bottom: 1200 },
    };
    const floor = {
      floorId,
      venueId,
      name: body.name,
      description: body.description || "",
      image: body.image || "",
      editorSettings: body.editorSettings || defaultEditorSettings,
      createdAt: now,
      createdBy: userId,
    };

    await dynamodb
      .put({
        TableName: "Venue_Floor",
        Item: floor,
      })
      .promise();

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Floor created successfully",
        floorId,
        floor,
      }),
    };
  } catch (error) {
    console.error("Error in createFloorHandler:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
