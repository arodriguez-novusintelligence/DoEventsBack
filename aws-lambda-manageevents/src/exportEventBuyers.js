const {
  getOrdersByEvent,
  getClientByUserId,
  normalizeOrderAmount,
  classifyOrderLifecycle,
  response,
} = require("./statsShared");

const csvEscape = (value) => {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const paymentMethodLabel = (order = {}) => {
  const raw = order.payment_method || order.paymentMethod || order.method;
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    return raw.provider || raw.type || raw.name || JSON.stringify(raw);
  }
  return String(raw);
};

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    const query = event.queryStringParameters || {};
    const scope = String(query.scope || "executed").toLowerCase();

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    const orders = await getOrdersByEvent(eventId);
    const filteredOrders = orders.filter((order) => {
      const lifecycle = classifyOrderLifecycle(order);

      if (scope === "executed") return lifecycle.bucket === "EXECUTED_SALE";
      if (scope === "cancelled") {
        return ["EVENT_CANCELLED", "PURCHASE_CANCELLED"].includes(
          lifecycle.bucket
        );
      }
      if (scope === "event_cancelled") return lifecycle.bucket === "EVENT_CANCELLED";
      if (scope === "purchase_cancelled") {
        return lifecycle.bucket === "PURCHASE_CANCELLED";
      }
      if (scope === "non_executed") return lifecycle.bucket === "NON_EXECUTED";

      return true;
    });

    const rows = [
      [
        "buyerId",
        "userId",
        "nombre",
        "email",
        "phone",
        "paymentStatus",
        "paymentMethod",
        "ticketCount",
        "totalComprado",
        "fecha_compra",
        "lifecycleBucket",
        "cancellationOrigin",
      ],
    ];

    for (const order of filteredOrders) {
      const lifecycle = classifyOrderLifecycle(order);
      const userId = order.user_id || order.userId || "";
      const client = await getClientByUserId(userId);

      const fullName =
        client?.name && client?.lastName
          ? `${client.name} ${client.lastName}`.trim()
          : client?.name || order.user_name || "Comprador";

      rows.push([
        order.order_id || order.id || "",
        userId,
        fullName,
        client?.email || order.email || "",
        client?.phone || order.phone || "",
        order.payment_status || order.status || "",
        paymentMethodLabel(order),
        Array.isArray(order.tickets) ? order.tickets.length : 0,
        normalizeOrderAmount(order),
        order.created_at || order.createdAt || "",
        lifecycle.bucket,
        lifecycle.cancellationOrigin,
      ]);
    }

    const csvContent = rows
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": `attachment; filename=buyers-${eventId}.csv`,
      },
      body: csvContent,
    };
  } catch (error) {
    console.error("exportEventBuyers error:", error);
    return response(500, {
      error: "Error exporting buyers",
      message: error.message,
    });
  }
};
