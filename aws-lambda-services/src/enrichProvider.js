const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';

function resolveProviderImage(item) {
  if (!item) return undefined;
  if (item.profileImageUrl) return item.profileImageUrl;
  if (Array.isArray(item.gallery) && item.gallery.length) return item.gallery[0];
  return undefined;
}

async function enrichProviderItem(item) {
  if (!item) return item;

  if (!item.userId) return item;

  try {
    const client = await dynamodb.get({
      TableName: CLIENT_TABLE,
      Key: { id: item.userId },
    }).promise();

    const profileUrl = resolveProviderImage(item)
      || client.Item?.imagen
      || client.Item?.fotoPerfilUrl
      || client.Item?.profileImageUrl;

    if (client.Item) {
      const displayName = [client.Item.name, client.Item.lastName].filter(Boolean).join(' ').trim()
        || client.Item.user
        || client.Item.username
        || item.name;
      return {
        ...item,
        profileImageUrl: profileUrl || item.profileImageUrl,
        username: item.username || client.Item.user || client.Item.username,
        providerDisplayName: displayName,
      };
    }

    if (profileUrl) {
      return { ...item, profileImageUrl: profileUrl };
    }
  } catch (err) {
    console.warn('enrichProviderItem client lookup failed', err.message);
  }

  return item;
}

module.exports = { enrichProviderItem, resolveProviderImage };
