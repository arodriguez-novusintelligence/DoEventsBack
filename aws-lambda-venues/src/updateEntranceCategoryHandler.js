const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler: updateEntranceCategoryHandler
 *
 * Actualiza una categoría de entrada existente.
 *
 * Path: PUT /venues/{venueId}/entrances/{entranceId}/categories/{categoryId}
 */

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const categoryId = event.pathParameters?.categoryId;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.updatedBy;

    if (!categoryId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "categoryId is required" }),
      };
    }

    const now = new Date().toISOString();

    const updateData = {
      name: body.name,
      description: body.description,
      type: body.type,
      capacity: body.capacity,
      availableCapacity: body.availableCapacity,
      minAge: body.minAge,
      maxAge: body.maxAge,
      requiresDocumentation: body.requiresDocumentation,
      allowedDays: body.allowedDays,
      allowedTimeRanges: body.allowedTimeRanges,
      priority: body.priority,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
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

    const result = await dynamodb
      .update({
        TableName: "Venue_Entrance_Category",
        Key: { entranceCategoryId: categoryId },
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
        message: "Entrance category updated successfully",
        category: result.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error in updateEntranceCategoryHandler:", error);
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
