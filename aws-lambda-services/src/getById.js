const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');
const { mapProvider } = require('./mapper');
const { enrichProviderItem } = require('./enrichProvider');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    if (!serviceId) {
      return jsonResponse(event, 400, { error: 'serviceId es requerido' });
    }

    const result = await dynamodb.get({
      TableName: TABLE,
      Key: { serviceId },
    }).promise();

    if (!result.Item || result.Item.status !== 'active') {
      return jsonResponse(event, 404, { error: 'Servicio no encontrado' });
    }

    const enriched = await enrichProviderItem(result.Item);
    return jsonResponse(event, 200, { service: mapProvider(enriched) });
  } catch (err) {
    console.error('getById error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
