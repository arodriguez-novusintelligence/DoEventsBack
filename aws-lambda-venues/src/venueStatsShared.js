const AWS = require("aws-sdk");
const { tableName } = require("./venueBookingUtils");
const { assertVenueOwnerAccess, parseAuthUserId } = require("./venuePromoCodesShared");

const doc = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "sa-east-1",
});

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function bookingStatus(booking, nowMs = Date.now()) {
  const status = String(booking?.status || "").toUpperCase();
  if (status === "CANCELLED" || status === "EXPIRED") return "cancelled";
  if (status === "CONFIRMED") return "confirmed";
  if (status === "PENDING") {
    const expires = Number(booking?.expired_at_ts || 0);
    if (expires && expires < nowMs) return "cancelled";
    return "pending";
  }
  return "cancelled";
}

function bookingDates(booking) {
  const raw = Array.isArray(booking?.selectedDates) ? booking.selectedDates : [];
  return [...new Set(raw.map((d) => String(d).slice(0, 10)).filter(Boolean))].sort();
}

function countNights(booking) {
  const dates = bookingDates(booking);
  return Math.max(1, dates.length);
}

function bookingAmount(booking) {
  const pricing = booking?.pricing || {};
  return Number(pricing.subtotalReserva || pricing.reservationValue || pricing.total || 0) || 0;
}

