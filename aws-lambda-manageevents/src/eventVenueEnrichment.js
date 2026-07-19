const AWS = require("aws-sdk");

AWS.config.update({
  region:
    process.env.DYNAMODB_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "sa-east-1",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const VENUES_TABLE = process.env.VENUES_TABLE || "Venues-dev";

async function loadVenueSnapshot(venueId) {
  if (!venueId) return null;
  const result = await dynamodb
    .get({
      TableName: VENUES_TABLE,
      Key: { venue_id: venueId },
    })
    .promise()
    .catch(() => ({ Item: null }));
  return result.Item || null;
}

function pickCoords(venue, eventItem) {
  const lat =
    eventItem.latitude ??
    eventItem.ubicacion?.latitude ??
    venue?.latitude ??
    venue?.lat;
  const lng =
    eventItem.longitude ??
    eventItem.ubicacion?.longitude ??
    venue?.longitude ??
    venue?.lng;
  const parsedLat = lat != null ? Number(lat) : null;
  const parsedLng = lng != null ? Number(lng) : null;
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }
  return { latitude: parsedLat, longitude: parsedLng };
}

async function enrichEventFromVenue(eventItem = {}) {
  if (!eventItem.venueId) {
    return {
      hasSeating: Boolean(eventItem.hasSeating),
      coords: pickCoords(null, eventItem),
    };
  }

  const venue = await loadVenueSnapshot(eventItem.venueId);
  const hasSeating = Boolean(
    eventItem.hasSeating ?? eventItem.has_seating ?? venue?.hasSeating,
  );
  const coords = pickCoords(venue, eventItem);

  return { hasSeating, coords, venue };
}

module.exports = {
  enrichEventFromVenue,
  loadVenueSnapshot,
};
