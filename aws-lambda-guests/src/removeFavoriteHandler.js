const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Función para procesar eliminación de un solo favorito
async function processSingleDelete(userId, favoriteId) {
  try {
    console.log(`Deleting favoriteId ${favoriteId} for user ${userId}...`);

    await dynamodb
      .delete({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Key: {
          userId,
          favoriteId,
        },
      })
      .promise();

    return {
      success: true,
      favoriteId,
      deleted: true,
    };
  } catch (error) {
    console.error(`Error deleting favoriteId ${favoriteId}:`, error);
    return {
      success: false,
      favoriteId,
      error: error.message,
    };
  }
}

// Elimina uno o varios usuarios de la lista de favoritos
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId, favoriteId } = event.pathParameters || {};
    const body = event.body ? JSON.parse(event.body) : null;

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    // Determinar si es eliminación única o múltiple
    let favoriteIds = [];

    // Si viene favoriteId en el path (DELETE /users/{userId}/favorites/{favoriteId})
    if (favoriteId) {
      favoriteIds = [favoriteId];
    }
    // Si viene en el body (DELETE /users/{userId}/favorites con body)
    else if (body && body.favoriteId) {
      favoriteIds = [body.favoriteId];
    }
    // Si viene array de favoriteIds en el body
    else if (body && body.favoriteIds && Array.isArray(body.favoriteIds)) {
      favoriteIds = body.favoriteIds;
    } else {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "favoriteId or favoriteIds is required",
          message:
            "Provide favoriteId in path, or favoriteId/favoriteIds in body",
        }),
      };
    }

    if (favoriteIds.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "At least one favoriteId is required",
        }),
      };
    }

    console.log(`Processing deletion of ${favoriteIds.length} favorite(s)...`);

    // Procesar cada eliminación
    const results = await Promise.all(
      favoriteIds.map((favId) => processSingleDelete(userId, favId))
    );

    // Separar éxitos y errores
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    return {
      statusCode: successful.length > 0 ? (failed.length > 0 ? 207 : 200) : 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Processed ${favoriteIds.length} favorite(s) deletion`,
        summary: {
          total: favoriteIds.length,
          successful: successful.length,
          failed: failed.length,
        },
        deleted: successful.map((r) => r.favoriteId),
        errors: failed.length > 0 ? failed : undefined,
      }),
    };
  } catch (error) {
    console.error("Error in removeFavoriteHandler:", error);
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
