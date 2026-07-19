const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

AWS.config.update({
  region:
    process.env.DYNAMODB_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "sa-east-1",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.SERVICE_PROMO_CODES_TABLE || "ServicePromoCodes-dev";
const SERVICES_TABLE = process.env.SERVICES_TABLE || "ServiceProviders-dev";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-dev";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
};

const VALID_CURRENCIES = new Set(["COP", "USD", "EUR", "MXN", "DOP"]);
const CODE_PREFIX = "DOS";

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

async function queryServicePromoItems(serviceId) {
  const result = await dynamodb
    .query({
      TableName: TABLE,
      KeyConditionExpression: "serviceId = :serviceId",
      ExpressionAttributeValues: { ":serviceId": serviceId },
    })
    .promise();
  return result.Items || [];
}

async function getServiceOwnerId(serviceId) {
  const result = await dynamodb
    .get({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
    })
    .promise();
  return result.Item?.userId || null;
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

async function assertServiceOwnerAccess(serviceId, userId) {
  if (!userId) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const result = await dynamodb
    .get({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
    })
    .promise();
  const ownerId = result.Item?.userId || null;
  const coAdminIds = Array.isArray(result.Item?.coAdminIds)
    ? result.Item.coAdminIds.map(String)
    : [];
  if (
    !ownerId
    || (String(ownerId) !== String(userId) && !coAdminIds.includes(String(userId)))
  ) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
}

async function assertOwnerOrPlatformAdmin(serviceId, userId) {
  if (!userId) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
  const ownerId = await getServiceOwnerId(serviceId);
  if (ownerId && String(ownerId) === String(userId)) return;
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
    batch.codes = (codesByBatch.get(batch.id) || []).sort();
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
      bookingType: record.bookingType || "service",
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

async function putBatchWithCodes(serviceId, batch, organizerId) {
  const now = new Date().toISOString();
  const batchId = batch.id || uuidv4();
  const currency = VALID_CURRENCIES.has(batch.currency) ? batch.currency : "COP";
  const value = Number(batch.value || 0);
  const quantity = Math.min(500, Math.max(1, Number(batch.quantity || batch.codes?.length || 1)));
  const description = String(batch.description || "").trim();
  const codes =
    Array.isArray(batch.codes) && batch.codes.length
      ? batch.codes.map(normalizeCode)
      : generateUniquePromoCodes(quantity);

  const items = [
    {
      serviceId,
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
      serviceId,
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

module.exports = {
  TABLE,
  dynamodb,
  CORS_HEADERS,
  response,
  normalizeCode,
  generateUniquePromoCodes,
  queryServicePromoItems,
  getServiceOwnerId,
  assertServiceOwnerAccess,
  assertOwnerOrPlatformAdmin,
  parseAuthUserId,
  buildPromoPayload,
  putBatchWithCodes,
  uuidv4,
  VALID_CURRENCIES,
};
