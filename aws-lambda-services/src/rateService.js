const AWS = require('aws-sdk');
const { randomUUID } = require('crypto');
const { jsonResponse, handleOptions } = require('./response');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';
const RATINGS_TABLE = process.env.SERVICE_RATINGS_TABLE || 'ServiceCalification-qa';

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const serviceId = String(body.serviceId || '').trim();
    const userId = String(body.userId || '').trim();
    const rating = Number(body.rating);
    const comment = String(body.comment || '').trim();

    if (!serviceId || !userId || Number.isNaN(rating) || rating < 1 || rating > 5) {
      return jsonResponse(event, 400, { error: 'serviceId, userId y rating (1-5) son requeridos' });
    }

    const calificationId = randomUUID();
    const now = new Date().toISOString();

    await dynamodb.put({
      TableName: RATINGS_TABLE,
      Item: {
        serviceId,
        calificationId,
        userId,
        rating,
        comment,
        createdAt: now,
      },
    }).promise();

    const ratingsScan = await dynamodb.query({
      TableName: RATINGS_TABLE,
      KeyConditionExpression: 'serviceId = :sid',
      ExpressionAttributeValues: { ':sid': serviceId },
    }).promise();

    const items = ratingsScan.Items || [];
    const avg = items.length
      ? items.reduce((s, r) => s + Number(r.rating || 0), 0) / items.length
      : rating;

    await dynamodb.update({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
      UpdateExpression: 'SET rating = :r, reviewCount = :c, updatedAt = :now',
      ExpressionAttributeValues: {
        ':r': Math.round(avg * 10) / 10,
        ':c': items.length,
        ':now': now,
      },
    }).promise();

    return jsonResponse(event, 200, {
      calificationId,
      rating: Math.round(avg * 10) / 10,
      reviewCount: items.length,
    });
  } catch (err) {
    console.error('rateService error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
