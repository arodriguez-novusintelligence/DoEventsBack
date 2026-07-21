function toCoord(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readCoords(source = {}) {
  return {
    lat: toCoord(source.latitude ?? source.lat),
    lon: toCoord(source.longitude ?? source.lng ?? source.lon),
  };
}

function extractRequestUserId(body = {}) {
  const raw = body.userID ?? body.userId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractRequestUserLocation(body = {}) {
  const userLocation =
    body.userLocation && typeof body.userLocation === "object"
      ? body.userLocation
      : {};
  const fromUserLocation = readCoords(userLocation);
  const lat = toCoord(
    fromUserLocation.lat ?? body.latitude ?? body.lat ?? null,
  );
  const lon = toCoord(
    fromUserLocation.lon ?? body.longitude ?? body.lng ?? body.lon ?? null,
  );
  const explicitInRequest =
    fromUserLocation.lat != null ||
    fromUserLocation.lon != null ||
    body.latitude != null ||
    body.lat != null ||
    body.longitude != null ||
    body.lng != null ||
    body.lon != null;

  return { lat, lon, explicitInRequest };
}

function mergeDeviceLocationCoords(lat, lon, deviceLocation = {}) {
  const device = readCoords(deviceLocation);
  return {
    lat: lat ?? device.lat,
    lon: lon ?? device.lon,
  };
}

function isNearbyRadiusRequest(maxDistanceKm) {
  const radius = Number(maxDistanceKm);
  return Number.isFinite(radius) && radius > 0 && radius < 500;
}

function shouldApplyDistanceFilter(hasLocation, maxDistanceKm) {
  return hasLocation && isNearbyRadiusRequest(maxDistanceKm);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (/^\d{8}$/.test(String(value))) {
    const raw = String(value);
    return new Date(
      `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}T00:00:00Z`,
    );
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatEventDateForFeed(value) {
  const d = toDate(value);
  if (!d) return value;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeFeedEventItem(item) {
  if (!item || typeof item !== "object") return item;
  if (!item.userId && item.user_id) {
    item.userId = item.user_id;
  }
  const coords = readCoords(item.ubicacion || item);
  if (coords.lat != null && coords.lon != null) {
    item.latitude = coords.lat;
    item.longitude = coords.lon;
    item.ubicacion = {
      ...(item.ubicacion && typeof item.ubicacion === "object"
        ? item.ubicacion
        : {}),
      latitude: coords.lat,
      longitude: coords.lon,
    };
  }
  return item;
}

module.exports = {
  toCoord,
  readCoords,
  extractRequestUserId,
  extractRequestUserLocation,
  mergeDeviceLocationCoords,
  isNearbyRadiusRequest,
  shouldApplyDistanceFilter,
  formatEventDateForFeed,
  normalizeFeedEventItem,
};
