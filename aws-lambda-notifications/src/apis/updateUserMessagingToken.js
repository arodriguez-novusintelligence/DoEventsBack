const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    // PARSE INPUT
    const body = JSON.parse(event.body || "{}");
    const userId = body.userId;

    // NEW TOKEN VALUE (CAN BE PROVIDED AS newToken OR token)
    const newToken = body.newMessagingToken || body.token;
    const oldToken = body.oldMessagingToken || null;
    
    if (!userId || !newToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "userId and newToken (or token) are required",
        }),
      };
    }

    const now = new Date().toISOString();

    // IF oldToken PROVIDED AND DIFFERENT FROM newToken -> DELETE OLD ENTRY
    if (oldToken && oldToken !== newToken) {
      await docClient
        .delete({
          TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
          Key: { userId, token: oldToken },
        })
        .promise();
    }

    // UPSERT NEW TOKEN (PK: userId, SK: token)
    await docClient
      .put({
        TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
        Item: {
          userId,
          token: newToken,
          updatedAt: now,
          createdAt: now,
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, userId, token: newToken }),
    };
  } catch (err) {
    console.error("updateUserToken error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "internal_error" }),
    };
  }
};
