const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";

exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  const queryParams = event.queryStringParameters || {};
  const userId = String(queryParams.userId || "").trim();

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing userId. Connect with ?userId=YOUR_USER_ID",
      }),
    };
  }

  const channelId = `notification-user-${userId}`;

  try {
    await docClient
      .put({
        TableName: USER_CHANNELS_TABLE,
        Item: {
          channelId,
          connectionId,
          userId,
          ttl: Math.floor(Date.now() / 1000) + 3600,
        },
      })
      .promise();

    return { statusCode: 200, body: "Connected." };
  } catch (err) {
    console.error("$connect error:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error registering connection", error: err.message }),
    };
  }
};
