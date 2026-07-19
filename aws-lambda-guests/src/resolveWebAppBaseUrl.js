/**
 * Resuelve la URL pública del front según el entorno.
 * Prioridad: WEB_APP_BASE_URL/APP_WEB_URL → STAGE → fallback QA (histórico).
 */
function resolveWebAppBaseUrl(env = process.env) {
  const explicit = String(
    env.WEB_APP_BASE_URL || env.APP_WEB_URL || env.FEED_PUBLIC_BASE_URL || "",
  )
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;

  const stage = String(env.STAGE || env.AWS_STAGE || env.SERVERLESS_STAGE || "")
    .trim()
    .toLowerCase();

  if (stage === "dev" || stage === "develop" || stage === "development" || stage === "devaws") {
    return "https://dev.doeventsapp.com";
  }
  if (stage === "prod" || stage === "production" || stage === "main" || stage === "prd") {
    return "https://doeventsapp.com";
  }
  // qa / release / vacío: mantener QA como fallback para no romper despliegues QA antiguos
  return "https://qa.doeventsapp.com";
}

module.exports = {
  resolveWebAppBaseUrl,
};
