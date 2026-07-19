const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const { buildPresenceBroadcast } = require("../utils/wsPresencePayload");
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { broadcastJsonToRoomChannel } = require("../utils/wsBroadcastRoom");
const { resolveWsManagementApiEndpoint } = require("../utils/resolveWsManagementApiEndpoint");

const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";

exports.handler = async (event) => {
  const body = parseLambdaJsonBody(event);
  const roomId = String(body.roomId ?? "").trim();
  const userId = body.userId;

  if (!roomId) {
    console.error("joinRoom: falta roomId");
    return { statusCode: 400, body: "Invalid input" };
  }

  const connectionId = event.requestContext.connectionId;
  const channelId = roomId;

  console.log("✅ Joining channel:", channelId, "userId:", userId || "(omitido)");

  await docClient
    .put({
      TableName: USER_CHANNELS_TABLE,
      Item: {
        channelId,
        connectionId,
        ...(userId ? { userId } : {}),
        ttl: Math.floor(Date.now() / 1000) + 86400,
      },
    })
    .promise();

  if (userId) {
    await docClient
      .put({
        TableName: USER_CHANNELS_TABLE,
        Item: {
          channelId: `notification-user-${userId}`,
          connectionId,
          userId,
          ttl: Math.floor(Date.now() / 1000) + 86400,
        },
      })
      .promise();
  }

  if (userId) {
    try {
      const requestContext = event.requestContext || {};
      const { domainName, stage } = resolveWsManagementApiEndpoint(requestContext);
      const presence = buildPresenceBroadcast({
        userId,
        status: "online",
        roomId: channelId,
      });
      await broadcastJsonToRoomChannel({
        docClient,
        domainName,
        stage,
        channelId,
        payload: presence,
        logBroadcastErrors: false,
        requestContext,
      });
    } catch (e) {
      console.error("joinRoom: broadcast presencia falló (join OK):", e.message);
    }
  }

  return { statusCode: 200 };
};
