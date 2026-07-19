const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "src", "processRefund.js");
let s = fs.readFileSync(filePath, "utf8");

if (!s.includes('require("./lib/wompiRefund")')) {
  s = s.replace(
    'const { evaluateRefundEligibility } = require("./lib/refundEligibility");',
    'const { evaluateRefundEligibility } = require("./lib/refundEligibility");\nconst { processPaymentRefund } = require("./lib/wompiRefund");',
  );
}

s = s.replace(
  'refundStatus: "PENDING", // Campo estándar de ticketsCancelation',
  'refundStatus: refundData.refundStatus || "PENDING",',
);

if (!s.includes("payment_refund: refundData.paymentRefund")) {
  s = s.replace(
    'originalStatus: "APPROVED",\n    };',
    'originalStatus: "APPROVED",\n      payment_refund: refundData.paymentRefund || null,\n    };',
  );
}

const startMarker = "const updateOrderStatus = async (";
const endMarker = "exports.processRefund = async (event) => {";
const startIdx = s.indexOf(startMarker);
const endIdx = s.indexOf(endMarker);
if (startIdx < 0 || endIdx < 0) {
  console.error("markers not found", { startIdx, endIdx });
  process.exit(1);
}

const newBlock = `const updateOrderStatus = async (
  orderId,
  isFullRefund,
  refundedQuantity,
  refundAmount,
  refundedTicketIds = [],
  platformFee = 0,
  refundStatus = "PENDING",
  paymentRefund = null,
) => {
  console.log(
    \`🔄 Actualizando orden \${orderId} (\${isFullRefund ? "FULL" : "PARTIAL"} refund, status=\${refundStatus})...\`,
  );

  try {
    const orderResult = await dynamodb.send(
      new GetCommand({
        TableName: process.env.ORDERS_TABLE || "Orders",
        Key: { order_id: orderId },
      }),
    );
    const order = orderResult.Item || {};
    const refundedSet = new Set((refundedTicketIds || []).map(String));
    const timestamp = new Date().toISOString();
    const statusValue = refundStatus || "PENDING";
    const updatedTickets = Array.isArray(order.tickets)
      ? order.tickets.map((ticket) => {
          const ticketId = String(
            ticket.ticket_id || ticket.ticketInstanceId || ticket.id || "",
          );
          if (!refundedSet.has(ticketId)) return ticket;
          return {
            ...ticket,
            refund_status: "REFUNDED",
            ticket_status: "REFUNDED",
            refunded_at: timestamp,
            qr_url: "",
            qrCodeKey: null,
          };
        })
      : [];

    if (isFullRefund) {
      const values = {
        ":status": statusValue,
        ":now": timestamp,
        ":amount": refundAmount,
        ":fee": platformFee,
        ":true": true,
        ":tickets": updatedTickets,
      };
      let updateExpression =
        "SET refund_status = :status, refunded_at = :now, refund_amount = :amount, platform_fee_retained = :fee, is_refunded = :true, tickets = :tickets";
      if (paymentRefund) {
        updateExpression += ", payment_refund = :paymentRefund";
        values[":paymentRefund"] = paymentRefund;
      }
      if (statusValue === "COMPLETED") {
        updateExpression += ", payment_status = :cancelled";
        values[":cancelled"] = "CANCELLED";
      }

      await dynamodb.send(
        new UpdateCommand({
          TableName: process.env.ORDERS_TABLE || "Orders",
          Key: { order_id: orderId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: values,
        }),
      );

      console.log(\`✅ Orden marcada con reembolso \${statusValue}\`);
    } else {
      const values = {
        ":refunded": refundedQuantity,
        ":status": statusValue,
        ":amount": refundAmount,
        ":fee": platformFee,
        ":zero": 0,
        ":now": timestamp,
        ":true": true,
        ":tickets": updatedTickets,
      };
      let updateExpression =
        "SET partial_refund_status = :status, partial_refund_amount = if_not_exists(partial_refund_amount, :zero) + :amount, partial_refund_platform_fee = if_not_exists(partial_refund_platform_fee, :zero) + :fee, partial_refund_count = if_not_exists(partial_refund_count, :zero) + :refunded, last_refund_at = :now, is_partially_refunded = :true, tickets = :tickets";
      if (paymentRefund) {
        updateExpression += ", payment_refund = :paymentRefund";
        values[":paymentRefund"] = paymentRefund;
      }

      await dynamodb.send(
        new UpdateCommand({
          TableName: process.env.ORDERS_TABLE || "Orders",
          Key: { order_id: orderId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: values,
        }),
      );

      console.log(
        \`✅ Orden actualizada: \${refundedQuantity} tickets reembolsados (parcial)\`,
      );
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Error actualizando orden:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const markRefundPaymentResult = async (refundId, paymentResult) => {
  if (!refundId || !paymentResult) return;
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName:
          process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation",
        Key: { id: refundId },
        UpdateExpression:
          "SET refundStatus = :status, payment_refund = :payment, updatedAt = :now",
        ExpressionAttributeValues: {
          ":status": paymentResult.refundStatus || "PENDING",
          ":payment": paymentResult,
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    console.warn(
      "⚠️ No se pudo actualizar payment_refund en ticketsCancelation:",
      error.message,
    );
  }
};

/**
 * Procesa un reembolso de boletas
 * @param {Object} event - Evento de API Gateway
 * @returns {Object} - Respuesta HTTP con el resultado del reembolso
 */
exports.processRefund = async (event) => {`;

s = s.slice(0, startIdx) + newBlock + s.slice(endIdx + endMarker.length);

