const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { CORS_HEADERS, acceptedStatusFilter } = require("./followRelationsQuery");

exports.handler = async (event) => {
  const { userId } = event.pathParameters || {};

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
        IndexName: "userIdIndex",
        KeyConditionExpression: "userId = :userId",
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

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        userId: userId,
        following_count: totalCount,
      }),
    };
  } catch (error) {
    console.error("Error en getFollowingCount:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: "Error interno al contar usuarios seguidos",
      }),
    };
  }
};
