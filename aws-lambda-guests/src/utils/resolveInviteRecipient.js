const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const FAVORITE_USERS_TABLE = process.env.FAVORITE_USERS_TABLE || "FavoriteUsers";

async function getClientById(clientId) {
  if (!clientId) return null;
  const result = await dynamodb
    .get({
      TableName: CLIENT_TABLE,
      Key: { id: clientId },
    })
    .promise();
  return result.Item || null;
}

async function getClientByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;

  const result = await dynamodb
    .query({
      TableName: CLIENT_TABLE,
      IndexName: "EmailIndex",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: { ":email": normalized },
      Limit: 1,
    })
    .promise();

  return result.Items?.[0] || null;
}

async function getClientByUsername(username) {
  const normalized = String(username || "").replace(/^@/, "").trim().toLowerCase();
  if (!normalized) return null;

  const result = await dynamodb
    .query({
      TableName: CLIENT_TABLE,
      IndexName: "userIndex",
      KeyConditionExpression: "#user = :user",
      ExpressionAttributeNames: { "#user": "user" },
      ExpressionAttributeValues: { ":user": normalized },
      Limit: 1,
    })
    .promise();

  return result.Items?.[0] || null;
}

function buildDisplayName(contact = {}) {
  const full = `${contact.name || ""} ${contact.lastName || ""}`.trim();
  return full || contact.username || contact.user || "Usuario";
}

function buildFullPhone(contact = {}) {
  const rawPhone = String(contact.phone || "").replace(/\D/g, "");
  if (rawPhone.length >= 10) return rawPhone;

  const indicative = String(contact.phoneIndicative || contact.indicativo || "").replace(/\D/g, "");
  const number = String(contact.phoneNumber || "").replace(/\D/g, "");
  if (indicative && number) return `${indicative}${number}`;
  return number || rawPhone || null;
}

async function resolveLinkedClient(favorite) {
  const invitedUserId = favorite.invitedUserId || null;

  if (invitedUserId) {
    const byId = await getClientById(invitedUserId);
    if (byId) return byId;
  }

  if (favorite.email) {
    const byEmail = await getClientByEmail(favorite.email);
    if (byEmail) return byEmail;
  }

  const username = favorite.username || favorite.user;
  if (username) {
    const byUsername = await getClientByUsername(username);
    if (byUsername) return byUsername;
  }

  return null;
}

/**
 * Resuelve un favoriteId o userId de Client al destinatario real de la invitación.
 */
async function resolveInviteRecipient(invitedBy, recipientRef) {
  const normalizedRef = String(recipientRef || "").trim();
  if (!normalizedRef) return null;

  const directClient = await getClientById(normalizedRef);
  if (directClient) {
    const phone = buildFullPhone(directClient);
    return {
      storageUserId: normalizedRef,
      favoriteId: null,
      contact: directClient,
      displayName: buildDisplayName(directClient),
      email: directClient.email || null,
      phone,
      phoneIndicative: directClient.phoneIndicative || directClient.indicativo || null,
      phoneNumber: directClient.phoneNumber || null,
      originType: "REGISTERED",
    };
  }

  const favoriteResult = await dynamodb
    .get({
      TableName: FAVORITE_USERS_TABLE,
      Key: {
        userId: invitedBy,
        favoriteId: normalizedRef,
      },
    })
    .promise();

  const favorite = favoriteResult.Item;
  if (!favorite) return null;

  const linkedClient = await resolveLinkedClient(favorite);
  const storageUserId = linkedClient ? linkedClient.id : normalizedRef;
  const mergedContact = linkedClient || favorite;
  const phone = buildFullPhone(mergedContact);

  return {
    storageUserId,
    favoriteId: favorite.favoriteId || normalizedRef,
    contact: mergedContact,
    displayName: buildDisplayName(mergedContact),
    email: favorite.email || linkedClient?.email || null,
    phone,
    phoneIndicative: favorite.phoneIndicative || linkedClient?.phoneIndicative || linkedClient?.indicativo || null,
    phoneNumber: favorite.phoneNumber || linkedClient?.phoneNumber || null,
    originType: favorite.originType || (linkedClient ? "REGISTERED" : "MANUAL"),
  };
}

module.exports = {
  resolveInviteRecipient,
};
