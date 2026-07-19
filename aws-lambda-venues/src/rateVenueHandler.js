const AWS = require("aws-sdk");
const { randomUUID } = require("crypto");
const { tableName, respond, handleOptions } = require("./venueSocialUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const VENUE_TABLE = () => tableName("VENUE_TABLE", "Venues");
const RATINGS_TABLE = () => tableName("VENUE_RATINGS_TABLE", "VenueCalification");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const body = JSON.parse(event.body || "{}");
    const userId = String(body.userId || "").trim();
    const rating = Number(body.rating);
    const comment = String(body.comment || "").trim();

    if (!venueId || !userId || Number.isNaN(rating) || rating < 1 || rating > 5) {
      return respond(400, {
        error: "venueId, userId y rating (1-5) son requeridos",
      });
    }

    const venueResult = await dynamodb
      .get({
        TableName: VENUE_TABLE(),
        Key: { venue_id: venueId },
      })
      .promise();

    if (!venueResult.Item) {
      return respond(404, { error: "Lugar no encontrado" });
    }

    const calificationId = randomUUID();
    const now = new Date().toISOString();

    await dynamodb
      .put({
        TableName: RATINGS_TABLE(),
        Item: {
          venueId,
          calificationId,
          userId,
          rating,
          comment,
          createdAt: now,
        },
      })
      .promise();

    const ratingsResult = await dynamodb
      .query({
        TableName: RATINGS_TABLE(),
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: { ":venueId": venueId },
      })
      .promise();

    const items = ratingsResult.Items || [];
    const avg = items.length
      ? items.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
        items.length
      : rating;
    const rounded = Math.round(avg * 10) / 10;

    await dynamodb
      .update({
        TableName: VENUE_TABLE(),
        Key: { venue_id: venueId },
        UpdateExpression:
          "SET rating = :rating, reviewCount = :count, updatedAt = :now",
        ExpressionAttributeValues: {
          ":rating": rounded,
          ":count": items.length,
          ":now": now,
        },
      })
      .promise();

    return respond(200, {
      calificationId,
      rating: rounded,
      reviewCount: items.length,
    });
  } catch (error) {
    console.error("rateVenueHandler error:", error);
    return respond(500, {
      error: "Error interno",
      message: error.message,
    });
  }
};
