const {
  response,
  queryEventPromoItems,
  assertOrganizerAccess,
  assertOwnerOrPlatformAdmin,
  parseAuthUserId,
  buildPromoPayload,
  putBatchWithCodes,
  updateBatchEditableCodes,
  normalizeCode,
  generateUniquePromoCodes,
  dynamodb,
  TABLE,
  uuidv4,
  hydrateRedemptionUsers,
  getClientById,
  mapClientToRedeemedUser,
  buildInitials,
} = require("./promoCodesShared");
const {
  notifyPromoCodeShared,
  notifyPromoCodeCanceled,
} = require("./promoCodeNotifications");

async function getPromoCodes(eventId, userId) {
  await assertOwnerOrPlatformAdmin(eventId, userId);
  const items = await queryEventPromoItems(eventId);
  const payload = buildPromoPayload(items);
  await hydrateRedemptionUsers(payload.redemptions || {});
  return response(200, {
    success: true,
    eventId,
    ...payload,
  });
}

async function createBatch(eventId, body, userId) {
  await assertOrganizerAccess(eventId, userId);
  const existing = await queryEventPromoItems(eventId);
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
    eventId,
    {
      id: `${eventId}-${Date.now()}`,
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

async function updateBatch(eventId, batchId, body, userId) {
  await assertOrganizerAccess(eventId, userId);
  const existing = await queryEventPromoItems(eventId);
  const updated = await updateBatchEditableCodes(
    eventId,
    { ...body, id: batchId || body.id },
    existing,
  );
  return response(200, { success: true, batch: updated });
}

async function syncPromoCodes(eventId, body, userId) {
  await assertOrganizerAccess(eventId, userId);
  const batches = Array.isArray(body.batches) ? body.batches : [];
  if (!batches.length) {
    return response(200, { success: true, synced: 0, created: 0, updated: 0, batches: [] });
  }

  const existing = await queryEventPromoItems(eventId);
  const existingBatchIds = new Set(
    existing
      .filter((item) => String(item.sk || "").startsWith("BATCH#"))
      .map((item) => item.batchId),
  );

  const created = [];
  const updated = [];
  const existingCodes = new Set(
    existing
      .filter((item) => String(item.sk || "").startsWith("CODE#"))
      .map((item) => item.code),
  );

  for (const batch of batches) {
    if (batch.id && existingBatchIds.has(batch.id)) {
      try {
        const saved = await updateBatchEditableCodes(eventId, batch, existing);
        updated.push(saved);
      } catch (err) {
        // Lote sin códigos editables: se omite sin fallar el sync completo
        if (err.statusCode === 409) continue;
        throw err;
      }
      continue;
    }
    const quantity = Number(batch.quantity || batch.codes?.length || 0);
    if (!quantity) continue;
    const codes =
      Array.isArray(batch.codes) && batch.codes.length
        ? batch.codes.map(normalizeCode)
        : generateUniquePromoCodes(quantity, existingCodes);
    codes.forEach((code) => existingCodes.add(code));
    const saved = await putBatchWithCodes(eventId, { ...batch, codes }, userId);
    created.push(saved);
    existingBatchIds.add(saved.id);
  }

  return response(200, {
    success: true,
    synced: created.length + updated.length,
    created: created.length,
    updated: updated.length,
    batches: [...created, ...updated],
  });
}

async function sharePromoCode(eventId, body, userId) {
  await assertOrganizerAccess(eventId, userId);
  const promoCode = normalizeCode(body.promo_code || body.promoCode);
  if (!promoCode) return response(400, { error: "promo_code is required" });

  const items = await queryEventPromoItems(eventId);
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
    eventId,
    sk: `SHARE#${shareId}`,
    entityType: "SHARE",
    shareId,
    promo_code: promoCode,
    batchId: codeItem.batchId,
    recipient_id: body.recipient_id || body.recipientId || "",
    recipient_name: body.recipient_name || body.recipientName || "",
    recipient_username: body.recipient_username || body.recipientUsername || "",
    recipient_email: body.recipient_email || body.recipientEmail || null,
    recipient_phone: body.recipient_phone || body.recipientPhone || null,
    channels: Array.isArray(body.channels) ? body.channels : [],
    message: body.message || null,
    organizer_name: body.organizer_name || body.organizerName || null,
    created_at: now,
    sharedBy: userId,
  };

  const shareResponse = {
    id: shareId,
    promo_code: promoCode,
    recipient_id: record.recipient_id,
    recipient_name: record.recipient_name,
    recipient_username: record.recipient_username,
    recipient_email: record.recipient_email,
    recipient_phone: record.recipient_phone,
    channels: record.channels,
    message: record.message,
    organizer_name: record.organizer_name,
    created_at: now,
  };

  // Validar y encolar antes de cambiar el estado. Así un fallo de contacto/canal
  // no deja el código falsamente marcado como compartido.
  await notifyPromoCodeShared({
    eventId,
    shareRecord: shareResponse,
    promoCode,
    batch: {
      currency: codeItem.currency,
      value: codeItem.value,
      description: codeItem.description,
    },
    organizerName: record.organizer_name,
  });

  await dynamodb.put({ TableName: TABLE, Item: record }).promise();
  await dynamodb
    .update({
      TableName: TABLE,
      Key: { eventId, sk: `CODE#${promoCode}` },
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
    share: shareResponse,
  });
}

async function cancelPromoCode(eventId, body, userId) {
  await assertOrganizerAccess(eventId, userId);
  const promoCode = normalizeCode(body.promo_code || body.promoCode);
  const reason = String(body.reason || "").trim() || null;
  if (!promoCode) return response(400, { error: "promo_code is required" });

  const items = await queryEventPromoItems(eventId);
  const codeItem = items.find((item) => item.code === promoCode);
  if (!codeItem) return response(404, { error: "Promo code not found" });
  if (String(codeItem.status).toUpperCase() === "REDEEMED") {
    return response(409, { error: "Promo code already redeemed" });
  }

  const now = new Date().toISOString();
  await dynamodb
    .update({
      TableName: TABLE,
      Key: { eventId, sk: `CODE#${promoCode}` },
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
        eventId,
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

  const priorShares = items
    .filter((item) => String(item.sk || "").startsWith("SHARE#"))
    .filter((item) => item.promo_code === promoCode)
    .map((item) => ({
      recipient_id: item.recipient_id,
      recipient_name: item.recipient_name,
      recipient_username: item.recipient_username,
    }));

  await notifyPromoCodeCanceled({
    eventId,
    promoCode,
    batch: {
      currency: codeItem.currency,
      value: codeItem.value,
      description: codeItem.description,
    },
    reason,
    shareRecords: priorShares,
  });

  return response(200, {
    success: true,
    cancellation: {
      promo_code: promoCode,
      reason,
      created_at: now,
    },
  });
}

async function redeemPromoCode(eventId, body, userId) {
  const promoCode = normalizeCode(body.promo_code || body.promoCode || body.code);
  if (!promoCode) return response(400, { ok: false, reason: "invalid_code" });
  if (!userId) return response(401, { ok: false, reason: "unauthorized" });

  const items = await queryEventPromoItems(eventId);
  const codeItem = items.find((item) => item.code === promoCode);
  if (!codeItem) return response(200, { ok: false, reason: "not_found" });

  const status = String(codeItem.status || "AVAILABLE").toUpperCase();
  if (status === "CANCELLED") return response(200, { ok: false, reason: "cancelled" });
  if (status === "REDEEMED") return response(200, { ok: false, reason: "already_used" });

  const now = new Date().toISOString();
  const orderId = body.orderId || body.order_id || "";
  const discount = Number(body.discount ?? codeItem.value ?? 0);

  const client = await getClientById(userId);
  const redeemedUser = mapClientToRedeemedUser(userId, client, {
    name: body.redeemedByName || body.userName || "",
    avatar: body.redeemedByAvatar || body.avatar || undefined,
  });

  await dynamodb
    .update({
      TableName: TABLE,
      Key: { eventId, sk: `CODE#${promoCode}` },
      UpdateExpression:
        "SET #status = :status, updatedAt = :updatedAt, redeemedAt = :redeemedAt, redeemedByUserId = :userId, redeemedByName = :redeemedByName, redeemedByInitials = :redeemedByInitials, redeemedByUsername = :redeemedByUsername, redeemedByAvatar = :redeemedByAvatar, orderId = :orderId, discount = :discount, ticketQty = :ticketQty, subtotal = :subtotal, serviceFee = :serviceFee, #total = :total",
      ExpressionAttributeNames: {
        "#status": "status",
        "#total": "total",
      },
      ExpressionAttributeValues: {
        ":status": "REDEEMED",
        ":updatedAt": now,
        ":redeemedAt": now,
        ":userId": userId,
        ":redeemedByName": redeemedUser.name || "Usuario",
        ":redeemedByInitials": redeemedUser.initials || buildInitials(redeemedUser.name) || "U",
        ":redeemedByUsername": redeemedUser.username || "",
        ":redeemedByAvatar": redeemedUser.avatar || null,
        ":orderId": orderId,
        ":discount": discount,
        ":ticketQty": Number(body.ticketQty || 0),
        ":subtotal": Number(body.subtotal || 0),
        ":serviceFee": Number(body.serviceFee || 0),
        ":total": Number(body.total || 0),
      },
    })
    .promise();

  return response(200, {
    ok: true,
    promo_code: promoCode,
    orderId,
    redeemedAt: now,
    user: redeemedUser,
  });
}

async function validatePromoCode(eventId, body) {
  const promoCode = normalizeCode(body.promo_code || body.promoCode || body.code);
  if (!promoCode) return response(400, { ok: false, reason: "invalid_code" });

  const items = await queryEventPromoItems(eventId);
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
    const eventId = event.pathParameters?.eventId;
    if (!eventId) return response(400, { error: "eventId is required" });

    const rawPath = event.rawPath || event.path || "";
    const userId = parseAuthUserId(event);
    const body =
      typeof event.body === "string" && event.body
        ? JSON.parse(event.body)
        : event.body || {};

    if (method === "GET") {
      return getPromoCodes(eventId, userId);
    }

    const batchIdParam = event.pathParameters?.batchId;
    if ((method === "PUT" || method === "PATCH") && batchIdParam) {
      return updateBatch(eventId, batchIdParam, body, userId);
    }

    if (method !== "POST") {
      return response(405, { error: "Method not allowed" });
    }

    if (rawPath.endsWith("/batches") || /\/batches\/?$/.test(rawPath)) {
      return createBatch(eventId, body, userId);
    }
    if (rawPath.endsWith("/sync")) {
      return syncPromoCodes(eventId, body, userId);
    }
    if (rawPath.endsWith("/share")) {
      return sharePromoCode(eventId, body, userId);
    }
    if (rawPath.endsWith("/cancel")) {
      return cancelPromoCode(eventId, body, userId);
    }
    if (rawPath.endsWith("/validate")) {
      return validatePromoCode(eventId, body);
    }
    if (rawPath.endsWith("/redeem")) {
      return redeemPromoCode(eventId, body, userId);
    }

    return response(404, { error: "Unknown promo codes action" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return response(statusCode, {
      error: error.message || "Internal server error",
    });
  }
};
