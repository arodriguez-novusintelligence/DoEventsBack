const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { CORS_HEADERS, acceptedStatusFilter } = require("./followRelationsQuery");

exports.handler = async (event) => {
  const { userId } = event.pathParameters || {};
  const query = event.queryStringParameters || {};
  const userIdViewer = query.userIdViewer || query.viewerId;

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

    let totalCount = 0;
    let lastKey;
    do {
      const params = {
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        IndexName: "followUserIdIndex",
        KeyConditionExpression: "follow_userId = :userId",
        FilterExpression: acceptedStatusFilter(),
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":userId": userId,
          ":accepted": "accepted",
        },
        Select: "COUNT",
        ExclusiveStartKey: lastKey,
      };

      const result = await dynamodb.query(params).promise();
      totalCount += result.Count || 0;
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // Verificar relación del viewer con el perfil consultado
    let isFollowing = false;
    let followStatus = "none";
    if (userIdViewer && userIdViewer !== userId) {
      const followId = `${userIdViewer}_${userId}`;
      const followCheck = await dynamodb
        .get({
          TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
          Key: { follow_id: followId },
        })
        .promise();

      const status = String(followCheck.Item?.status || "").toLowerCase();
      if (status === "accepted") {
        isFollowing = true;
        followStatus = "accepted";
      } else if (status === "pending") {
        followStatus = "pending";
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        userId: userId,
        followers_count: totalCount,
        isFollowing: isFollowing,
        followStatus,
        isPublicProfile: user.Item.isPublicProfile !== false,
      }),
    };
  } catch (error) {
    console.error("Error en getFollowersCount:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Error interno al contar seguidores" }),
    };
  }
};
