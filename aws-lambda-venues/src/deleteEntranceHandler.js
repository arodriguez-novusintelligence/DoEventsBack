const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler: deleteEntranceHandler
 *
 * Elimina una configuración de entrada y todas sus categorías y precios asociados.
 *
 * Path: DELETE /venues/{venueId}/entrances/{entranceId}
 */

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const venueId = event.pathParameters?.venueId;
    const entranceId = event.pathParameters?.entranceId;

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

    // Obtener todas las categorías
    const categoriesResult = await dynamodb
      .query({
        TableName: "Venue_Entrance_Category",
        IndexName: "entranceIdIndex",
        KeyConditionExpression: "entranceId = :entranceId",
        ExpressionAttributeValues: {
          ":entranceId": entranceId,
        },
      })
      .promise();

    const categories = categoriesResult.Items || [];

    // Eliminar categorías en lotes de 25
    const batchSize = 25;
    for (let i = 0; i < categories.length; i += batchSize) {
      const batch = categories.slice(i, i + batchSize);
      const deleteRequests = batch.map((category) => ({
        DeleteRequest: {
          Key: { entranceCategoryId: category.entranceCategoryId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            Venue_Entrance_Category: deleteRequests,
          },
        })
        .promise();
    }

    // Eliminar la entrada principal
    await dynamodb
      .delete({
        TableName: "Venue_Entrance",
        Key: { entranceId },
      })
      .promise();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Entrance configuration deleted successfully",
        deletedItems: {
          entrance: 1,
          categories: categories.length,
        },
      }),
    };
  } catch (error) {
    console.error("Error in deleteEntranceHandler:", error);
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
