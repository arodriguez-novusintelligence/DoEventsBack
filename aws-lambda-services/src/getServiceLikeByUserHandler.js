const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const LIKES_TABLE = process.env.SERVICE_LIKES_TABLE || 'Service_Likes-qa';

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const userId = event.pathParameters?.userId;

    if (!serviceId || !userId) {
      return jsonResponse(event, 400, { error: 'serviceId y userId son requeridos' });
    }

    const result = await dynamodb
      .get({
        TableName: LIKES_TABLE,
        Key: { userId, serviceId },
      })
      .promise();

    return jsonResponse(event, 200, {
      liked: Boolean(result.Item),
    });
  } catch (error) {
    console.error('getServiceLikeByUserHandler error:', error);
    return jsonResponse(event, 500, {
      error: 'Error interno',
      message: error.message,
    });
  }
};
