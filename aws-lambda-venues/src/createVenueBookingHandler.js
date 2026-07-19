const AWS = require("aws-sdk");
const { respond, handleOptions } = require("./venueSocialUtils");
const {
  tableName,
  parseVenueAmenities,
  parsePrice,
  loadVenueBookings,
  getActiveBookedDates,
  validateSelectedDates,
  computeBookingTotals,
  computeBookingTotalsFromDates,
  createVenueBookingRecord,
} = require("./venueBookingUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const VENUE_TABLE = () => tableName("VENUE_TABLE", "Venues");

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const body = JSON.parse(event.body || "{}");
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      body.userId ||
      body.user_id;

    if (!venueId || !userId) {
      return respond(400, { error: "venueId y userId son requeridos" });
    }

    const selectedDates = body.selectedDates || body.dates;
    const services = Array.isArray(body.services) ? body.services : [];
    const buyer = body.buyer || {
      firstName: body.firstName || body.buyerFirstName,
      lastName: body.lastName || body.buyerLastName,
      email: body.email || body.buyerEmail,
    };

    if (!buyer?.email) {
      return respond(400, { error: "El correo del comprador es requerido" });
    }

    const venueResult = await dynamodb
      .get({ TableName: VENUE_TABLE(), Key: { venue_id: venueId } })
      .promise();

    if (!venueResult.Item) {
      return respond(404, { error: "Lugar no encontrado" });
    }

    const venue = venueResult.Item;

    const amenities = parseVenueAmenities(venue.amenities);
    const pricing = amenities.pricing || {};
    const availability = amenities.availability || {};
    const datePrices = availability.datePrices || amenities.datePrices || {};
    const pricePerDay = parsePrice(pricing.perDay || pricing.perMultiDay || 0);

    if (!pricePerDay) {
      return respond(400, { error: "Este lugar no tiene precio de alquiler configurado" });
    }

    const bookings = await loadVenueBookings(venueId);
    const bookedDates = getActiveBookedDates(bookings);
    const validation = validateSelectedDates({
      selectedDates,
      blockedDates: availability.blockedDates || [],
      bookedDates,
    });

    if (!validation.ok) {
      return respond(409, { error: validation.error });
    }

    const totals = computeBookingTotalsFromDates({
      dates: validation.dates,
      basePricePerDay: pricePerDay,
      datePrices,
      services,
    });

    const created = await createVenueBookingRecord({
      venueId,
      venue,
      userId,
      selectedDates: validation.dates,
      services,
      buyer,
      totals,
    });

    return respond(200, {
      message: "Reserva creada. Completa el pago antes de que expire.",
      bookingId: created.bookingId,
      orderId: created.orderId,
      order_id: created.orderId,
      expired_at_ts: created.expired_at_ts,
      total_amount: totals.total,
      pricing: totals,
      booking: {
        bookingId: created.bookingId,
        venueId,
        venueName: venue.name,
        selectedDates: validation.dates,
        status: "PENDING",
      },
    });
  } catch (error) {
    console.error("createVenueBookingHandler error:", error);
    return respond(500, { error: error.message || "Error interno" });
  }
};
