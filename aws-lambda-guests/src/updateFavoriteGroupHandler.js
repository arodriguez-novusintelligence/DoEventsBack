const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Actualiza un grupo global de favoritos
 * Permite actualizar: nombre, color, orden, usuarios y tags
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId, groupId } = event.pathParameters;
    const body = JSON.parse(event.body);

    // Validaciones
    if (!userId || !groupId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "userId and groupId are required",
        }),
      };
    }

    const now = new Date().toISOString();

    // Construir las expresiones de actualización
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ":updatedAt": now,
    };

    // Name (groupName)
    if (body.name !== undefined) {
      updateExpressions.push("groupName = :groupName");
      expressionAttributeValues[":groupName"] = body.name;
    }

    // Color
    if (body.color !== undefined) {
      updateExpressions.push("#color = :color");
      expressionAttributeNames["#color"] = "color";
      expressionAttributeValues[":color"] = body.color;
    }

    // Order
    if (body.order !== undefined) {
      updateExpressions.push("#order = :order");
      expressionAttributeNames["#order"] = "order";
      expressionAttributeValues[":order"] = body.order;
    }

    // UserIds
    if (body.userIds !== undefined) {
      updateExpressions.push("userIds = :userIds");
      expressionAttributeValues[":userIds"] = body.userIds;
    }

    // Tags
    if (body.tags !== undefined) {
      updateExpressions.push("tags = :tags");
      expressionAttributeValues[":tags"] = body.tags;
    }

    // Siempre actualizar updatedAt
    updateExpressions.push("updatedAt = :updatedAt");

    if (updateExpressions.length === 1) {
      // Solo hay updatedAt, no hay nada que actualizar
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "No fields to update",
        }),
      };
    }

    const updateParams = {
      TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
      Key: {
        userId: userId,
        groupId: groupId,
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }

    console.log("Update params:", JSON.stringify(updateParams));
    const result = await dynamodb.update(updateParams).promise();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Favorite group updated successfully",
        group: {
          groupId: result.Attributes.groupId,
          groupName: result.Attributes.groupName,
          color: result.Attributes.color,
          order: result.Attributes.order,
          userIds: result.Attributes.userIds,
          tags: result.Attributes.tags,
          updatedAt: result.Attributes.updatedAt,
        },
      }),
    };
  } catch (error) {
    console.error("Error in updateFavoriteGroupHandler:", error);
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
