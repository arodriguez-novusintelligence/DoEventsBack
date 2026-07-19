const AWS = require("aws-sdk");
const { resolveWsManagementApiEndpoint } = require("./resolveWsManagementApiEndpoint");

async function sendAckToConnection({
  domainName,
  stage,
  connectionId,
  payload,
  requestContext,
}) {
  if (!connectionId || !payload) {
    return false;
  }

  const resolved = resolveWsManagementApiEndpoint(
    requestContext || { domainName, stage },
  );
  if (!resolved.domainName || !resolved.stage) {
    return false;
  }

  const endpoint = `https://${resolved.domainName}/${resolved.stage}`;
  const apigateway = new AWS.ApiGatewayManagementApi({ endpoint });

  try {
    await apigateway
      .postToConnection({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload),
      })
      .promise();
    return true;
  } catch (error) {
    if (error && error.statusCode === 410) {
      return false;
    }
    console.error("sendAckToConnection failed:", error);
    return false;
  }
}

module.exports = {
  sendAckToConnection,
};
