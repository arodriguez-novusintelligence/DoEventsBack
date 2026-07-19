const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";
const { resolveWsManagementApiEndpoint } = require("./utils/resolveWsManagementApiEndpoint");

function buildPresenceBroadcast({ userId, status, roomId }) {
  const normalized = normalizePresenceStatus(status);
  return {
    channel: "status-connection",
    channelAlt: "statusConnection",
    channelSnake: "status_connection",
    action: "statusConnection",
    actionAlt: "status-connection",
    actionPresence: "userPresence",
    userId,
    user_id: userId,
    status: normalized,
    userStatus: normalized,
    connectionStatus: normalized,
    ...(roomId ? { roomId } : {}),
  };
}

function normalizePresenceStatus(s) {
  const v = String(s || "online").toLowerCase();
  if (v === "connected" || v === "active") return "online";
  if (v === "disconnected" || v === "inactive") return "offline";
  if (v === "online" || v === "offline") return v;
  return v;
}

async function getConnectionAuthenticatedUserId(connectionId) {
  if (!connectionId) return null;
  const res = await docClient
    .query({
      TableName: USER_CHANNELS_TABLE,
      IndexName: "ConnectionIndex",
      KeyConditionExpression: "connectionId = :cid",
      ExpressionAttributeValues: { ":cid": connectionId },
    })
    .promise();

  for (const item of res.Items || []) {
    const cid = item.channelId;
    if (typeof cid === "string" && cid.startsWith("notification-user-")) {
      return cid.slice("notification-user-".length);
    }
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const requestContext = event.requestContext || {};
    const { stage, domainName } = resolveWsManagementApiEndpoint(requestContext);
    const endpoint = `https://${domainName}/${stage}`;
    const apigateway = new AWS.ApiGatewayManagementApi({ endpoint });

    const body = event.body ? JSON.parse(event.body) : {};
    const rawStatus =
      body.status || body.userStatus || body.connectionStatus || "online";
    let userId = body.userId || body.user_id || (body.user && body.user.id);

    const connectionId = event.requestContext.connectionId;
    const authId = await getConnectionAuthenticatedUserId(connectionId);

    if (!userId && authId) {
      userId = authId;
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    if (authId && String(userId).trim() !== String(authId).trim()) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "userId no coincide con la conexión" }),
      };
    }

    const presenceBase = buildPresenceBroadcast({
      userId,
      status: rawStatus,
      roomId: body.roomId,
    });

    const channelNotification = `notification-user-${userId}`;

    const resConn = await docClient
      .query({
        TableName: USER_CHANNELS_TABLE,
        IndexName: "ConnectionIndex",
        KeyConditionExpression: "connectionId = :cid",
        ExpressionAttributeValues: { ":cid": connectionId },
      })
      .promise();

    const roomIds = [];
    for (const item of resConn.Items || []) {
      const cid = item.channelId;
      if (cid && !cid.startsWith("notification-user-")) {
        roomIds.push(cid);
      }
    }

    const tasks = [];

    const resNotif = await docClient
      .query({
        TableName: USER_CHANNELS_TABLE,
        KeyConditionExpression: "channelId = :cid",
        ExpressionAttributeValues: { ":cid": channelNotification },
      })
      .promise();

    for (const row of resNotif.Items || []) {
      tasks.push(
        apigateway
          .postToConnection({
            ConnectionId: row.connectionId,
            Data: JSON.stringify(presenceBase),
          })
          .promise()
          .catch((err) => {
            if (err.statusCode === 410) {
              return docClient
                .delete({
                  TableName: USER_CHANNELS_TABLE,
                  Key: {
                    channelId: channelNotification,
                    connectionId: row.connectionId,
                  },
                })
                .promise();
            }
            console.error("statusConnection notif post:", err);
          }),
      );
    }

    for (const roomId of roomIds) {
      const payload = buildPresenceBroadcast({
        userId,
        status: rawStatus,
        roomId,
      });
      const roomRows = await docClient
        .query({
          TableName: USER_CHANNELS_TABLE,
          KeyConditionExpression: "channelId = :cid",
          ExpressionAttributeValues: { ":cid": roomId },
        })
        .promise();

      for (const row of roomRows.Items || []) {
        tasks.push(
          apigateway
            .postToConnection({
              ConnectionId: row.connectionId,
              Data: JSON.stringify(payload),
            })
            .promise()
            .catch((err) => {
              if (err.statusCode === 410) {
                return docClient
                  .delete({
                    TableName: USER_CHANNELS_TABLE,
                    Key: {
                      channelId: roomId,
                      connectionId: row.connectionId,
                    },
                  })
                  .promise();
              }
              console.error("statusConnection room post:", err);
            }),
        );
      }
    }

    await Promise.all(tasks);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Status updated successfully" }),
    };
  } catch (error) {
    console.error("Error in statusConnection handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
