const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Actualiza múltiples grupos de favoritos en lote
 * Permite actualizar varios grupos al mismo tiempo, incluyendo el reordenamiento
 *
 * Body esperado:
 * {
 *   "groups": [
 *     {
 *       "groupId": "uuid-1",
 *       "name": "Familia",
 *       "color": "#FF0000",
 *       "order": 0,
 *       "userIds": ["user1", "user2"],
 *       "tags": ["importante"]
 *     },
 *     ...
 *   ]
 * }
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId } = event.pathParameters;
    const body = JSON.parse(event.body);

    // Validaciones
    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    if (!body.groups || !Array.isArray(body.groups)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "groups array is required",
        }),
      };
    }

    if (body.groups.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "groups array cannot be empty",
        }),
      };
    }

    if (body.groups.length > 25) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Cannot update more than 25 groups at once",
        }),
      };
    }

    const now = new Date().toISOString();
    const results = {
      updated: [],
      errors: [],
    };

    // Primero, obtener todos los grupos actuales del usuario
    const queryParams = {
      TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    console.log("Querying current groups:", JSON.stringify(queryParams));
    const currentGroupsResult = await dynamodb.query(queryParams).promise();
    const currentGroups = currentGroupsResult.Items || [];

    console.log(`Found ${currentGroups.length} existing groups`);

    // Crear un mapa de grupos actuales por groupId
    const currentGroupsMap = {};
    currentGroups.forEach((group) => {
      currentGroupsMap[group.groupId] = group;
    });

    // Procesar cada grupo a actualizar
    for (const groupUpdate of body.groups) {
      try {
        if (!groupUpdate.groupId) {
          results.errors.push({
            error: "groupId is required for each group",
            group: groupUpdate,
          });
          continue;
        }

        const currentGroup = currentGroupsMap[groupUpdate.groupId];

        if (!currentGroup) {
          results.errors.push({
            groupId: groupUpdate.groupId,
            error: "Group not found",
          });
          continue;
        }

        // Actualización directa usando groupId como sort key
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {
          ":updatedAt": now,
        };

        // Name
        if (groupUpdate.name !== undefined) {
          updateExpressions.push("groupName = :groupName");
          expressionAttributeValues[":groupName"] = groupUpdate.name;
        }

        // Color
        if (groupUpdate.color !== undefined) {
          updateExpressions.push("#color = :color");
          expressionAttributeNames["#color"] = "color";
          expressionAttributeValues[":color"] = groupUpdate.color;
        }

        // Order
        if (groupUpdate.order !== undefined) {
          updateExpressions.push("#order = :order");
          expressionAttributeNames["#order"] = "order";
          expressionAttributeValues[":order"] = groupUpdate.order;
        }

        // UserIds
        if (groupUpdate.userIds !== undefined) {
          updateExpressions.push("userIds = :userIds");
          expressionAttributeValues[":userIds"] = groupUpdate.userIds;
        }

        // Tags
        if (groupUpdate.tags !== undefined) {
          updateExpressions.push("tags = :tags");
          expressionAttributeValues[":tags"] = groupUpdate.tags;
        }

        // Siempre actualizar updatedAt
        updateExpressions.push("updatedAt = :updatedAt");

        if (updateExpressions.length === 1) {
          // Solo updatedAt, no hay cambios reales
          results.errors.push({
            groupId: groupUpdate.groupId,
            error: "No fields to update",
          });
          continue;
        }

        const updateParams = {
          TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
          Key: {
            userId: userId,
            groupId: groupUpdate.groupId,
          },
          UpdateExpression: `SET ${updateExpressions.join(", ")}`,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: "ALL_NEW",
        };

        if (Object.keys(expressionAttributeNames).length > 0) {
          updateParams.ExpressionAttributeNames = expressionAttributeNames;
        }

        console.log(
          `Updating group ${groupUpdate.groupId}:`,
          JSON.stringify(updateParams)
        );
        const result = await dynamodb.update(updateParams).promise();

        results.updated.push({
          groupId: result.Attributes.groupId,
          groupName: result.Attributes.groupName,
          order: result.Attributes.order,
        });
      } catch (error) {
        console.error(`Error updating group ${groupUpdate.groupId}:`, error);
        results.errors.push({
          groupId: groupUpdate.groupId,
          error: error.message,
        });
      }
    }

    const statusCode = results.errors.length > 0 ? 207 : 200; // 207 Multi-Status si hay errores parciales

    return {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Batch update completed",
        summary: {
          total: body.groups.length,
          updated: results.updated.length,
          failed: results.errors.length,
        },
        results,
      }),
    };
  } catch (error) {
    console.error("Error in batchUpdateFavoriteGroupsHandler:", error);
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
