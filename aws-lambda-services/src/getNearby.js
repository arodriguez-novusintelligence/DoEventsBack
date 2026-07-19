const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');
const { haversineKm } = require('./geo');
const { mapProvider } = require('./mapper');
const { enrichProviderItem } = require('./enrichProvider');
const { filterPrivateOwners } = require('./privacyFilter');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const maxDistanceKm = Number(body.maxDistanceKm || 25);
    const limit = Math.min(Number(body.limit || 20), 50);
    const viewerId = String(body.viewerId || body.userId || '').trim() || null;

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return jsonResponse(event, 400, { error: 'latitude y longitude son requeridos' });
    }

    const scan = await dynamodb.scan({
      TableName: TABLE,
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
    }).promise();

    const rankedWithCoords = [];
    const rankedWithoutCoords = [];

    (scan.Items || []).forEach((item) => {
      const location = item.location && typeof item.location === 'object' ? item.location : {};
      const lat = Number(item.latitude ?? location.lat ?? location.latitude);
      const lng = Number(item.longitude ?? location.lng ?? location.longitude);
      const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lng);
      if (hasCoords) {
        const dist = haversineKm(latitude, longitude, lat, lng);
        if (dist <= maxDistanceKm) rankedWithCoords.push({ item, dist });
        return;
      }
      rankedWithoutCoords.push({
        item,
        dist: null,
        createdAt: item.createdAt || item.updatedAt || '',
      });
    });

    rankedWithCoords.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return Number(b.item.rating || 0) - Number(a.item.rating || 0);
    });

    rankedWithoutCoords.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const rankedRaw = [
      ...rankedWithCoords,
      ...rankedWithoutCoords.slice(0, Math.max(0, limit - rankedWithCoords.length)),
    ].slice(0, limit);

    const enriched = await Promise.all(
      rankedRaw.map(({ item }) => enrichProviderItem(item)),
    );

    const ranked = rankedRaw.map(({ dist }, i) => mapProvider(enriched[i], dist));
    const visible = await filterPrivateOwners(
      ranked,
      (item) => item.userId || item.ownerUserId,
      viewerId,
    );

    return jsonResponse(event, 200, { services: visible });
  } catch (err) {
    console.error('getNearby error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
