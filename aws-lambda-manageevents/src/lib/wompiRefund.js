const axios = require("axios");

/**
 * Resuelve el ID de transacción Wompi guardado en la orden.
 */
function resolveWompiTransactionId(order = {}) {
  const paymentData = order.payment_data || {};
  const paymentMethod = order.payment_method || {};
  const methodExtra = paymentMethod.extra || {};

  const candidates = [
    paymentData.transactionId,
    paymentData.transaction_id,
    paymentData.id,
    order.transactionId,
    order.transaction_id,
    order.payment_id,
    paymentMethod.transactionId,
    paymentMethod.transaction_id,
    methodExtra.transactionId,
    methodExtra.transaction_id,
  ];

  for (const value of candidates) {
    const id = String(value || "").trim();
    if (id) return id;
  }
  return null;
}

function isFreeOrZeroOrder(order = {}, refundAmount = 0) {
  const total = Number(
    order.total_amount ?? order.amount ?? order.total ?? refundAmount ?? 0,
  );
  return !Number.isFinite(total) || total <= 0 || Number(refundAmount) <= 0;
}

/**
 * Anula una transacción en Wompi (tarjeta).
 * POST /v1/transactions/{id}/void
 *
 * @returns {{ attempted: boolean, success: boolean, skipped?: boolean, reason?: string, status?: string, transactionId?: string, error?: string, raw?: any }}
 */
async function voidWompiTransaction(transactionId) {
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  const apiBase =
    process.env.WOMPI_API_BASE_URL || "https://sandbox.wompi.co/v1";

  if (!privateKey) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "wompi_credentials_missing",
      transactionId,
    };
  }

  if (!transactionId) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "missing_transaction_id",
    };
  }

  try {
    const url = `${apiBase.replace(/\/$/, "")}/transactions/${encodeURIComponent(transactionId)}/void`;
    console.log(`💳 Wompi void → ${url}`);
    const response = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${privateKey}`,
          "Content-Type": "application/json",
        },
        timeout: 25000,
        validateStatus: () => true,
      },
    );

    const data = response.data?.data || response.data || {};
    const status = String(data.status || "").toUpperCase();

    if (response.status >= 200 && response.status < 300) {
      const ok = !status || status === "VOIDED" || status === "APPROVED";
      return {
        attempted: true,
        success: ok,
        status: status || "VOIDED",
        transactionId,
        raw: data,
        reason: ok ? "voided" : `unexpected_status_${status || "unknown"}`,
      };
    }

    const errMsg =
      response.data?.error?.reason ||
      response.data?.error?.messages ||
      response.data?.message ||
      `http_${response.status}`;

    return {
      attempted: true,
      success: false,
      status: status || null,
      transactionId,
      error: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg),
      raw: response.data,
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      transactionId,
      error: error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message,
    };
  }
}

/**
 * Intenta devolver el dinero del reembolso vía Wompi.
 * - Órdenes gratis / monto 0 → COMPLETED sin llamar pasarela
 * - Reembolso FULL con transactionId → void
 * - Parcial / sin tx → queda PENDING (void Wompi es total y solo tarjeta)
 */
async function processPaymentRefund({
  order,
  isFullRefund,
  refundAmount,
}) {
  if (isFreeOrZeroOrder(order, refundAmount)) {
    return {
      attempted: false,
      success: true,
      skipped: true,
      reason: "zero_amount_no_gateway",
      refundStatus: "COMPLETED",
    };
  }

  const transactionId = resolveWompiTransactionId(order);
  if (!transactionId) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "missing_transaction_id",
      refundStatus: "PENDING",
    };
  }

  if (!isFullRefund) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "partial_refund_requires_manual_gateway",
      transactionId,
      refundStatus: "PENDING",
    };
  }

  const voidResult = await voidWompiTransaction(transactionId);
  return {
    ...voidResult,
    refundStatus: voidResult.success ? "COMPLETED" : "PENDING",
  };
}

module.exports = {
  resolveWompiTransactionId,
  voidWompiTransaction,
  processPaymentRefund,
  isFreeOrZeroOrder,
};
