const AWS = require("aws-sdk");
const { getClientByUserId, getOrderPaymentTimingBucket } = require("./statsShared");
const { normalizeRefundCategory } = require("./lib/refundPolicyValidation");

AWS.config.update({
  region: process.env.AWS_REGION || process.env.DYNAMODB_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

const TICKETS_CANCELATION_TABLE =
  process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders";
const VENUES_TABLE = process.env.VENUES_TABLE || "Venues-dev";
const SERVICES_TABLE = process.env.SERVICES_TABLE || "ServiceProviders-dev";
const VENUE_BOOKINGS_TABLE = process.env.VENUE_BOOKINGS_TABLE || "VenueBookings-dev";
const SERVICE_BOOKINGS_TABLE = process.env.SERVICE_BOOKINGS_TABLE || "ServiceBookings-dev";

const MAX_REFUND_AMOUNT_COP = 500_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const response = (code, body) => ({
  statusCode: code,
  headers: HEADERS,
  body: JSON.stringify(body, null, 2),
});

const safeAdd = (a, b) => (Number(a) || 0) + (Number(b) || 0);

/**
 * Parsea montos COP evitando concatenación de strings y valores corruptos.
 */
function parseCopAmount(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded < 0 || rounded > MAX_REFUND_AMOUNT_COP) return 0;
    return rounded;
  }

  const raw = String(value).trim();
  if (!raw || UUID_RE.test(raw)) return 0;

  // Formato colombiano: 2.590.000
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    const parsed = Number(raw.replace(/\./g, ""));
    return Number.isFinite(parsed) && parsed <= MAX_REFUND_AMOUNT_COP ? parsed : 0;
  }

  const normalized = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_REFUND_AMOUNT_COP) return 0;
  return Math.round(parsed);
}

function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

function looksLikeMissingName(name, id) {
  const label = String(name || "").trim();
  if (!label) return true;
  if (label === String(id || "").trim()) return true;
  return isUuid(label);
}

function classifyRefundSource(record) {
  if (record.refund_type) return "USER_REQUEST";
  if (record.reason && /reprogramaci/i.test(record.reason)) return "EVENT_RESCHEDULED";
  return "EVENT_CANCELLED";
}

function mapRefundStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "COMPLETED") return "completed";
  if (normalized === "REJECTED") return "rejected";
  return "pending";
}

function policyMetaFromCategory(categoriaReembolso) {
  const cat = normalizeRefundCategory(categoriaReembolso);
  if (cat === "1") {
    return { policyType: "days_1", policyLimitDays: 1, policyLabel: "Hasta 1 día antes del inicio del evento" };
  }
  if (cat === "7") {
    return { policyType: "days_7", policyLimitDays: 7, policyLabel: "Hasta 7 días antes del inicio del evento" };
  }
  if (cat === "30") {
    return { policyType: "days_30", policyLimitDays: 30, policyLabel: "Hasta 30 días antes del inicio del evento" };
  }
  if (cat === "0") {
    return { policyType: "case_by_case", policyLimitDays: 0, policyLabel: "Se evalúa caso a caso por el organizador" };
  }
  if (cat === "N") {
    return { policyType: "no_refund", policyLimitDays: 0, policyLabel: "Sin reembolsos" };
  }
  return { policyType: "days_7", policyLimitDays: 7, policyLabel: "Según política del evento" };
}

