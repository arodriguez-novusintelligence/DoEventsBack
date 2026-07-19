const { jsonResponse, handleOptions } = require("./response");
const {
  parseAuthUserId,
  assertServiceOwnerAccess,
  loadServiceBookings,
  buildServiceStatisticsPayload,
} = require("./serviceStatsShared");
const { dynamodb } = require("./servicePromoCodesShared");

const SERVICES_TABLE = process.env.SERVICES_TABLE || "ServiceProviders-dev";

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const userId = parseAuthUserId(event);
    if (!serviceId) {
      return jsonResponse(event, 400, { error: "serviceId es requerido" });
    }
    await assertServiceOwnerAccess(serviceId, userId);

    const query = event.queryStringParameters || {};
    const now = new Date();
    const year = Number(query.year) || now.getFullYear();
    const month = Number(query.month) || now.getMonth() + 1;

    const serviceResult = await dynamodb
      .get({ TableName: SERVICES_TABLE, Key: { serviceId } })
      .promise();
    if (!serviceResult.Item) {
      return jsonResponse(event, 404, { error: "Servicio no encontrado" });
    }

    const bookings = await loadServiceBookings(serviceId);
    const payload = buildServiceStatisticsPayload(serviceResult.Item, bookings, { year, month });
    return jsonResponse(event, 200, payload);
  } catch (error) {
    console.error("getServiceStatisticsHandler error:", error);
    const status = error.statusCode || 500;
    return jsonResponse(event, status, { error: error.message || "Error interno" });
  }
};
