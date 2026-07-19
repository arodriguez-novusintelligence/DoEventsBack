const { tableName } = require("./serviceBookingUtils");
const {
  assertServiceOwnerAccess,
  parseAuthUserId,
  dynamodb,
} = require("./servicePromoCodesShared");

const SERVICES_TABLE = process.env.SERVICES_TABLE || "ServiceProviders-dev";
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

function bookingDates(booking) {
  if (Array.isArray(booking?.selectedDates) && booking.selectedDates.length) {
    return [...new Set(booking.selectedDates.map((d) => String(d).slice(0, 10)).filter(Boolean))].sort();
  }
  if (booking?.startDate && booking?.endDate) {
    return expandDateSpan(booking.startDate, booking.endDate);
  }
  if (booking?.startDate) return [String(booking.startDate).slice(0, 10)];
  return [];
}

function countDays(booking) {
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

async function loadServiceBookings(serviceId) {
  const result = await dynamodb
    .query({
      TableName: tableName("SERVICE_BOOKINGS_TABLE", "ServiceBookings"),
      KeyConditionExpression: "serviceId = :serviceId",
      ExpressionAttributeValues: { ":serviceId": serviceId },
    })
    .promise();
  return result.Items || [];
}

async function loadOwnerServices(ownerUserId) {
  const items = [];
  let lastKey;
  do {
    const result = await dynamodb
      .query({
        TableName: SERVICES_TABLE,
        IndexName: "userIdIndex",
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": ownerUserId },
        ExclusiveStartKey: lastKey,
      })
      .promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items.filter((s) => String(s.status || "").toLowerCase() !== "deleted");
}

function summarizeBookings(bookings, nowMs = Date.now()) {
  const active = bookings.filter((b) => bookingStatus(b, nowMs) !== "cancelled");
  const days = active.reduce((sum, b) => sum + countDays(b), 0);
  const confirmed = active.filter((b) => bookingStatus(b, nowMs) === "confirmed");
  const avgStay = confirmed.length > 0
    ? Number((days / confirmed.length).toFixed(1))
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
    nights: days,
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
      return {
        bookingId: booking.bookingId,
        guestName: guestLabel(booking),
        guestUserId: guestUserId(booking),
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        nights: countDays(booking),
        amount: bookingAmount(booking),
        status: booking.status,
        statusLabel: statusLabel(status),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mapServiceSummary(service, bookings, nowMs = Date.now()) {
  const summary = summarizeBookings(bookings, nowMs);
  const gallery = Array.isArray(service.gallery) ? service.gallery : [];
  return {
    serviceId: service.serviceId,
    name: service.businessName || service.name || service.providerName || "Servicio",
    imageUrl: service.profileImageUrl || gallery[0] || null,
    city: service.city || "",
    address: service.address || "",
    status: String(service.status || "active").toLowerCase(),
    ...summary,
  };
}

function buildServiceStatisticsPayload(service, bookings, { year, month }, nowMs = Date.now()) {
  const summary = summarizeBookings(bookings, nowMs);
  const monthly = buildMonthlySeries(bookings, year, nowMs);
  const comparison = buildComparisonSeries(bookings, year, nowMs);
  const selected = monthly[month - 1] || { received: 0, pending: 0 };
  const previousYearMonth = buildMonthlySeries(bookings, year - 1, nowMs)[month - 1] || {
    received: 0,
    pending: 0,
  };

  return {
    serviceId: service.serviceId,
    serviceName: service.businessName || service.name || "Servicio",
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
      nights: countDays(booking),
      status: statusLabel(status),
      detail: `${paidAt ? paidAt.toLocaleDateString("es-CO") : ""} · ${guestLabel(booking)} · ${gross.toLocaleString("es-CO")} COP`,
    });
  });
  return rows.sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

module.exports = {
  MONTH_LABELS,
  parseAuthUserId,
  assertServiceOwnerAccess,
  loadServiceBookings,
  loadOwnerServices,
  mapServiceSummary,
  buildServiceStatisticsPayload,
  buildExportRows,
};
