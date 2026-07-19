const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler: updateEntranceHandler
 *
 * Actualiza una configuración de entrada existente.
 * Permite actualizar campos básicos sin afectar categorías/precios.
 *
 * Path: PUT /venues/{venueId}/entrances/{entranceId}
 */

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const venueId = event.pathParameters?.venueId;
    const entranceId = event.pathParameters?.entranceId;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.updatedBy;

    if (!venueId || !entranceId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "venueId and entranceId are required" }),
      };
    }

    // Verificar que la entrada existe
    const entranceCheck = await dynamodb
      .get({
        TableName: "Venue_Entrance",
        Key: { entranceId },
      })
      .promise();

    if (!entranceCheck.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Entrance configuration not found" }),
      };
    }

    if (entranceCheck.Item.venueId !== venueId) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Entrance does not belong to this venue",
        }),
      };
    }

    const now = new Date().toISOString();

    // Construir expresión de actualización dinámica
    const updateData = {
      name: body.name,
      description: body.description,
      type: body.type,
      isActive: body.isActive,
      capacity: body.capacity,
      availableCapacity: body.availableCapacity,
      requiresReservation: body.requiresReservation,
      allowsGroupBooking: body.allowsGroupBooking,
      minGroupSize: body.minGroupSize,
      maxGroupSize: body.maxGroupSize,
      validFrom: body.validFrom,
      validUntil: body.validUntil,
      metadata: body.metadata,
      updatedAt: now,
      updatedBy: userId,
    };

    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined && value !== null) {
        updateExpression.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }

    if (updateExpression.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No fields to update" }),
      };
    }

    // Actualizar en DynamoDB
    const result = await dynamodb
      .update({
        TableName: "Venue_Entrance",
        Key: { entranceId },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
      .promise();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Entrance configuration updated successfully",
        entrance: result.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error in updateEntranceHandler:", error);
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
