const AWS = require("aws-sdk");
const { tableName, respond, handleOptions } = require("./venueSocialUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const VENUE_TABLE = () => tableName("VENUE_TABLE", "Venues");
const LIKES_TABLE = () => tableName("VENUE_LIKES_TABLE", "Venue_Likes");

async function countVenueLikes(venueId) {
  let total = 0;
  let lastKey;
  do {
    const result = await dynamodb
      .query({
        TableName: LIKES_TABLE(),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: { ":venueId": venueId },
        Select: "COUNT",
        ExclusiveStartKey: lastKey,
      })
      .promise();
    total += result.Count || 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return total;
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const body = JSON.parse(event.body || "{}");
    const userId = String(body.userId || "").trim();
    const like = body.like !== false;

    if (!venueId || !userId) {
      return respond(400, { error: "venueId y userId son requeridos" });
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

    const now = new Date().toISOString();

    if (like) {
      try {
        await dynamodb
          .put({
            TableName: LIKES_TABLE(),
            Item: {
              userId,
              venueId,
              createdAt: now,
            },
            ConditionExpression:
              "attribute_not_exists(userId) AND attribute_not_exists(venueId)",
          })
          .promise();
      } catch (err) {
        if (err.code !== "ConditionalCheckFailedException") throw err;
      }
    } else {
      await dynamodb
        .delete({
          TableName: LIKES_TABLE(),
          Key: { userId, venueId },
        })
        .promise();
    }

    const likeCount = await countVenueLikes(venueId);

    await dynamodb
      .update({
        TableName: VENUE_TABLE(),
        Key: { venue_id: venueId },
        UpdateExpression: "SET likeCount = :lc, updatedAt = :now",
        ExpressionAttributeValues: {
          ":lc": likeCount,
          ":now": now,
        },
      })
      .promise();

    return respond(200, {
      success: true,
      liked: like,
      likeCount,
    });
  } catch (error) {
    console.error("likeVenueHandler error:", error);
    return respond(500, {
      error: "Error interno",
      message: error.message,
    });
  }
};
