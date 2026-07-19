const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-2',
});

const BACKOFFICE_TABLE = process.env.BACKOFFICE_TABLE || 'doevents-backoffice-qa-users';

async function writeAuditLog({
  adminId,
  targetUserId,
  action,
  description,
  patch,
}) {
  const createdAt = new Date().toISOString();
  const activityId = uuidv4();

  const base = {
    type: action,
    description,
    actorId: adminId,
    targetUserId: targetUserId || null,
    patch: patch || null,
    createdAt,
    status: 'active',
    userId: targetUserId || adminId,
  };

  await Promise.all([
    dynamodb.put({
      TableName: BACKOFFICE_TABLE,
      Item: {
        PK: `ACTIVITY#GLOBAL`,
        SK: `${createdAt}#${activityId}`,
        ...base,
      },
    }).promise(),
    targetUserId ? dynamodb.put({
      TableName: BACKOFFICE_TABLE,
      Item: {
        PK: `AUDIT#${targetUserId}`,
        SK: `ACTION#${Date.now()}`,
        ...base,
      },
    }).promise() : Promise.resolve(),
  ]).catch((err) => {
    console.warn('writeAuditLog failed:', err.message);
  });
}

async function fetchRecentActivity(limit = 20) {
  const result = await dynamodb.query({
    TableName: BACKOFFICE_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': 'ACTIVITY#GLOBAL' },
    ScanIndexForward: false,
    Limit: limit,
  }).promise().catch(() => ({ Items: [] }));

  return (result.Items || []).map((row) => ({
    id: row.SK || row.PK || uuidv4(),
    type: row.type || 'activity',
    description: row.description || row.action || 'Actividad registrada',
    createdAt: row.createdAt || '',
    actorId: row.actorId,
    targetUserId: row.targetUserId,
  }));
}

async function fetchUserActivity(userId, limit = 50) {
  const result = await dynamodb.query({
    TableName: BACKOFFICE_TABLE,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `AUDIT#${userId}` },
    ScanIndexForward: false,
    Limit: limit,
  }).promise().catch(() => ({ Items: [] }));

  return (result.Items || []).map((row) => ({
    id: row.SK || uuidv4(),
    type: row.type || 'audit',
    description: row.description || 'Acción registrada',
    createdAt: row.createdAt || '',
    actorId: row.actorId,
    patch: row.patch || null,
  }));
}

module.exports = { writeAuditLog, fetchRecentActivity, fetchUserActivity };
