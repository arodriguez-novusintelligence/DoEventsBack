const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

AWS.config.update({
  region:
    process.env.DYNAMODB_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.PROMO_CODES_TABLE || "EventPromoCodes-dev";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-dev";
const PROFILE_BUCKET =
  process.env.PROFILE_IMAGES_BUCKET
  || process.env.PROFILE_BUCKET
  || "doevents-profile-media-dev";
const PROFILE_BUCKET_REGION =
  process.env.PROFILE_IMAGES_BUCKET_REGION
  || process.env.AWS_REGION
  || "sa-east-1";
const s3 = new AWS.S3({ region: PROFILE_BUCKET_REGION });

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
};

const VALID_CURRENCIES = new Set(["COP", "USD", "EUR", "MXN", "DOP"]);
const CODE_PREFIX = "DOE";

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function generatePromoCode(existing = new Set()) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let attempt = 0;
  while (attempt < 500) {
    let suffix = "";
    for (let i = 0; i < 6; i += 1) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const code = `${CODE_PREFIX}-${suffix}`;
    if (!existing.has(code)) return code;
    attempt += 1;
  }
  return `${CODE_PREFIX}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

function generateUniquePromoCodes(quantity, existingSet = new Set()) {
  const codes = [];
  const used = new Set(existingSet);
  for (let i = 0; i < quantity; i += 1) {
    const code = generatePromoCode(used);
    used.add(code);
    codes.push(code);
  }
  return codes;
}

async function queryEventPromoItems(eventId) {
  const result = await dynamodb
    .query({
      TableName: TABLE,
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
    })
    .promise();
  return result.Items || [];
}

async function getEventOrganizerId(eventId) {
  const result = await dynamodb
    .get({
      TableName: EVENTS_TABLE,
      Key: { id: eventId },
    })
    .promise();
  return result.Item?.userId || result.Item?.userID || null;
}

async function isPlatformAdmin(userId) {
  if (!userId || !CLIENT_TABLE) return false;
  try {
    const result = await dynamodb
      .get({ TableName: CLIENT_TABLE, Key: { id: userId } })
      .promise();
    const role = String(result.Item?.platformRole || result.Item?.role || "user").toLowerCase();
    return role === "admin";
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function resolveUserProfileImageUrl(fotoPerfilUrl, platform) {
  if (!fotoPerfilUrl) return null;
  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  if (normalizedPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }
  try {
    return s3.getSignedUrl("getObject", {
      Bucket: PROFILE_BUCKET,
      Key: fotoPerfilUrl,
      Expires: 3600,
    });
  } catch {
    return isHttpUrl(fotoPerfilUrl) ? fotoPerfilUrl : null;
  }
}

function buildClientDisplayName(client) {
  if (!client) return "";
  const fromParts = `${client.nombre || client.name || ""} ${client.apellido || client.lastName || ""}`.trim();
  return fromParts || client.user || client.username || client.email || "";
}

function buildInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function mapClientToRedeemedUser(userId, client, fallback = {}) {
  const name =
    buildClientDisplayName(client)
    || fallback.name
    || "Usuario";
  return {
    id: userId || fallback.id || "",
    name,
    initials: buildInitials(name) || fallback.initials || "U",
    username: client?.user || client?.username || fallback.username || "",
    avatar:
      resolveUserProfileImageUrl(client?.fotoPerfilUrl, client?.platform)
      || fallback.avatar
      || undefined,
  };
}

async function getClientById(userId) {
  if (!userId || !CLIENT_TABLE) return null;
  try {
    const result = await dynamodb
      .get({ TableName: CLIENT_TABLE, Key: { id: userId } })
      .promise();
    return result.Item || null;
  } catch {
    return null;
  }
}

async function hydrateRedemptionUsers(redemptions = {}) {
  const ids = [
    ...new Set(
      Object.values(redemptions)
        .map((item) => String(item?.user?.id || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return redemptions;

  const clients = await Promise.all(ids.map(async (id) => [id, await getClientById(id)]));
  const byId = new Map(clients);

  Object.values(redemptions).forEach((item) => {
    const userId = String(item?.user?.id || "").trim();
    if (!userId) return;
    const client = byId.get(userId);
    if (!client) return;
    item.user = mapClientToRedeemedUser(userId, client, item.user);
  });

  return redemptions;
}

async function assertOrganizerAccess(eventId, userId) {
  if (!userId) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const organizerId = await getEventOrganizerId(eventId);
  if (!organizerId || String(organizerId) !== String(userId)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
}

async function assertOwnerOrPlatformAdmin(eventId, userId) {
  if (!userId) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const organizerId = await getEventOrganizerId(eventId);
  if (organizerId && String(organizerId) === String(userId)) return;
  if (await isPlatformAdmin(userId)) return;
  const error = new Error("Forbidden");
  error.statusCode = 403;
  throw error;
}

function parseAuthUserId(event) {
  const auth =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";
  if (!auth) return null;
  try {
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return payload.sub || payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

function buildPromoPayload(items) {
  const batches = [];
  const codesByBatch = new Map();
  const codeRecords = new Map();
  const shares = [];
  const cancellations = [];

  items.forEach((item) => {
    const sk = String(item.sk || "");
    if (sk.startsWith("BATCH#")) {
      batches.push({
        id: item.batchId,
        currency: item.currency,
        value: Number(item.value || 0),
        quantity: Number(item.quantity || 0),
        description: item.description || "",
        codes: [],
        createdAt: item.createdAt,
      });
    } else if (sk.startsWith("CODE#")) {
      codeRecords.set(item.code, item);
      const list = codesByBatch.get(item.batchId) || [];
      list.push(item.code);
      codesByBatch.set(item.batchId, list);
    } else if (sk.startsWith("SHARE#")) {
      shares.push({
        id: item.shareId || sk.replace("SHARE#", ""),
        promo_code: item.promo_code,
        recipient_id: item.recipient_id,
        recipient_name: item.recipient_name,
        recipient_username: item.recipient_username,
        recipient_email: item.recipient_email || null,
        channels: item.channels || [],
        message: item.message || null,
        organizer_name: item.organizer_name || null,
        created_at: item.created_at,
      });
    } else if (sk.startsWith("CANCEL#")) {
      cancellations.push({
        id: item.cancelId || sk.replace("CANCEL#", ""),
        promo_code: item.promo_code,
        reason: item.reason || null,
        created_at: item.created_at,
      });
    }
  });

  batches.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  batches.forEach((batch) => {
    const codes = (codesByBatch.get(batch.id) || []).sort();
    const codeStatuses = {};
    let redeemedCount = 0;
    let cancelledCount = 0;
    let editableCount = 0;
    codes.forEach((code) => {
      const status = String(codeRecords.get(code)?.status || "AVAILABLE").toUpperCase();
      codeStatuses[code] = status;
      if (status === "REDEEMED") redeemedCount += 1;
      else if (status === "CANCELLED") cancelledCount += 1;
      else editableCount += 1; // AVAILABLE | SHARED
    });
    batch.codes = codes;
    batch.codeStatuses = codeStatuses;
    batch.redeemedCount = redeemedCount;
    batch.cancelledCount = cancelledCount;
    batch.editableCount = editableCount;
    batch.editable = editableCount > 0;
    batch.persisted = true;
  });

  const sharesByCode = {};
  shares.forEach((share) => {
    (sharesByCode[share.promo_code] ||= []).push(share);
  });

  const cancellationByCode = {};
  cancellations.forEach((cancel) => {
    cancellationByCode[cancel.promo_code] = cancel;
  });

  const redemptions = {};
  codeRecords.forEach((record, code) => {
    if (String(record.status || "").toUpperCase() !== "REDEEMED") return;
    redemptions[code] = {
      code,
      orderId: record.orderId || "",
      redeemedAt: record.redeemedAt || record.updatedAt || "",
      user: {
        id: record.redeemedByUserId || "",
        name: record.redeemedByName || "Usuario",
        initials: record.redeemedByInitials || "U",
        username: record.redeemedByUsername || "",
        avatar: record.redeemedByAvatar || undefined,
      },
      ticketType: record.ticketType || "",
      ticketQty: Number(record.ticketQty || 1),
      subtotal: Number(record.subtotal || 0),
      serviceFee: Number(record.serviceFee || 0),
      discount: Number(record.discount || 0),
      total: Number(record.total || 0),
      currency: record.currency || "COP",
    };
  });

  return {
    batches,
    shares,
    cancellations,
    sharesByCode,
    cancellationByCode,
    redemptions,
  };
}

async function batchWriteItems(items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) {
    chunks.push(items.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    await dynamodb
      .batchWrite({
        RequestItems: {
          [TABLE]: chunk.map((Item) => ({ PutRequest: { Item } })),
        },
      })
      .promise();
  }
}

async function putBatchWithCodes(eventId, batch, organizerId) {
  const now = new Date().toISOString();
  const batchId = batch.id || uuidv4();
  const currency = VALID_CURRENCIES.has(batch.currency) ? batch.currency : "COP";
  const value = Number(batch.value || 0);
  const quantity = Math.min(500, Math.max(1, Number(batch.quantity || batch.codes?.length || 1)));
  const description = String(batch.description || "").trim().toUpperCase();
  const codes =
    Array.isArray(batch.codes) && batch.codes.length
      ? batch.codes.map(normalizeCode)
      : generateUniquePromoCodes(quantity);

  const items = [
    {
      eventId,
      sk: `BATCH#${batchId}`,
      entityType: "BATCH",
      batchId,
      currency,
      value,
      quantity: codes.length,
      description,
      organizerId,
      createdAt: batch.createdAt || now,
      updatedAt: now,
    },
    ...codes.map((code) => ({
      eventId,
      sk: `CODE#${code}`,
      entityType: "CODE",
      code,
      batchId,
      currency,
      value,
      description,
      status: "AVAILABLE",
      organizerId,
      createdAt: now,
      updatedAt: now,
    })),
  ];

  await batchWriteItems(items);
  return {
    id: batchId,
    currency,
    value,
    quantity: codes.length,
    description,
    codes,
    createdAt: batch.createdAt || now,
  };
}

