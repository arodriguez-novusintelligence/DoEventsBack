const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler: getEntranceByIdHandler
 *
 * Obtiene una configuración de entrada específica con todas sus categorías y precios.
 *
 * Path: GET /venues/{venueId}/entrances/{entranceId}
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

    // Obtener la entrada
    const entranceResult = await dynamodb
      .get({
        TableName: "Venue_Entrance",
        Key: { entranceId },
      })
      .promise();

    if (!entranceResult.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Entrance configuration not found" }),
      };
    }

    const entrance = entranceResult.Item;

    // Verificar que pertenezca al venue correcto
    if (entrance.venueId !== venueId) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Entrance does not belong to this venue",
        }),
      };
    }

    // Obtener categorías
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

    entrance.categories = categories;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entrance,
      }),
    };
  } catch (error) {
    console.error("Error in getEntranceByIdHandler:", error);
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
