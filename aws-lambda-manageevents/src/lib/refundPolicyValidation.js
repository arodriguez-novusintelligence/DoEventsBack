const VALID_REFUND_CATEGORIES = new Set(["1", "7", "30", "0", "N"]);

function normalizeRefundCategory(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toUpperCase();
}

function isValidRefundCategory(value) {
  return VALID_REFUND_CATEGORIES.has(normalizeRefundCategory(value));
}

function assertRefundCategoryConfigured(value) {
  const normalized = normalizeRefundCategory(value);
  if (!normalized) {
    const error = new Error(
      "La política de reembolsos es obligatoria. Configúrala antes de publicar el evento.",
    );
    error.statusCode = 400;
    throw error;
  }
  if (!isValidRefundCategory(normalized)) {
    const error = new Error(
      "La categoría de reembolso no es válida. Valores permitidos: 1, 7, 30, 0, N.",
    );
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

module.exports = {
  VALID_REFUND_CATEGORIES,
  normalizeRefundCategory,
  isValidRefundCategory,
  assertRefundCategoryConfigured,
};
