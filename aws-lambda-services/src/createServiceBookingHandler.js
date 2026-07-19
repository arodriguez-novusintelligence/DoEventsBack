const AWS = require("aws-sdk");
const { jsonResponse, handleOptions } = require("./response");
const {
  tableName,
  resolveServicePricePerDay,
  loadServiceBookings,
  getActiveBookedDates,
  validateDateRange,
  computeBookingTotals,
  createServiceBookingRecord,
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
    const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
    const userId = String(body.userId || body.user_id || "").trim();

    if (!serviceId || !userId) {
      return jsonResponse(event, 400, { error: "serviceId y userId son requeridos" });
    }

    const startDate = body.startDate || body.start_date;
    const endDate = body.endDate || body.end_date || startDate;
    const additionalServices = Array.isArray(body.additionalServices)
      ? body.additionalServices
      : Array.isArray(body.services)
        ? body.services
        : [];
    const activityKey = String(body.activityKey || body.activity_key || "").trim() || null;
    const activityName = String(body.activityName || body.activity_name || "").trim() || null;
    const buyer = body.buyer || {
      firstName: body.firstName || body.buyerFirstName,
      lastName: body.lastName || body.buyerLastName,
      email: body.email || body.buyerEmail,
    };

    if (!buyer?.email) {
      return jsonResponse(event, 400, { error: "El correo del comprador es requerido" });
    }

    const serviceResult = await dynamodb
      .get({ TableName: SERVICES_TABLE(), Key: { serviceId } })
      .promise();

    if (!serviceResult.Item || serviceResult.Item.status !== "active") {
      return jsonResponse(event, 404, { error: "Servicio no encontrado" });
    }

    const service = serviceResult.Item;

    const pricePerDay = resolveServicePricePerDay(service, activityKey);
    if (!pricePerDay) {
      return jsonResponse(event, 400, { error: "Este servicio no tiene tarifa configurada" });
    }

    const availability = service.availability || {};
    const blockedDates = availability.blockedDates || service.blockedDates || [];
    const bookings = await loadServiceBookings(serviceId);
    const bookedDates = getActiveBookedDates(bookings);
    const validation = validateDateRange({
      startDate,
      endDate,
      blockedDates,
      bookedDates,
    });

    if (!validation.ok) {
      return jsonResponse(event, 409, { error: validation.error });
    }

    const totals = computeBookingTotals({
      pricePerDay,
      numDays: validation.dates.length,
      additionalServices,
    });

    const created = await createServiceBookingRecord({
      serviceId,
      service,
      userId,
      startDate: validation.startDate,
      endDate: validation.endDate,
      selectedDates: validation.dates,
      additionalServices,
      buyer,
      totals,
      activityKey,
      activityName,
    });

    return jsonResponse(event, 200, {
      message: "Reserva creada. Completa el pago antes de que expire.",
      bookingId: created.bookingId,
      orderId: created.orderId,
      order_id: created.orderId,
      expired_at_ts: created.expired_at_ts,
      total_amount: totals.total,
      pricing: totals,
      booking: {
        bookingId: created.bookingId,
        serviceId,
        serviceName: service.name,
        startDate: validation.startDate,
        endDate: validation.endDate,
        selectedDates: validation.dates,
        status: "PENDING",
      },
    });
  } catch (error) {
    console.error("createServiceBookingHandler error:", error);
    return jsonResponse(event, 500, { error: error.message || "Error interno" });
  }
};
