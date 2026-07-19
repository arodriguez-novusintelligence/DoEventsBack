const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
};

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(bodyObj),
  };
}

async function queryAllUserTokens(userId) {
  const queryParams = {
    TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
  };

  const all = [];
  let lastKey;
  do {
    const res = await docClient
      .query({
        ...queryParams,
        ExclusiveStartKey: lastKey,
      })
      .promise();
    all.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

exports.handler = async (event) => {
  try {
    const targetUserId =
      event.pathParameters && event.pathParameters.userId
        ? String(event.pathParameters.userId).trim()
        : "";

    if (!targetUserId) {
      return jsonResponse(400, { error: "userId is required" });
    }

    const items = await queryAllUserTokens(targetUserId);

    if (items.length > 0) {
      await Promise.all(
        items.map((item) =>
          docClient
            .delete({
              TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
              Key: { userId: item.userId, token: item.token },
            })
            .promise(),
        ),
      );
    }

    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: "",
    };
  } catch (err) {
    console.error("deleteUserMessagingToken error:", err);
    return jsonResponse(500, { error: "internal_error" });
  }
};
