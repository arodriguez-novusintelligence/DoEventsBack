const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-2',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';

async function assertAdmin(event) {
  const userId = event.requestContext?.authorizer?.claims?.sub
    || event.queryStringParameters?.userId
    || event.headers?.['x-user-id']
    || event.headers?.['X-User-Id'];
  if (!userId) throw new Error('UNAUTHORIZED');

  const client = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
  const role = String(client.Item?.platformRole || client.Item?.role || '').toLowerCase();
  if (role !== 'admin') throw new Error('FORBIDDEN');
  return userId;
}

module.exports = { assertAdmin };
