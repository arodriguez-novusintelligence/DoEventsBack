/**
 * Endpoint para ApiGatewayManagementApi (postToConnection).
 * Con dominio custom (ws-dev.doeventsapp.com) NO se debe usar requestContext.domainName:
 * AWS exige el host execute-api.{region}.amazonaws.com/{stage}.
 */
function resolveWsManagementApiEndpoint(requestContext = {}) {
  const fromEnv = String(process.env.WS_API_ENDPOINT || "").trim();
  if (fromEnv) {
    try {
      const normalized = fromEnv.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
      const url = new URL(normalized);
      const pathStage = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean)[0];
      return {
        domainName: url.hostname,
        stage: pathStage || process.env.STAGE || requestContext.stage || "dev",
      };
    } catch (err) {
      console.warn("WS_API_ENDPOINT invalido:", fromEnv, err.message);
    }
  }

  const domainName = requestContext.domainName;
  const stage = requestContext.stage || process.env.STAGE || "dev";

  if (domainName && !domainName.includes(".execute-api.")) {
    console.warn(
      "requestContext.domainName es custom domain; configure WS_API_ENDPOINT con execute-api URL",
      domainName,
    );
  }

  return { domainName, stage };
}

module.exports = { resolveWsManagementApiEndpoint };
