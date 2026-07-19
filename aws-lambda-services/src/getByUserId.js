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
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return jsonResponse(event, 400, { error: 'userId es requerido' });
    }

    const includeInactive = event.queryStringParameters?.includeInactive === 'true';

    const items = [];
    let lastKey;
    do {
      const queryParams = {
        TableName: TABLE,
        IndexName: 'userIdIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ExclusiveStartKey: lastKey,
      };

      if (!includeInactive) {
        queryParams.FilterExpression = '#status = :active';
        queryParams.ExpressionAttributeNames = { '#status': 'status' };
        queryParams.ExpressionAttributeValues[':active'] = 'active';
      } else {
        queryParams.FilterExpression = 'attribute_not_exists(#status) OR #status <> :deleted';
        queryParams.ExpressionAttributeNames = { '#status': 'status' };
        queryParams.ExpressionAttributeValues[':deleted'] = 'deleted';
      }

      const res = await dynamodb.query(queryParams).promise();
      items.push(...(res.Items || []));
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    const enriched = await Promise.all(items.map((item) => enrichProviderItem(item)));
    const services = enriched.map((item) => mapProvider(item)).filter(Boolean);

    return jsonResponse(event, 200, { services, count: services.length });
  } catch (err) {
    console.error('getByUserId error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
