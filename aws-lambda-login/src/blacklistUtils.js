const BACKOFFICE_TABLE = process.env.BACKOFFICE_TABLE || 'doevents-backoffice-qa-users';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client';
const BACKOFFICE_REGION = process.env.BACKOFFICE_REGION || 'us-east-2';

const AWS = require('aws-sdk');
const backofficeDynamo = new AWS.DynamoDB.DocumentClient({ region: BACKOFFICE_REGION });

const BLOCKED_MESSAGE =
  'Esta cuenta no puede acceder a do.events. Si crees que es un error, contacta a soporte.';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isClientAccountBlocked(user) {
  if (!user) return false;
  if (user.blacklisted === true) return true;
  const status = String(user.accountStatus || user.userStatus || user.status || '').toLowerCase();
  return ['blocked', 'suspended', 'deleted'].includes(status);
}

async function isEmailBlacklisted(dynamodb, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { blocked: false };

  const blacklistEntry = await backofficeDynamo
    .get({
      TableName: BACKOFFICE_TABLE,
      Key: { PK: `BLACKLIST#${normalized}`, SK: 'META' },
    })
    .promise()
    .catch(() => ({ Item: null }));

  if (blacklistEntry.Item) {
    return { blocked: true, reason: 'blacklisted' };
  }

  const clientResult = await dynamodb
    .query({
      TableName: CLIENT_TABLE,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': normalized },
    })
    .promise()
    .catch(() => ({ Items: [] }));

  const blockedUser = (clientResult.Items || []).find(isClientAccountBlocked);
  if (blockedUser) {
    return { blocked: true, reason: 'account_blocked' };
  }

  return { blocked: false };
}

function buildBlacklistHttpResponse(statusCode = 403) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: false,
      message: BLOCKED_MESSAGE,
      data: { codigoRespuesta: 1, reason: 'blacklisted' },
    }),
  };
}

module.exports = {
  BLOCKED_MESSAGE,
  normalizeEmail,
  isClientAccountBlocked,
  isEmailBlacklisted,
  buildBlacklistHttpResponse,
};
