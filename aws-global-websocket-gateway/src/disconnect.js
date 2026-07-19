const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";
const { resolveWsManagementApiEndpoint } = require("./utils/resolveWsManagementApiEndpoint");

function offlinePayload(userId, roomId) {
  const status = "offline";
  return {
    channel: "status-connection",
    channelAlt: "statusConnection",
    channelSnake: "status_connection",
    action: "statusConnection",
    actionAlt: "status-connection",
    actionPresence: "userPresence",
    userId,
    user_id: userId,
    status,
    userStatus: status,
    connectionStatus: status,
    ...(roomId ? { roomId } : {}),
  };
}

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const requestContext = event.requestContext || {};
  const { stage, domainName } = resolveWsManagementApiEndpoint(requestContext);
  const endpoint = `https://${domainName}/${stage}`;
  const apigateway = new AWS.ApiGatewayManagementApi({ endpoint });

  const result = await docClient
    .query({
      TableName: USER_CHANNELS_TABLE,
      IndexName: "ConnectionIndex",
      KeyConditionExpression: "connectionId = :cid",
      ExpressionAttributeValues: { ":cid": connectionId },
    })
    .promise();

  const items = result.Items || [];
  let userId;
  const roomIds = [];
  for (const item of items) {
    const cid = item.channelId;
    if (cid && cid.startsWith("notification-user-")) {
      userId = cid.slice("notification-user-".length);
    } else if (cid) {
      roomIds.push(cid);
    }
  }

  if (userId && roomIds.length > 0) {
    const tasks = [];
    for (const roomId of roomIds) {
      const payload = offlinePayload(userId, roomId);
      const roomRows = await docClient
        .query({
          TableName: USER_CHANNELS_TABLE,
          KeyConditionExpression: "channelId = :cid",
          ExpressionAttributeValues: { ":cid": roomId },
        })
        .promise();

      for (const row of roomRows.Items || []) {
        if (row.connectionId === connectionId) continue;
        tasks.push(
          apigateway
            .postToConnection({
              ConnectionId: row.connectionId,
              Data: JSON.stringify(payload),
            })
            .promise()
            .catch(() => {}),
        );
      }
    }
    try {
      await Promise.all(tasks);
    } catch (e) {
      console.error("disconnect presence broadcast:", e.message);
    }
  }

  const deleteTasks = items.map((item) =>
    docClient
      .delete({
        TableName: USER_CHANNELS_TABLE,
        Key: {
          channelId: item.channelId,
          connectionId: item.connectionId,
        },
      })
      .promise(),
  );

  await Promise.all(deleteTasks);
  return { statusCode: 200 };
};
