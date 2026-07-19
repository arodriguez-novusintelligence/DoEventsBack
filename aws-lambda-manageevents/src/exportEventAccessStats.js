const {
  getOrdersByEvent,
  getTicketScansByEvent,
  getEventById,
  getVenueGatesByVenue,
  getClientByUserId,
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

const scanStatusLabel = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success" || normalized === "valid") return "VALID";
  if (normalized === "alreadyused" || normalized === "duplicate") return "DUPLICATE";
  return normalized ? "INVALID" : "NOT_SCANNED";
};

const pickScanTimestamp = (scan = {}) =>
  scan.scanAt || scan.scannedAt || scan.createdAt || scan.updatedAt || null;

const normalizeGateId = (scan = {}) => scan.gateId || scan.gate_id || null;

const normalizeStaffId = (scan = {}) =>
  scan.staffId || scan.staff_id || scan.scannedBy || scan.validatedBy || null;

const sortIso = (a, b) => String(a || "").localeCompare(String(b || ""));

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};
    const query = event.queryStringParameters || {};
    const scope = String(query.scope || "executed").toLowerCase();

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    const [orders, scans, eventInfo] = await Promise.all([
      getOrdersByEvent(eventId),
      getTicketScansByEvent(eventId),
      getEventById(eventId),
    ]);

    const venueId = eventInfo?.venueId || eventInfo?.venue_id || null;
    const venueGates = venueId ? await getVenueGatesByVenue(venueId) : [];
    const gateCatalog = new Map(
      venueGates
        .filter((gate) => !gate.eventId || gate.eventId === eventId)
        .map((gate) => [
          gate.gateId || gate.name,
          { gateId: gate.gateId || null, gateName: gate.name || gate.gateNumber || "Sin puerta" },
        ])
    );

    const filteredOrders = orders.filter((order) => {
      const lifecycle = classifyOrderLifecycle(order);
      if (scope === "executed") return lifecycle.bucket === "EXECUTED_SALE";
      if (scope === "cancelled") {
        return ["EVENT_CANCELLED", "PURCHASE_CANCELLED"].includes(lifecycle.bucket);
      }
      if (scope === "event_cancelled") return lifecycle.bucket === "EVENT_CANCELLED";
      if (scope === "purchase_cancelled") return lifecycle.bucket === "PURCHASE_CANCELLED";
      if (scope === "non_executed") return lifecycle.bucket === "NON_EXECUTED";
      return true;
    });

    const scansByTicket = new Map();
    for (const scan of scans) {
      const ticketId = scan.ticketId || scan.ticket_id || scan.rawScanValue || null;
      if (!ticketId) continue;
      if (!scansByTicket.has(ticketId)) scansByTicket.set(ticketId, []);
      scansByTicket.get(ticketId).push(scan);
    }

    const rows = [
      [
        "orderId",
        "userId",
        "nombre",
        "email",
        "ticketId",
        "categoria",
        "paymentStatus",
        "lifecycleBucket",
        "asistio",
        "estadoAcceso",
        "cantidadEscaneos",
        "primerEscaneo",
        "ultimoEscaneo",
        "gateId",
        "gateName",
        "scannedByUserIds",
        "scannedByNames",
      ],
    ];

    let totalTickets = 0;
    let attendedTickets = 0;

    for (const order of filteredOrders) {
      const lifecycle = classifyOrderLifecycle(order);
      const userId = order.user_id || order.userId || "";
      const client = await getClientByUserId(userId);
      const fullName =
        client?.name && client?.lastName
          ? `${client.name} ${client.lastName}`.trim()
          : client?.name || order.user_name || "Comprador";

      const tickets = Array.isArray(order.tickets) ? order.tickets : [];
      for (const ticket of tickets) {
        totalTickets += 1;
        const ticketId = ticket.ticket_id || ticket.ticketInstanceId || ticket.id || "";
        const ticketScans = ticketId ? scansByTicket.get(ticketId) || [] : [];

        const statuses = ticketScans
          .map((scan) => scanStatusLabel(scan.statusResult || scan.status))
          .filter(Boolean);

        const isAttended = statuses.includes("VALID");
        if (isAttended) attendedTickets += 1;

        const timestamps = ticketScans
          .map((scan) => pickScanTimestamp(scan))
          .filter(Boolean)
          .sort(sortIso);
        const scannerIds = [...new Set(ticketScans.map((scan) => normalizeStaffId(scan)).filter(Boolean))];
        const scannerNames = await Promise.all(
          scannerIds.map(async (scannerId) => {
            const client = await getClientByUserId(scannerId);
            return client?.name && client?.lastName
              ? `${client.name} ${client.lastName}`.trim()
              : client?.name || scannerId;
          })
        );
        const lastGateId = ticketScans.length > 0 ? normalizeGateId(ticketScans[ticketScans.length - 1]) : "";
        const lastGate = gateCatalog.get(lastGateId) || { gateId: lastGateId || "", gateName: "" };

        const estadoAcceso =
          statuses.length > 0
            ? statuses.includes("VALID")
              ? "VALID"
              : statuses[statuses.length - 1]
            : "NOT_SCANNED";

        rows.push([
          order.order_id || order.id || "",
          userId,
          fullName,
          client?.email || order.email || "",
          ticketId,
          ticket.category || ticket.categoryName || ticket.ticket_type || ticket.section || "General",
          order.payment_status || order.status || "",
          lifecycle.bucket,
          isAttended ? "SI" : "NO",
          estadoAcceso,
          ticketScans.length,
          timestamps[0] || "",
          timestamps[timestamps.length - 1] || "",
          lastGate.gateId || "",
          lastGate.gateName || "",
          scannerIds.join(" | "),
          scannerNames.join(" | "),
        ]);
      }
    }

    const notScanned = Math.max(0, totalTickets - attendedTickets);

    rows.push([]);
    rows.push(["RESUMEN", "", "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["total_tickets", totalTickets, "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["tickets_escaneados_validos", attendedTickets, "", "", "", "", "", "", "", "", "", "", ""]);
    rows.push(["tickets_no_escaneados", notScanned, "", "", "", "", "", "", "", "", "", "", ""]);

    const csvContent = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": `attachment; filename=access-stats-${eventId}.csv`,
      },
      body: csvContent,
    };
  } catch (error) {
    console.error("exportEventAccessStats error:", error);
    return response(500, {
      error: "Error exporting access stats",
      message: error.message,
    });
  }
};
