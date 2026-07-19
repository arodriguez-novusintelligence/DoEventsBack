const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || process.env.DYNAMODB_CLIENT_TABLE || 'Client-dev';
const FOLLOWERS_TABLE = process.env.FOLLOWERS_TABLE || process.env.DYNAMODB_FOLLOWERS_TABLE || 'Followers-dev';

async function batchGetClients(userIds = []) {
  const unique = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!unique.length) return new Map();

  const map = new Map();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const result = await dynamodb
      .batchGet({
        RequestItems: {
          [CLIENT_TABLE]: {
            Keys: chunk.map((id) => ({ id })),
            ProjectionExpression: 'id, isPublicProfile',
          },
        },
      })
      .promise();
    (result.Responses?.[CLIENT_TABLE] || []).forEach((item) => {
      map.set(item.id, item);
    });
  }
  return map;
}

async function getAcceptedFollowingIds(viewerId) {
  if (!viewerId) return new Set();
  const ids = new Set();
  let lastKey;
  do {
    const result = await dynamodb
      .query({
        TableName: FOLLOWERS_TABLE,
        IndexName: 'userIdIndex',
        KeyConditionExpression: 'userId = :uid',
        FilterExpression: '#status = :accepted',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':uid': viewerId,
          ':accepted': 'accepted',
        },
        ExclusiveStartKey: lastKey,
      })
      .promise();
    (result.Items || []).forEach((item) => {
      if (item.follow_userId) ids.add(String(item.follow_userId));
    });
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

/**
 * Filtra items cuyo dueño tiene perfil privado y el viewer no lo sigue.
 */
async function filterPrivateOwners(items, getOwnerId, viewerId) {
  if (!Array.isArray(items) || !items.length) return items || [];

  try {
    const ownerIds = [...new Set(items.map((item) => String(getOwnerId(item) || '').trim()).filter(Boolean))];
    if (!ownerIds.length) return items;

    const [clients, following] = await Promise.all([
      batchGetClients(ownerIds),
      getAcceptedFollowingIds(viewerId),
    ]);

    return items.filter((item) => {
      const ownerId = String(getOwnerId(item) || '').trim();
      if (!ownerId) return true;
      if (viewerId && ownerId === viewerId) return true;
      const client = clients.get(ownerId);
      if (!client || client.isPublicProfile !== false) return true;
      return following.has(ownerId);
    });
  } catch (err) {
    console.error('privacyFilter: no se pudo aplicar filtro de privacidad', err.message);
    return items;
  }
}

module.exports = {
  filterPrivateOwners,
  getAcceptedFollowingIds,
};
