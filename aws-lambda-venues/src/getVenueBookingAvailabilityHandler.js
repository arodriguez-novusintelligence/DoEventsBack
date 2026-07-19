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
  createVenueBookingRecord,
  buildMonthAvailability,
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
    const qs = event.queryStringParameters || {};
    const year = Number(qs.year);
    const month = Number(qs.month);

    if (!venueId) {
      return respond(400, { error: "venueId es requerido" });
    }
    if (!year || !month || month < 1 || month > 12) {
      return respond(400, { error: "year y month son requeridos (1-12)" });
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

    const bookings = await loadVenueBookings(venueId);
    const bookedDates = getActiveBookedDates(bookings);
    const blockedDates = [
      ...(availability.blockedDates || []),
    ];

    const days = buildMonthAvailability({
      year,
      month,
      pricePerDay,
      blockedDates,
      bookedDates,
      datePrices,
    });

    return respond(200, {
      venueId,
      year,
      month,
      pricePerDay,
      rentalUnit: amenities.rentalUnit || pricing.rentalUnit || "day",
      checkIn: availability.globalStartTime || "12:00",
      checkOut: availability.globalEndTime || "15:00",
      days,
    });
  } catch (error) {
    console.error("getVenueBookingAvailabilityHandler error:", error);
    return respond(500, { error: error.message || "Error interno" });
  }
};
