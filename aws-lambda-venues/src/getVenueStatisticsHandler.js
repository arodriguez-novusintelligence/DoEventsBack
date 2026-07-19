const { respond, handleOptions } = require("./venueSocialUtils");
const {
  parseAuthUserId,
  assertVenueOwnerAccess,
  loadVenueBookingsForStatsGroup,
  buildVenueStatisticsPayload,
} = require("./venueStatsShared");
const { dynamodb, venueTable } = require("./dynamoClient");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const userId = parseAuthUserId(event);
    if (!venueId) {
      return respond(400, { error: "venueId es requerido" });
    }
    await assertVenueOwnerAccess(venueId, userId);

    const query = event.queryStringParameters || {};
    const now = new Date();
    const year = Number(query.year) || now.getFullYear();
    const month = Number(query.month) || now.getMonth() + 1;

    const venueResult = await dynamodb
      .get({ TableName: venueTable(), Key: { venue_id: venueId } })
      .promise();
    if (!venueResult.Item) {
      return respond(404, { error: "Lugar no encontrado" });
    }

    const bookings = await loadVenueBookingsForStatsGroup(venueId, userId);
    const payload = buildVenueStatisticsPayload(venueResult.Item, bookings, { year, month });
    return respond(200, payload);
  } catch (error) {
    console.error("getVenueStatisticsHandler error:", error);
    const status = error.statusCode || 500;
    return respond(status, { error: error.message || "Error interno" });
  }
};
