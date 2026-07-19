const AWS = require("aws-sdk");
const { resolveWsManagementApiEndpoint } = require("./resolveWsManagementApiEndpoint");

const USER_CHANNELS_TABLE = process.env.USER_CHANNELS_TABLE || "UserChannels";

function normalizeChannelId(channelId) {
  return String(channelId ?? "").trim();
}

function buildLegacyChannelCandidates(channelId) {
  const normalized = normalizeChannelId(channelId);
  if (!normalized) return [];

  const candidates = [normalized];
  if (/^\d+$/.test(normalized)) {
    const asNumber = Number(normalized);
    if (Number.isSafeInteger(asNumber)) {
      candidates.push(asNumber);
    }
  }

  return candidates;
}

async function querySubscribersByChannelCandidates(docClient, channelCandidates) {
  const allRows = [];

  for (const candidate of channelCandidates) {
    const res = await docClient
      .query({
        TableName: USER_CHANNELS_TABLE,
        KeyConditionExpression: "channelId = :cid",
        ExpressionAttributeValues: { ":cid": candidate },
      })
      .promise();
    allRows.push(...(res.Items || []));
  }

  const deduped = new Map();
  for (const row of allRows) {
    const key = String(row.connectionId || "").trim();
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
}

/**
 * Envía JSON a todas las conexiones suscritas a channelId (sala chat).
 */
async function broadcastJsonToRoomChannel({
  docClient,
  domainName,
  stage = process.env.STAGE || "dev",
  channelId,
  payload,
  logBroadcastErrors = true,
  requestContext,
}) {
  const normalizedChannelId = normalizeChannelId(channelId);
  const resolved = resolveWsManagementApiEndpoint(requestContext || { domainName, stage });
  const mgmtDomain = resolved.domainName;
  const mgmtStage = resolved.stage;

  if (!mgmtDomain || !normalizedChannelId) return;

  const endpoint = `https://${mgmtDomain}/${mgmtStage}`;
  const apigateway = new AWS.ApiGatewayManagementApi({ endpoint });
  const channelCandidates = buildLegacyChannelCandidates(normalizedChannelId);
  const Items = await querySubscribersByChannelCandidates(
    docClient,
    channelCandidates,
  );

  const data = typeof payload === "string" ? payload : JSON.stringify(payload);

  await Promise.all(
    Items.map(({ connectionId, channelId: rowChannelId }) =>
      apigateway
        .postToConnection({ ConnectionId: connectionId, Data: data })
        .promise()
        .catch((err) => {
          if (err && err.statusCode === 410) {
            return docClient
              .delete({
                TableName: USER_CHANNELS_TABLE,
                Key: { channelId: rowChannelId, connectionId },
              })
              .promise();
          }
          if (logBroadcastErrors) {
            console.error("broadcastJsonToRoomChannel:", err);
          }
        }),
    ),
  );
}

module.exports = { broadcastJsonToRoomChannel };
