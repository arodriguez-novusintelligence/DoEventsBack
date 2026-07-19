const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";

exports.handler = async (event) => {
  const connectionId = event.requestContext?.connectionId;
  if (!connectionId) return { statusCode: 200, body: "Disconnected." };

  try {
    const res = await docClient
      .query({
        TableName: USER_CHANNELS_TABLE,
        IndexName: "ConnectionIndex",
        KeyConditionExpression: "connectionId = :cid",
        ExpressionAttributeValues: { ":cid": connectionId },
      })
      .promise();

    await Promise.all(
      (res.Items || []).map((item) =>
        docClient
          .delete({
            TableName: USER_CHANNELS_TABLE,
            Key: {
              channelId: item.channelId,
              connectionId: item.connectionId,
            },
          })
          .promise(),
      ),
    );

    return { statusCode: 200, body: "Disconnected." };
  } catch (err) {
    console.error("$disconnect error:", err.message);
    return { statusCode: 200, body: "Disconnected." };
  }
};
