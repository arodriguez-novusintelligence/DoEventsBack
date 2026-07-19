const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

/**
 * Handler: createEntranceCategoryHandler
 *
 * Crea una nueva categoría de entrada para una configuración existente.
 *
 * Path: POST /venues/{venueId}/entrances/{entranceId}/categories
 */

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const venueId = event.pathParameters?.venueId;
    const entranceId = event.pathParameters?.entranceId;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.createdBy;

    if (!venueId || !entranceId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "venueId and entranceId are required" }),
      };
    }

    if (!body.name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    // Verificar que la entrada existe
    const entranceCheck = await dynamodb
      .get({
        TableName: "Venue_Entrance",
        Key: { entranceId },
      })
      .promise();

    if (!entranceCheck.Item || entranceCheck.Item.venueId !== venueId) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Entrance configuration not found" }),
      };
    }

    const entranceCategoryId = uuidv4();
    const now = new Date().toISOString();

    const category = {
      entranceCategoryId,
      entranceId,
      venueId,
      name: body.name,
      description: body.description || "",
      type: body.type || "standard",
      capacity: body.capacity || 0,
      availableCapacity: body.capacity || 0,
      minAge: body.minAge || null,
      maxAge: body.maxAge || null,
      requiresDocumentation: body.requiresDocumentation || false,
      allowedDays: body.allowedDays || [],
      allowedTimeRanges: body.allowedTimeRanges || [],
      priority: body.priority || 0,
      sortOrder: body.sortOrder || 0,
      isActive: body.isActive !== undefined ? body.isActive : true,
      metadata: body.metadata || {},
      createdAt: now,
      createdBy: userId,
    };

    await dynamodb
      .put({
        TableName: "Venue_Entrance_Category",
        Item: category,
      })
      .promise();

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Entrance category created successfully",
        category,
      }),
    };
  } catch (error) {
    console.error("Error in createEntranceCategoryHandler:", error);
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
