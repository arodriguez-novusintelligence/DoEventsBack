const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-2',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';
const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Eventos-qa';
const ORDERS_TABLE = process.env.ORDERS_TABLE || 'Orders-qa';
const VENUES_TABLE = process.env.VENUES_TABLE || 'Venues-qa';
const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';

function todayStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function yesterdayStartIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function dayKey(iso) {
  return dayKeyFromCreatedAt(iso);
}

function normalizeCreatedAt(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const str = String(value).trim();
  if (/^\d{13}$/.test(str)) {
    return new Date(Number(str)).toISOString();
  }
  if (/^\d{10}$/.test(str)) {
    return new Date(Number(str) * 1000).toISOString();
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return str;
}

function dayKeyFromCreatedAt(value) {
  const normalized = normalizeCreatedAt(value);
  if (!normalized) return '';
  return normalized.slice(0, 10);
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function isApprovedOrder(order) {
  return ['APPROVED', 'PAID', 'SOLD', 'FINISHED', 'COMPLETED', 'SUCCESS'].includes(
    String(order.payment_status || order.paymentStatus || '').toUpperCase(),
  );
}

const ORDER_SCAN_PROJECTION = 'order_id, total_amount, payment_status, created_at, event_id, user_id, metadata, order_type, tickets';

function resolveOrderType(order) {
  const explicit = String(order.order_type || order.metadata?.orderType || '').toUpperCase();
  if (explicit === 'VENUE_RENTAL') return 'venue';
  if (explicit === 'SERVICE_RENTAL') return 'service';
  const eventId = String(order.event_id || order.eventId || '');
  if (eventId.startsWith('venue:')) return 'venue';
  if (eventId.startsWith('service:')) return 'service';
  return 'event';
}

function resolveOrderCategory(order) {
  const type = resolveOrderType(order);
  if (type === 'venue') return 'lugar';
  if (type === 'service') return 'servicio';
  return 'evento';
}

function extractOrderEntityId(order, type = resolveOrderType(order)) {
  const meta = order.metadata || {};
  if (type === 'venue') {
    return String(meta.venueId || String(order.event_id || order.eventId || '').replace(/^venue:/, '')).trim();
  }
  if (type === 'service') {
    return String(meta.serviceId || String(order.event_id || order.eventId || '').replace(/^service:/, '')).trim();
  }
  return String(order.event_id || order.eventId || '').trim();
}

function orderTicketCount(order) {
  if (resolveOrderType(order) !== 'event') return 0;
  const rootTickets = order.tickets;
  if (Array.isArray(rootTickets) && rootTickets.length) {
    const qty = rootTickets.reduce(
      (sum, ticket) => sum + (Number(ticket.quantity) || Number(ticket.qty) || 0),
      0,
    );
    if (qty > 0) return qty;
    return rootTickets.length;
  }
  const metaTickets = order.metadata?.tickets;
  if (Array.isArray(metaTickets) && metaTickets.length) {
    const qty = metaTickets.reduce(
      (sum, ticket) => sum + (Number(ticket.quantity) || Number(ticket.qty) || 0),
      0,
    );
    if (qty > 0) return qty;
    return metaTickets.length;
  }
  const fallbackCount = Number(order.ticketCount || order.tickets_count || order.quantity || order.qty || 0);
  if (fallbackCount > 0) return fallbackCount;
  return isApprovedOrder(order) ? 1 : 0;
}

function resolveOrderLabel(order, maps = {}) {
  const type = resolveOrderType(order);
  const meta = order.metadata || {};
  const {
    eventNameMap = new Map(),
    venueNameMap = new Map(),
    serviceNameMap = new Map(),
  } = maps;

  if (type === 'venue') {
    const venueId = extractOrderEntityId(order, 'venue');
    return venueNameMap.get(venueId) || meta.venueName || 'Reserva de lugar';
  }
  if (type === 'service') {
    const serviceId = extractOrderEntityId(order, 'service');
    return serviceNameMap.get(serviceId) || meta.serviceName || 'Reserva de servicio';
  }
  const eventId = extractOrderEntityId(order, 'event');
  return eventNameMap.get(eventId) || meta.eventName || 'Evento';
}

function resolveTransactionBadge(order) {
  if (isApprovedOrder(order)) return 'ingreso';
  const status = String(order.payment_status || order.paymentStatus || '').toUpperCase();
  if (status === 'PENDING') return 'pendiente';
  if (status === 'CANCELLED' || status === 'EXPIRED') return 'cancelado';
  return 'dispersión';
}

function sumApprovedRevenueByCategory(orders, startIso = null) {
  const totals = { evento: 0, lugar: 0, servicio: 0 };
  orders.forEach((order) => {
    if (!isApprovedOrder(order)) return;
    if (startIso && String(order.created_at || order.createdAt || '') < startIso) return;
    totals[resolveOrderCategory(order)] += Number(order.total_amount || order.totalAmount || 0);
  });
  return totals;
}

function countApprovedSalesByCategory(orders, startIso = null) {
  const counts = { evento: 0, lugar: 0, servicio: 0 };
  orders.forEach((order) => {
    if (!isApprovedOrder(order)) return;
    if (startIso && String(order.created_at || order.createdAt || '') < startIso) return;
    counts[resolveOrderCategory(order)] += 1;
  });
  return counts;
}

async function buildEntityNameMaps() {
  const [venueItems, serviceItems] = await Promise.all([
    scanTable(VENUES_TABLE, {
      projection: 'venue_id, venueId, #name, ownerUserId',
      names: { '#name': 'name' },
      limit: 500,
    }).catch(() => []),
    scanTable(SERVICES_TABLE, {
      projection: 'serviceId, #name, userId',
      names: { '#name': 'name' },
      limit: 500,
    }).catch(() => []),
  ]);

  const venueNameMap = new Map();
  const venueOwnerMap = new Map();
  venueItems.forEach((item) => {
    const id = item.venue_id || item.venueId;
    if (!id) return;
    venueNameMap.set(id, item.name || 'Lugar');
    if (item.ownerUserId) venueOwnerMap.set(id, item.ownerUserId);
  });

  const serviceNameMap = new Map();
  const serviceOwnerMap = new Map();
  serviceItems.forEach((item) => {
    if (!item.serviceId) return;
    serviceNameMap.set(item.serviceId, item.name || 'Servicio');
    if (item.userId) serviceOwnerMap.set(item.serviceId, item.userId);
  });

  return { venueNameMap, venueOwnerMap, serviceNameMap, serviceOwnerMap };
}

function calcCommissionCop(gross, tickets) {
  const subtotal = Number(gross || 0) * 0.08 + Number(tickets || 0) * 1500;
  return Math.round(subtotal * 1.19);
}

function formatEventDateRange(item) {
  const ini = item.fechaIni ? String(item.fechaIni).slice(0, 10) : '';
  const fin = item.fechaFin ? String(item.fechaFin).slice(0, 10) : '';
  if (ini && fin && ini !== fin) return `${ini} – ${fin}`;
  return ini || fin || '—';
}

function mapStaffStatus(item) {
  const role = String(item.platformRole || item.role || 'user').toLowerCase();
  const status = String(item.accountStatus || item.status || 'active').toLowerCase();
  if (['blocked', 'suspended'].includes(status)) return 'cerrado';
  if (['admin', 'support', 'operation'].includes(role)) return 'aprobado';
  if (String(item.email || '').toLowerCase().endsWith('@doeventsapp.com')) return 'pendiente';
  return 'aprobado';
}

function mapStaffRole(item) {
  const role = String(item.platformRole || item.role || 'user').toLowerCase();
  if (role === 'admin') return 'Admin';
  if (role === 'support') return 'Support';
  if (role === 'operation') return 'Operation';
  return null;
}

function normalizeSearchQuery(query) {
  return String(query || '').trim().toLowerCase().replace(/^@+/, '');
}

function matchesUserSearch(user, query) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return true;
  const fields = [
    user.email,
    user.username,
    user.userId,
    user.nombre,
    user.apellido,
    user.fullName,
  ].map((value) => String(value || '').toLowerCase());
  return fields.some((field) => field.includes(normalized));
}

function isDeletedAppUser(user) {
  return String(user?.status || '').toLowerCase() === 'deleted';
}

function resolveAuthSource(item) {
  const raw = item.platform
    || item.PLATFORM
    || item.authProvider
    || item.provider
    || item.loginProvider
    || null;
  if (!raw) return 'Email';
  const value = String(raw).toLowerCase();
  if (value.includes('google')) return 'Google';
  if (value.includes('apple')) return 'Apple';
  if (value.includes('facebook')) return 'Facebook';
  if (value.includes('email') || value.includes('credential') || value.includes('password')) return 'Email';
  return 'Email';
}

const AUTH_SOURCE_ORDER = ['Google', 'Email', 'Apple', 'Facebook'];

function buildSourceBreakdown(users) {
  const sourceMap = {};
  users.forEach((user) => {
    const source = user.authSource || 'Email';
    sourceMap[source] = (sourceMap[source] || 0) + 1;
  });
  const ordered = AUTH_SOURCE_ORDER
    .filter((name) => sourceMap[name] > 0)
    .map((name) => ({ name, value: sourceMap[name] }));
  const extras = Object.entries(sourceMap)
    .filter(([name]) => !AUTH_SOURCE_ORDER.includes(name))
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return [...ordered, ...extras];
}

function filterUsersByPeriod(users, period) {
  const todayKey = dayKey(todayStartIso());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = dayKey(yesterdayDate.toISOString());

  if (period === 'today') {
    return users.filter((u) => dayKeyFromCreatedAt(u.createdAt) === todayKey);
  }
  if (period === 'yesterday') {
    return users.filter((u) => dayKeyFromCreatedAt(u.createdAt) === yesterdayKey);
  }
  if (period === '7d') {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users.filter((u) => {
      const created = new Date(normalizeCreatedAt(u.createdAt) || 0).getTime();
      return created >= cutoff;
    });
  }
  return users;
}

function normalizeEventStatus(item) {
  return String(item?.estatus || item?.status || item?.estado || '').trim().toLowerCase();
}

function isBlockedStatus(status) {
  return ['blocked', 'suspended'].includes(String(status || '').toLowerCase());
}

function isProPlan(plan) {
  return String(plan || '').toLowerCase() === 'pro';
}

function isDeletedEvent(item) {
  return normalizeEventStatus(item) === 'deleted';
}

function isPublishedEvent(item) {
  const status = normalizeEventStatus(item);
  return ['activo', 'en_ejecucion', 'ejecucion', 'finalizado', 'reagendado'].includes(status);
}

function isDraftEvent(item) {
  const status = normalizeEventStatus(item);
  return ['inactivo', 'draft', 'borrador'].includes(status);
}

function isCancelledEvent(item) {
  const status = normalizeEventStatus(item);
  return ['cancelado', 'cancelled', 'canceled'].includes(status);
}

async function countTable(tableName) {
  const result = await dynamodb.scan({ TableName: tableName, Select: 'COUNT' }).promise();
  return result.Count || 0;
}

async function scanTable(tableName, options = {}) {
  const {
    projection,
    names,
    limit = 500,
    maxPages = 20,
  } = options;

  const items = [];
  let lastKey;
  let pages = 0;

  do {
    const params = {
      TableName: tableName,
      Limit: Math.min(limit, 500),
    };
    if (projection) {
      params.ProjectionExpression = projection;
      if (names && Object.keys(names).length) {
        params.ExpressionAttributeNames = names;
      }
    }
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await dynamodb.scan(params).promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
    pages += 1;
  } while (lastKey && items.length < limit && pages < maxPages);

  return items;
}

async function scanClientsProjection(projection, names, limit = 1000) {
  return scanTable(CLIENT_TABLE, { projection, names, limit });
}

async function countUserEvents(userId) {
  const result = await dynamodb.query({
    TableName: EVENTS_TABLE,
    IndexName: 'userIdIndex',
    KeyConditionExpression: 'userId = :uid',
    Select: 'COUNT',
    ExpressionAttributeValues: { ':uid': userId },
  }).promise().catch(() => ({ Count: 0 }));
  return result.Count || 0;
}

async function countUserOrders(userId) {
  const result = await dynamodb.query({
    TableName: ORDERS_TABLE,
    IndexName: 'user_id-created_at-index',
    KeyConditionExpression: 'user_id = :uid',
    Select: 'COUNT',
    ExpressionAttributeValues: { ':uid': userId },
  }).promise().catch(() => ({ Count: 0 }));
  return result.Count || 0;
}

function summarizeEvents(items) {
  const visible = items.filter((item) => !isDeletedEvent(item));
  return {
    total: visible.length,
    published: visible.filter(isPublishedEvent).length,
    draft: visible.filter(isDraftEvent).length,
    cancelled: visible.filter(isCancelledEvent).length,
    inProgress: visible.filter((item) => ['en_ejecucion', 'ejecucion'].includes(normalizeEventStatus(item))).length,
  };
}

function mapEventItem(item) {
  return {
    id: item.id,
    nombre: item.nombre || item.name || 'Sin nombre',
    estatus: item.estatus || item.status || 'desconocido',
    fechaIni: item.fechaIni,
    fechaFin: item.fechaFin,
    ciudad: item.ciudad || item.city,
    userId: item.userId,
    createDate: item.createDate || item.createdAt,
  };
}

function mapOrderItem(item) {
  return {
    orderId: item.order_id || item.orderId || item.id,
    eventId: item.event_id || item.eventId,
    userId: item.user_id || item.userId,
    totalAmount: Number(item.total_amount || item.totalAmount || 0),
    paymentStatus: item.payment_status || item.status || 'unknown',
    createdAt: item.created_at || item.createdAt,
  };
}

function mapVenueItem(item) {
  return {
    venueId: item.venue_id || item.venueId || item.id,
    name: item.name || item.nombre || 'Sin nombre',
    city: item.city || item.ciudad,
    ownerUserId: item.ownerUserId || item.userId,
    createdAt: item.createdAt || item.createDate,
  };
}

function mapServiceItem(item) {
  return {
    serviceId: item.serviceId || item.id,
    name: item.name || item.nombre || 'Sin nombre',
    category: item.category || item.role,
    userId: item.userId,
    city: item.city,
    status: item.status || 'active',
    rating: Number(item.rating || 0),
    createdAt: item.createdAt || item.createDate,
  };
}

function sortByDateDesc(items, field = 'createdAt') {
  return [...items].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
}

async function buildDashboardMetrics() {
  const [
    totalUsers,
    totalEvents,
    totalOrders,
    totalVenues,
    totalServices,
    clients,
    eventItems,
    orderItems,
  ] = await Promise.all([
    countTable(CLIENT_TABLE),
    countTable(EVENTS_TABLE),
    countTable(ORDERS_TABLE),
    countTable(VENUES_TABLE).catch(() => 0),
    countTable(SERVICES_TABLE).catch(() => 0),
    scanClientsProjection(
      'id, #plan, accountStatus, #status, platformRole, #role',
      { '#plan': 'plan', '#status': 'status', '#role': 'role' },
    ),
    scanTable(EVENTS_TABLE, {
      projection: 'id, nombre, #name, estatus, #status, estado, createDate, fechaIni, fechaFin, userId, aforo',
      names: { '#name': 'name', '#status': 'status' },
      limit: 2000,
    }),
    scanTable(ORDERS_TABLE, {
      projection: ORDER_SCAN_PROJECTION,
      limit: 3000,
    }),
  ]);

  const blockedUsers = clients.filter((u) => isBlockedStatus(u.accountStatus || u.status)).length;
  const proSubscribers = clients.filter((u) => isProPlan(u.plan)).length;
  const adminUsers = clients.filter((u) => String(u.platformRole || u.role || '').toLowerCase() === 'admin').length;
  const activeUsers = Math.max(totalUsers - blockedUsers, 0);

  const eventSummary = summarizeEvents(eventItems);
  const todayStart = todayStartIso();
  const approvedOrders = orderItems.filter((o) =>
    ['APPROVED', 'PAID'].includes(String(o.payment_status || '').toUpperCase()));
  const revenueCop = approvedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const ordersToday = orderItems.filter((o) => String(o.created_at || '') >= todayStart).length;
  const revenueTodayCop = orderItems
    .filter((o) => String(o.created_at || '') >= todayStart
      && ['APPROVED', 'PAID'].includes(String(o.payment_status || '').toUpperCase()))
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  return {
    totalUsers,
    activeUsers,
    blockedUsers,
    adminUsers,
    proSubscribers,
    totalEvents,
    publishedEvents: eventSummary.published,
    draftEvents: eventSummary.draft,
    cancelledEvents: eventSummary.cancelled,
    eventsInProgress: eventSummary.inProgress,
    totalOrders,
    ordersToday,
    totalVenues,
    totalServices,
    revenueCop,
    revenueTodayCop,
  };
}

async function listRecentEvents(limit = 50) {
  const items = await scanTable(EVENTS_TABLE, {
    projection: 'id, nombre, #name, estatus, #status, estado, fechaIni, fechaFin, ciudad, userId, createDate',
    names: { '#name': 'name', '#status': 'status' },
    limit: 500,
  });
  return sortByDateDesc(
    items.filter((item) => !isDeletedEvent(item)).map(mapEventItem),
    'createDate',
  ).slice(0, limit);
}

async function listRecentOrders(limit = 50) {
  const items = await scanTable(ORDERS_TABLE, {
    projection: 'order_id, event_id, user_id, total_amount, payment_status, created_at',
    limit: 500,
  });
  return sortByDateDesc(items.map(mapOrderItem), 'createdAt').slice(0, limit);
}

async function listVenues(limit = 50) {
  const items = await scanTable(VENUES_TABLE, {
    projection: 'venue_id, #name, city, ownerUserId, createdAt',
    names: { '#name': 'name' },
    limit: 500,
  }).catch(() => []);
  return sortByDateDesc(items.map(mapVenueItem), 'createdAt').slice(0, limit);
}

async function listServices(limit = 50) {
  const items = await scanTable(SERVICES_TABLE, {
    projection: 'serviceId, #name, category, #role, userId, city, #status, rating, createdAt',
    names: { '#name': 'name', '#role': 'role', '#status': 'status' },
    limit: 500,
  }).catch(() => []);
  return sortByDateDesc(items.map(mapServiceItem), 'createdAt').slice(0, limit);
}

async function getEventsSection() {
  const items = await scanTable(EVENTS_TABLE, {
    projection: 'id, nombre, #name, estatus, #status, estado, fechaIni, fechaFin, ciudad, userId, createDate',
    names: { '#name': 'name', '#status': 'status' },
    limit: 2000,
  });
  const summary = summarizeEvents(items);
  const recent = sortByDateDesc(
    items.filter((item) => !isDeletedEvent(item)).map(mapEventItem),
    'createDate',
  ).slice(0, 50);
  return { summary, events: recent };
}

async function getOrdersSection() {
  const items = await scanTable(ORDERS_TABLE, {
    projection: 'order_id, event_id, user_id, total_amount, payment_status, created_at',
    limit: 2000,
  });
  const todayStart = todayStartIso();
  const approved = items.filter((o) =>
    ['APPROVED', 'PAID'].includes(String(o.payment_status || '').toUpperCase()));
  const summary = {
    total: items.length,
    approved: approved.length,
    pending: items.filter((o) => String(o.payment_status || '').toUpperCase() === 'PENDING').length,
    cancelled: items.filter((o) => String(o.payment_status || '').toUpperCase() === 'CANCELLED').length,
    revenueCop: approved.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
    ordersToday: items.filter((o) => String(o.created_at || '') >= todayStart).length,
  };
  const orders = sortByDateDesc(items.map(mapOrderItem), 'createdAt').slice(0, 50);
  return { summary, orders };
}

function mapClient(item) {
  if (!item) return null;
  const nombre = item.name || item.nombre;
  const apellido = item.lastName || item.apellido;
  return {
    userId: item.id,
    email: item.email,
    username: item.user || item.username,
    nombre,
    apellido,
    fullName: [nombre, apellido].filter(Boolean).join(' ').trim() || item.email || item.id,
    plan: item.plan || 'free',
    platformRole: item.platformRole || item.role || 'user',
    status: item.accountStatus || item.status || 'active',
    blacklisted: Boolean(item.blacklisted),
    blacklistedAt: item.blacklistedAt || null,
    deletedAt: item.deletedAt || null,
    staffStatus: mapStaffStatus(item),
    staffRole: mapStaffRole(item),
    createdAt: normalizeCreatedAt(item.createDate),
    authSource: resolveAuthSource(item),
    country: item.pais || item.country || item.ciudad || '',
    rating: Number(item.calificacion || item.rating || 0),
  };
}

async function countUserVenues(userId) {
  const items = await scanTable(VENUES_TABLE, {
    projection: 'venue_id, ownerUserId, userId',
    limit: 500,
  }).catch(() => []);
  return items.filter((item) => (item.ownerUserId || item.userId) === userId).length;
}

async function countUserServices(userId) {
  const items = await scanTable(SERVICES_TABLE, {
    projection: 'serviceId, userId',
    limit: 500,
  }).catch(() => []);
  return items.filter((item) => item.userId === userId).length;
}

async function buildSupportProfile(item) {
  const userId = item.id;
  const [eventsCount, ordersCount, venuesCount, servicesCount] = await Promise.all([
    countUserEvents(userId),
    countUserOrders(userId),
    countUserVenues(userId),
    countUserServices(userId),
  ]);

  const nombre = item.name || item.nombre;
  const apellido = item.lastName || item.apellido;
  const fullName = [nombre, apellido].filter(Boolean).join(' ').trim() || item.email || userId;
  const createDate = item.createDate ? new Date(item.createDate) : null;
  const yearsAsEventer = createDate && !Number.isNaN(createDate.getTime())
    ? Math.max(0, Math.floor((Date.now() - createDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)))
    : 0;

  return {
    id: userId,
    fullName,
    username: item.user ? `@${item.user}` : (item.username || ''),
    email: item.email || '',
    description: item.description || item.bio || '',
    followers: Number(item.followersCount || item.seguidores || 0),
    following: Number(item.followingCount || item.siguiendo || 0),
    rating: Number(item.calificacion || item.rating || 0),
    yearsAsEventer,
    eventsCreated: eventsCount,
    publications: Number(item.totalPublicaciones || item.publicationsCount || 0),
    guestManagement: Number(item.Invitados || item.guestCount || 0),
    venues: venuesCount,
    services: servicesCount,
    eventInvitations: Number(item.UserInvitations || item.invitationsCount || 0),
    ticketsPurchased: ordersCount,
    eventStats: eventsCount,
    subscriptionPlan: String(item.plan || 'free').toLowerCase() === 'pro' ? 'Plan PRO' : 'Plan free',
    subscriptionStatus: ['blocked', 'suspended'].includes(String(item.accountStatus || item.status || '').toLowerCase())
      ? 'Suspendido'
      : 'Activo',
    isPrivateProfile: item.isPublicProfile === false,
    phone: item.phoneNumber || item.telefono || item.phone || '',
    whatsapp: item.whatsapp || item.whatsApp || '',
    contactEmail: item.email || '',
    platformRole: item.platformRole || item.role || 'user',
    accountStatus: item.accountStatus || item.status || 'active',
  };
}

function aggregateOrdersByEvent(eventItems, orderItems, clientItems) {
  const eventMap = new Map();
  eventItems.filter((item) => !isDeletedEvent(item)).forEach((item) => {
    eventMap.set(item.id, item);
  });

  const clientMap = new Map();
  clientItems.forEach((item) => {
    clientMap.set(item.id, item);
  });

  const byEvent = new Map();
  orderItems.forEach((order) => {
    if (resolveOrderType(order) !== 'event') return;
    const eventId = order.event_id || order.eventId;
    if (!eventId) return;
    const bucket = byEvent.get(eventId) || {
      eventId,
      ticketsSold: 0,
      grossAmount: 0,
      pendingGross: 0,
      approvedCount: 0,
      pendingCount: 0,
    };
    const tickets = orderTicketCount(order);
    const amount = Number(order.total_amount || 0);
    if (isApprovedOrder(order)) {
      bucket.ticketsSold += tickets;
      bucket.grossAmount += amount;
      bucket.approvedCount += 1;
    } else if (String(order.payment_status || '').toUpperCase() === 'PENDING') {
      bucket.pendingGross += amount;
      bucket.pendingCount += 1;
    }
    byEvent.set(eventId, bucket);
  });

  return byEvent;
}

function aggregateOrdersByRental(orderItems, rentalType) {
  const byEntity = new Map();
  orderItems.forEach((order) => {
    if (resolveOrderType(order) !== rentalType) return;
    const entityId = extractOrderEntityId(order, rentalType);
    if (!entityId) return;
    const bucket = byEntity.get(entityId) || {
      entityId,
      grossAmount: 0,
      salesCount: 0,
      pendingCount: 0,
      approvedCount: 0,
    };
    const amount = Number(order.total_amount || 0);
    if (isApprovedOrder(order)) {
      bucket.grossAmount += amount;
      bucket.salesCount += 1;
      bucket.approvedCount += 1;
    } else if (String(order.payment_status || '').toUpperCase() === 'PENDING') {
      bucket.pendingCount += 1;
    }
    byEntity.set(entityId, bucket);
  });
  return byEntity;
}

function resolvePaymentStatus(bucket) {
  if (bucket.approvedCount > 0 && bucket.pendingCount === 0) return 'dispersado';
  if (bucket.approvedCount > 0) return 'procesado';
  return 'pendiente';
}

async function buildExtendedDashboard() {
  const [
    metrics,
    eventItems,
    orderItems,
    clientItems,
    entityMaps,
  ] = await Promise.all([
    buildDashboardMetrics(),
    scanTable(EVENTS_TABLE, {
      projection: 'id, nombre, #name, estatus, #status, estado, createDate, fechaIni, fechaFin, userId, aforo',
      names: { '#name': 'name', '#status': 'status' },
      limit: 2000,
    }),
    scanTable(ORDERS_TABLE, {
      projection: ORDER_SCAN_PROJECTION,
      limit: 3000,
    }),
    scanClientsProjection(
      'id, email, #user, username, #name, nombre, lastName, apellido, createDate',
      { '#user': 'user', '#name': 'name' },
      2000,
    ),
    buildEntityNameMaps(),
  ]);

  const { venueNameMap, venueOwnerMap, serviceNameMap, serviceOwnerMap } = entityMaps;

  const todayStart = todayStartIso();
  const yesterdayStart = yesterdayStartIso();
  const todayKey = dayKey(todayStart);
  const yesterdayKey = dayKey(yesterdayStart);

  const visibleEvents = eventItems.filter((item) => !isDeletedEvent(item));
  const activeEvents = visibleEvents.filter(isPublishedEvent).length;
  const ordersByEvent = aggregateOrdersByEvent(eventItems, orderItems, clientItems);

  const approvedToday = orderItems.filter((o) => isApprovedOrder(o) && String(o.created_at || '') >= todayStart);
  const approvedYesterday = orderItems.filter((o) =>
    isApprovedOrder(o)
    && String(o.created_at || '') >= yesterdayStart
    && String(o.created_at || '') < todayStart);
  const ticketsSoldToday = approvedToday.reduce((sum, o) => sum + orderTicketCount(o), 0);
  const ticketsSoldYesterday = approvedYesterday.reduce((sum, o) => sum + orderTicketCount(o), 0);
  const revenueYesterdayCop = approvedYesterday.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  const usersToday = clientItems.filter((u) => dayKey(u.createDate) === todayKey).length;
  const usersYesterday = clientItems.filter((u) => dayKey(u.createDate) === yesterdayKey).length;

  const clientMap = new Map(clientItems.map((c) => [c.id, c]));
  const recentEvents = sortByDateDesc(visibleEvents, 'createDate').slice(0, 6).map((item) => {
    const stats = ordersByEvent.get(item.id) || { ticketsSold: 0 };
    const organizer = clientMap.get(item.userId);
    const organizerName = organizer
      ? [organizer.nombre || organizer.name, organizer.apellido || organizer.lastName].filter(Boolean).join(' ')
      : 'Organizador';
    const total = Number(item.aforo || 0);
    const status = normalizeEventStatus(item);
    return {
      id: item.id,
      name: item.nombre || item.name || 'Sin nombre',
      organizer: organizerName || 'Organizador',
      date: formatEventDateRange(item),
      sold: stats.ticketsSold || 0,
      total: total || stats.ticketsSold || 0,
      status: ['finalizado'].includes(status) ? 'finalizado' : 'activo',
    };
  });

  const eventNameMap = new Map(visibleEvents.map((e) => [e.id, e.nombre || e.name || 'Evento']));
  const labelMaps = { eventNameMap, venueNameMap, serviceNameMap };
  const recentTransactions = sortByDateDesc(orderItems, 'created_at').slice(0, 8).map((order) => ({
    id: order.order_id || order.orderId,
    event: resolveOrderLabel(order, labelMaps),
    label: resolveOrderLabel(order, labelMaps),
    category: resolveOrderCategory(order),
    amount: Number(order.total_amount || 0),
    type: resolveTransactionBadge(order),
    date: order.created_at || order.createdAt || '',
  }));

  const organizerStats = new Map();
  visibleEvents.forEach((item) => {
    if (!item.userId) return;
    const bucket = organizerStats.get(item.userId) || {
      userId: item.userId,
      events: 0,
      sold: 0,
      capacity: 0,
      revenueCop: 0,
    };
    bucket.events += 1;
    const orderStats = ordersByEvent.get(item.id);
    bucket.sold += orderStats?.ticketsSold || 0;
    bucket.capacity += Number(item.aforo || 0);
    bucket.revenueCop += orderStats?.grossAmount || 0;
    organizerStats.set(item.userId, bucket);
  });

  orderItems.forEach((order) => {
    if (!isApprovedOrder(order)) return;
    const type = resolveOrderType(order);
    const amount = Number(order.total_amount || 0);
    if (type === 'venue') {
      const venueId = extractOrderEntityId(order, 'venue');
      const ownerId = venueOwnerMap.get(venueId) || order.metadata?.ownerUserId;
      if (!ownerId) return;
      const bucket = organizerStats.get(ownerId) || {
        userId: ownerId,
        events: 0,
        sold: 0,
        capacity: 0,
        revenueCop: 0,
      };
      bucket.revenueCop += amount;
      organizerStats.set(ownerId, bucket);
      return;
    }
    if (type === 'service') {
      const serviceId = extractOrderEntityId(order, 'service');
      const ownerId = serviceOwnerMap.get(serviceId) || order.metadata?.providerUserId;
      if (!ownerId) return;
      const bucket = organizerStats.get(ownerId) || {
        userId: ownerId,
        events: 0,
        sold: 0,
        capacity: 0,
        revenueCop: 0,
      };
      bucket.revenueCop += amount;
      organizerStats.set(ownerId, bucket);
    }
  });

  const topOrganizers = [...organizerStats.values()]
    .sort((a, b) => b.revenueCop - a.revenueCop)
    .slice(0, 4)
    .map((row, index) => {
      const client = clientMap.get(row.userId);
      const name = client
        ? [client.nombre || client.name, client.apellido || client.lastName].filter(Boolean).join(' ')
        : row.userId;
      const occupancy = row.capacity > 0 ? Math.round((row.sold / row.capacity) * 100) : 0;
      return {
        rank: index + 1,
        name: name || 'Organizador',
        events: row.events,
        revenueCop: row.revenueCop,
        occupancy,
      };
    });

  const salesTodayByCategory = sumApprovedRevenueByCategory(orderItems, todayStart);
  const salesCountToday = countApprovedSalesByCategory(orderItems, todayStart);

  return {
    ...metrics,
    homeKpis: {
      activeEvents,
      ticketsSoldToday,
      revenueTodayCop: metrics.revenueTodayCop,
      totalUsers: metrics.totalUsers,
      salesTodayByCategory,
      salesCountToday,
      changes: {
        ticketsSoldToday: pctChange(ticketsSoldToday, ticketsSoldYesterday),
        revenueTodayCop: pctChange(metrics.revenueTodayCop, revenueYesterdayCop),
        totalUsers: pctChange(usersToday, usersYesterday),
        activeEvents: 0,
      },
    },
    recentEvents,
    recentTransactions,
    topOrganizers,
  };
}

async function getPaymentsSection() {
  const [eventItems, orderItems, clientItems, entityMaps] = await Promise.all([
    scanTable(EVENTS_TABLE, {
      projection: 'id, nombre, #name, estatus, #status, estado, fechaIni, fechaFin, userId, aforo',
      names: { '#name': 'name', '#status': 'status' },
      limit: 2000,
    }),
    scanTable(ORDERS_TABLE, {
      projection: ORDER_SCAN_PROJECTION,
      limit: 3000,
    }),
    scanClientsProjection(
      'id, email, #name, nombre, lastName, apellido, #user, username',
      { '#name': 'name', '#user': 'user' },
      2000,
    ),
    buildEntityNameMaps(),
  ]);

  const { venueNameMap, venueOwnerMap, serviceNameMap, serviceOwnerMap } = entityMaps;
  const ordersByEvent = aggregateOrdersByEvent(eventItems, orderItems, clientItems);
  const ordersByVenue = aggregateOrdersByRental(orderItems, 'venue');
  const ordersByService = aggregateOrdersByRental(orderItems, 'service');
  const clientMap = new Map(clientItems.map((c) => [c.id, c]));
  const visibleEvents = eventItems.filter((item) => !isDeletedEvent(item));

  const eventPayments = visibleEvents
    .map((item) => {
      const stats = ordersByEvent.get(item.id);
      if (!stats || (stats.ticketsSold === 0 && stats.pendingCount === 0)) return null;
      const organizer = clientMap.get(item.userId);
      const organizerName = organizer
        ? [organizer.nombre || organizer.name, organizer.apellido || organizer.lastName].filter(Boolean).join(' ')
        : 'Organizador';
      const grossAmount = stats.grossAmount;
      const commission = calcCommissionCop(grossAmount, stats.ticketsSold);
      const totalTickets = Number(item.aforo || 0) || stats.ticketsSold;
      return {
        id: `PAY-${String(item.id).slice(0, 8)}`,
        eventId: item.id,
        eventName: item.nombre || item.name || 'Sin nombre',
        saleCategory: 'evento',
        organizer: organizerName || 'Organizador',
        organizerEmail: organizer?.email || '',
        totalTickets,
        ticketsSold: stats.ticketsSold,
        occupancy: totalTickets > 0 ? Math.round((stats.ticketsSold / totalTickets) * 100) : 0,
        currency: 'COP',
        grossAmount,
        commission,
        netAmount: grossAmount - commission,
        status: resolvePaymentStatus(stats),
        eventStartDate: item.fechaIni || '',
        eventEndDate: item.fechaFin || item.fechaIni || '',
        ticketsPendingPayment: Math.max(totalTickets - stats.ticketsSold, 0),
      };
    })
    .filter(Boolean);

  const venuePayments = [...ordersByVenue.values()]
    .filter((stats) => stats.grossAmount > 0 || stats.pendingCount > 0)
    .map((stats) => {
      const ownerId = venueOwnerMap.get(stats.entityId);
      const organizer = ownerId ? clientMap.get(ownerId) : null;
      const organizerName = organizer
        ? [organizer.nombre || organizer.name, organizer.apellido || organizer.lastName].filter(Boolean).join(' ')
        : 'Propietario';
      const grossAmount = stats.grossAmount;
      const commission = calcCommissionCop(grossAmount, stats.salesCount);
      return {
        id: `PAY-VEN-${String(stats.entityId).slice(0, 8)}`,
        eventId: stats.entityId,
        eventName: venueNameMap.get(stats.entityId) || 'Reserva de lugar',
        saleCategory: 'lugar',
        organizer: organizerName || 'Propietario',
        organizerEmail: organizer?.email || '',
        totalTickets: stats.salesCount,
        ticketsSold: stats.salesCount,
        occupancy: stats.salesCount > 0 ? 100 : 0,
        currency: 'COP',
        grossAmount,
        commission,
        netAmount: grossAmount - commission,
        status: resolvePaymentStatus(stats),
        eventStartDate: '',
        eventEndDate: '',
        ticketsPendingPayment: stats.pendingCount,
      };
    });

  const servicePayments = [...ordersByService.values()]
    .filter((stats) => stats.grossAmount > 0 || stats.pendingCount > 0)
    .map((stats) => {
      const ownerId = serviceOwnerMap.get(stats.entityId);
      const organizer = ownerId ? clientMap.get(ownerId) : null;
      const organizerName = organizer
        ? [organizer.nombre || organizer.name, organizer.apellido || organizer.lastName].filter(Boolean).join(' ')
        : 'Proveedor';
      const grossAmount = stats.grossAmount;
      const commission = calcCommissionCop(grossAmount, stats.salesCount);
      return {
        id: `PAY-SVC-${String(stats.entityId).slice(0, 8)}`,
        eventId: stats.entityId,
        eventName: serviceNameMap.get(stats.entityId) || 'Reserva de servicio',
        saleCategory: 'servicio',
        organizer: organizerName || 'Proveedor',
        organizerEmail: organizer?.email || '',
        totalTickets: stats.salesCount,
        ticketsSold: stats.salesCount,
        occupancy: stats.salesCount > 0 ? 100 : 0,
        currency: 'COP',
        grossAmount,
        commission,
        netAmount: grossAmount - commission,
        status: resolvePaymentStatus(stats),
        eventStartDate: '',
        eventEndDate: '',
        ticketsPendingPayment: stats.pendingCount,
      };
    });

  const payments = [...eventPayments, ...venuePayments, ...servicePayments]
    .sort((a, b) => b.grossAmount - a.grossAmount);

  const summary = {
    pendingCop: payments.filter((p) => p.status === 'pendiente').reduce((s, p) => s + p.netAmount, 0),
    processedCop: payments.filter((p) => p.status === 'procesado').reduce((s, p) => s + p.netAmount, 0),
    disbursedCop: payments.filter((p) => p.status === 'dispersado').reduce((s, p) => s + p.netAmount, 0),
  };

  return { summary, payments };
}

async function getNewUsersSection(period = 'today') {
  const clients = await scanClientsProjection(
    'id, email, #user, username, #name, nombre, lastName, apellido, #plan, platformRole, #role, accountStatus, #status, createDate, platform, PLATFORM, platformUserId, authProvider, provider, loginProvider, accountType, calificacion, rating, pais, country, ciudad',
    {
      '#user': 'user',
      '#name': 'name',
      '#plan': 'plan',
      '#role': 'role',
      '#status': 'status',
    },
    3000,
  );

  const todayKey = dayKey(todayStartIso());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = dayKey(yesterdayDate.toISOString());

  const mapped = clients.map(mapClient).filter(Boolean).filter((u) => !isDeletedAppUser(u));

  const stats = {
    today: mapped.filter((u) => dayKeyFromCreatedAt(u.createdAt) === todayKey).length,
    yesterday: mapped.filter((u) => dayKeyFromCreatedAt(u.createdAt) === yesterdayKey).length,
    week: mapped.filter((u) => {
      const created = new Date(normalizeCreatedAt(u.createdAt) || 0).getTime();
      return created >= Date.now() - 7 * 24 * 60 * 60 * 1000;
    }).length,
  };
  stats.change = Math.round(pctChange(stats.today, stats.yesterday));

  const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dailySeries = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = dayKey(date.toISOString());
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevKey = dayKey(prevDate.toISOString());
    dailySeries.push({
      day: dayLabels[date.getDay()],
      date: key,
      current: mapped.filter((u) => dayKeyFromCreatedAt(u.createdAt) === key).length,
      previous: mapped.filter((u) => dayKeyFromCreatedAt(u.createdAt) === prevKey).length,
    });
  }

  const trend = [];
  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = dayKey(date.toISOString());
    trend.push({
      label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
      count: mapped.filter((u) => dayKeyFromCreatedAt(u.createdAt) === key).length,
    });
  }

  const periodUsers = filterUsersByPeriod(mapped, period);
  const sources = buildSourceBreakdown(periodUsers);

  const limited = sortByDateDesc(periodUsers, 'createdAt').slice(0, 100);
  const withCounts = await Promise.all(limited.map(async (user) => {
    const [eventsCount, ordersCount] = await Promise.all([
      countUserEvents(user.userId),
      countUserOrders(user.userId),
    ]);
    return { ...user, eventsCount, ticketsBought: ordersCount };
  }));

  return { stats, dailySeries, trend, sources, users: withCounts };
}

