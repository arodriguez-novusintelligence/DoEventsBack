const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler: getEntrancesHandler
 *
 * Obtiene todas las configuraciones de entradas de un venue.
 * Incluye categorías y precios asociados.
 *
 * Path: GET /venues/{venueId}/entrances
 */

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const venueId = event.pathParameters?.venueId;

    if (!venueId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "venueId is required" }),
      };
    }

    // Obtener todas las entradas del venue
    const entrancesResult = await dynamodb
      .query({
        TableName: "Venue_Entrance",
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":venueId": venueId,
        },
      })
      .promise();

    const entrances = entrancesResult.Items || [];

    // Para cada entrada, obtener sus categorías y precios
    for (const entrance of entrances) {
      // Obtener categorías
      const categoriesResult = await dynamodb
        .query({
          TableName: "Venue_Entrance_Category",
          IndexName: "entranceIdIndex",
          KeyConditionExpression: "entranceId = :entranceId",
          ExpressionAttributeValues: {
            ":entranceId": entrance.entranceId,
          },
        })
        .promise();

      const categories = categoriesResult.Items || [];

      entrance.categories = categories;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueId,
        entrances,
        total: entrances.length,
      }),
    };
  } catch (error) {
    console.error("Error in getEntrancesHandler:", error);
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
