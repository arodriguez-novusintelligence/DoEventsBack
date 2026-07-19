const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

/**
 * Handler: createEntranceHandler
 *
 * Crea una configuración de entradas para un venue.
 * Permite definir categorías de entradas con sus precios y capacidades.
 *
 * Path: POST /venues/{venueId}/entrances
 */

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const venueId = event.pathParameters?.venueId;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.createdBy;

    // Validaciones
    if (!venueId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "venueId is required" }),
      };
    }

    if (!body.name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    // Verificar que el venue existe
    const venueCheck = await dynamodb
      .get({
        TableName: process.env.VENUE_TABLE || "Venues",
        Key: { venue_id: venueId },
      })
      .promise();

    if (!venueCheck.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Venue not found" }),
      };
    }

    const entranceId = uuidv4();
    const now = new Date().toISOString();

    // Crear configuración de entrada principal
    const entrance = {
      entranceId,
      venueId,
      name: body.name,
      description: body.description || "",
      type: body.type || "general", // general, vip, accessible, etc.
      isActive: body.isActive !== undefined ? body.isActive : true,
      capacity: body.capacity || 0,
      availableCapacity: body.capacity || 0,
      requiresReservation: body.requiresReservation || false,
      allowsGroupBooking: body.allowsGroupBooking || false,
      minGroupSize: body.minGroupSize || 1,
      maxGroupSize: body.maxGroupSize || 10,
      validFrom: body.validFrom || null,
      validUntil: body.validUntil || null,
      metadata: body.metadata || {},
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };

    // Guardar en DynamoDB
    await dynamodb
      .put({
        TableName: "Venue_Entrance",
        Item: entrance,
      })
      .promise();

    // Procesar categorías de entrada si existen
    const categories = [];
    if (body.categories && Array.isArray(body.categories)) {
      for (const categoryData of body.categories) {
        const entranceCategoryId = uuidv4();

        const category = {
          entranceCategoryId,
          entranceId,
          venueId,
          name: categoryData.name,
          description: categoryData.description || "",
          type: categoryData.type || "standard", // standard, vip, student, senior, child, etc.
          capacity: categoryData.capacity || 0,
          availableCapacity: categoryData.capacity || 0,
          minAge: categoryData.minAge || null,
          maxAge: categoryData.maxAge || null,
          requiresDocumentation: categoryData.requiresDocumentation || false,
          allowedDays: categoryData.allowedDays || [], // ["monday", "tuesday", etc.]
          allowedTimeRanges: categoryData.allowedTimeRanges || [], // [{ start: "09:00", end: "17:00" }]
          priority: categoryData.priority || 0,
          sortOrder: categoryData.sortOrder || 0,
          isActive:
            categoryData.isActive !== undefined ? categoryData.isActive : true,
          metadata: categoryData.metadata || {},
          createdAt: now,
          createdBy: userId,
        };

        await dynamodb
          .put({
            TableName: "Venue_Entrance_Category",
            Item: category,
          })
          .promise();

        categories.push({
          entranceCategoryId,
          name: category.name,
          type: category.type,
          capacity: category.capacity,
        });
      }
    }

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Entrance configuration created successfully",
        entrance: {
          entranceId,
          venueId,
          name: entrance.name,
          type: entrance.type,
          capacity: entrance.capacity,
          categoryCount: categories.length,
          categories,
        },
      }),
    };
  } catch (error) {
    console.error("Error in createEntranceHandler:", error);
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
