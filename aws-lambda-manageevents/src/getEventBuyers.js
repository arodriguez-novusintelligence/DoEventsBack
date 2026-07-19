const {
  getOrdersByEvent,
  getClientByUserId,
  getOrderPostEventFlag,
  normalizeOrderAmount,
  normalizeTicketsCount,
  classifyOrderLifecycle,
  getOrderPaymentTimingBucket,
  response,
} = require("./statsShared");

const paymentStatusLabel = (order = {}) => {
  const status = order.payment_status || order.status;
  const normalized = String(status || "").toUpperCase();
  const timingBucket = getOrderPaymentTimingBucket(order);
  const timingLabel = timingBucket === "POST_EVENT" ? "Post-evento" : "Pre-evento";

  if (
    normalized === "APPROVED" ||
    normalized === "PAID" ||
    normalized === "SOLD" ||
    normalized === "FINISHED"
  ) {
    return `${timingLabel} (pagado)`;
  }
  if (normalized === "PENDING") {
    return `${timingLabel} (pendiente)`;
  }
  if (timingBucket === "POST_EVENT") {
    return "Post-evento (pendiente)";
  }
  return "Pre-evento (pendiente)";
};

const bucketSummaryKey = (statusLabel) => {
  if (statusLabel === "Pre-evento (pagado)") {
    return "Pre-evento (pagado)";
  }
  if (statusLabel === "Pre-evento (pendiente)") {
    return "Pre-evento (pendiente)";
  }
  if (statusLabel === "Post-evento (pagado)") {
    return "Post-evento (pagado)";
  }
  return "Post-evento (pendiente)";
};

const paymentMethodLabel = (order = {}) => {
  const raw = order.payment_method || order.paymentMethod || order.method;
  if (!raw) return "No especificado";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return (
      raw.provider ||
      raw.type ||
      raw.name ||
      JSON.stringify(raw)
    );
  }
  return String(raw);
};

