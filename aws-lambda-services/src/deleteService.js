const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';
const RATINGS_TABLE = process.env.SERVICE_RATINGS_TABLE || 'ServiceCalification-qa';

async function deleteRatingsForService(serviceId) {
  let lastKey;
  do {
    const result = await dynamodb.query({
      TableName: RATINGS_TABLE,
      KeyConditionExpression: 'serviceId = :serviceId',
      ExpressionAttributeValues: { ':serviceId': serviceId },
      ExclusiveStartKey: lastKey,
    }).promise();

    const items = result.Items || [];
    for (const item of items) {
      await dynamodb.delete({
        TableName: RATINGS_TABLE,
        Key: { serviceId: item.serviceId, calificationId: item.calificationId },
      }).promise();
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const userId = String(body.userId || event.queryStringParameters?.userId || '').trim();

    if (!serviceId) {
      return jsonResponse(event, 400, { error: 'serviceId es requerido' });
    }
    if (!userId) {
      return jsonResponse(event, 400, { error: 'userId es requerido' });
    }

    const result = await dynamodb.get({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
    }).promise();

    const service = result.Item;
    if (!service || service.status === 'deleted') {
      return jsonResponse(event, 404, { error: 'Servicio no encontrado' });
    }

    if (service.userId !== userId) {
      return jsonResponse(event, 403, { error: 'No tienes permiso para eliminar este servicio' });
    }

    await deleteRatingsForService(serviceId);

    await dynamodb.delete({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
    }).promise();

    return jsonResponse(event, 200, { success: true, serviceId });
  } catch (err) {
    console.error('deleteService error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
