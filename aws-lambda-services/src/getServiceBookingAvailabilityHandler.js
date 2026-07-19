const AWS = require("aws-sdk");
const { jsonResponse, handleOptions } = require("./response");
const {
  tableName,
  resolveServicePricePerDay,
  loadServiceBookings,
  getActiveBookedDates,
  buildMonthAvailability,
} = require("./serviceBookingUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const SERVICES_TABLE = () => tableName("SERVICES_TABLE", "ServiceProviders-qa");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const qs = event.queryStringParameters || {};
    const year = Number(qs.year);
    const month = Number(qs.month);

    if (!serviceId) {
      return jsonResponse(event, 400, { error: "serviceId es requerido" });
    }
    if (!year || !month || month < 1 || month > 12) {
      return jsonResponse(event, 400, { error: "year y month son requeridos (1-12)" });
    }

    const serviceResult = await dynamodb
      .get({ TableName: SERVICES_TABLE(), Key: { serviceId } })
      .promise();

    if (!serviceResult.Item || serviceResult.Item.status !== "active") {
      return jsonResponse(event, 404, { error: "Servicio no encontrado" });
    }

    const service = serviceResult.Item;
    const availability = service.availability || {};
    const pricePerDay = resolveServicePricePerDay(service);
    const bookings = await loadServiceBookings(serviceId);
    const bookedDates = getActiveBookedDates(bookings);
    const blockedDates = availability.blockedDates || service.blockedDates || [];

    const days = buildMonthAvailability({
      year,
      month,
      pricePerDay,
      blockedDates,
      bookedDates,
    });

    return jsonResponse(event, 200, {
      serviceId,
      year,
      month,
      pricePerDay,
      checkIn: availability.globalStartTime || service.globalStartTime || "08:00",
      checkOut: availability.globalEndTime || service.globalEndTime || "18:00",
      days,
    });
  } catch (error) {
    console.error("getServiceBookingAvailabilityHandler error:", error);
    return jsonResponse(event, 500, { error: error.message || "Error interno" });
  }
};