const resolveTicketSeatLabel = (ticket = {}) => {
  if (ticket.seatLabel) return String(ticket.seatLabel).trim();
  if (ticket.seat_label) return String(ticket.seat_label).trim();
  if (ticket.seat_code) return String(ticket.seat_code).trim();
  if (typeof ticket.seat === "string" && ticket.seat.trim()) return ticket.seat.trim();
  if (ticket.seat && typeof ticket.seat === "object") {
    const fromSeat =
      ticket.seat.seatLabel
      || ticket.seat.seat_label
      || [
          ticket.seat.rowLabel || ticket.seat.row || "",
          ticket.seat.colNumber ?? ticket.seat.number ?? "",
        ].join("");
    if (String(fromSeat).trim()) return String(fromSeat).trim();
  }
  if (ticket.location && typeof ticket.location === "object") {
    const fromLoc =
      ticket.location.seatLabel
      || ticket.location.seat_label
      || [
          ticket.location.rowLabel || ticket.location.row || "",
          ticket.location.colNumber ?? ticket.location.number ?? "",
        ].join("");
    if (String(fromLoc).trim()) return String(fromLoc).trim();
  }
  if (Array.isArray(ticket.seats) && ticket.seats.length) {
    const first = ticket.seats[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return null;
};

const resolveClientDisplayName = (client, order = {}) => {
  if (client) {
    const fromParts = `${client.nombre || client.name || ""} ${client.apellido || client.lastName || ""}`.trim();
    if (fromParts) return fromParts;
    if (client.user) return String(client.user);
    if (client.username) return String(client.username);
  }
  return order.user_name || order.buyerName || "Comprador";
};

const resolveClientPhone = (client, order = {}) => {
  if (client?.phone) return String(client.phone);
  if (client?.phoneNumber && client?.phoneIndicative) {
    return `${client.phoneIndicative}${client.phoneNumber}`;
  }
  if (client?.phoneNumber) return String(client.phoneNumber);
  return order.phone || null;
};

const buildSummary = (orders = []) => {
  const summary = {
    totalVenta: 0,
    preEventoPagado: 0,
    preEventoPendiente: 0,
    postEventoPagado: 0,
    postEventoPendiente: 0,
    buyersTotal: 0,
    buyersPreEventoPagado: 0,
    buyersPreEventoPendiente: 0,
    buyersPostEventoPagado: 0,
    buyersPostEventoPendiente: 0,
    currency: "COP",
  };

  for (const order of orders) {
    const amount = normalizeOrderAmount(order);
    const statusLabel = paymentStatusLabel(order);
    const summaryKey = bucketSummaryKey(statusLabel);

    summary.totalVenta += amount;
    summary.buyersTotal += 1;

    if (summaryKey === "Pre-evento (pagado)") {
      summary.preEventoPagado += amount;
      summary.buyersPreEventoPagado += 1;
    } else if (summaryKey === "Pre-evento (pendiente)") {
      summary.preEventoPendiente += amount;
      summary.buyersPreEventoPendiente += 1;
    } else if (summaryKey === "Post-evento (pagado)") {
      summary.postEventoPagado += amount;
      summary.buyersPostEventoPagado += 1;
    } else {
      summary.postEventoPendiente += amount;
      summary.buyersPostEventoPendiente += 1;
    }

    if (order.currency && typeof order.currency === "string") {
      summary.currency = order.currency;
    }
  }

  return summary;
};

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    const query = event.queryStringParameters || {};

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    const limit = Math.max(1, Math.min(500, Number(query.limit) || 50));
    const offset = Math.max(0, Number(query.offset) || 0);
    const statusFilter = query.status ? String(query.status).toUpperCase() : null;
    const scope = String(query.scope || "executed").toLowerCase();

    const orders = await getOrdersByEvent(eventId);

    const filteredOrders = orders.filter((order) => {
      const lifecycle = classifyOrderLifecycle(order);

      if (scope === "executed" && lifecycle.bucket !== "EXECUTED_SALE") {
        return false;
      }
      if (scope === "cancelled" && !["EVENT_CANCELLED", "PURCHASE_CANCELLED"].includes(lifecycle.bucket)) {
        return false;
      }
      if (scope === "event_cancelled" && lifecycle.bucket !== "EVENT_CANCELLED") {
        return false;
      }
      if (scope === "purchase_cancelled" && lifecycle.bucket !== "PURCHASE_CANCELLED") {
        return false;
      }
      if (scope === "non_executed" && lifecycle.bucket !== "NON_EXECUTED") {
        return false;
      }

      if (!statusFilter) return true;
      return String(order.payment_status || order.status || "").toUpperCase() === statusFilter;
    });

    const paginated = filteredOrders.slice(offset, offset + limit);
    const summary = buildSummary(filteredOrders);

    const buyers = await Promise.all(
      paginated.map(async (order) => {
        const lifecycle = classifyOrderLifecycle(order);
        const userId = order.user_id || order.userId || null;
        const client = await getClientByUserId(userId);

        const tickets = Array.isArray(order.tickets) ? order.tickets : [];
        const entries = tickets.map((ticket) => {
          const seatLabel = resolveTicketSeatLabel(ticket);
          const rowFromTicket =
            ticket.row
            || ticket.rowLabel
            || ticket.location?.rowLabel
            || ticket.location?.row
            || ticket.seat?.rowLabel
            || ticket.seat?.row
            || null;
          return {
            ticketId: ticket.ticket_id || ticket.ticketInstanceId || ticket.id || null,
            categoria:
              ticket.category ||
              ticket.categoryName ||
              ticket.ticket_type ||
              ticket.section ||
              "General",
            precio: ticket.price || ticket.amount || ticket.unitPrice || ticket.purchasePrice || 0,
            fecha_compra: order.created_at || order.createdAt || null,
            status: order.payment_status || order.status || "UNKNOWN",
            seat: seatLabel,
            seatLabel,
            row: rowFromTicket,
          };
        });

        const paymentStatus = order.payment_status || order.status || "UNKNOWN";
        const isReferred = getOrderPostEventFlag(order);
        const timingBucket = getOrderPaymentTimingBucket(order);

        return {
          buyerId: order.order_id || order.id || null,
          orderId: order.order_id || order.id || null,
          userId,
          nombre: resolveClientDisplayName(client, order),
          buyerName: resolveClientDisplayName(client, order),
          email: client?.email || order.email || null,
          buyerEmail: client?.email || order.email || null,
          phone: resolveClientPhone(client, order),
          buyerPhone: resolveClientPhone(client, order),
          avatar: client?.fotoPerfilUrl || client?.profileImage || client?.avatar || null,
          entradas: entries,
          seat: entries[0]?.seatLabel || null,
          category: entries[0]?.categoria || null,
          totalComprado: normalizeOrderAmount(order),
          amount: normalizeOrderAmount(order),
          statusPago: paymentStatusLabel(order),
          metodoPago: paymentMethodLabel(order),
          fecha_compra: order.created_at || order.createdAt || null,
          purchaseDate: order.created_at || order.createdAt || null,
          rawStatus: paymentStatus,
          isReferred,
          paymentTimingBucket: timingBucket,
          ticketCount: normalizeTicketsCount(order),
          isApproved: lifecycle.hasExecutedPayment,
          lifecycleBucket: lifecycle.bucket,
          cancellationOrigin: lifecycle.cancellationOrigin,
          isExecutedSale: lifecycle.isExecutedSale,
          isFullyRefunded: lifecycle.isFullyRefunded,
          isPartiallyRefunded: lifecycle.isPartiallyRefunded,
        };
      })
    );

    return response(200, {
      total: filteredOrders.length,
      limit,
      offset,
      scope,
      summary,
      buyers,
    });
  } catch (error) {
    console.error("getEventBuyers error:", error);
    return response(500, {
      error: "Error getting event buyers",
      message: error.message,
    });
  }
};
