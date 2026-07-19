const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const {
  CORS_HEADERS,
  queryFollowRelations,
  loadClientUsers,
  mapUserSummary,
} = require("./followRelationsQuery");

exports.handler = async (event) => {
  const { userId } = event.pathParameters || {};
  const { limit = 50, lastKey } = event.queryStringParameters || {};

  if (!userId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Parámetro userId es requerido" }),
    };
  }

  try {
    const user = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_CLIENT_TABLE,
        Key: { id: userId },
      })
      .promise();

    if (!user.Item) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Usuario no encontrado" }),
      };
    }

    const { items, lastKey: nextKey } = await queryFollowRelations({
      indexName: "followUserIdIndex",
      keyName: "follow_userId",
      keyValue: userId,
      status: "accepted",
      limit: parseInt(limit, 10) || 50,
      lastKey,
    });

    const followerIds = items.map((item) => item.userId);
    const followers = await loadClientUsers(followerIds);

    const followersWithFollowInfo = followers.map((follower) => {
      const followInfo = items.find((item) => item.userId === follower.id);
      return {
        user: mapUserSummary(follower),
        followed_at: followInfo?.timestamp,
      };
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        followers: followersWithFollowInfo,
        count: followersWithFollowInfo.length,
        lastKey: nextKey,
      }),
    };
  } catch (error) {
    console.error("Error en getFollowers:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Error interno al obtener seguidores" }),
    };
  }
};
