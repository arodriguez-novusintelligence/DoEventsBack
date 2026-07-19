const AWS = require("aws-sdk");
const { tableName, respond, handleOptions } = require("./venueSocialUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const RATINGS_TABLE = () => tableName("VENUE_RATINGS_TABLE", "VenueCalification");
const CLIENT_TABLE = () => tableName("CLIENT_TABLE", "Client");

async function getUserDisplay(userId) {
  try {
    const result = await dynamodb
      .get({
        TableName: CLIENT_TABLE(),
        Key: { id: userId },
      })
      .promise();
    const user = result.Item;
    if (!user) return { userId, name: "Usuario" };
    const name = [user.nombre, user.apellido].filter(Boolean).join(" ").trim()
      || user.username
      || "Usuario";
    return {
      userId,
      name,
      avatarUrl: user.imagen || user.fotoPerfilUrl || null,
      username: user.username || null,
    };
  } catch {
    return { userId, name: "Usuario" };
  }
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const limit = Math.min(
      Number(event.queryStringParameters?.limit || 20),
      50,
    );

    if (!venueId) {
      return respond(400, { error: "venueId es requerido" });
    }

    const result = await dynamodb
      .query({
        TableName: RATINGS_TABLE(),
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: { ":venueId": venueId },
        Limit: limit,
        ScanIndexForward: false,
      })
      .promise();

    const califications = await Promise.all(
      (result.Items || []).map(async (item) => {
        const user = await getUserDisplay(item.userId);
        return {
          id: item.calificationId,
          venueId: item.venueId,
          userId: item.userId,
          rating: item.rating,
          comment: item.comment || "",
          createdAt: item.createdAt,
          authorName: user.name,
          authorAvatar: user.avatarUrl,
          authorUsername: user.username,
        };
      }),
    );

    return respond(200, {
      califications,
      count: califications.length,
    });
  } catch (error) {
    console.error("getVenueCalificationsHandler error:", error);
    return respond(500, {
      error: "Error interno",
      message: error.message,
    });
  }
};