async function loadAppUsersProjection() {
  const clients = await scanClientsProjection(
    'id, email, #user, username, #name, nombre, lastName, apellido, #plan, platformRole, #role, accountStatus, #status, createDate, updatedAt',
    {
      '#user': 'user',
      '#name': 'name',
      '#plan': 'plan',
      '#role': 'role',
      '#status': 'status',
    },
    2000,
  );
  return clients.map(mapClient).filter(Boolean).filter((user) => !isDeletedAppUser(user));
}

async function getAppUsersSummary() {
  const users = await loadAppUsersProjection();
  return {
    total: users.length,
    active: users.filter((u) => String(u.status || 'active').toLowerCase() === 'active').length,
    blocked: users.filter((u) => ['blocked', 'suspended'].includes(String(u.status || '').toLowerCase())).length,
    admins: users.filter((u) => String(u.platformRole || '').toLowerCase() === 'admin').length,
    pending: users.filter((u) => u.staffStatus === 'pendiente').length,
    approved: users.filter((u) => u.staffStatus === 'aprobado').length,
    rejected: users.filter((u) => u.staffStatus === 'rechazado').length,
    closed: users.filter((u) => u.staffStatus === 'cerrado').length,
  };
}

async function listAppUsers(options = {}) {
  const limit = Math.min(Number(options.limit || 100), 200);
  const query = options.query || '';
  const users = await loadAppUsersProjection();
  const filtered = query
    ? users.filter((user) => matchesUserSearch(user, query))
    : users;
  return sortByDateDesc(filtered, 'createdAt').slice(0, limit);
}

async function listStaffUsers() {
  return listAppUsers({ limit: 200 });
}

module.exports = {
  buildDashboardMetrics,
  buildExtendedDashboard,
  buildSupportProfile,
  mapClient,
  countUserEvents,
  countUserOrders,
  countUserVenues,
  countUserServices,
  scanClientsProjection,
  listRecentEvents,
  listRecentOrders,
  listVenues,
  listServices,
  getEventsSection,
  getOrdersSection,
  getPaymentsSection,
  getNewUsersSection,
  listStaffUsers,
  listAppUsers,
  getAppUsersSummary,
  matchesUserSearch,
  normalizeSearchQuery,
  calcCommissionCop,
  orderTicketCount,
};
