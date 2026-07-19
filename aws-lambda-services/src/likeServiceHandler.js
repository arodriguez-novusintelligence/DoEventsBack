const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';
const LIKES_TABLE = process.env.SERVICE_LIKES_TABLE || 'Service_Likes-qa';

async function countServiceLikes(serviceId) {
  let total = 0;
  let lastKey;
  do {
    const result = await dynamodb
      .query({
        TableName: LIKES_TABLE,
        IndexName: 'serviceIdIndex',
        KeyConditionExpression: 'serviceId = :serviceId',
        ExpressionAttributeValues: { ':serviceId': serviceId },
        Select: 'COUNT',
        ExclusiveStartKey: lastKey,
      })
      .promise();
    total += result.Count || 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return total;
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const userId = String(body.userId || '').trim();
    const like = body.like !== false;

    if (!serviceId || !userId) {
      return jsonResponse(event, 400, { error: 'serviceId y userId son requeridos' });
    }

    const serviceResult = await dynamodb
      .get({
        TableName: SERVICES_TABLE,
        Key: { serviceId },
      })
      .promise();

    if (!serviceResult.Item) {
      return jsonResponse(event, 404, { error: 'Servicio no encontrado' });
    }

    const now = new Date().toISOString();

    if (like) {
      try {
        await dynamodb
          .put({
            TableName: LIKES_TABLE,
            Item: {
              userId,
              serviceId,
              createdAt: now,
            },
            ConditionExpression:
              'attribute_not_exists(userId) AND attribute_not_exists(serviceId)',
          })
          .promise();
      } catch (err) {
        if (err.code !== 'ConditionalCheckFailedException') throw err;
      }
    } else {
      await dynamodb
        .delete({
          TableName: LIKES_TABLE,
          Key: { userId, serviceId },
        })
        .promise();
    }

    const likeCount = await countServiceLikes(serviceId);

    await dynamodb
      .update({
        TableName: SERVICES_TABLE,
        Key: { serviceId },
        UpdateExpression: 'SET likeCount = :lc, updatedAt = :now',
        ExpressionAttributeValues: {
          ':lc': likeCount,
          ':now': now,
        },
      })
      .promise();

    return jsonResponse(event, 200, {
      success: true,
      liked: like,
      likeCount,
    });
  } catch (error) {
    console.error('likeServiceHandler error:', error);
    return jsonResponse(event, 500, {
      error: 'Error interno',
      message: error.message,
    });
  }
};
