const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

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

function parseVenueAmenities(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toIsoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function expandDateRange(dates = []) {
  const expanded = new Set();
  for (const entry of dates) {
    if (!entry) continue;
    if (Array.isArray(entry)) {
      entry.forEach((d) => expanded.add(String(d)));
      continue;
    }
    const value = String(entry);
    if (value.includes("..")) {
      const [start, end] = value.split("..");
      const startDate = new Date(`${start}T12:00:00Z`);
      const endDate = new Date(`${end}T12:00:00Z`);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;
      for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
        expanded.add(d.toISOString().slice(0, 10));
      }
    } else {
      expanded.add(value.slice(0, 10));
    }
  }
  return expanded;
}

function computeBookingTotals({ pricePerDay, numDays, services = [] }) {
  const days = Math.max(1, numDays);
  const reservationValue = pricePerDay * days;
  const servicesTotal = services.reduce((acc, s) => {
    const price = parsePrice(s.price);
    const qty = Math.max(1, Number(s.quantity) || 1);
    const multiplier = s.unit === "día" || s.unit === "dia" ? days : 1;
    return acc + price * qty * multiplier;
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

async function loadVenueBookings(venueId) {
  const result = await doc
    .query({
      TableName: tableName("VENUE_BOOKINGS_TABLE", "VenueBookings"),
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: { ":venueId": venueId },
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
    for (const date of booking.selectedDates || []) {
      booked.add(String(date).slice(0, 10));
    }
  }
  return booked;
}

function validateSelectedDates({ selectedDates, blockedDates, bookedDates }) {
  const unique = [...new Set((selectedDates || []).map((d) => String(d).slice(0, 10)))];
  if (!unique.length) {
    return { ok: false, error: "Debes seleccionar al menos una fecha" };
  }
  const blocked = expandDateRange(blockedDates || []);
  for (const date of unique) {
    if (blocked.has(date)) {
      return { ok: false, error: `La fecha ${date} no está disponible` };
    }
    if (bookedDates.has(date)) {
      return { ok: false, error: `La fecha ${date} ya está reservada` };
    }
  }
  return { ok: true, dates: unique.sort() };
}

async function createVenueBookingRecord({
  venueId,
  venue,
  userId,
  selectedDates,
  services,
  buyer,
  totals,
}) {
  const now = new Date();
  const bookingId = uuidv4();
  const orderId = `VEN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = now.toISOString();
  const created_at_ts = now.getTime();
  const expired_at_ts = created_at_ts + TTL_MINUTES * 60 * 1000;
  const ttl = Math.floor(expired_at_ts / 1000);

  const bookingItem = {
    venueId,
    bookingId,
    orderId,
    userId,
    ownerUserId: venue.ownerUserId || venue.owner_user_id || null,
    venueName: venue.name || "Lugar",
    status: "PENDING",
    selectedDates,
    services: services || [],
    buyer: buyer || {},
    pricing: totals,
    createdAt,
    created_at_ts,
    expired_at_ts,
    ttl,
  };

  const orderItem = {
    order_id: orderId,
    order_type: "VENUE_RENTAL",
    created_at: createdAt,
    created_at_ts,
    expired_at_ts,
    status: "PENDING",
    payment_status: "PENDING",
    event_id: `venue:${venueId}`,
    user_id: userId,
    customer_email: buyer?.email || null,
    hasSeating: false,
    tickets: [],
    total_ticket_amount: totals.subtotalReserva,
    total_additional_charges: totals.commission + totals.commissionIva,
    total_amount: totals.total,
    metadata: {
      orderType: "VENUE_RENTAL",
      venueId,
      bookingId,
      venueName: venue.name || "Lugar",
      selectedDates,
      services: services || [],
      buyer: buyer || {},
      userID: userId,
      pricing: totals,
    },
  };

  await doc
    .put({
      TableName: tableName("VENUE_BOOKINGS_TABLE", "VenueBookings"),
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

async function confirmVenueBookingByOrderId(orderId) {
  const bookingsTable = tableName("VENUE_BOOKINGS_TABLE", "VenueBookings");
  const scan = await doc
    .scan({
      TableName: bookingsTable,
      FilterExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
    })
    .promise();

  const booking = (scan.Items || [])[0];
  if (!booking) return null;

  await doc
    .update({
      TableName: bookingsTable,
      Key: { venueId: booking.venueId, bookingId: booking.bookingId },
      UpdateExpression: "SET #status = :status, confirmedAt = :confirmedAt REMOVE #ttl",
      ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":status": "CONFIRMED",
        ":confirmedAt": new Date().toISOString(),
      },
    })
    .promise();

  return { ...booking, status: "CONFIRMED" };
}

async function cancelVenueBookingByOrderId(orderId, status = "CANCELLED") {
  const bookingsTable = tableName("VENUE_BOOKINGS_TABLE", "VenueBookings");
  const scan = await doc
    .scan({
      TableName: bookingsTable,
      FilterExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
    })
    .promise();

  const booking = (scan.Items || [])[0];
  if (!booking) return null;

  await doc
    .update({
      TableName: bookingsTable,
      Key: { venueId: booking.venueId, bookingId: booking.bookingId },
      UpdateExpression: "SET #status = :status, cancelledAt = :cancelledAt REMOVE #ttl",
      ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":status": status,
        ":cancelledAt": new Date().toISOString(),
      },
    })
    .promise();

  return { ...booking, status };
}

function buildMonthAvailability({ year, month, pricePerDay, blockedDates, bookedDates, datePrices = {} }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const blocked = expandDateRange(blockedDates || []);
  const days = {};

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toIsoDate(year, month, day);
    const dateObj = new Date(`${iso}T12:00:00`);
    const override = datePrices[iso] || {};
    let status = "available";
    if (dateObj < today) status = "unavailable";
    else if (override.blocked || blocked.has(iso)) status = "unavailable";
    else if (bookedDates.has(iso)) status = "reserved";
    const dayPrice = override.price != null && String(override.price).trim()
      ? parsePrice(override.price)
      : pricePerDay;
    days[iso] = { status, pricePerDay: dayPrice };
  }

  return days;
}

function resolveDayPrice(isoDate, basePricePerDay, datePrices = {}) {
  const override = datePrices[isoDate] || {};
  if (override.price != null && String(override.price).trim()) {
    return parsePrice(override.price);
  }
  return basePricePerDay;
}

function computeBookingTotalsFromDates({ dates, basePricePerDay, datePrices = {}, services = [] }) {
  const uniqueDates = [...new Set((dates || []).map((d) => String(d).slice(0, 10)))].sort();
  const reservationValue = uniqueDates.reduce(
    (sum, date) => sum + resolveDayPrice(date, basePricePerDay, datePrices),
    0,
  );
  const days = Math.max(1, uniqueDates.length);
  const servicesTotal = services.reduce((acc, s) => {
    const price = parsePrice(s.price);
    const qty = Math.max(1, Number(s.quantity) || 1);
    const multiplier = s.unit === "día" || s.unit === "dia" ? days : 1;
    return acc + price * qty * multiplier;
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

module.exports = {
  COMMISSION_RATE,
  IVA_RATE,
  TTL_MINUTES,
  tableName,
  parsePrice,
  parseVenueAmenities,
  computeBookingTotals,
  loadVenueBookings,
  getActiveBookedDates,
  validateSelectedDates,
  createVenueBookingRecord,
  confirmVenueBookingByOrderId,
  cancelVenueBookingByOrderId,
  buildMonthAvailability,
  expandDateRange,
  resolveDayPrice,
  computeBookingTotalsFromDates,
};