/**
 * Actualiza valor/descripción/moneda del lote y de los códigos activos no redimidos.
 * Códigos REDEEMED / CANCELLED se dejan intactos.
 */
async function updateBatchEditableCodes(eventId, batch, existingItems) {
  const batchId = String(batch.id || "").trim();
  if (!batchId) {
    const error = new Error("batch.id is required");
    error.statusCode = 400;
    throw error;
  }

  const batchItem = existingItems.find(
    (item) => String(item.sk || "") === `BATCH#${batchId}`,
  );
  if (!batchItem) {
    const error = new Error("Promo batch not found");
    error.statusCode = 404;
    throw error;
  }

  const codeItems = existingItems.filter(
    (item) =>
      String(item.sk || "").startsWith("CODE#") &&
      String(item.batchId || "") === batchId,
  );
  const editableCodes = codeItems.filter((item) => {
    const status = String(item.status || "").toUpperCase();
    return status === "AVAILABLE" || status === "SHARED";
  });

  if (!editableCodes.length) {
    const error = new Error(
      "No se puede editar: todos los códigos del lote están redimidos o cancelados",
    );
    error.statusCode = 409;
    throw error;
  }

  const value = Number(batch.value);
  if (!Number.isFinite(value) || value <= 0) {
    const error = new Error("value must be greater than 0");
    error.statusCode = 400;
    throw error;
  }
  const currency = VALID_CURRENCIES.has(batch.currency) ? batch.currency : batchItem.currency || "COP";
  const description = String(batch.description || "").trim().toUpperCase();
  const now = new Date().toISOString();

  const updates = [
    {
      ...batchItem,
      currency,
      value,
      description,
      updatedAt: now,
    },
    ...editableCodes.map((item) => ({
      ...item,
      currency,
      value,
      description,
      updatedAt: now,
    })),
  ];

  await batchWriteItems(updates);

  const allCodes = codeItems
    .map((item) => item.code)
    .filter(Boolean)
    .sort();

  return {
    id: batchId,
    currency,
    value,
    quantity: allCodes.length,
    description,
    codes: allCodes,
    createdAt: batchItem.createdAt,
    updatedAt: now,
    editableCount: editableCodes.length,
    editable: true,
    persisted: true,
  };
}

module.exports = {
  TABLE,
  dynamodb,
  CORS_HEADERS,
  response,
  normalizeCode,
  generateUniquePromoCodes,
  queryEventPromoItems,
  getEventOrganizerId,
  assertOrganizerAccess,
  assertOwnerOrPlatformAdmin,
  parseAuthUserId,
  buildPromoPayload,
  batchWriteItems,
  putBatchWithCodes,
  updateBatchEditableCodes,
  uuidv4,
  VALID_CURRENCIES,
  hydrateRedemptionUsers,
  getClientById,
  mapClientToRedeemedUser,
  buildInitials,
  buildClientDisplayName,
};
