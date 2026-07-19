const {
  response,
  queryServicePromoItems,
  assertServiceOwnerAccess,
  assertOwnerOrPlatformAdmin,
  parseAuthUserId,
  buildPromoPayload,
  putBatchWithCodes,
  normalizeCode,
  generateUniquePromoCodes,
  dynamodb,
  TABLE,
  uuidv4,
} = require("./servicePromoCodesShared");

async function getPromoCodes(serviceId, userId) {
  await assertOwnerOrPlatformAdmin(serviceId, userId);
  const items = await queryServicePromoItems(serviceId);
  const payload = buildPromoPayload(items);
  return response(200, {
    success: true,
    serviceId,
    ...payload,
  });
}

async function createBatch(serviceId, body, userId) {
  await assertServiceOwnerAccess(serviceId, userId);
  const existing = await queryServicePromoItems(serviceId);
  const existingCodes = new Set(
    existing
      .filter((item) => String(item.sk || "").startsWith("CODE#"))
      .map((item) => item.code),
  );

  const value = Number(body.value || 0);
  const quantity = Number(body.quantity || 0);
  const description = String(body.description || "").trim();
  if (!description) return response(400, { error: "description is required" });
  if (!value || value <= 0) return response(400, { error: "value must be greater than 0" });
  if (!quantity || quantity <= 0 || quantity > 500) {
    return response(400, { error: "quantity must be between 1 and 500" });
  }

  const codes = generateUniquePromoCodes(quantity, existingCodes);
  const batch = await putBatchWithCodes(
    serviceId,
    {
      id: `${serviceId}-${Date.now()}`,
      currency: body.currency || "COP",
      value,
      quantity,
      description,
      codes,
    },
    userId,
  );

  return response(201, { success: true, batch });
}

async function syncPromoCodes(serviceId, body, userId) {
  await assertServiceOwnerAccess(serviceId, userId);
  const batches = Array.isArray(body.batches) ? body.batches : [];
  if (!batches.length) {
    return response(200, { success: true, synced: 0, batches: [] });
  }

  const existing = await queryServicePromoItems(serviceId);
  const existingBatchIds = new Set(
    existing
      .filter((item) => String(item.sk || "").startsWith("BATCH#"))
      .map((item) => item.batchId),
  );

  const created = [];
  const existingCodes = new Set(
    existing
      .filter((item) => String(item.sk || "").startsWith("CODE#"))
      .map((item) => item.code),
  );

  for (const batch of batches) {
    if (batch.id && existingBatchIds.has(batch.id)) continue;
    const quantity = Number(batch.quantity || batch.codes?.length || 0);
    if (!quantity) continue;
    const codes =
      Array.isArray(batch.codes) && batch.codes.length
        ? batch.codes.map(normalizeCode)
        : generateUniquePromoCodes(quantity, existingCodes);
    codes.forEach((code) => existingCodes.add(code));
    const saved = await putBatchWithCodes(serviceId, { ...batch, codes }, userId);
    created.push(saved);
    existingBatchIds.add(saved.id);
  }

  return response(200, { success: true, synced: created.length, batches: created });
}

async function sharePromoCode(serviceId, body, userId) {
  await assertServiceOwnerAccess(serviceId, userId);
  const promoCode = normalizeCode(body.promo_code || body.promoCode);
  if (!promoCode) return response(400, { error: "promo_code is required" });

  const items = await queryServicePromoItems(serviceId);
  const codeItem = items.find((item) => item.code === promoCode);
  if (!codeItem) return response(404, { error: "Promo code not found" });
  if (String(codeItem.status).toUpperCase() === "CANCELLED") {
    return response(409, { error: "Promo code is cancelled" });
  }
  if (String(codeItem.status).toUpperCase() === "REDEEMED") {
    return response(409, { error: "Promo code already redeemed" });
  }

  const shareId = uuidv4();
  const now = new Date().toISOString();
  const record = {
    serviceId,
    sk: `SHARE#${shareId}`,
    entityType: "SHARE",
    shareId,
    promo_code: promoCode,
    batchId: codeItem.batchId,
    recipient_id: body.recipient_id || body.recipientId || "",
    recipient_name: body.recipient_name || body.recipientName || "",
    recipient_username: body.recipient_username || body.recipientUsername || "",
    recipient_email: body.recipient_email || body.recipientEmail || null,
    channels: Array.isArray(body.channels) ? body.channels : [],
    message: body.message || null,
    organizer_name: body.organizer_name || body.organizerName || null,
    created_at: now,
    sharedBy: userId,
  };

  await dynamodb.put({ TableName: TABLE, Item: record }).promise();
  await dynamodb
    .update({
      TableName: TABLE,
      Key: { serviceId, sk: `CODE#${promoCode}` },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "SHARED",
        ":updatedAt": now,
      },
    })
    .promise();

  return response(201, {
    success: true,
    share: {
      id: shareId,
      promo_code: promoCode,
      recipient_id: record.recipient_id,
      recipient_name: record.recipient_name,
      recipient_username: record.recipient_username,
      recipient_email: record.recipient_email,
      channels: record.channels,
      message: record.message,
      organizer_name: record.organizer_name,
      created_at: now,
    },
  });
}

