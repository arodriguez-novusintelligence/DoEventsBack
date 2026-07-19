const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId, floorId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.createdBy;

    if (!body.name || (!body.type && !body.geometry)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name and type (or geometry) are required" }),
      };
    }

    // Verificar que el floor existe
    const floorExists = await dynamodb
      .get({
        TableName: "Venue_Floor",
        Key: { floorId },
      })
      .promise();

    if (!floorExists.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Floor not found" }),
      };
    }

    const elementId = body.elementId || uuidv4(); // Usar ID del frontend o generar uno nuevo
    const now = new Date().toISOString();

    const element = {
      elementId,
      floorId,
      venueId,
      name: body.name,
      type: body.type || body.geometry || "other",
      geometry: body.geometry || body.type || "RECTANGLE",
      position: body.position || "",
      relX: body.relX || 0,
      relY: body.relY || 0,
      zIndex: body.zIndex !== undefined ? body.zIndex : 0,
      rotation: body.rotation !== undefined ? body.rotation : 0,
      width: body.width || 0,
      height: body.height || 0,
      horseshoeCurvature: body.horseshoeCurvature !== undefined ? body.horseshoeCurvature : 0,
      textColor: body.textColor || "",
      textFontWeight: body.textFontWeight || "",
      textFontFamily: body.textFontFamily || "",
      textFontSize: body.textFontSize !== undefined ? body.textFontSize : 0,
      notes: body.notes || "",
      createdAt: now,
      createdBy: userId,
    };

    await dynamodb
      .put({
        TableName: "Venue_Element",
        Item: element,
      })
      .promise();

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Element created successfully",
        elementId,
        element,
      }),
    };
  } catch (error) {
    console.error("Error in createElementHandler:", error);
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
