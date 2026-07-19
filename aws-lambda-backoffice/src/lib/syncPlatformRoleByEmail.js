const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-1',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-dev';

async function findClientsByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return [];

  const result = await dynamodb.query({
    TableName: CLIENT_TABLE,
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': normalizedEmail,
    },
  }).promise();

  return result.Items || [];
}

/**
 * Propaga platformRole a todas las cuentas con el mismo correo.
 * Evita que OAuth y registro manual queden con IDs distintos y roles desincronizados.
 */
async function syncPlatformRoleByEmail(email, platformRole, primaryUserId) {
  const role = String(platformRole || '').trim().toLowerCase();
  if (!role) return 0;

  const accounts = await findClientsByEmail(email);
  let updated = 0;
  const now = new Date().toISOString();

  for (const account of accounts) {
    if (!account?.id || account.id === primaryUserId) continue;
    const current = String(account.platformRole || account.role || 'user').toLowerCase();
    if (current === role) continue;

    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: account.id },
      UpdateExpression: 'SET platformRole = :role, updatedAt = :now REMOVE #legacyRole',
      ExpressionAttributeNames: {
        '#legacyRole': 'role',
      },
      ExpressionAttributeValues: {
        ':role': role,
        ':now': now,
      },
    }).promise().catch(async () => {
      await dynamodb.update({
        TableName: CLIENT_TABLE,
        Key: { id: account.id },
        UpdateExpression: 'SET platformRole = :role, updatedAt = :now',
        ExpressionAttributeValues: {
          ':role': role,
          ':now': now,
        },
      }).promise();
    });
    updated += 1;
  }

  return updated;
}

module.exports = {
  findClientsByEmail,
  syncPlatformRoleByEmail,
};