async function cancelPromoCode(serviceId, body, userId) {
  await assertServiceOwnerAccess(serviceId, userId);
  const promoCode = normalizeCode(body.promo_code || body.promoCode);
  const reason = String(body.reason || "").trim() || null;
  if (!promoCode) return response(400, { error: "promo_code is required" });

  const items = await queryServicePromoItems(serviceId);
  const codeItem = items.find((item) => item.code === promoCode);
  if (!codeItem) return response(404, { error: "Promo code not found" });
  if (String(codeItem.status).toUpperCase() === "REDEEMED") {
    return response(409, { error: "Promo code already redeemed" });
  }

  const now = new Date().toISOString();
  await dynamodb
    .update({
      TableName: TABLE,
      Key: { serviceId, sk: `CODE#${promoCode}` },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt, cancelReason = :reason, canceledBy = :userId",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "CANCELLED",
        ":updatedAt": now,
        ":reason": reason,
        ":userId": userId,
      },
    })
    .promise();

  await dynamodb
    .put({
      TableName: TABLE,
      Item: {
        serviceId,
        sk: `CANCEL#${promoCode}`,
        entityType: "CANCEL",
        cancelId: uuidv4(),
        promo_code: promoCode,
        batchId: codeItem.batchId,
        reason,
        created_at: now,
        canceled_by: userId,
      },
    })
    .promise();

  return response(200, {
    success: true,
    cancellation: {
      promo_code: promoCode,
      reason,
      created_at: now,
    },
  });
}

async function validatePromoCode(serviceId, body) {
  const promoCode = normalizeCode(body.promo_code || body.promoCode || body.code);
  if (!promoCode) return response(400, { ok: false, reason: "invalid_code" });

  const items = await queryServicePromoItems(serviceId);
  const codeItem = items.find((item) => item.code === promoCode);
  if (!codeItem) return response(200, { ok: false, reason: "not_found" });

  const status = String(codeItem.status || "AVAILABLE").toUpperCase();
  if (status === "CANCELLED") return response(200, { ok: false, reason: "cancelled" });
  if (status === "REDEEMED") return response(200, { ok: false, reason: "already_used" });

  return response(200, {
    ok: true,
    value: Number(codeItem.value || 0),
    currency: codeItem.currency || "COP",
    batchId: codeItem.batchId,
    description: codeItem.description || "",
  });
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === "OPTIONS") {
    return response(200, { ok: true });
  }

  try {
    const serviceId = event.pathParameters?.serviceId;
    if (!serviceId) return response(400, { error: "serviceId is required" });

    const rawPath = event.rawPath || event.path || "";
    const userId = parseAuthUserId(event);
    const body =
      typeof event.body === "string" && event.body
        ? JSON.parse(event.body)
        : event.body || {};

    if (method === "GET") {
      return getPromoCodes(serviceId, userId);
    }

    if (method !== "POST") {
      return response(405, { error: "Method not allowed" });
    }

    if (rawPath.endsWith("/batches")) {
      return createBatch(serviceId, body, userId);
    }
    if (rawPath.endsWith("/sync")) {
      return syncPromoCodes(serviceId, body, userId);
    }
    if (rawPath.endsWith("/share")) {
      return sharePromoCode(serviceId, body, userId);
    }
    if (rawPath.endsWith("/cancel")) {
      return cancelPromoCode(serviceId, body, userId);
    }
    if (rawPath.endsWith("/validate")) {
      return validatePromoCode(serviceId, body);
    }

    return response(404, { error: "Unknown promo codes action" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return response(statusCode, {
      error: error.message || "Internal server error",
    });
  }
};
