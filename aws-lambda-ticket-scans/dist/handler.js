"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerScan = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const crypto_1 = require("crypto");
const CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
};
const TABLE = process.env.TICKET_SCANS_TABLE_NAME ?? "TicketScans";
const EVENTS_TABLE = process.env.EVENTS_TABLE ?? "Eventos";
const VENUES_TABLE = process.env.VENUES_TABLE ?? "Venues";
const USERS_TABLE = process.env.USERS_TABLE ?? "Client";
const TICKETS_DIST_EVENT_INDEX = "eventIdIndex";
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE ?? "TicketsDistribution";
const TICKET_ID_STATUS_INDEX = "TicketIdStatusIndex";
const STAFF_ACCESS_TABLE = process.env.STAFF_ACCESS_TABLE_NAME ?? "StaffAccess";
const ORDERS_TABLE = process.env.ORDERS_TABLE_NAME ?? process.env.ORDERS_TABLE ?? "Orders";
const doc = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});
function toStr(v) {
    if (v == null)
        return undefined;
    if (typeof v === "string")
        return v;
    if (typeof v === "number")
        return String(v);
    return undefined;
}
function toYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
}
function isScanDateWithinEvent(scanAt, fechaIni, fechaFin) {
    const scanDay = toYYYYMMDD(scanAt);
    return (fechaIni.length === 8 &&
        fechaFin.length === 8 &&
        scanDay >= fechaIni &&
        scanDay <= fechaFin);
}
const ok = (body, statusCode = 200) => ({
    statusCode,
    headers: CORS,
    body: JSON.stringify(body),
});
const replyErr = (statusCode, message, extra) => ({
    statusCode,
    headers: CORS,
    body: JSON.stringify({ message, ...extra }),
});
function onError(error) {
    console.error("Handler error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const code = errMsg.includes("MISSING_") || errMsg.includes("INVALID_") ? 400 : 500;
    return replyErr(code, errMsg.includes("MISSING_") || errMsg.includes("INVALID_")
        ? errMsg
        : "Error interno del servidor.", process.env.NODE_ENV === "development"
        ? { details: String(error) }
        : undefined);
}
function parseSeat(seat) {
    if (!seat || typeof seat !== "object" || Array.isArray(seat))
        return undefined;
    const s = seat;
    return {
        seatLabel: toStr(s.seatLabel),
        floorId: toStr(s.floorId),
        colNumber: typeof s.colNumber === "number" ? s.colNumber : undefined,
        seatId: toStr(s.seatId),
        rowLabel: toStr(s.rowLabel),
        venueId: toStr(s.venueId),
    };
}
function parseBody(body) {
    const requestBody = body;
    if (!requestBody || typeof requestBody !== "object") {
        throw new Error("INVALID_REQUEST_BODY");
    }
    const eventId = toStr(requestBody.eventId ?? requestBody.event_id);
    if (!eventId?.trim())
        throw new Error("MISSING_EVENT_ID");
    const qrCodeKey = toStr(requestBody.qrCodeKey);
    if (!qrCodeKey?.trim())
        throw new Error("MISSING_QR_CODE_KEY");
    const ticketInstanceId = toStr(requestBody.ticketInstanceId);
    if (!ticketInstanceId?.trim())
        throw new Error("MISSING_TICKET_INSTANCE_ID");
    const orderId = toStr(requestBody.orderId);
    if (!orderId?.trim())
        throw new Error("MISSING_ORDER_ID");
    const category = toStr(requestBody.category);
    if (!category?.trim())
        throw new Error("MISSING_CATEGORY");
    const userId = toStr(requestBody.user_id ?? requestBody.userId);
    if (!userId?.trim())
        throw new Error("MISSING_USER_ID");
    const staffId = toStr(requestBody.staffUserId ?? requestBody.staffId ?? requestBody.staff_id) ?? "";
    if (!staffId.trim())
        throw new Error("MISSING_STAFF_USER_ID");
    const gateId = toStr(requestBody.gateId ?? requestBody.gate_id) ?? "";
    const seat = parseSeat(requestBody.seat);
    // seat se valida después según si el evento tiene sillas (hasSeating)
    const location = requestBody.location;
    if (!location ||
        typeof location !== "object" ||
        typeof location.latitude !== "number" ||
        typeof location.longitude !== "number") {
        throw new Error("MISSING_LOCATION");
    }
    const deviceInfo = requestBody.deviceInfo;
    if (!deviceInfo || typeof deviceInfo !== "object" || Array.isArray(deviceInfo)) {
        throw new Error("MISSING_DEVICE_INFO");
    }
    const rawScanValue = qrCodeKey.trim();
    const ticketId = ticketInstanceId.trim();
    const mergedDeviceInfo = {
        ...deviceInfo,
        orderId,
        category,
        userId,
    };
    if (seat && Object.keys(seat).length > 0)
        mergedDeviceInfo.seat = seat;
    return {
        rawScanValue: rawScanValue || ticketId,
        eventId: eventId.trim(),
        staffId: staffId.trim(),
        gateId: gateId.trim(),
        ticketId,
        orderId: orderId.trim(),
        category: category.trim(),
        seat: seat ?? {},
        userId: userId.trim(),
        deviceInfo: mergedDeviceInfo,
        location: { latitude: location.latitude, longitude: location.longitude },
    };
}
async function getOrder(orderId) {
    if (!ORDERS_TABLE || !orderId?.trim())
        return null;
    try {
        const r = await doc.send(new lib_dynamodb_1.GetCommand({
            TableName: ORDERS_TABLE,
            Key: { order_id: orderId.trim() },
        }));
        return r.Item ?? null;
    }
    catch {
        return null;
    }
}
async function getEvent(eventId) {
    try {
        const r = await doc.send(new lib_dynamodb_1.GetCommand({
            TableName: EVENTS_TABLE,
            Key: { id: eventId },
        }));
        return r.Item ?? null;
    }
    catch (e) {
        console.error("getEvent failed:", e);
        return null;
    }
}
async function getVenue(venueId) {
    if (!VENUES_TABLE || !venueId?.trim())
        return null;
    try {
        const r = await doc.send(new lib_dynamodb_1.GetCommand({
            TableName: VENUES_TABLE,
            Key: { venue_id: venueId.trim() },
        }));
        return r.Item ?? null;
    }
    catch {
        return null;
    }
}
async function getUser(userId) {
    if (!USERS_TABLE || !userId?.trim())
        return null;
    try {
        const r = await doc.send(new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE,
            Key: { id: userId.trim() },
        }));
        return r.Item ?? null;
    }
    catch {
        return null;
    }
}
async function isTicketAlreadyUsed(ticketId) {
    try {
        const r = await doc.send(new lib_dynamodb_1.QueryCommand({
            TableName: TABLE,
            IndexName: TICKET_ID_STATUS_INDEX,
            KeyConditionExpression: "ticketId = :tid AND statusResult = :status",
            ExpressionAttributeValues: { ":tid": ticketId, ":status": "success" },
            Limit: 1,
        }));
        return (r.Items?.length ?? 0) > 0;
    }
    catch (e) {
        console.error("isTicketAlreadyUsed failed:", e);
        return false;
    }
}
async function findAndValidateTicket(ticketInstanceId, eventId, orderId) {
    if (!TICKETS_DIST_TABLE) {
        return { valid: false, reason: "TICKETS_DIST_TABLE not configured" };
    }
    let lastKey;
    const tid = String(ticketInstanceId).trim();
    try {
        do {
            const r = await doc.send(new lib_dynamodb_1.QueryCommand({
                TableName: TICKETS_DIST_TABLE,
                IndexName: TICKETS_DIST_EVENT_INDEX,
                KeyConditionExpression: "eventId = :eid",
                ExpressionAttributeValues: { ":eid": eventId },
                ExclusiveStartKey: lastKey,
            }));
            const items = (r.Items ?? []);
            for (const dist of items) {
                const tickets = dist.tickets ?? [];
                const ticket = tickets.find((t) => String(t.ticketInstanceId ?? t.ticket_id ?? "").trim() === tid);
                if (!ticket)
                    continue;
                if (orderId != null && orderId !== "" && ticket.orderId !== orderId) {
                    return { valid: false, reason: "orderId no coincide con el ticket" };
                }
                if (ticket.ticketStatus !== "SOLD") {
                    return {
                        valid: false,
                        reason: `ticket no está vendido (estado: ${ticket.ticketStatus ?? "unknown"})`,
                    };
                }
                const ownerId = toStr(ticket.ownerId ?? ticket.userId) ?? undefined;
                return { valid: true, ownerId };
            }
            lastKey = r.LastEvaluatedKey;
        } while (lastKey);
    }
    catch (e) {
        console.error("findAndValidateTicket failed:", e);
        return { valid: false, reason: "Error al validar el ticket. Intenta de nuevo." };
    }
    return { valid: false, reason: "ticket no encontrado en el evento" };
}
async function isStaffAssignedToGate(staffId, gateId, eventId) {
    if (!STAFF_ACCESS_TABLE || !gateId?.trim() || !staffId?.trim())
        return true;
    const sk = `${eventId}#${gateId.trim()}`;
    try {
        const r = await doc.send(new lib_dynamodb_1.GetCommand({
            TableName: STAFF_ACCESS_TABLE,
            Key: { userId: staffId.trim(), sk },
        }));
        return r.Item != null;
    }
    catch {
        return false;
    }
}
function buildScanItem(ctx, statusResult, ticketIdOverride, hasSeating = false) {
    const { id, scanAtIso, input } = ctx;
    const ticketId = ticketIdOverride !== undefined ? ticketIdOverride : input.ticketId;
    return {
        id,
        ticketId,
        eventId: input.eventId,
        staffId: input.staffId,
        gateId: input.gateId,
        rawScanValue: input.rawScanValue,
        statusResult,
        scanAt: scanAtIso,
        hasSeating,
        orderId: input.orderId,
        category: input.category,
        seat: input.seat ?? {},
        userId: input.userId,
        deviceInfo: input.deviceInfo,
        location: input.location,
    };
}
function buildScanDynamoItem(item) {
    return {
        id: item.id,
        ticketId: item.ticketId ?? null,
        eventId: item.eventId,
        staffId: item.staffId,
        gateId: item.gateId,
        rawScanValue: item.rawScanValue,
        statusResult: item.statusResult,
        scanAt: item.scanAt,
        hasSeating: item.hasSeating,
        orderId: item.orderId,
        category: item.category,
        seat: item.seat,
        userId: item.userId,
        deviceInfo: item.deviceInfo,
        location: item.location,
    };
}
async function saveScanAndRespond(item, message, extra) {
    try {
        await doc.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLE,
            Item: buildScanDynamoItem(item),
        }));
    }
    catch (e) {
        console.error("DynamoDB PutCommand failed:", e);
        return replyErr(503, "No se pudo guardar el escaneo. Intenta de nuevo.", process.env.NODE_ENV === "development" ? { details: String(e) } : undefined);
    }
    const body = { scan: item, message };
    if (extra?.event != null)
        body.event = extra.event;
    if (extra?.venue != null)
        body.venue = extra.venue;
    if (extra?.ticketOwner != null)
        body.ticketOwner = extra.ticketOwner;
    return ok(body, 201);
}
async function respondScan(ctx, status, message, ticketId, hasSeating = false) {
    const item = buildScanItem(ctx, status, ticketId, hasSeating);
    return saveScanAndRespond(item, message);
}
async function registerScanHandler(event) {
    let body;
    try {
        body =
            typeof event.body === "string"
                ? JSON.parse(event.body ?? "{}")
                : (event.body ?? {});
    }
    catch {
        return replyErr(400, "INVALID_JSON_BODY");
    }
    let input;
    try {
        input = parseBody(body);
        if (!input.staffId && event.requestContext?.authorizer?.userId) {
            input.staffId = String(event.requestContext.authorizer.userId);
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : "VALIDATION_ERROR";
        return replyErr(400, msg);
    }
    const scanAt = new Date();
    const ctx = {
        id: (0, crypto_1.randomUUID)(),
        scanAtIso: scanAt.toISOString(),
        input,
    };
    const { eventId, rawScanValue, staffId, gateId } = input;
    if (input.orderId?.trim()) {
        const order = await getOrder(input.orderId.trim());
        if (!order) {
            return respondScan(ctx, "invalidCode", "Orden no encontrada.");
        }
        const orderEventId = toStr(order.event_id)?.trim();
        if (orderEventId && eventId !== orderEventId) {
            return respondScan(ctx, "invalidCode", "El ticket no corresponde a este evento.");
        }
        const orderUserId = toStr(order.user_id)?.trim();
        if (orderUserId &&
            input.userId?.trim() &&
            orderUserId !== input.userId.trim()) {
            return respondScan(ctx, "invalidCode", "El usuario no es el propietario del ticket.");
        }
        const paymentStatus = toStr(order.payment_status)?.toUpperCase();
        if (paymentStatus !== "APPROVED") {
            return respondScan(ctx, "invalidCode", "La orden no está aprobada (pagada). Solo se pueden escanear tickets de órdenes pagadas.");
        }
    }
    if (STAFF_ACCESS_TABLE && gateId.trim() && !staffId.trim()) {
        return replyErr(400, "MISSING_STAFF_ID: Se requiere staffUserId (o staffId) cuando se envía gateId para validar asignación a la puerta.");
    }
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let ticketId = input.ticketId;
    if (!ticketId && uuidLike.test(rawScanValue.trim())) {
        ticketId = rawScanValue.trim();
    }
    if (!ticketId) {
        return respondScan(ctx, "invalidCode", "Código no válido o no se pudo identificar el ticket.", null);
    }
    const validation = await findAndValidateTicket(ticketId, eventId, input.orderId);
    if (!validation.valid) {
        return respondScan(ctx, "invalidCode", validation.reason ??
            "El ticket no pertenece a este evento o no está vendido (SOLD).", ticketId);
    }
    const staffAssigned = await isStaffAssignedToGate(staffId, gateId, eventId);
    if (!staffAssigned) {
        return respondScan(ctx, "invalidCode", "El staff no está asignado a esta puerta para el evento. Solo el personal asignado puede escanear en esta puerta.", ticketId);
    }
    const eventRow = await getEvent(eventId);
    if (!eventRow) {
        return respondScan(ctx, "wrongEvent", "Evento no encontrado o escaneo fuera de fechas.");
    }
    const hasSeating = eventRow.hasSeating === true;
    if (hasSeating && (!input.seat || !input.seat.seatLabel?.trim())) {
        return respondScan(ctx, "invalidCode", "Este evento tiene ubicaciones asignadas; se requiere el asiento.", ticketId, hasSeating);
    }
    const fechaIni = toStr(eventRow.fechaIni ?? eventRow.fecha_ini) ?? "";
    const fechaFin = toStr(eventRow.fechaFin ?? eventRow.fecha_fin) ?? "";
    if (!fechaIni ||
        !fechaFin ||
        !isScanDateWithinEvent(scanAt, fechaIni, fechaFin)) {
        return respondScan(ctx, "wrongEvent", "El escaneo está fuera de las fechas del evento. Solo se permite escanear entre fecha de inicio y fecha de fin.", ticketId, hasSeating);
    }
    const ticketOwnerId = validation.ownerId?.trim();
    const payloadUserId = input.userId?.trim();
    if (ticketOwnerId && payloadUserId && ticketOwnerId !== payloadUserId) {
        return respondScan(ctx, "invalidCode", "El usuario no es el propietario del ticket. Solo el comprador puede utilizar este ticket.", ticketId, hasSeating);
    }
    const alreadyUsed = await isTicketAlreadyUsed(ticketId);
    const statusResult = alreadyUsed ? "alreadyUsed" : "success";
    const message = statusResult === "success"
        ? "Escaneo registrado correctamente."
        : "Este ticket ya fue utilizado (escaneado previamente).";
    const item = buildScanItem(ctx, statusResult, ticketId, hasSeating);
    const venueId = toStr(eventRow.venueId ?? eventRow.venue_id);
    let venue = null;
    let ticketOwner = null;
    try {
        [venue, ticketOwner] = await Promise.all([
            venueId ? getVenue(venueId) : Promise.resolve(null),
            ticketOwnerId ? getUser(ticketOwnerId) : Promise.resolve(null),
        ]);
    }
    catch (e) {
        console.warn("Enrichment (venue/user) failed, returning without them:", e);
    }
    return saveScanAndRespond(item, message, {
        event: eventRow,
        venue: venue ?? undefined,
        ticketOwner: ticketOwner ?? undefined,
    });
}
function normalizeEvent(event) {
    return {
        ...event,
        pathParameters: event.pathParameters ?? {},
        queryStringParameters: event.queryStringParameters ?? {},
    };
}
function wrap(handler) {
    return async (event) => {
        try {
            return await handler(normalizeEvent(event));
        }
        catch (e) {
            return onError(e);
        }
    };
}
exports.registerScan = wrap(registerScanHandler);
//# sourceMappingURL=handler.js.map