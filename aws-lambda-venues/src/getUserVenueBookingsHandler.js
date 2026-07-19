const AWS = require("aws-sdk");
const { respond, handleOptions } = require("./venueSocialUtils");
const { tableName } = require("./venueBookingUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const BOOKINGS_TABLE = () => tableName("VENUE_BOOKINGS_TABLE", "VenueBookings");
const VENUES_TABLE = () => process.env.VENUE_TABLE || "Venues-dev";

function resolveVenueImage(venue) {
  if (!venue) return "";
  const raw = venue.mainImage || venue.images || venue.image || "";
  if (Array.isArray(raw)) {
    return raw.map((part) => String(part || "").trim()).filter(Boolean)[0] || "";
  }
  if (typeof raw === "string") {
    return raw.split(",").map((part) => part.trim()).filter(Boolean)[0] || "";
  }
  return "";
}

function resolveVenueLocation(venue) {
  if (!venue) return { city: "", address: "" };
  const nested = venue.location && typeof venue.location === "object" ? venue.location : {};
  return {
    city: venue.city || venue.ciudad || nested.city || nested.ciudad || "",
    address: venue.address || venue.direccion || nested.address || nested.direccion || "",
  };
}

async function loadVenueMap(venueIds = []) {
  const uniqueIds = [...new Set(venueIds.filter(Boolean))];
  const map = new Map();
  await Promise.all(uniqueIds.map(async (venueId) => {
    try {
      const result = await dynamodb.get({
        TableName: VENUES_TABLE(),
        Key: { venue_id: venueId },
      }).promise();
      if (result.Item) map.set(venueId, result.Item);
    } catch (error) {
      console.warn("getUserVenueBookings: venue lookup failed", venueId, error.message);
    }
  }));
  return map;
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return respond(400, { error: "userId es requerido" });
    }

    const result = await dynamodb
      .query({
        TableName: BOOKINGS_TABLE(),
        IndexName: "userIdIndex",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ScanIndexForward: false,
      })
      .promise();

    const items = result.Items || [];
    const venueMap = await loadVenueMap(items.map((item) => item.venueId));

    const bookings = items.map((item) => {
      const venue = venueMap.get(item.venueId);
      const { city, address } = resolveVenueLocation(venue);
      const image = resolveVenueImage(venue);
      return {
        bookingId: item.bookingId,
        venueId: item.venueId,
        venueName: item.venueName || venue?.name || "Lugar",
        venueImage: image,
        venueCoverImage: image,
        venueCity: city,
        venueAddress: address,
        orderId: item.orderId,
        status: item.status,
        selectedDates: item.selectedDates || [],
        services: item.services || [],
        pricing: item.pricing || {},
        createdAt: item.createdAt,
        confirmedAt: item.confirmedAt || null,
      };
    });

    return respond(200, { bookings, count: bookings.length });
  } catch (error) {
    console.error("getUserVenueBookingsHandler error:", error);
    return respond(500, { error: error.message || "Error interno" });
  }
};
