const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getProfileImageUrl } = require("./utils/imageUrlHelper");
const { guestResponse } = require("./guestResponse");
const {
  sanitizeStoredContact,
  pickSingleGroupIds,
  normalizeContactCategory,
} = require("./utils/contactCategoryUtils");

function normalizePhoneDigits(phone, indicative, number) {
  const raw = phone || `${indicative || ""}${number || ""}`;
  return String(raw).replace(/\D/g, "");
}

function pickRicherName(a, b) {
  const na = (a || "").trim();
  const nb = (b || "").trim();
  if (!na || na === "Sin nombre") return nb && nb !== "Sin nombre" ? nb : na;
  if (!nb || nb === "Sin nombre") return na;
  return na.length >= nb.length ? na : nb;
}

function contactKeys(item) {
  const keys = [];
  if (item.invitedUserId) keys.push(`uid:${item.invitedUserId}`);
  if (item.favoriteId) keys.push(`fav:${item.favoriteId}`);
  if (item.email) keys.push(`email:${item.email.trim().toLowerCase()}`);
  const phone = normalizePhoneDigits(item.phone, item.phoneIndicative, item.phoneNumber);
  if (phone.length >= 7) keys.push(`phone:${phone}`);
  const username = (item.username || item.user || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
  if (username) keys.push(`user:${username}`);
  return keys;
}

function mergeContacts(existing, incoming) {
  const preferIncomingGroup = Boolean((incoming.groupIds || []).filter(Boolean).length);
  const preferExistingGroup = Boolean((existing.groupIds || []).filter(Boolean).length);
  // Grupos y favoritos son excluyentes: si hay grupo en cualquiera, gana el grupo.
  const mergedGroupIds = preferIncomingGroup
    ? pickSingleGroupIds(incoming.groupIds)
    : preferExistingGroup
      ? pickSingleGroupIds(existing.groupIds)
      : pickSingleGroupIds(incoming.groupIds || existing.groupIds);
  const category = normalizeContactCategory({
    isFavorite: mergedGroupIds.length
      ? false
      : Boolean(existing.isFavorite || incoming.isFavorite),
    groupIds: mergedGroupIds,
  });

  return {
    ...existing,
    ...incoming,
    favoriteId: existing.favoriteId || incoming.favoriteId,
    invitedUserId: existing.invitedUserId || incoming.invitedUserId,
    name: pickRicherName(existing.name, incoming.name),
    lastName:
      pickRicherName(existing.lastName, incoming.lastName)
      || existing.lastName
      || incoming.lastName,
    email: (existing.email || incoming.email || "").trim().toLowerCase() || undefined,
    username: existing.username || incoming.username || existing.user || incoming.user,
    user: existing.user || incoming.user || existing.username || incoming.username,
    phone: existing.phone || incoming.phone,
    phoneIndicative: existing.phoneIndicative || incoming.phoneIndicative,
    phoneNumber: existing.phoneNumber || incoming.phoneNumber,
    profileImageUrl: existing.profileImageUrl || incoming.profileImageUrl,
    isFavorite: category.isFavorite,
    groupIds: category.groupIds,
    originType: existing.originType || incoming.originType,
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt || existing.updatedAt,
  };
}

function dedupeContacts(items) {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const keyToIndex = new Map();
  for (let i = 0; i < n; i += 1) {
    for (const key of contactKeys(items[i])) {
      const prev = keyToIndex.get(key);
      if (prev !== undefined) union(prev, i);
      else keyToIndex.set(key, i);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(items[i]);
  }

  return Array.from(groups.values()).map((group) =>
    group.reduce((acc, item) => mergeContacts(acc, item)),
  );
}

exports.handler = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    if (!userId) {
      return guestResponse(400, { error: "userId is required" });
    }

    const result = await dynamodb
      .query({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
      })
      .promise();

    const raw = (result.Items || []).map((item) => ({
      favoriteId: item.favoriteId,
      invitedUserId: item.invitedUserId,
      name: item.name || "",
      lastName: item.lastName || "",
      email: item.email ? item.email.trim().toLowerCase() : "",
      phone: item.phone || "",
      phoneIndicative: item.phoneIndicative || "",
      phoneNumber: item.phoneNumber || "",
      username: item.username || item.user || "",
      user: item.user || item.username || "",
      profileImageUrl: getProfileImageUrl(
        item.profileImageUrl,
        item.platform || item.PLATFORM || null,
      ),
      originType: item.originType || "",
      groupIds: item.groupIds || [],
      tags: item.tags || [],
      isFavorite: Boolean(item.isFavorite),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const contacts = dedupeContacts(raw)
      .map((item) => sanitizeStoredContact(item))
      .map((item) => ({
        ...item,
        groupIds: pickSingleGroupIds(item.groupIds),
      }));

    return guestResponse(200, {
      contacts,
      count: contacts.length,
      rawCount: raw.length,
    });
  } catch (error) {
    console.error("Error in getContactsHandler:", error);
    return guestResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};
