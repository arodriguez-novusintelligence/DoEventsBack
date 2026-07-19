const {
  getTicketScansByEvent,
  getOrdersByEvent,
  getEventById,
  getVenueGatesByVenue,
  getClientByUserId,
  normalizeTicketsCount,
  response,
  isOrderApproved,
  numberOrZero,
} = require("./statsShared");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const PROFILE_IMAGES_BUCKET = "doeventprofileimagesbucket";

const isGrantedStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "success" || normalized === "valid";
};

const isDeniedStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return (
    normalized === "alreadyused" ||
    normalized === "invalidcode" ||
    normalized === "wrongevent" ||
    normalized === "invalid" ||
    normalized === "duplicate"
  );
};

const normalizeTicketId = (scan = {}) =>
  scan.ticketId || scan.ticket_id || scan.rawScanValue || null;

const normalizeGateId = (scan = {}) => scan.gateId || scan.gate_id || null;

const normalizeStaffId = (scan = {}) =>
  scan.staffId || scan.staff_id || scan.scannedBy || scan.validatedBy || null;

const normalizeGate = (scan = {}) =>
  scan.gateName ||
  scan.name ||
  scan.gate_name ||
  scan.entranceName ||
  scan.entrance_name ||
  scan.puerta ||
  scan.gateId ||
  scan.gate_id ||
  "Sin puerta";

const normalizeCategory = (ticket = {}) =>
  ticket.category ||
  ticket.categoryName ||
  ticket.ticket_type ||
  ticket.section ||
  "General";

const pct = (num, den) =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : "0%";

const pickScanTimestamp = (scan = {}) =>
  scan.scanAt || scan.scannedAt || scan.createdAt || scan.updatedAt || null;