function parseYyyymmddToDate(raw) {
  const s = String(raw || "").replace(/\D/g, "");
  if (s.length !== 8) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const date = new Date(y, m, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDaysBetween(fromIso, toDate) {
  if (!fromIso || !toDate) return 0;
  const from = new Date(String(fromIso).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(from.getTime())) return 0;
  const target = new Date(toDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - from.getTime()) / 86400000);
}

function extractBuyerFromPayment(refund) {
  const tx = refund?.payment_refund?.raw?.transaction || refund?.payment_refund?.transaction || {};
  const customer = tx.customer_data || {};
  const phone = customer.phone_number || customer.phone || null;
  return {
    buyerName: customer.full_name || customer.fullName || null,
    buyerEmail: tx.customer_email || customer.email || null,
    buyerPhone: phone && String(phone).toLowerCase() !== "n/a" ? String(phone) : null,
  };
}

function normalizeTicketInstances(rawInstances, order, refundAmount) {
  const orderTickets = Array.isArray(order?.tickets) ? order.tickets : [];
  const metaTickets = Array.isArray(order?.metadata?.tickets) ? order.metadata.tickets : [];
  const byId = new Map();

  for (const t of orderTickets) {
    const id = String(t.ticket_id || t.ticketId || t.id || "").trim();
    if (id) byId.set(id, t);
  }
  for (const t of metaTickets) {
    const id = String(t.ticket_id || t.ticketId || t.id || "").trim();
    if (id && !byId.has(id)) byId.set(id, t);
  }

  const source = Array.isArray(rawInstances) && rawInstances.length
    ? rawInstances
    : orderTickets.length
      ? orderTickets
      : metaTickets;

  return source.map((entry, idx) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry) && (entry.category || entry.categoria || entry.seat || entry.row)) {
      const seat = entry.seat && typeof entry.seat === "object" ? entry.seat : {};
      return {
        ticketId: String(entry.ticket_id || entry.ticketId || entry.id || ""),
        category: String(entry.category || entry.categoria || "General"),
        row: String(seat.rowLabel || entry.row || entry.rowLabel || "—"),
        seat: Number(seat.colNumber || entry.seatNumber || entry.seat || idx + 1) || idx + 1,
        amount: parseCopAmount(entry.total_amount || entry.price || entry.purchasePrice || entry.amount || refundAmount),
      };
    }

    const ticketId = String(
      typeof entry === "string" || typeof entry === "number"
        ? entry
        : entry?.ticket_id || entry?.ticketId || entry?.id || "",
    ).trim();
    const matched = ticketId ? byId.get(ticketId) : null;
    if (matched) {
      const seat = matched.seat && typeof matched.seat === "object" ? matched.seat : {};
      return {
        ticketId,
        category: String(matched.category || matched.categoria || "General"),
        row: String(seat.rowLabel || matched.rowLabel || matched.row || "—"),
        seat: Number(seat.colNumber || matched.colNumber || matched.seatNumber || idx + 1) || idx + 1,
        amount: parseCopAmount(matched.total_amount || matched.price || matched.purchasePrice || refundAmount),
      };
    }

    return {
      ticketId,
      category: "General",
      row: "—",
      seat: idx + 1,
      amount: parseCopAmount(refundAmount),
    };
  });
}

function resolvePayerMeta({ policyType, withinPolicy, paymentTiming }) {
  if (policyType === "case_by_case" || policyType === "no_refund") {
    return { payer: "organizer", requiresOrganizerReview: true };
  }
  if (withinPolicy && paymentTiming === "post_event") {
    return { payer: "platform", requiresOrganizerReview: false };
  }
  return { payer: "organizer", requiresOrganizerReview: false };
}

function emptyGroup(reservationType, reservationId) {
  return {
    reservationType,
    reservationId,
    eventId: reservationType === "event" ? reservationId : undefined,
    eventName: null,
    eventStatus: null,
    eventStartDate: null,
    eventEndDate: null,
    organizerId: null,
    eventExists: false,
    categoriaReembolso: null,
    policyType: null,
    policyLabel: null,
    policyLimitDays: null,
    pendingCount: 0,
    completedCount: 0,
    rejectedCount: 0,
    pendingAmount: 0,
    completedAmount: 0,
    totalRefundAmount: 0,
    refunds: [],
  };
}

