const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { userId, token } = body;

    if (!userId || !token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId and token are required" }),
      };
    }

    // GET NOW DATE
    const now = new Date().toISOString();

    // BUILD PARAMS
    const params = {
      TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
      Item: {
        userId,
        token,
        createdAt: now,
        updatedAt: now,
      },
    };

    // UPSERT TOKEN (PK: userId, SK: token)
    await docClient.put(params).promise();

    // RETURN SUCCESS RESPONSE
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("createUserToken error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "internal_error" }),
    };
  }
};
