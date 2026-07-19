const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();

const WARM_CACHE_TTL_MS = 60 * 1000;
const warmCache = new Map();

const withWarmCache = async (key, fetcher) => {
  const cached = warmCache.get(key);
  if (cached && Date.now() - cached.cachedAt < WARM_CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await fetcher();
  warmCache.set(key, { data, cachedAt: Date.now() });
  return data;
};

const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";

const resolveSuffixedTable = (baseName) => {
  const ordersTable = process.env.ORDERS_TABLE || "Orders";
  if (ordersTable.endsWith("-dev")) return `${baseName}-dev`;
  if (ordersTable.endsWith("-qa")) return `${baseName}-qa`;
  return baseName;
};

const EVENT_INVITATIONS_TABLE =
  process.env.EVENT_INVITATIONS_TABLE || resolveSuffixedTable("EventInvitations");
const TICKET_SCANS_TABLE =
  process.env.TICKET_SCANS_TABLE || resolveSuffixedTable("TicketScans");
const VENUE_GATE_TABLE =
  process.env.VENUE_GATE_TABLE || resolveSuffixedTable("Venue_Gate");
const FAVORITE_USERS_TABLE =
  process.env.FAVORITE_USERS_TABLE || resolveSuffixedTable("FavoriteUsers");

const APPROVED_STATUSES = new Set([
  "APPROVED",
  "approved",
  "PAID",
  "paid",
  "SOLD",
  "sold",
  "FINISHED",
  "finished",
]);
const EXECUTED_PAYMENT_STATUSES = new Set([
  "APPROVED",
  "PAID",
  "SOLD",
  "FINISHED",
  "COMPLETED",
  "SUCCESS",
]);
const NON_EXECUTED_PAYMENT_STATUSES = new Set([
  "PENDING",
  "REJECTED",
  "FAILED",
  "DECLINED",
  "EXPIRED",
]);
const REFUND_ACTIVE_STATUSES = new Set(["PENDING", "COMPLETED"]);

const numberOrZero = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeOrderAmount = (order = {}) => {
  const candidates = [
    order.total_amount,
    order.totalAmount,
    order.amount,
    order.netAmount,
    order.net_amount,
  ];

  for (const candidate of candidates) {
    const amount = numberOrZero(candidate);
    if (amount > 0) return amount;
  }

  if (Array.isArray(order.tickets) && order.tickets.length > 0) {
    const ticketTotal = order.tickets.reduce((sum, ticket) => {
      return sum + numberOrZero(
        ticket.price || ticket.amount || ticket.unitPrice || ticket.total_amount || ticket.purchasePrice,
      );
    }, 0);
    if (ticketTotal > 0) return ticketTotal;
  }

  return 0;
};

const normalizeTicketsCount = (order = {}) => {
  if (Array.isArray(order.tickets) && order.tickets.length > 0) {
    const qtySum = order.tickets.reduce(
      (sum, ticket) =>
        sum + (numberOrZero(ticket.quantity) || numberOrZero(ticket.qty) || 0),
      0,
    );
    if (qtySum > 0) return qtySum;
    return order.tickets.length;
  }

  const metaTickets = order.metadata?.tickets;
  if (Array.isArray(metaTickets) && metaTickets.length > 0) {
    const metaQty = metaTickets.reduce(
      (sum, ticket) =>
        sum + (numberOrZero(ticket.quantity) || numberOrZero(ticket.qty) || 0),
      0,
    );
    if (metaQty > 0) return metaQty;
    return metaTickets.length;
  }

  const candidates = [
    order.ticketCount,
    order.tickets_count,
    order.quantity,
    order.qty,
  ];

  for (const candidate of candidates) {
    const count = numberOrZero(candidate);
    if (count > 0) return count;
  }

  return 0;
};

const isOrderApproved = (order = {}) => {
  const status = String(order.payment_status || order.status || "").trim();
  return APPROVED_STATUSES.has(status);
};

const normalizeUpper = (value) => String(value || "").trim().toUpperCase();

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "si", "sí"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
};

const getOrderPostEventFlag = (order = {}) => {
  const candidates = [
    order.isReferred,
    order.is_referred,
    order.referred,
    order.payment_data?.isReferred,
    order.payment_data?.is_referred,
    order.payment_data?.referred,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBoolean(candidate);
    if (normalized !== undefined) {
      return normalized;
    }
  }

  return false;
};

