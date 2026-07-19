const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Elimina múltiples grupos de favoritos en lote
 *
 * Body esperado:
 * {
 *   "groupIds": ["grp-001", "grp-002", "grp-003"]
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

    if (!body.groupIds || !Array.isArray(body.groupIds)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "groupIds array is required",
        }),
      };
    }

    if (body.groupIds.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "groupIds array cannot be empty",
        }),
      };
    }

    if (body.groupIds.length > 25) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Cannot delete more than 25 groups at once",
        }),
      };
    }

    const results = {
      deleted: [],
      errors: [],
    };

    // Primero, obtener todos los grupos del usuario para validar que existen
    const queryParams = {
      TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    console.log("Querying user groups:", JSON.stringify(queryParams));
    const userGroupsResult = await dynamodb.query(queryParams).promise();
    const userGroups = userGroupsResult.Items || [];

    console.log(`Found ${userGroups.length} groups for user ${userId}`);

    // Crear un mapa de grupos por groupId para búsqueda rápida
    const groupsMap = {};
    userGroups.forEach((group) => {
      groupsMap[group.groupId] = group;
    });

    // Procesar cada grupo a eliminar
    for (const groupId of body.groupIds) {
      try {
        if (!groupId) {
          results.errors.push({
            groupId: null,
            error: "groupId is required",
          });
          continue;
        }

        const group = groupsMap[groupId];

        if (!group) {
          results.errors.push({
            groupId,
            error: "Group not found",
          });
          continue;
        }

        // Eliminar el grupo
        await dynamodb
          .delete({
            TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
            Key: {
              userId: userId,
              groupId: groupId,
            },
          })
          .promise();

        console.log(
          `Group ${groupId} (${group.groupName}) deleted successfully`
        );

        results.deleted.push({
          groupId,
          groupName: group.groupName,
        });
      } catch (error) {
        console.error(`Error deleting group ${groupId}:`, error);
        results.errors.push({
          groupId,
          error: error.message,
        });
      }
    }

    const statusCode = results.errors.length > 0 ? 207 : 200; // 207 Multi-Status si hay errores parciales

    return {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Batch delete completed",
        summary: {
          total: body.groupIds.length,
          deleted: results.deleted.length,
          failed: results.errors.length,
        },
        results,
      }),
    };
  } catch (error) {
    console.error("Error in batchDeleteFavoriteGroupsHandler:", error);
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