const normalizeAssignedStaff = (staff = []) =>
  (Array.isArray(staff) ? staff : [])
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") {
        return { userId: item, role: null, raw: item };
      }

      if (typeof item !== "object") return null;

      return {
        userId:
          item.userId || item.id || item.staffUserId || item.staffId || item.user_id || null,
        role: item.role || item.cargo || item.position || null,
        raw: item,
      };
    })
    .filter((item) => item && item.userId);

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveProfileImageUrl = async (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  if (isHttpUrl(value)) return value;

  try {
    return await s3.getSignedUrlPromise("getObject", {
      Bucket: PROFILE_IMAGES_BUCKET,
      Key: value,
      Expires: 3600,
    });
  } catch (error) {
    console.warn("[getEventAccessStats] profile image resolve failed:", error.message);
    return value;
  }
};

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    const [scans, orders, eventInfo] = await Promise.all([
      getTicketScansByEvent(eventId),
      getOrdersByEvent(eventId),
      getEventById(eventId),
    ]);

    const venueId = eventInfo?.venueId || eventInfo?.venue_id || null;
    const venueGates = venueId ? await getVenueGatesByVenue(venueId) : [];
    const relevantGates = venueGates.filter(
      (gate) => !gate.eventId || gate.eventId === eventId
    );

    const approvedOrders = orders.filter(isOrderApproved);

    const totalFromOrders = approvedOrders.reduce(
      (sum, order) => sum + normalizeTicketsCount(order),
      0
    );

    const eventCapacity = numberOrZero(
      eventInfo?.aforo || eventInfo?.capacity || eventInfo?.venue?.capacity
    );

    const totalBoletos = totalFromOrders > 0 ? totalFromOrders : eventCapacity;

    const accessGranted = scans.filter((scan) => isGrantedStatus(scan.statusResult));
    const denied = scans.filter((scan) => isDeniedStatus(scan.statusResult));

    const scansByTicket = new Map();
    scans.forEach((scan) => {
      const ticketId = normalizeTicketId(scan);
      if (!ticketId) return;
      if (!scansByTicket.has(ticketId)) scansByTicket.set(ticketId, []);
      scansByTicket.get(ticketId).push(scan);
    });

    const gateCatalog = new Map();
    relevantGates.forEach((gate) => {
      const gateId = gate.gateId || gate.id || null;
      const gateName = gate.name || gate.gateName || gate.gateNumber || "Sin puerta";
      gateCatalog.set(gateId || gateName, {
        gateId,
        puerta: gateName,
        descripcion: gate.description || "",
        assignedStaff: normalizeAssignedStaff(gate.assignedStaff),
      });
    });

    const doorMap = new Map();
    for (const gate of gateCatalog.values()) {
      const key = gate.gateId || gate.puerta;
      doorMap.set(key, {
        gateId: gate.gateId,
        puerta: gate.puerta,
        descripcion: gate.descripcion,
        totalIntentos: 0,
        totalIngresos: 0,
        concedidos: 0,
        denegados: 0,
        porcentaje: "0%",
        personalAsignado: [],
        escaneadores: [],
        historialEscaneos: [],
        _validTickets: new Set(),
        _scannerIds: new Set(),
      });
    }

    scans.forEach((scan) => {
      const gateId = normalizeGateId(scan);
      const puerta = normalizeGate(scan);
      const key = gateId || puerta;
      if (!doorMap.has(key)) {
        doorMap.set(key, {
          gateId: gateId || null,
          puerta,
          descripcion: "",
          totalIntentos: 0,
          totalIngresos: 0,
          concedidos: 0,
          denegados: 0,
          porcentaje: "0%",
          personalAsignado: [],
          escaneadores: [],
          historialEscaneos: [],
          _validTickets: new Set(),
          _scannerIds: new Set(),
        });
      }

      const current = doorMap.get(key);
      current.totalIntentos += 1;
      if (isGrantedStatus(scan.statusResult)) current.concedidos += 1;
      else if (isDeniedStatus(scan.statusResult)) current.denegados += 1;
      else current.denegados += 1;

      const ticketId = normalizeTicketId(scan);
      if (ticketId && isGrantedStatus(scan.statusResult)) {
        current._validTickets.add(ticketId);
      }

      const staffId = normalizeStaffId(scan);
      if (staffId) {
        current._scannerIds.add(staffId);
      }

      current.historialEscaneos.push({
        ticketId,
        orderId: scan.orderId || null,
        userId: scan.userId || null,
        staffId,
        gateId: gateId || null,
        puerta,
        status: scan.statusResult || scan.status || null,
        scanAt: pickScanTimestamp(scan),
      });
    });

    const clientCache = new Map();
    const getClientCached = async (userId) => {
      if (!userId) return null;
      if (clientCache.has(userId)) return clientCache.get(userId);
      const client = await getClientByUserId(userId);
      clientCache.set(userId, client || null);
      return client || null;
    };

    await Promise.all(
      Array.from(doorMap.values()).map(async (row) => {
        row.totalIngresos = row._validTickets.size;

        const assignedStaffRows = await Promise.all(
          normalizeAssignedStaff(
            gateCatalog.get(row.gateId || row.puerta)?.assignedStaff || []
          ).map(async (item) => {
            const client = await getClientCached(item.userId);
            return {
              userId: item.userId,
              nombre:
                client?.name && client?.lastName
                  ? `${client.name} ${client.lastName}`.trim()
                  : client?.name || item.userId,
              email: client?.email || null,
              phone: client?.phone || null,
              avatar: await resolveProfileImageUrl(
                client?.fotoPerfilUrl ||
                  client?.profileImage ||
                  client?.avatar ||
                  client?.profile_image ||
                  client?.profileImageUrl
              ),
              role: item.role,
            };
          })
        );

        const scannerRows = await Promise.all(
          Array.from(row._scannerIds).map(async (staffId) => {
            const client = await getClientCached(staffId);
            return {
              userId: staffId,
              nombre:
                client?.name && client?.lastName
                  ? `${client.name} ${client.lastName}`.trim()
                  : client?.name || staffId,
              email: client?.email || null,
              phone: client?.phone || null,
              avatar: await resolveProfileImageUrl(
                client?.fotoPerfilUrl ||
                  client?.profileImage ||
                  client?.avatar ||
                  client?.profile_image ||
                  client?.profileImageUrl
              ),
            };
          })
        );

        row.personalAsignado = assignedStaffRows;
        row.escaneadores = scannerRows;
        row.porcentaje = pct(row.totalIngresos, row.totalIntentos || row.totalIngresos);
        delete row._validTickets;
        delete row._scannerIds;
      })
    );

    const estadoAccesoPorPuerta = Array.from(doorMap.values()).map((row) => ({
      ...row,
      porcentaje: pct(row.concedidos, row.totalIntentos),
    }));

    const uniqueInside = new Set(
      accessGranted
        .map((scan) => scan.ticketId || scan.rawScanValue)
        .filter(Boolean)
    ).size;

    const boletosEscaneadosUnicos = new Set(
      accessGranted
        .map((scan) => scan.ticketId || scan.ticket_id || scan.rawScanValue)
        .filter(Boolean)
    ).size;

    const boletosNoEscaneados =
      totalBoletos > 0 ? Math.max(0, totalBoletos - boletosEscaneadosUnicos) : 0;

    const statusCounter = scans.reduce(
      (acc, scan) => {
        const normalized = String(scan.statusResult || "").toLowerCase();
        if (normalized === "success" || normalized === "valid") acc.VALID += 1;
        else if (normalized === "alreadyused" || normalized === "duplicate") acc.DUPLICATE += 1;
        else acc.INVALID += 1;
        return acc;
      },
      { VALID: 0, INVALID: 0, DUPLICATE: 0 }
    );

    const traficoTipoMap = new Map();
    const boletasDetalle = [];

    for (const order of approvedOrders) {
      const userId = order.user_id || order.userId || null;
      const client = await getClientCached(userId);
      const attendeeName =
        client?.name && client?.lastName
          ? `${client.name} ${client.lastName}`.trim()
          : client?.name || order.user_name || "Comprador";
      const attendeeAvatar = await resolveProfileImageUrl(
        client?.fotoPerfilUrl ||
          client?.profileImage ||
          client?.avatar ||
          client?.profile_image ||
          client?.profileImageUrl
      );

      const tickets = Array.isArray(order.tickets) ? order.tickets : [];
      for (const ticket of tickets) {
        const categoria = normalizeCategory(ticket);
        const ticketId =
          ticket.ticket_id || ticket.ticketInstanceId || ticket.id || null;

        if (!traficoTipoMap.has(categoria)) {
          traficoTipoMap.set(categoria, {
            categoria,
            nombre: categoria,
            total: 0,
            escaneados: 0,
            concedidos: 0,
            denegados: 0,
            porcentaje: "0%",
            asistentes: [],
          });
        }

        const current = traficoTipoMap.get(categoria);
        current.total += 1;

        const ticketScans = ticketId ? (scansByTicket.get(ticketId) || []).slice().sort((a, b) =>
          String(pickScanTimestamp(a) || "").localeCompare(String(pickScanTimestamp(b) || ""))
        ) : [];
        const grantedCount = ticketScans.filter((scan) =>
          isGrantedStatus(scan.statusResult)
        ).length;
        const deniedCount = ticketScans.filter((scan) =>
          isDeniedStatus(scan.statusResult)
        ).length;

        current.concedidos += grantedCount;
        current.denegados += deniedCount;

        const isAttended = grantedCount > 0;
        if (isAttended) current.escaneados += 1;

        const historialEscaneos = await Promise.all(
          ticketScans.map(async (scan) => {
            const staffId = normalizeStaffId(scan);
            const scanner = await getClientCached(staffId);
            const gateId = normalizeGateId(scan);
            const gateInfo = gateCatalog.get(gateId || normalizeGate(scan));

            return {
              scanId: scan.id || null,
              ticketId: normalizeTicketId(scan),
              orderId: scan.orderId || order.order_id || null,
              gateId: gateId || gateInfo?.gateId || null,
              gateName: gateInfo?.puerta || normalizeGate(scan),
              staffId,
              scannerName:
                scanner?.name && scanner?.lastName
                  ? `${scanner.name} ${scanner.lastName}`.trim()
                  : scanner?.name || staffId || null,
              status: scan.statusResult || scan.status || null,
              scanAt: pickScanTimestamp(scan),
            };
          })
        );

        const lastScan = historialEscaneos[historialEscaneos.length - 1] || null;

        current.asistentes.push({
          nombre: attendeeName,
          avatar: attendeeAvatar,
          estado: isAttended ? "ASISTIO" : "NO_ASISTIO",
        });

        boletasDetalle.push({
          ticketId,
          orderId: order.order_id || order.id || null,
          userId,
          comprador: attendeeName,
          compradorAvatar: attendeeAvatar,
          categoria,
          seat: ticket.seat || ticket.seatLabel || ticket.seatNumber || null,
          scanned: isAttended,
          statusAcceso: isAttended
            ? "VALID"
            : historialEscaneos.length > 0
              ? historialEscaneos[historialEscaneos.length - 1].status
              : "NOT_SCANNED",
          totalEscaneos: historialEscaneos.length,
          gateId: lastScan?.gateId || null,
          gateName: lastScan?.gateName || null,
          ultimoEscaneo: lastScan?.scanAt || null,
          escaneadoPor: lastScan?.scannerName || null,
          escaneadoPorUserId: lastScan?.staffId || null,
          historialEscaneos,
        });
      }
    }

    const traficoTipoBleta = Array.from(traficoTipoMap.values()).map((row) => ({
      ...row,
      porcentaje: pct(row.escaneados, row.total),
    }));

    const asistentesAlEvento = traficoTipoBleta.map((row) => ({
      categoria: row.categoria,
      total: row.total,
      asistidos: row.escaneados,
      porcentaje: row.porcentaje,
      asistentes: row.asistentes,
    }));

    const attendancePct =
      totalBoletos > 0
        ? `${Math.min(100, Math.round((accessGranted.length / totalBoletos) * 100))}%`
        : "0%";

    return response(200, {
      eventId,
      totalBoletos,
      accesosConcedidos: accessGranted.length,
      ingresosUnicos: boletosEscaneadosUnicos,
      porcentajeAsistencia: attendancePct,
      denegaciones: denied.length,
      dentroActual: uniqueInside,
      boletosEscaneadosUnicos,
      boletosNoEscaneados,
      estadosAcceso: statusCounter,
      estadoAccesoPorPuerta,
      boletasDetalle,
      asistentesAlEvento,
      traficoTipoBleta,
      tiempoAccesoPromedio: null,
      horaMaximaAcceso: null,
      horaAccesoPromedio: null,
    });
  } catch (error) {
    console.error("getEventAccessStats error:", error);
    return response(500, {
      error: "Error getting access stats",
      message: error.message,
    });
  }
};