const getOrderPaymentTimingBucket = (order = {}) =>
  getOrderPostEventFlag(order) ? "POST_EVENT" : "PRE_EVENT";

const resolvePaymentStatus = (order = {}) =>
  normalizeUpper(order.payment_status || order.status);

const classifyOrderLifecycle = (order = {}) => {
  const paymentStatus = resolvePaymentStatus(order);
  const orderStatus = normalizeUpper(order.status);
  const refundStatus = normalizeUpper(order.refund_status);
  const partialRefundStatus = normalizeUpper(order.partial_refund_status);

  const hasEventCancellationMarker = Boolean(order.cancelled_at);
  const hasExpirationMarker = Boolean(order.finalized_at);

  const isCancelled =
    paymentStatus === "CANCELLED" || orderStatus === "CANCELLED";
  const isFullyRefunded =
    order.is_refunded === true || REFUND_ACTIVE_STATUSES.has(refundStatus);
  const isPartiallyRefunded =
    order.is_partially_refunded === true ||
    REFUND_ACTIVE_STATUSES.has(partialRefundStatus);
  const hasExecutedPayment = EXECUTED_PAYMENT_STATUSES.has(paymentStatus);

  if (hasEventCancellationMarker && isCancelled) {
    return {
      bucket: "EVENT_CANCELLED",
      cancellationOrigin: "EVENT",
      isExecutedSale: false,
      hasExecutedPayment,
      isFullyRefunded,
      isPartiallyRefunded,
      paymentStatus,
      orderStatus,
    };
  }

  if (isFullyRefunded || isCancelled) {
    const cancellationOrigin = hasExpirationMarker ? "SYSTEM_EXPIRED" : "PURCHASE";
    const bucket = hasExpirationMarker
      ? "NON_EXECUTED"
      : "PURCHASE_CANCELLED";

    return {
      bucket,
      cancellationOrigin,
      isExecutedSale: false,
      hasExecutedPayment,
      isFullyRefunded,
      isPartiallyRefunded,
      paymentStatus,
      orderStatus,
    };
  }

  if (hasExecutedPayment) {
    return {
      bucket: "EXECUTED_SALE",
      cancellationOrigin: "NONE",
      isExecutedSale: true,
      hasExecutedPayment,
      isFullyRefunded,
      isPartiallyRefunded,
      paymentStatus,
      orderStatus,
    };
  }

  if (NON_EXECUTED_PAYMENT_STATUSES.has(paymentStatus) || hasExpirationMarker) {
    return {
      bucket: "NON_EXECUTED",
      cancellationOrigin: hasExpirationMarker ? "SYSTEM_EXPIRED" : "NONE",
      isExecutedSale: false,
      hasExecutedPayment,
      isFullyRefunded,
      isPartiallyRefunded,
      paymentStatus,
      orderStatus,
    };
  }

  return {
    bucket: "NON_EXECUTED",
    cancellationOrigin: "NONE",
    isExecutedSale: false,
    hasExecutedPayment,
    isFullyRefunded,
    isPartiallyRefunded,
    paymentStatus,
    orderStatus,
  };
};

const isOrderExecutedSale = (order = {}) => classifyOrderLifecycle(order).isExecutedSale;