function bookingPaidAt(booking) {
  const raw = booking?.confirmedAt || booking?.paidAt || booking?.createdAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function guestLabel(booking) {
  const buyer = booking?.buyer || {};
  const name = String(buyer.name || buyer.fullName || buyer.displayName || "").trim();
  if (name) return name;
  const email = String(buyer.email || "").trim();
  if (email) return email.split("@")[0];
  return "Usuario";
}

function guestUserId(booking) {
  const id = booking?.userId || booking?.user_id || booking?.buyer?.userId || booking?.buyer?.id;
  return id ? String(id).trim() : null;
}

function statusLabel(status) {
  if (status === "confirmed") return "FINALIZADA";
  if (status === "pending") return "PENDIENTE";
  return "CANCELADA";
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

async function loadOwnerVenues(ownerUserId) {
  const venues = [];
  let lastKey;
  do {
    const result = await doc
      .query({
        TableName: process.env.VENUE_TABLE || "Venues-dev",
        IndexName: "ownerUserIdIndex",
        KeyConditionExpression: "ownerUserId = :ownerUserId",
        ExpressionAttributeValues: { ":ownerUserId": ownerUserId },
        ExclusiveStartKey: lastKey,
      })
      .promise();
    venues.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return venues.filter((v) => String(v.status || "").toLowerCase() !== "deleted");
}

function normalizeVenueName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function venueIdentityKey(venue) {
  const location = venue.location && typeof venue.location === "object" ? venue.location : {};
  const city = String(venue.city || location.city || "").toLowerCase().trim();
  const address = String(venue.address || location.address || "").toLowerCase().trim();
  return `${normalizeVenueName(venue.name)}|${city || address}`;
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

/** Solo lugares publicados para alquiler — excluye clones/venues creados al armar un evento. */
function isStatsEligibleVenue(venue) {
  const status = String(venue.status || "").toLowerCase();
  if (status === "deleted" || status === "archived") return false;
  if (isTruthyFlag(venue.isEventVenue) || isTruthyFlag(venue.is_event_venue)) return false;
  if (venue.eventId || venue.event_id) return false;
  if (venue.baseVenueId || venue.base_venue_id) return false;
  if (isTruthyFlag(venue.isTemplate) || isTruthyFlag(venue.is_template)) return false;
  return true;
}

function venueDisplayScore(venue, summary) {
  let score = 0;
  if (summary.receivedRevenue > 0) score += 32;
  if (summary.reservationsCount > 0) score += 16;
  if (summary.pendingRevenue > 0) score += 8;
  const images = Array.isArray(venue.images)
    ? venue.images
    : String(venue.images || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (images.length > 0 || venue.mainImage) score += 8;
  if (String(venue.status || "").toLowerCase() === "active") score += 2;
  const updatedAt = Date.parse(venue.updatedAt || venue.updated_at || "");
  if (!Number.isNaN(updatedAt)) score += updatedAt / 1e15;
  return score;
}

function groupVenuesByIdentity(venues) {
  const groups = new Map();
  venues.forEach((venue) => {
    const key = venueIdentityKey(venue);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(venue);
  });
  return groups;
}

async function resolveStatsVenueGroupIds(venueId, ownerUserId) {
  const venues = await loadOwnerVenues(ownerUserId);
  const eligible = venues.filter(isStatsEligibleVenue);
  const target = eligible.find((v) => String(v.venue_id || v.venueId) === String(venueId));
  if (!target) return [venueId];

  const key = venueIdentityKey(target);
  const ids = eligible
    .filter((v) => venueIdentityKey(v) === key)
    .map((v) => v.venue_id || v.venueId)
    .filter(Boolean);

  return ids.length ? ids : [venueId];
}

async function loadVenueBookingsForStatsGroup(venueId, ownerUserId) {
  const ids = await resolveStatsVenueGroupIds(venueId, ownerUserId);
  const batches = await Promise.all(ids.map((id) => loadVenueBookings(id)));
  const seen = new Set();
  const merged = [];
  batches.flat().forEach((booking) => {
    const key = booking.bookingId || `${booking.orderId || ""}-${booking.createdAt || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(booking);
  });
  return merged;
}

async function buildOwnerVenueStatSummaries(ownerUserId, nowMs = Date.now()) {
  const venues = await loadOwnerVenues(ownerUserId);
  const eligible = venues.filter(isStatsEligibleVenue);
  const groups = groupVenuesByIdentity(eligible);
  const summaries = [];

  for (const group of groups.values()) {
    const rows = await Promise.all(
      group.map(async (venue) => {
        const venueId = venue.venue_id || venue.venueId;
        const bookings = await loadVenueBookings(venueId);
        return { venue, bookings, summary: mapVenueSummary(venue, bookings, nowMs) };
      }),
    );

    rows.sort((a, b) => venueDisplayScore(b.venue, b.summary) - venueDisplayScore(a.venue, a.summary));
    const primary = rows[0];
    const allBookings = rows.flatMap((row) => row.bookings);
    summaries.push(mapVenueSummary(primary.venue, allBookings, nowMs));
  }

  summaries.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return summaries;
}

function summarizeBookings(bookings, nowMs = Date.now()) {
  const active = bookings.filter((b) => bookingStatus(b, nowMs) !== "cancelled");
  const nights = active.reduce((sum, b) => sum + countNights(b), 0);
  const confirmed = active.filter((b) => bookingStatus(b, nowMs) === "confirmed");
  const avgStay = confirmed.length > 0
    ? Number((nights / confirmed.length).toFixed(1))
    : 0;

  const yearStart = new Date();
  yearStart.setMonth(0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const daysInYear = Math.max(
    1,
    Math.ceil((nowMs - yearStart.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const bookedDaysYtd = new Set();
  active.forEach((booking) => {
    bookingDates(booking).forEach((date) => {
      if (date.startsWith(String(yearStart.getFullYear()))) bookedDaysYtd.add(date);
    });
  });
  const occupancyPercent = Math.min(100, Math.round((bookedDaysYtd.size / daysInYear) * 100));

  return {
    nights,
    avgStay,
    occupancyPercent,
    reservationsCount: active.length,
    receivedRevenue: confirmed.reduce((sum, b) => sum + bookingAmount(b), 0),
    pendingRevenue: active
      .filter((b) => bookingStatus(b, nowMs) === "pending")
      .reduce((sum, b) => sum + bookingAmount(b), 0),
  };
}

function buildMonthlySeries(bookings, year, nowMs = Date.now()) {
  const months = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    label: MONTH_LABELS[idx],
    received: 0,
    pending: 0,
  }));

  bookings.forEach((booking) => {
    const status = bookingStatus(booking, nowMs);
    if (status === "cancelled") return;
    const paidAt = bookingPaidAt(booking);
    if (!paidAt || paidAt.getFullYear() !== year) return;
    const amount = bookingAmount(booking);
    const bucket = months[paidAt.getMonth()];
    if (status === "confirmed") bucket.received += amount;
    else bucket.pending += amount;
  });

  return months;
}

function buildComparisonSeries(bookings, currentYear, nowMs = Date.now()) {
  const current = buildMonthlySeries(bookings, currentYear, nowMs).map((m) => ({
    month: m.month,
    label: m.label,
    total: m.received + m.pending,
  }));
  const previous = buildMonthlySeries(bookings, currentYear - 1, nowMs).map((m) => ({
    month: m.month,
    label: m.label,
    total: m.received + m.pending,
  }));
  return current.map((row, idx) => ({
    month: row.month,
    label: row.label,
    current: row.total,
    previous: previous[idx]?.total || 0,
  }));
}

function buildCalendar(bookings, year, month, nowMs = Date.now()) {
  const reservedDates = new Set();
  bookings.forEach((booking) => {
    if (bookingStatus(booking, nowMs) === "cancelled") return;
    bookingDates(booking).forEach((date) => {
      const [y, m] = date.split("-").map(Number);
      if (y === year && m === month) reservedDates.add(date);
    });
  });
  return {
    year,
    month,
    nights: reservedDates.size,
    reservedDates: [...reservedDates].sort(),
  };
}

function buildMonthReservations(bookings, year, month, nowMs = Date.now()) {
  return bookings
    .map((booking) => {
      const status = bookingStatus(booking, nowMs);
      if (status === "cancelled") return null;
      const dates = bookingDates(booking);
      const inMonth = dates.filter((date) => {
        const [y, m] = date.split("-").map(Number);
        return y === year && m === month;
      });
      if (!inMonth.length) return null;
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];
      return {
        bookingId: booking.bookingId,
        guestName: guestLabel(booking),
        guestUserId: guestUserId(booking),
        startDate,
        endDate,
        nights: countNights(booking),
        amount: bookingAmount(booking),
        status: booking.status,
        statusLabel: statusLabel(status),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mapVenueSummary(venue, bookings, nowMs = Date.now()) {
  const summary = summarizeBookings(bookings, nowMs);
  const images = Array.isArray(venue.images)
    ? venue.images
    : String(venue.images || "").split(",").map((s) => s.trim()).filter(Boolean);
  const location = venue.location && typeof venue.location === "object" ? venue.location : {};
  return {
    venueId: venue.venue_id || venue.venueId,
    name: venue.name || "Lugar",
    imageUrl: images[0] || venue.mainImage || null,
    city: venue.city || location.city || "",
    address: venue.address || location.address || "",
    status: String(venue.status || "active").toLowerCase(),
    ...summary,
  };
}

function buildVenueStatisticsPayload(venue, bookings, { year, month }, nowMs = Date.now()) {
  const summary = summarizeBookings(bookings, nowMs);
  const monthly = buildMonthlySeries(bookings, year, nowMs);
  const comparison = buildComparisonSeries(bookings, year, nowMs);
  const selected = monthly[month - 1] || { received: 0, pending: 0 };
  const previousYearMonth = buildMonthlySeries(bookings, year - 1, nowMs)[month - 1] || {
    received: 0,
    pending: 0,
  };

  return {
    venueId: venue.venue_id || venue.venueId,
    venueName: venue.name || "Lugar",
    currency: "COP",
    summary,
    year,
    month,
    monthly,
    comparison: {
      currentYear: year,
      previousYear: year - 1,
      series: comparison,
    },
    selectedMonth: {
      received: selected.received,
      pending: selected.pending,
      total: selected.received + selected.pending,
      previousYearTotal: (previousYearMonth.received || 0) + (previousYearMonth.pending || 0),
    },
    calendar: buildCalendar(bookings, year, month, nowMs),
    reservations: buildMonthReservations(bookings, year, month, nowMs),
  };
}

function buildExportRows(bookings, nowMs = Date.now()) {
  const rows = [];
  bookings.forEach((booking) => {
    const status = bookingStatus(booking, nowMs);
    if (status === "cancelled") return;
    const gross = bookingAmount(booking);
    const commission = Number(booking?.pricing?.commission || 0) + Number(booking?.pricing?.commissionIva || 0);
    const net = Math.max(0, gross - commission);
    const paidAt = bookingPaidAt(booking);
    rows.push({
      paidAt: paidAt ? paidAt.toISOString().slice(0, 10) : "",
      guestName: guestLabel(booking),
      gross,
      commission,
      net,
      currency: "COP",
      nights: countNights(booking),
      status: statusLabel(status),
      detail: `${paidAt ? paidAt.toLocaleDateString("es-CO") : ""} · ${guestLabel(booking)} · ${gross.toLocaleString("es-CO")} COP`,
    });
  });
  return rows.sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

module.exports = {
  MONTH_LABELS,
  parseAuthUserId,
  assertVenueOwnerAccess,
  loadVenueBookings,
  loadVenueBookingsForStatsGroup,
  loadOwnerVenues,
  summarizeBookings,
  mapVenueSummary,
  buildOwnerVenueStatSummaries,
  buildVenueStatisticsPayload,
  buildExportRows,
};
