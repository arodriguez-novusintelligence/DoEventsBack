const AWS = require("aws-sdk");
const { randomUUID } = require("crypto");

const doc = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const COMMISSION_RATE = 0.12;
const IVA_RATE = 0.19;
const TTL_MINUTES = 15;

function tableName(envKey, fallback) {
  return process.env[envKey] || fallback;
}

function parsePrice(value) {
  if (value == null) return 0;
  const normalized = String(value).replace(/[^\d.-]/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
}

function expandDateSpan(startDate, endDate) {
  const dates = [];
  const start = new Date(`${String(startDate).slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${String(endDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return dates;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function expandDateRange(dates = []) {
  const expanded = new Set();
  for (const entry of dates) {
    if (!entry) continue;
    const value = String(entry);
    if (value.includes("..")) {
      const [start, end] = value.split("..");
      expandDateSpan(start, end).forEach((d) => expanded.add(d));
    } else {
      expanded.add(value.slice(0, 10));
    }
  }
  return expanded;
}

function resolveServicePricePerDay(service, activityKey) {
  const pricing = service.pricing || {};
  if (activityKey && pricing[activityKey]) {
    const cost = parsePrice(pricing[activityKey]?.cost ?? pricing[activityKey]?.price);
    if (cost > 0) return Math.round(cost);
  }
  if (service.minPrice != null && Number(service.minPrice) > 0) {
    return Math.round(Number(service.minPrice));
  }
  let max = 0;
  Object.values(pricing).forEach((p) => {
    const cost = parsePrice(p?.cost ?? p?.price);
    if (cost > max) max = cost;
  });
  return max;
}

function computeBookingTotals({ pricePerDay, numDays, additionalServices = [] }) {
  const days = Math.max(1, numDays);
  const reservationValue = pricePerDay * days;
  const servicesTotal = additionalServices.reduce((acc, s) => {
    const price = parsePrice(s.pricePerDay ?? s.price);
    const qty = Math.max(0, Number(s.quantity) || 0);
    return acc + price * qty * days;
  }, 0);
  const subtotalReserva = reservationValue + servicesTotal;
  const commission = Math.round(subtotalReserva * COMMISSION_RATE);
  const commissionIva = Math.round(commission * IVA_RATE);
  const total = subtotalReserva + commission + commissionIva;
  return {
    reservationValue,
    servicesTotal,
    subtotalReserva,
    commission,
    commissionIva,
    total,
    numDays: days,
  };
}

async function loadServiceBookings(serviceId) {
  const result = await doc
    .query({
      TableName: tableName("SERVICE_BOOKINGS_TABLE", "ServiceBookings"),
      KeyConditionExpression: "serviceId = :serviceId",
      ExpressionAttributeValues: { ":serviceId": serviceId },
    })
    .promise();
  return result.Items || [];
}

function getActiveBookedDates(bookings, nowMs = Date.now()) {
  const booked = new Set();
  for (const booking of bookings) {
    const status = String(booking.status || "").toUpperCase();
    if (status === "CANCELLED" || status === "EXPIRED") continue;
    if (status === "PENDING") {
      const expires = Number(booking.expired_at_ts || 0);
      if (expires && expires < nowMs) continue;
    }
    const span =
      booking.selectedDates?.length
        ? booking.selectedDates
        : expandDateSpan(booking.startDate, booking.endDate);
    span.forEach((date) => booked.add(String(date).slice(0, 10)));
  }
  return booked;
}

function validateDateRange({ startDate, endDate, blockedDates, bookedDates }) {
  if (!startDate || !endDate) {
    return { ok: false, error: "startDate y endDate son requeridos" };
  }
  const dates = expandDateSpan(startDate, endDate);
  if (!dates.length) {
    return { ok: false, error: "Rango de fechas inválido" };
  }
  const blocked = expandDateRange(blockedDates || []);
  const today = new Date().toISOString().slice(0, 10);
  for (const date of dates) {
    if (date < today) {
      return { ok: false, error: "No puedes reservar fechas pasadas" };
    }
    if (blocked.has(date)) {
      return { ok: false, error: `La fecha ${date} no está disponible` };
    }
    if (bookedDates.has(date)) {
      return { ok: false, error: `La fecha ${date} ya está reservada` };
    }
  }
  return { ok: true, dates, startDate: dates[0], endDate: dates[dates.length - 1] };
}

function buildMonthAvailability({ year, month, pricePerDay, blockedDates, bookedDates }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const blocked = expandDateRange(blockedDates || []);
  const days = {};

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dateObj = new Date(`${iso}T12:00:00`);
    let status = "available";
    if (dateObj < today) status = "unavailable";
    else if (blocked.has(iso)) status = "unavailable";
    else if (bookedDates.has(iso)) status = "reserved";
    days[iso] = { status, pricePerDay };
  }

  return days;
}

async function createServiceBookingRecord({
  serviceId,
  service,
  userId,
  startDate,
  endDate,
  selectedDates,
  additionalServices,
  buyer,
  totals,
  activityKey,
  activityName,
}) {
  const now = new Date();
  const bookingId = randomUUID();
  const orderId = `SVC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = now.toISOString();
  const created_at_ts = now.getTime();
  const expired_at_ts = created_at_ts + TTL_MINUTES * 60 * 1000;
  const ttl = Math.floor(expired_at_ts / 1000);

  const bookingItem = {
    serviceId,
    bookingId,
    orderId,
    userId,
    providerUserId: service.userId,
    serviceName: service.name || "Servicio",
    status: "PENDING",
    startDate,
    endDate,
    selectedDates,
    additionalServices: additionalServices || [],
    buyer: buyer || {},
    activityKey: activityKey || null,
    activityName: activityName || null,
    pricing: totals,
    createdAt,
    created_at_ts,
    expired_at_ts,
    ttl,
  };

  const orderItem = {
    order_id: orderId,
    order_type: "SERVICE_RENTAL",
    created_at: createdAt,
    created_at_ts,
    expired_at_ts,
    status: "PENDING",
    payment_status: "PENDING",
    event_id: `service:${serviceId}`,
    user_id: userId,
    customer_email: buyer?.email || null,
    hasSeating: false,
    tickets: [],
    total_ticket_amount: totals.subtotalReserva,
    total_additional_charges: totals.commission + totals.commissionIva,
    total_amount: totals.total,
    metadata: {
      orderType: "SERVICE_RENTAL",
      serviceId,
      bookingId,
      serviceName: service.name || "Servicio",
      startDate,
      endDate,
      selectedDates,
      additionalServices: additionalServices || [],
      buyer: buyer || {},
      activityKey: activityKey || null,
      activityName: activityName || null,
      userID: userId,
      pricing: totals,
    },
  };

  await doc
    .put({
      TableName: tableName("SERVICE_BOOKINGS_TABLE", "ServiceBookings"),
      Item: bookingItem,
      ConditionExpression: "attribute_not_exists(bookingId)",
    })
    .promise();

  await doc
    .put({
      TableName: tableName("ORDERS_TABLE", "Orders"),
      Item: orderItem,
    })
    .promise();

  return {
    bookingId,
    orderId,
    booking: bookingItem,
    order: orderItem,
    expired_at_ts,
  };
}

module.exports = {
  COMMISSION_RATE,
  IVA_RATE,
  TTL_MINUTES,
  tableName,
  parsePrice,
  expandDateSpan,
  expandDateRange,
  resolveServicePricePerDay,
  computeBookingTotals,
  loadServiceBookings,
  getActiveBookedDates,
  validateDateRange,
  buildMonthAvailability,
  createServiceBookingRecord,
};