// Wire payment refund after releasing tickets / before final response
const orderUpdateCall = `    const orderUpdateResult = await updateOrderStatus(
      orderId,
      isFullRefund,
      ticketsToRefund.length,
      refundAmount,
      ticketsToRefund.map((t) => t.ticketInstanceId),
      platformFeeRetained,
    );`;

if (!s.includes("processPaymentRefund({")) {
  const paymentBlock = `    // 9. Devolución de dinero vía Wompi (void en reembolso FULL)
    let paymentResult = {
      attempted: false,
      success: false,
      skipped: true,
      reason: "not_attempted",
      refundStatus: "PENDING",
    };
    try {
      paymentResult = await processPaymentRefund({
        order,
        isFullRefund,
        refundAmount,
      });
      console.log("💳 Resultado pasarela:", JSON.stringify(paymentResult));
    } catch (paymentErr) {
      console.error("❌ Error en pasarela de reembolso:", paymentErr.message);
      paymentResult = {
        attempted: true,
        success: false,
        error: paymentErr.message,
        refundStatus: "PENDING",
      };
    }

    const finalRefundStatus = paymentResult.refundStatus || "PENDING";

    const orderUpdateResult = await updateOrderStatus(
      orderId,
      isFullRefund,
      ticketsToRefund.length,
      refundAmount,
      ticketsToRefund.map((t) => t.ticketInstanceId),
      platformFeeRetained,
      finalRefundStatus,
      paymentResult,
    );`;

  if (!s.includes(orderUpdateCall)) {
    console.error("orderUpdateCall not found");
    process.exit(1);
  }
  s = s.replace(orderUpdateCall, paymentBlock);
}

// After successful order update, mark refund payment result
const afterOrderOk = `    if (!orderUpdateResult.success) {
      console.error("❌ Error actualizando orden:", orderUpdateResult.error);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "Error al actualizar el estado de la orden",
          error: orderUpdateResult.error,
        }),
      };
    }

    // 10. Preparar respuesta exitosa
    const response = {
      success: true,
      message: \`Reembolso \${isFullRefund ? "total" : "parcial"} procesado exitosamente\`,
      data: {
        refundId: traceabilityResult.refundId,
        filingId: traceabilityResult.filingId,
        orderId: orderId,
        refundType: isFullRefund ? "FULL" : "PARTIAL",
        refundStatus: "PENDING",`;

const afterOrderOkNew = `    if (!orderUpdateResult.success) {
      console.error("❌ Error actualizando orden:", orderUpdateResult.error);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "Error al actualizar el estado de la orden",
          error: orderUpdateResult.error,
        }),
      };
    }

    await markRefundPaymentResult(traceabilityResult.refundId, paymentResult);

    // 10. Preparar respuesta exitosa
    const response = {
      success: true,
      message: \`Reembolso \${isFullRefund ? "total" : "parcial"} procesado exitosamente\`,
      data: {
        refundId: traceabilityResult.refundId,
        filingId: traceabilityResult.filingId,
        orderId: orderId,
        refundType: isFullRefund ? "FULL" : "PARTIAL",
        refundStatus: finalRefundStatus,
        paymentRefund: {
          success: Boolean(paymentResult.success),
          attempted: Boolean(paymentResult.attempted),
          skipped: Boolean(paymentResult.skipped),
          reason: paymentResult.reason || paymentResult.error || null,
          transactionId: paymentResult.transactionId || null,
        },`;

if (s.includes(afterOrderOk) && !s.includes("markRefundPaymentResult(traceabilityResult.refundId")) {
  s = s.replace(afterOrderOk, afterOrderOkNew);
} else {
  console.warn("response block replace skipped or already applied");
}

// Early idempotency after order validation
const afterOrderValidated = `    const order = orderValidation.order;
    console.log("✅ Orden validada, procediendo con reembolso");

    const eventIdForPolicy = order.event_id || order.eventId;`;

const afterOrderValidatedNew = `    const order = orderValidation.order;
    console.log("✅ Orden validada, procediendo con reembolso");

    const earlyTicketIds =
      specificTickets && Array.isArray(ticketInstanceIds)
        ? ticketInstanceIds
        : (Array.isArray(order.tickets)
            ? order.tickets
                .map((t) => t.ticket_id || t.ticketInstanceId || t.id)
                .filter(Boolean)
            : null);
    const earlyIdempotency = await checkExistingRefund(orderId, earlyTicketIds);
    if (earlyIdempotency.exists) {
      console.log(
        \`⚠️  Reembolso duplicado detectado temprano (\${earlyIdempotency.status})\`,
      );
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          message: \`Reembolso ya procesado previamente (\${earlyIdempotency.status})\`,
          duplicate: true,
          data: {
            refundId: earlyIdempotency.refund.id,
            filingId: earlyIdempotency.refund.filingId || null,
            orderId: earlyIdempotency.refund.orderId,
            refundType: earlyIdempotency.refund.refund_type,
            refundStatus: earlyIdempotency.refund.refundStatus,
            ticketsRefunded: earlyIdempotency.refund.quantity,
            refundAmount: earlyIdempotency.refund.refund_amount,
            processedAt: earlyIdempotency.refund.createdAt,
          },
        }),
      };
    }

    const eventIdForPolicy = order.event_id || order.eventId;`;

if (
  s.includes(afterOrderValidated) &&
  !s.includes("earlyIdempotency = await checkExistingRefund")
) {
  s = s.replace(afterOrderValidated, afterOrderValidatedNew);
}

fs.writeFileSync(filePath, s, "utf8");
console.log("patched", filePath, "bytes", s.length);
