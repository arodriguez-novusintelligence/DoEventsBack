/**
 * Determina si un evento permite control de acceso en vivo (escaneo QR).
 */
function parseEventDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const date = new Date(y, m, d);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function applyTimeToDate(base, time, endOfDay = false) {
  const result = new Date(base);
  if (time && String(time).trim()) {
    const [hours, minutes] = String(time).split(":").map((part) => Number(part));
    if (Number.isFinite(hours)) {
      result.setHours(hours, Number.isFinite(minutes) ? minutes : 0, 0, 0);
      return result;
    }
  }
  if (endOfDay) {
    result.setHours(23, 59, 59, 999);
  } else {
    result.setHours(0, 0, 0, 0);
  }
  return result;
}

function isEventInProgress(eventInfo) {
  const startDate = parseEventDate(eventInfo?.fechaIni || eventInfo?.fechaInicio);
  const endDate = parseEventDate(eventInfo?.fechaFin || eventInfo?.fechaIni || eventInfo?.fechaInicio);
  if (!startDate || !endDate) return false;
  const start = applyTimeToDate(startDate, eventInfo?.horaIni);
  const end = applyTimeToDate(endDate, eventInfo?.horaFin, !eventInfo?.horaFin);
  const now = new Date();
  return now >= start && now <= end;
}

function isEventPast(eventInfo) {
  const endDate = parseEventDate(eventInfo?.fechaFin || eventInfo?.fechaIni || eventInfo?.fechaInicio);
  if (!endDate) return false;
  const end = applyTimeToDate(endDate, eventInfo?.horaFin, !eventInfo?.horaFin);
  return end < new Date();
}

function resolveDisplayEventStatus(eventInfo) {
  const normalized = String(eventInfo?.estatus || "").toLowerCase().trim();
  if (["cancelado", "cancelled", "canceled"].includes(normalized)) return "cancelado";
  if (["finalizado", "finished", "completed"].includes(normalized)) return "finalizado";
  if (isEventPast(eventInfo)) return "finalizado";
  if (
    ["en_ejecucion", "en ejecucion", "ejecucion"].includes(normalized) ||
    isEventInProgress(eventInfo)
  ) {
    return "activo";
  }
  if (["activo", "active", "published"].includes(normalized)) return "activo";
  return normalized || "activo";
}

function isAccessControlEnabled(eventInfo) {
  const status = resolveDisplayEventStatus(eventInfo);
  if (status === "cancelado" || status === "finalizado") return false;
  if (isEventInProgress(eventInfo)) return true;
  return status === "activo";
}

module.exports = {
  isAccessControlEnabled,
  resolveDisplayEventStatus,
};
