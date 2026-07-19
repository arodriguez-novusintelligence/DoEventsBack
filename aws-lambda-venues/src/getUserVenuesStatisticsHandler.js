const { respond, handleOptions } = require("./venueSocialUtils");
const {
  parseAuthUserId,
  buildOwnerVenueStatSummaries,
} = require("./venueStatsShared");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const ownerUserId = event.pathParameters?.userId;
    const requesterId = parseAuthUserId(event);
    if (!ownerUserId) {
      return respond(400, { error: "userId es requerido" });
    }
    if (!requesterId || String(requesterId) !== String(ownerUserId)) {
      return respond(403, { error: "No autorizado para consultar estas estadísticas" });
    }

    const nowMs = Date.now();
    const summaries = await buildOwnerVenueStatSummaries(ownerUserId, nowMs);

    return respond(200, {
      venues: summaries,
      count: summaries.length,
      currency: "COP",
    });
  } catch (error) {
    console.error("getUserVenuesStatisticsHandler error:", error);
    return respond(500, { error: error.message || "Error interno" });
  }
};
