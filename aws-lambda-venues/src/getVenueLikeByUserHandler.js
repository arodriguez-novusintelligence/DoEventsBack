const AWS = require("aws-sdk");
const { tableName, respond, handleOptions } = require("./venueSocialUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const LIKES_TABLE = () => tableName("VENUE_LIKES_TABLE", "Venue_Likes");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const userId = event.pathParameters?.userId;

    if (!venueId || !userId) {
      return respond(400, { error: "venueId y userId son requeridos" });
    }

    const result = await dynamodb
      .get({
        TableName: LIKES_TABLE(),
        Key: { userId, venueId },
      })
      .promise();

    return respond(200, {
      liked: Boolean(result.Item),
    });
  } catch (error) {
    console.error("getVenueLikeByUserHandler error:", error);
    return respond(500, {
      error: "Error interno",
      message: error.message,
    });
  }
};