const queryByIndexPaginated = async ({
  tableName,
  indexName,
  keyName,
  keyValue,
  projectionExpression,
}) => {
  const items = [];
  let lastKey;

  do {
    const params = {
      TableName: tableName,
      KeyConditionExpression: `${keyName} = :value`,
      ExpressionAttributeValues: {
        ":value": keyValue,
      },
      ExclusiveStartKey: lastKey,
    };

    if (indexName) {
      params.IndexName = indexName;
    }

    if (projectionExpression) {
      params.ProjectionExpression = projectionExpression;
    }

    const result = await dynamodb.query(params).promise();
    if (Array.isArray(result.Items) && result.Items.length > 0) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
};

const scanByFieldPaginated = async ({ tableName, fieldName, fieldValue }) => {
  const items = [];
  let lastKey;

  do {
    const params = {
      TableName: tableName,
      FilterExpression: `${fieldName} = :value`,
      ExpressionAttributeValues: {
        ":value": fieldValue,
      },
      ExclusiveStartKey: lastKey,
    };

    const result = await dynamodb.scan(params).promise();
    if (Array.isArray(result.Items) && result.Items.length > 0) {
      items.push(...result.Items);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
};

const getOrdersByEvent = async (eventId) =>
  withWarmCache(`orders:${eventId}`, async () => {
  const tryQueries = [
    { indexName: "event_id-created_at-index", keyName: "event_id" },
    { indexName: "eventIdIndex", keyName: "eventId" },
  ];

  for (const queryCfg of tryQueries) {
    try {
      const orders = await queryByIndexPaginated({
        tableName: ORDERS_TABLE,
        indexName: queryCfg.indexName,
        keyName: queryCfg.keyName,
        keyValue: eventId,
      });

      if (orders.length > 0) return orders;
    } catch (error) {
      console.warn(
        `[getOrdersByEvent] query fallback (${queryCfg.indexName}) failed:`,
        error.message
      );
    }
  }

  try {
    const ordersByEventId = await scanByFieldPaginated({
      tableName: ORDERS_TABLE,
      fieldName: "event_id",
      fieldValue: eventId,
    });
    if (ordersByEventId.length > 0) return ordersByEventId;
  } catch (error) {
    console.warn("[getOrdersByEvent] scan by event_id failed:", error.message);
  }

  try {
    return await scanByFieldPaginated({
      tableName: ORDERS_TABLE,
      fieldName: "eventId",
      fieldValue: eventId,
    });
  } catch (error) {
    console.warn("[getOrdersByEvent] scan by eventId failed:", error.message);
    return [];
  }
});

const getExecutedBuyerUserIdsByEvent = async (eventId) => {
  const tryQueries = [
    { indexName: "event_id-created_at-index", keyName: "event_id" },
    { indexName: "eventIdIndex", keyName: "eventId" },
  ];

  for (const queryCfg of tryQueries) {
    try {
      const orders = await queryByIndexPaginated({
        tableName: ORDERS_TABLE,
        indexName: queryCfg.indexName,
        keyName: queryCfg.keyName,
        keyValue: eventId,
        projectionExpression:
          "order_id, user_id, userId, payment_status, refund_status, partial_refund_status, is_refunded, is_partially_refunded, cancelled_at, finalized_at",
      });

      if (orders.length === 0) continue;

      const buyerIds = new Set();
      for (const order of orders) {
        if (!isOrderExecutedSale(order)) continue;
        const uid = order.user_id || order.userId;
        if (uid) buyerIds.add(uid);
      }

      return Array.from(buyerIds);
    } catch (error) {
      console.warn(
        `[getExecutedBuyerUserIdsByEvent] query fallback (${queryCfg.indexName}) failed:`,
        error.message
      );
    }
  }

  // Deliberately avoid scan fallback here to prevent timeout-driven 502s.
  return [];
};

const getEventInvitations = async (eventId) =>
  withWarmCache(`invitations:${eventId}`, async () => {
  const tryQueries = [
    { indexName: "EventIdIndex", keyName: "eventId", keyValue: eventId },
    { indexName: undefined, keyName: "PK", keyValue: `EVENT#${eventId}` },
  ];

  for (const queryCfg of tryQueries) {
    try {
      const invitations = await queryByIndexPaginated({
        tableName: EVENT_INVITATIONS_TABLE,
        indexName: queryCfg.indexName,
        keyName: queryCfg.keyName,
        keyValue: queryCfg.keyValue,
      });

      if (invitations.length > 0) return invitations;
    } catch (error) {
      console.warn(
        `[getEventInvitations] query fallback (${queryCfg.indexName || "PrimaryKey"}) failed:`,
        error.message
      );
    }
  }

  try {
    const invitationsByEventId = await scanByFieldPaginated({
      tableName: EVENT_INVITATIONS_TABLE,
      fieldName: "eventId",
      fieldValue: eventId,
    });
    if (invitationsByEventId.length > 0) return invitationsByEventId;
  } catch (error) {
    console.warn(
      "[getEventInvitations] scan fallback by eventId failed:",
      error.message
    );
  }

  try {
    return await scanByFieldPaginated({
      tableName: EVENT_INVITATIONS_TABLE,
      fieldName: "event_id",
      fieldValue: eventId,
    });
  } catch (error) {
    console.warn(
      "[getEventInvitations] scan fallback by event_id failed:",
      error.message
    );
    return [];
  }
});

const getTicketScansByEvent = async (eventId) =>
  withWarmCache(`scans:${eventId}`, async () => {
  const tryQueries = [
    { indexName: "EventScanAtIndex", keyName: "eventId" },
    { indexName: "EventStatusIndex", keyName: "eventId" },
  ];

  for (const queryCfg of tryQueries) {
    try {
      const scans = await queryByIndexPaginated({
        tableName: TICKET_SCANS_TABLE,
        indexName: queryCfg.indexName,
        keyName: queryCfg.keyName,
        keyValue: eventId,
      });
      if (scans.length > 0) return scans;
    } catch (error) {
      console.warn(
        `[getTicketScansByEvent] query fallback (${queryCfg.indexName}) failed:`,
        error.message
      );
    }
  }

  try {
    return await scanByFieldPaginated({
      tableName: TICKET_SCANS_TABLE,
      fieldName: "eventId",
      fieldValue: eventId,
    });
  } catch (error) {
    console.warn("[getTicketScansByEvent] scan fallback failed:", error.message);
    return [];
  }
});

const getEventById = async (eventId) =>
  withWarmCache(`event:${eventId}`, async () => {
  try {
    const result = await dynamodb
      .get({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
      })
      .promise();
    return result.Item || null;
  } catch (error) {
    console.warn("[getEventById] failed:", error.message);
    return null;
  }
});

const getVenueGatesByVenue = async (venueId) => {
  if (!venueId) return [];

  try {
    const gates = await queryByIndexPaginated({
      tableName: VENUE_GATE_TABLE,
      indexName: "venueIdIndex",
      keyName: "venueId",
      keyValue: venueId,
    });

    if (gates.length > 0) return gates;
  } catch (error) {
    console.warn("[getVenueGatesByVenue] query fallback failed:", error.message);
  }

  try {
    return await scanByFieldPaginated({
      tableName: VENUE_GATE_TABLE,
      fieldName: "venueId",
      fieldValue: venueId,
    });
  } catch (error) {
    console.warn("[getVenueGatesByVenue] scan fallback failed:", error.message);
    return [];
  }
};

const getClientByUserId = async (userId, ownerId = null) => {
  if (!userId) return null;

  // Client-* usa HASH `id` (= userId de la app). Probar primero para evitar ValidationException.
  try {
    const byId = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
      })
      .promise();

    if (byId.Item) return byId.Item;
  } catch (error) {
    console.warn("[getClientByUserId] get by id failed:", error.message);
  }

  try {
    const direct = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { user_id: userId },
      })
      .promise();

    if (direct.Item) return direct.Item;
  } catch (error) {
    console.warn("[getClientByUserId] get by user_id failed:", error.message);
  }

  if (!ownerId) {
    return null;
  }

  try {
    const favoriteResult = await dynamodb
      .get({
        TableName: FAVORITE_USERS_TABLE,
        Key: {
          userId: ownerId,
          favoriteId: userId,
        },
      })
      .promise();

    if (!favoriteResult.Item) {
      return null;
    }

    return {
      id: favoriteResult.Item.invitedUserId || favoriteResult.Item.favoriteId || userId,
      user_id: favoriteResult.Item.invitedUserId || favoriteResult.Item.favoriteId || userId,
      name: favoriteResult.Item.name || "",
      lastName: favoriteResult.Item.lastName || "",
      email: favoriteResult.Item.email || "",
      phone: favoriteResult.Item.phone || "",
      username: favoriteResult.Item.username || favoriteResult.Item.user || "",
      profileImage: favoriteResult.Item.profileImageUrl || favoriteResult.Item.profileImage || null,
      profileImageUrl: favoriteResult.Item.profileImageUrl || favoriteResult.Item.profileImage || null,
      avatar: favoriteResult.Item.profileImageUrl || favoriteResult.Item.profileImage || null,
      originType: "FAVORITE_USER",
    };
  } catch (error) {
    console.warn("[getClientByUserId] get by FavoriteUsers failed:", error.message);
    return null;
  }
};

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});

module.exports = {
  APPROVED_STATUSES,
  numberOrZero,
  normalizeOrderAmount,
  normalizeTicketsCount,
  normalizeBoolean,
  isOrderApproved,
  getOrderPostEventFlag,
  getOrderPaymentTimingBucket,
  classifyOrderLifecycle,
  isOrderExecutedSale,
  getOrdersByEvent,
  getExecutedBuyerUserIdsByEvent,
  getEventInvitations,
  getTicketScansByEvent,
  getEventById,
  getVenueGatesByVenue,
  getClientByUserId,
  response,
};