const queryRefundsByEvent = async (eventId) => {
  const items = [];
  let lastEvaluatedKey;
  try {
    do {
      const params = {
        TableName: TICKETS_CANCELATION_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      };
      const result = await dynamodb.query(params).promise();
      items.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return items;
  } catch (err) {
    console.warn("[getEventRefundsStatistics] eventIdIndex query failed, falling back to scan:", err.message);
    const all = await scanAllRefunds();
    return all.filter((r) => r.eventId === eventId);
  }
};

const scanAllRefunds = async () => {
  const items = [];
  let lastEvaluatedKey;
  do {
    const params = {
      TableName: TICKETS_CANCELATION_TABLE,
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
    };
    const result = await dynamodb.scan(params).promise();
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return items;
};

async function fetchEventInfo(eventId) {
  try {
    const result = await dynamodb
      .get({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        ProjectionExpression: "id, nombre, #s, fechaIni, fechaFin, userId, user_id, deletedAt, categoriaReembolso",
        ExpressionAttributeNames: { "#s": "estatus" },
      })
      .promise();
    const item = result.Item;
    if (!item || item.deletedAt) return null;
    return item;
  } catch (_err) {
    return null;
  }
}

async function fetchVenueInfo(venueId) {
  try {
    const result = await dynamodb
      .get({
        TableName: VENUES_TABLE,
        Key: { venue_id: venueId },
        ProjectionExpression: "venue_id, #n, #s, city, ownerUserId, deletedAt",
        ExpressionAttributeNames: { "#n": "name", "#s": "status" },
      })
      .promise();
    const item = result.Item;
    if (!item || item.deletedAt) return null;
    return item;
  } catch (_err) {
    return null;
  }
}

async function fetchServiceInfo(serviceId) {
  try {
    const result = await dynamodb
      .get({
        TableName: SERVICES_TABLE,
        Key: { serviceId },
        ProjectionExpression: "serviceId, #n, #s, city, deletedAt",
        ExpressionAttributeNames: { "#n": "name", "#s": "status" },
      })
      .promise();
    const item = result.Item;
    if (!item || item.deletedAt) return null;
    return item;
  } catch (_err) {
    return null;
  }
}

function createOrderCache() {
  const cache = new Map();
  return async (orderId) => {
    const key = String(orderId || "").trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);

    try {
      const result = await dynamodb
        .get({ TableName: ORDERS_TABLE, Key: { order_id: key } })
        .promise();
      const order = result.Item || null;
      cache.set(key, order);
      return order;
    } catch (_err) {
      cache.set(key, null);
      return null;
    }
  };
}

function resolveReservationFromOrder(order, fallbackEventId) {
  if (!order) {
    return {
      reservationType: "event",
      reservationId: fallbackEventId,
      amount: 0,
    };
  }

  const metadata = order.metadata || {};
  const orderType = String(order.order_type || metadata.orderType || "").toUpperCase();
  const amount = parseCopAmount(
    order.total_amount || order.totalAmount || order.final_total || order.amount,
  );

  if (orderType === "VENUE_RENTAL") {
    return {
      reservationType: "venue",
      reservationId: metadata.venueId || order.venue_id || order.venueId || fallbackEventId,
      amount,
      startDate: metadata.startDate || metadata.checkIn || null,
      endDate: metadata.endDate || metadata.checkOut || null,
    };
  }

  if (orderType === "SERVICE_RENTAL") {
    return {
      reservationType: "service",
      reservationId: metadata.serviceId || order.service_id || order.serviceId || fallbackEventId,
      amount,
      startDate: metadata.serviceDate || metadata.startDate || null,
      endDate: metadata.endDate || null,
    };
  }

  return {
    reservationType: "event",
    reservationId: order.event_id || order.eventId || fallbackEventId,
    amount,
    startDate: metadata.eventDate || null,
    endDate: null,
  };
}

function groupKey(reservationType, reservationId) {
  return `${reservationType}:${reservationId}`;
}

async function appendRefundToGroup(groups, refund, getOrder) {
  const order = refund.orderId ? await getOrder(refund.orderId) : null;
  const reservation = resolveReservationFromOrder(order, refund.eventId);
  const reservationId = reservation.reservationId;
  if (!reservationId) return;

  const key = groupKey(reservation.reservationType, reservationId);
  if (!groups[key]) {
    groups[key] = emptyGroup(reservation.reservationType, reservationId);
  }

  const group = groups[key];
  const refundStatus = String(refund.refundStatus || "").toUpperCase();

  let refundAmount = parseCopAmount(refund.refund_amount);
  if (!refundAmount && refund.original_total) {
    refundAmount = parseCopAmount(refund.original_total);
  }
  if (!refundAmount && reservation.amount) {
    refundAmount = reservation.amount;
  }

  if (refundStatus === "PENDING") {
    group.pendingCount += 1;
    group.pendingAmount = safeAdd(group.pendingAmount, refundAmount);
  } else if (refundStatus === "COMPLETED") {
    group.completedCount += 1;
    group.completedAmount = safeAdd(group.completedAmount, refundAmount);
  } else if (refundStatus === "REJECTED") {
    group.rejectedCount += 1;
  }

  group.totalRefundAmount = safeAdd(group.totalRefundAmount, refundAmount);

  if (!group.eventName && refund.eventName && !looksLikeMissingName(refund.eventName, reservationId)) {
    group.eventName = refund.eventName;
  }
  if (!group.eventStartDate && (refund.eventStartDate || reservation.startDate)) {
    group.eventStartDate = refund.eventStartDate || reservation.startDate;
  }
  if (!group.eventEndDate && (refund.eventEndDate || reservation.endDate)) {
    group.eventEndDate = refund.eventEndDate || reservation.endDate;
  }

  let buyerName = null;
  let buyerEmail = null;
  let buyerPhone = null;
  let buyerAvatar = null;
  if (refund.userId) {
    try {
      const client = await getClientByUserId(refund.userId);
      if (client) {
        buyerName = [client.name, client.lastName].filter(Boolean).join(" ").trim() || client.name || null;
        buyerEmail = client.email || null;
        const phone = client.phone || client.indicativo || null;
        buyerPhone = phone && String(phone).toLowerCase() !== "n/a" ? String(phone) : null;
        buyerAvatar = client.fotoPerfilUrl || client.profileImageUrl || client.avatar || null;
      }
    } catch (_e) {
      // ignore enrichment errors
    }
  }

  const paymentBuyer = extractBuyerFromPayment(refund);
  buyerName = buyerName || paymentBuyer.buyerName;
  buyerEmail = buyerEmail || paymentBuyer.buyerEmail;
  buyerPhone = buyerPhone || paymentBuyer.buyerPhone;

  const ticketInstances = normalizeTicketInstances(
    refund.ticket_instances,
    order,
    refundAmount,
  );
  const paymentTiming =
    getOrderPaymentTimingBucket(order || {}) === "POST_EVENT" ? "post_event" : "pre_event";

  group.refunds.push({
    id: refund.id,
    orderId: refund.orderId,
    userId: refund.userId,
    buyerName,
    buyerEmail,
    buyerPhone,
    buyerAvatar,
    refundStatus: refund.refundStatus,
    refundSource: classifyRefundSource(refund),
    refundType: refund.refund_type || null,
    refundAmount,
    originalTotal: parseCopAmount(refund.original_total),
    ticketCount: ticketInstances.length || refund.quantity || null,
    ticketInstances,
    reason: refund.reason || null,
    comment: refund.comment || null,
    paymentMethod: refund.payment_method || null,
    createdAt: refund.createdAt || null,
    executionDate: refund.executionDate || null,
    reservationType: reservation.reservationType,
    paymentTiming,
    // Se completan en enrichGroups con la política real del evento
    daysBeforeEvent: 0,
    withinPolicy: true,
    policyType: "days_7",
    policyLimitDays: 7,
    payer: paymentTiming === "post_event" ? "platform" : "organizer",
    requiresOrganizerReview: false,
  });
}

async function enrichGroups(groups) {
  await Promise.all(
    Object.values(groups).map(async (group) => {
      if (group.reservationType === "event") {
        const info = await fetchEventInfo(group.reservationId);
        if (info) {
          group.eventExists = true;
          group.eventName = group.eventName || info.nombre || null;
          group.eventStatus = info.estatus || null;
          group.eventStartDate = group.eventStartDate || info.fechaIni || null;
          group.eventEndDate = group.eventEndDate || info.fechaFin || null;
          group.organizerId = info.userId || info.user_id || null;
          group.categoriaReembolso = info.categoriaReembolso || null;
          const policy = policyMetaFromCategory(info.categoriaReembolso);
          group.policyType = policy.policyType;
          group.policyLabel = policy.policyLabel;
          group.policyLimitDays = policy.policyLimitDays;
        }
      } else if (group.reservationType === "venue") {
        const info = await fetchVenueInfo(group.reservationId);
        if (info) {
          group.eventExists = true;
          group.eventName = info.name || `Lugar ${group.reservationId.slice(0, 8)}`;
          group.eventStatus = info.status || "activo";
          group.organizerId = info.ownerUserId || null;
        } else {
          group.eventName = group.eventName || `Lugar ${group.reservationId.slice(0, 8)}`;
        }
      } else if (group.reservationType === "service") {
        const info = await fetchServiceInfo(group.reservationId);
        if (info) {
          group.eventExists = true;
          group.eventName = info.name || `Servicio ${group.reservationId.slice(0, 8)}`;
          group.eventStatus = info.status || "activo";
          group.organizerId = info.userId || null;
        } else {
          group.eventName = group.eventName || `Servicio ${group.reservationId.slice(0, 8)}`;
        }
      }

      if (!group.policyType) {
        const policy = policyMetaFromCategory(group.categoriaReembolso);
        group.policyType = policy.policyType;
        group.policyLabel = policy.policyLabel;
        group.policyLimitDays = policy.policyLimitDays;
      }

      const eventDate = parseYyyymmddToDate(group.eventStartDate);
      for (const refund of group.refunds || []) {
        const daysBeforeEvent = calendarDaysBetween(refund.createdAt, eventDate);
        refund.daysBeforeEvent = daysBeforeEvent;
        refund.policyType = group.policyType;
        refund.policyLimitDays = group.policyLimitDays;
        refund.policyLabel = group.policyLabel;

        let withinPolicy = true;
        if (group.policyType === "no_refund") withinPolicy = false;
        else if (group.policyType === "case_by_case") withinPolicy = true;
        else if (group.policyLimitDays != null) {
          withinPolicy = daysBeforeEvent >= Number(group.policyLimitDays || 0);
        }
        // Rechazados siempre se tratan como fuera de política para las métricas UI
        if (String(refund.refundStatus || "").toUpperCase() === "REJECTED") {
          withinPolicy = false;
        }
        refund.withinPolicy = withinPolicy;

        const payerMeta = resolvePayerMeta({
          policyType: group.policyType,
          withinPolicy,
          paymentTiming: refund.paymentTiming || "pre_event",
        });
        refund.payer = payerMeta.payer;
        refund.requiresOrganizerReview = payerMeta.requiresOrganizerReview;
      }
    }),
  );
}

function isValidReservationGroup(group) {
  if (!group?.reservationId) return false;
  if (group.pendingCount + group.completedCount + group.rejectedCount <= 0) return false;

  if (group.reservationType === "event") {
    if (group.eventExists) return true;
    if (group.eventName && !looksLikeMissingName(group.eventName, group.reservationId)) return true;
    return false;
  }

  return true;
}

async function appendVenueServiceCancelledOrders(groups, getOrder, seenOrderIds) {
  let lastEvaluatedKey;
  do {
    const result = await dynamodb
      .scan({
        TableName: ORDERS_TABLE,
        FilterExpression:
          "(order_type = :venue OR order_type = :service OR metadata.orderType = :venueMeta OR metadata.orderType = :serviceMeta) AND (payment_status = :cancelled OR #st = :cancelledLower OR is_refunded = :trueVal OR partial_refund_status = :pendingPartial)",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":venue": "VENUE_RENTAL",
          ":service": "SERVICE_RENTAL",
          ":venueMeta": "VENUE_RENTAL",
          ":serviceMeta": "SERVICE_RENTAL",
          ":cancelled": "CANCELLED",
          ":cancelledLower": "cancelled",
          ":trueVal": true,
          ":pendingPartial": "PENDING",
        },
        ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
      })
      .promise();

    for (const order of result.Items || []) {
      const orderId = order.order_id || order.id;
      if (!orderId || seenOrderIds.has(orderId)) continue;
      seenOrderIds.add(orderId);

      const reservation = resolveReservationFromOrder(order, order.event_id || order.eventId);
      if (reservation.reservationType === "event") continue;

      const key = groupKey(reservation.reservationType, reservation.reservationId);
      if (!groups[key]) {
        groups[key] = emptyGroup(reservation.reservationType, reservation.reservationId);
      }

      const group = groups[key];
      const amount = reservation.amount;
      const refundStatus = String(order.refund_status || order.partial_refund_status || "").toUpperCase();

      if (refundStatus === "COMPLETED" || order.is_refunded === true) {
        group.completedCount += 1;
        group.completedAmount = safeAdd(group.completedAmount, amount);
      } else if (refundStatus === "REJECTED") {
        group.rejectedCount += 1;
      } else {
        group.pendingCount += 1;
        group.pendingAmount = safeAdd(group.pendingAmount, amount);
      }

      group.totalRefundAmount = safeAdd(group.totalRefundAmount, amount);
      group.refunds.push({
        id: `order-${orderId}`,
        orderId,
        userId: order.user_id || order.userId || null,
        refundStatus: refundStatus || "PENDING",
        refundSource: "ORDER_CANCELLED",
        refundAmount: amount,
        originalTotal: amount,
        createdAt: order.cancelled_at || order.updated_at || order.created_at || null,
        reservationType: reservation.reservationType,
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
}

/**
 * GET /events/refunds/statistics
 */
exports.handler = async (event) => {
  try {
    const query = event.queryStringParameters || {};
    const eventIdFilter = query.eventId ? String(query.eventId).trim() : null;
    const reservationTypeFilter = query.reservationType
      ? String(query.reservationType).toLowerCase()
      : null;

    const statusFilter =
      query.refundStatus && query.refundStatus.toUpperCase() !== "ALL"
        ? query.refundStatus.toUpperCase()
        : null;

    const sourceFilter =
      query.source && query.source.toUpperCase() !== "ALL"
        ? query.source.toUpperCase()
        : null;

    const limit = Math.min(500, Math.max(1, Number(query.limit) || 100));
    const getOrder = createOrderCache();

    const allRefunds = eventIdFilter
      ? await queryRefundsByEvent(eventIdFilter)
      : await scanAllRefunds();

    const filtered = allRefunds.filter((r) => {
      if (statusFilter && String(r.refundStatus || "").toUpperCase() !== statusFilter) {
        return false;
      }
      if (sourceFilter && classifyRefundSource(r) !== sourceFilter) {
        return false;
      }
      return true;
    });

    const groups = {};
    const seenOrderIds = new Set(filtered.map((r) => r.orderId).filter(Boolean));

    for (const refund of filtered) {
      await appendRefundToGroup(groups, refund, getOrder);
    }

    await appendVenueServiceCancelledOrders(groups, getOrder, seenOrderIds);
    await enrichGroups(groups);

    let eventList = Object.values(groups).filter(isValidReservationGroup);

    if (reservationTypeFilter && reservationTypeFilter !== "all") {
      eventList = eventList.filter((g) => g.reservationType === reservationTypeFilter);
    }

    eventList.sort((a, b) => {
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      return b.totalRefundAmount - a.totalRefundAmount;
    });

    const paginated = eventIdFilter
      ? eventList.filter((e) => e.reservationId === eventIdFilter || e.eventId === eventIdFilter)
      : eventList.slice(0, limit);

    const summary = {
      totalEventsAffected: eventList.length,
      totalReservationsAffected: eventList.length,
      totalRecords: eventList.reduce((s, e) => s + e.refunds.length, 0),
      totalPendingRefunds: eventList.reduce((s, e) => safeAdd(s, e.pendingCount), 0),
      totalCompletedRefunds: eventList.reduce((s, e) => safeAdd(s, e.completedCount), 0),
      totalRejectedRefunds: eventList.reduce((s, e) => safeAdd(s, e.rejectedCount), 0),
      totalPendingAmount: eventList.reduce((s, e) => safeAdd(s, e.pendingAmount), 0),
      totalCompletedAmount: eventList.reduce((s, e) => safeAdd(s, e.completedAmount), 0),
      byType: {
        event: eventList.filter((e) => e.reservationType === "event").length,
        venue: eventList.filter((e) => e.reservationType === "venue").length,
        service: eventList.filter((e) => e.reservationType === "service").length,
      },
      currency: "COP",
    };

    return response(200, {
      summary,
      total: eventList.length,
      limit,
      events: paginated.map((item) => ({
        ...item,
        eventId: item.reservationType === "event" ? item.reservationId : item.eventId,
        pendingAmount: parseCopAmount(item.pendingAmount),
        completedAmount: parseCopAmount(item.completedAmount),
        totalRefundAmount: parseCopAmount(item.totalRefundAmount),
      })),
    });
  } catch (error) {
    console.error("getEventRefundsStatistics error:", error);
    return response(500, {
      error: "Error getting refund statistics",
      message: error.message,
    });
  }
};

module.exports.parseCopAmount = parseCopAmount;
module.exports.isValidReservationGroup = isValidReservationGroup;
