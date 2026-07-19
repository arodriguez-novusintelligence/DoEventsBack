const {
  normalizeRefundCategory,
  isValidRefundCategory,
} = require("./refundPolicyValidation");

/**
 * Diferencia en días calendario entre hoy (YYYYMMDD) y la fecha del evento.
 * @returns {number} Días restantes (0 = hoy es el día del evento).
 */
function calculateDaysUntilEvent(currentDate, eventDate) {
  const parseDate = (dateStr) => {
    if (!dateStr || String(dateStr).length !== 8) {
      throw new Error("Formato de fecha inválido. Debe ser YYYYMMDD");
    }
    const normalized = String(dateStr);
    const year = parseInt(normalized.substring(0, 4), 10);
    const month = parseInt(normalized.substring(4, 6), 10) - 1;
    const day = parseInt(normalized.substring(6, 8), 10);
    return new Date(year, month, day);
  };

  const current = parseDate(currentDate);
  const event = parseDate(eventDate);
  const diffTime = event.getTime() - current.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Evalúa si aplica reembolso según categoriaReembolso y días restantes.
 * "Hasta N días antes" => permitido mientras falten N días o más (>= N).
 */
function evaluateRefundEligibility({
  categoriaReembolso,
  currentDate,
  eventDate,
}) {
  if (!eventDate) {
    return {
      canRequestRefund: false,
      requiresManualReview: false,
      reason: "El evento no tiene fecha de inicio definida",
      statusCode: 400,
    };
  }

  const category = normalizeRefundCategory(categoriaReembolso);
  if (!category) {
    return {
      canRequestRefund: false,
      requiresManualReview: false,
      reason:
        "Este evento no tiene configurada una política de reembolsos. Contacta al organizador.",
      statusCode: 400,
    };
  }

  if (!isValidRefundCategory(category)) {
    return {
      canRequestRefund: false,
      requiresManualReview: false,
      reason: `Política de reembolsos inválida (${category}).`,
      statusCode: 400,
    };
  }

  let daysUntilEvent;
  try {
    daysUntilEvent = calculateDaysUntilEvent(currentDate, eventDate);
  } catch (error) {
    return {
      canRequestRefund: false,
      requiresManualReview: false,
      reason: `Error al procesar fechas: ${error.message}`,
      statusCode: 400,
    };
  }

  if (daysUntilEvent < 0) {
    return {
      canRequestRefund: false,
      requiresManualReview: false,
      daysUntilEvent,
      refundCategory: category,
      reason: "El evento ya finalizó. No es posible solicitar reembolso.",
      statusCode: 400,
    };
  }

  switch (category) {
    case "N":
      return {
        canRequestRefund: false,
        requiresManualReview: false,
        daysUntilEvent,
        refundCategory: category,
        reason: "Este evento no permite solicitudes de reembolso.",
        statusCode: 200,
      };

    case "0":
      return {
        canRequestRefund: false,
        requiresManualReview: true,
        daysUntilEvent,
        refundCategory: category,
        reason:
          "Las solicitudes de reembolso para este evento se evalúan caso a caso. Contacta al organizador.",
        statusCode: 200,
      };

    case "1":
    case "7":
    case "30": {
      const requiredDays = parseInt(category, 10);
      const canRequestRefund = daysUntilEvent >= requiredDays;
      if (canRequestRefund) {
        return {
          canRequestRefund: true,
          requiresManualReview: false,
          daysUntilEvent,
          refundCategory: category,
          reason: `Puedes solicitar reembolso. Faltan ${daysUntilEvent} día(s) para el evento (política: hasta ${requiredDays} día(s) antes).`,
          statusCode: 200,
        };
      }
      return {
        canRequestRefund: false,
        requiresManualReview: false,
        daysUntilEvent,
        refundCategory: category,
        reason: `No puedes solicitar reembolso. Faltan ${daysUntilEvent} día(s) para el evento y la política exige solicitarlo al menos ${requiredDays} día(s) antes.`,
        statusCode: 200,
      };
    }

    default:
      return {
        canRequestRefund: false,
        requiresManualReview: false,
        reason: `Categoría de reembolso no válida: ${category}.`,
        statusCode: 400,
      };
  }
}

module.exports = {
  calculateDaysUntilEvent,
  evaluateRefundEligibility,
};
