const assert = require("assert");
const {
  extractRequestUserId,
  extractRequestUserLocation,
  mergeDeviceLocationCoords,
  isNearbyRadiusRequest,
  shouldApplyDistanceFilter,
  formatEventDateForFeed,
  normalizeFeedEventItem,
} = require("./nearbyEventHelpers");

assert.strictEqual(extractRequestUserId({ userId: " abc " }), "abc");
assert.strictEqual(extractRequestUserId({ userID: "xyz" }), "xyz");
assert.strictEqual(extractRequestUserId({}), null);

const aliasCoords = extractRequestUserLocation({
  maxDistanceKm: 100,
  userLocation: { lat: 4.6, lng: -74.0 },
});
assert.strictEqual(aliasCoords.lat, 4.6);
assert.strictEqual(aliasCoords.lon, -74.0);
assert.strictEqual(aliasCoords.explicitInRequest, true);

const merged = mergeDeviceLocationCoords(null, null, { lat: 4.1, lng: -75.2 });
assert.strictEqual(merged.lat, 4.1);
assert.strictEqual(merged.lon, -75.2);

assert.strictEqual(isNearbyRadiusRequest(100), true);
assert.strictEqual(isNearbyRadiusRequest(500), false);
assert.strictEqual(isNearbyRadiusRequest(undefined), false);

assert.strictEqual(shouldApplyDistanceFilter(true, 100), true);
assert.strictEqual(shouldApplyDistanceFilter(true, 500), false);
assert.strictEqual(shouldApplyDistanceFilter(false, 100), false);

assert.strictEqual(formatEventDateForFeed("20260802"), "02/08/2026");

const normalized = normalizeFeedEventItem({
  user_id: "owner-1",
  ubicacion: { lat: 4.71, lng: -74.07 },
});
assert.strictEqual(normalized.userId, "owner-1");
assert.strictEqual(normalized.latitude, 4.71);
assert.strictEqual(normalized.longitude, -74.07);

console.log("nearbyEventHelpers.test.js: OK");
