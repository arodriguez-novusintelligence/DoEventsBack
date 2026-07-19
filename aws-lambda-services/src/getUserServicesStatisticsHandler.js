const { jsonResponse, handleOptions } = require("./response");
const {
  parseAuthUserId,
  loadOwnerServices,
  loadServiceBookings,
  mapServiceSummary,
} = require("./serviceStatsShared");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const ownerUserId = event.pathParameters?.userId;
    const requesterId = parseAuthUserId(event);
    if (!ownerUserId) {
      return jsonResponse(event, 400, { error: "userId es requerido" });
    }
    if (!requesterId || String(requesterId) !== String(ownerUserId)) {
      return jsonResponse(event, 403, { error: "No autorizado para consultar estas estadísticas" });
    }

    const services = await loadOwnerServices(ownerUserId);
    const nowMs = Date.now();
    const summaries = await Promise.all(
      services.map(async (service) => {
        const bookings = await loadServiceBookings(service.serviceId);
        return mapServiceSummary(service, bookings, nowMs);
      }),
    );

    summaries.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return jsonResponse(event, 200, {
      services: summaries,
      count: summaries.length,
      currency: "COP",
    });
  } catch (error) {
    console.error("getUserServicesStatisticsHandler error:", error);
    return jsonResponse(event, 500, { error: error.message || "Error interno" });
  }
};
