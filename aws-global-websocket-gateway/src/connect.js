const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";

exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  const queryParams = event.queryStringParameters || {};
  const userId = queryParams.userId;
  const channelId = `notification-user-${userId}`;

  if (!userId) {
    console.warn("$connect rejected: missing query parameter userId");
    return {
      statusCode: 400,
      body: JSON.stringify({
        message:
          "Missing userId in query parameters. Connect with: ?userId=YOUR_USER_ID",
      }),
    };
  }

  try {
    await docClient
      .put({
        TableName: USER_CHANNELS_TABLE,
        Item: {
          channelId,
          connectionId,
          userId,
          ttl: Math.floor(Date.now() / 1000) + 86400,
        },
      })
      .promise();

    return { statusCode: 200 };
  } catch (err) {
    console.error("$connect DynamoDB error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error registering connection.",
        error: err.message,
      }),
    };
  }
};
