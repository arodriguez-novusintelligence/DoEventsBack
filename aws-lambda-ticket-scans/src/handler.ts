import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export type ScanStatusResult =
  | "success"
  | "alreadyUsed"
  | "invalidCode"
  | "wrongEvent";

interface SeatInfo {
  seatLabel?: string;
  floorId?: string;
  colNumber?: number;
  seatId?: string;
  rowLabel?: string;
  venueId?: string;
}

/** Formato interno del handler (body normalizado). seat es obligatorio solo si el evento tiene sillas (hasSeating). */
interface RegisterScanInput {
  rawScanValue: string;
  eventId: string;
  staffId: string;
  gateId: string;
  ticketId: string | null;
  orderId: string;
  category: string;
  seat?: SeatInfo;
  userId: string;
  deviceInfo: Record<string, unknown>;
  location: { latitude: number; longitude: number };
}

interface TicketScanItem {
  id: string;
  ticketId: string | null;
  eventId: string;
  staffId: string;
  gateId: string;
  rawScanValue: string;
  statusResult: ScanStatusResult;
  scanAt: string;
  hasSeating: boolean;
  orderId: string;
  category: string;
  seat: SeatInfo;
  userId: string;
  deviceInfo: Record<string, unknown>;
  location: { latitude: number; longitude: number };
}

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
const TICKETS_DIST_TABLE =
  process.env.TICKETS_DIST_TABLE ?? "TicketsDistribution";
const TICKET_ID_STATUS_INDEX = "TicketIdStatusIndex";
const STAFF_ACCESS_TABLE = process.env.STAFF_ACCESS_TABLE_NAME ?? "StaffAccess";
const ORDERS_TABLE =
  process.env.ORDERS_TABLE_NAME ?? process.env.ORDERS_TABLE ?? "Orders";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

interface OrderItem {
  order_id?: string;
  event_id?: string;
  user_id?: string;
  payment_status?: string;
  [key: string]: unknown;
}

interface DistTicketInstance {
  ticketInstanceId?: string;
  ticket_id?: string;
  ticketStatus?: string;
  orderId?: string;
  category?: string;
  qrCodeKey?: string;
  ownerId?: string;
  userId?: string;
  [key: string]: unknown;
}

interface TicketValidationResult {
  valid: boolean;
  reason?: string;
  ownerId?: string;
}

function toStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function isScanDateWithinEvent(
  scanAt: Date,
  fechaIni: string,
  fechaFin: string,
): boolean {
  const scanDay = toYYYYMMDD(scanAt);
  return (
    fechaIni.length === 8 &&
    fechaFin.length === 8 &&
    scanDay >= fechaIni &&
    scanDay <= fechaFin
  );
}

const ok = (body: unknown, statusCode = 200): APIGatewayProxyResult => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

const replyErr = (
  statusCode: number,
  message: string,
  extra?: Record<string, unknown>,
): APIGatewayProxyResult => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify({ message, ...extra }),
});

function onError(error: unknown): APIGatewayProxyResult {
  console.error("Handler error:", error);
  const errMsg = error instanceof Error ? error.message : String(error);
  const code =
    errMsg.includes("MISSING_") || errMsg.includes("INVALID_") ? 400 : 500;
  return replyErr(
    code,
    errMsg.includes("MISSING_") || errMsg.includes("INVALID_")
      ? errMsg
      : "Error interno del servidor.",
    process.env.NODE_ENV === "development"
      ? { details: String(error) }
      : undefined,
  );
}

function parseSeat(seat: unknown): SeatInfo | undefined {
  if (!seat || typeof seat !== "object" || Array.isArray(seat))
    return undefined;
  const s = seat as Record<string, unknown>;
  return {
    seatLabel: toStr(s.seatLabel),
    floorId: toStr(s.floorId),
    colNumber: typeof s.colNumber === "number" ? s.colNumber : undefined,
    seatId: toStr(s.seatId),
    rowLabel: toStr(s.rowLabel),
    venueId: toStr(s.venueId),
  };
}

function parseBody(body: unknown): RegisterScanInput {
  const requestBody = body as Record<string, unknown>;
  if (!requestBody || typeof requestBody !== "object") {
    throw new Error("INVALID_REQUEST_BODY");
  }

  const eventId = toStr(requestBody.eventId ?? requestBody.event_id);
  if (!eventId?.trim()) throw new Error("MISSING_EVENT_ID");

  const qrCodeKey = toStr(requestBody.qrCodeKey);
  if (!qrCodeKey?.trim()) throw new Error("MISSING_QR_CODE_KEY");

  const ticketInstanceId = toStr(requestBody.ticketInstanceId);
  if (!ticketInstanceId?.trim()) throw new Error("MISSING_TICKET_INSTANCE_ID");

  const orderId = toStr(requestBody.orderId);
  if (!orderId?.trim()) throw new Error("MISSING_ORDER_ID");

  const category = toStr(requestBody.category);
  if (!category?.trim()) throw new Error("MISSING_CATEGORY");

  const userId = toStr(requestBody.user_id ?? requestBody.userId);
  if (!userId?.trim()) throw new Error("MISSING_USER_ID");

  const staffId =
    toStr(requestBody.staffUserId ?? requestBody.staffId ?? requestBody.staff_id) ?? "";
  if (!staffId.trim()) throw new Error("MISSING_STAFF_USER_ID");

  const gateId = toStr(requestBody.gateId ?? requestBody.gate_id) ?? "";

  const seat = parseSeat(requestBody.seat);
  // seat se valida después según si el evento tiene sillas (hasSeating)

  const location = requestBody.location as { latitude?: number; longitude?: number } | null;
  if (
    !location ||
    typeof location !== "object" ||
    typeof location.latitude !== "number" ||
    typeof location.longitude !== "number"
  ) {
    throw new Error("MISSING_LOCATION");
  }

  const deviceInfo = requestBody.deviceInfo as Record<string, unknown> | null;
  if (!deviceInfo || typeof deviceInfo !== "object" || Array.isArray(deviceInfo)) {
    throw new Error("MISSING_DEVICE_INFO");
  }

  const rawScanValue = qrCodeKey.trim();
  const ticketId = ticketInstanceId.trim();

  const mergedDeviceInfo: Record<string, unknown> = {
    ...deviceInfo,
    orderId,
    category,
    userId,
  };
  if (seat && Object.keys(seat).length > 0) mergedDeviceInfo.seat = seat;

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

async function getOrder(orderId: string): Promise<OrderItem | null> {
  if (!ORDERS_TABLE || !orderId?.trim()) return null;
  try {
    const r = await doc.send(
      new GetCommand({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderId.trim() },
      }),
    );
    return (r.Item as OrderItem) ?? null;
  } catch {
    return null;
  }
}

async function getEvent(
  eventId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const r = await doc.send(
      new GetCommand({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
      }),
    );
    return (r.Item as Record<string, unknown>) ?? null;
  } catch (e) {
    console.error("getEvent failed:", e);
    return null;
  }
}

async function getVenue(
  venueId: string,
): Promise<Record<string, unknown> | null> {
  if (!VENUES_TABLE || !venueId?.trim()) return null;
  try {
    const r = await doc.send(
      new GetCommand({
        TableName: VENUES_TABLE,
        Key: { venue_id: venueId.trim() },
      }),
    );
    return (r.Item as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

async function getUser(
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (!USERS_TABLE || !userId?.trim()) return null;
  try {
    const r = await doc.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: { id: userId.trim() },
      }),
    );
    return (r.Item as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

async function isTicketAlreadyUsed(ticketId: string): Promise<boolean> {
  try {
    const r = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: TICKET_ID_STATUS_INDEX,
        KeyConditionExpression: "ticketId = :tid AND statusResult = :status",
        ExpressionAttributeValues: { ":tid": ticketId, ":status": "success" },
        Limit: 1,
      }),
    );
    return (r.Items?.length ?? 0) > 0;
  } catch (e) {
    console.error("isTicketAlreadyUsed failed:", e);
    return false;
  }
}

async function findAndValidateTicket(
  ticketInstanceId: string,
  eventId: string,
  orderId?: string,
): Promise<TicketValidationResult> {
  if (!TICKETS_DIST_TABLE) {
    return { valid: false, reason: "TICKETS_DIST_TABLE not configured" };
  }

  let lastKey: Record<string, unknown> | undefined;
  const tid = String(ticketInstanceId).trim();

  try {
    do {
      const r = await doc.send(
        new QueryCommand({
          TableName: TICKETS_DIST_TABLE,
          IndexName: TICKETS_DIST_EVENT_INDEX,
          KeyConditionExpression: "eventId = :eid",
          ExpressionAttributeValues: { ":eid": eventId },
          ExclusiveStartKey: lastKey,
        }),
      );

      const items = (r.Items ?? []) as Array<Record<string, unknown>>;
      for (const dist of items) {
        const tickets = (dist.tickets as DistTicketInstance[] | undefined) ?? [];
        const ticket = tickets.find(
          (t) => String(t.ticketInstanceId ?? t.ticket_id ?? "").trim() === tid,
        );
        if (!ticket) continue;

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

      lastKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
  } catch (e) {
    console.error("findAndValidateTicket failed:", e);
    return { valid: false, reason: "Error al validar el ticket. Intenta de nuevo." };
  }

  return { valid: false, reason: "ticket no encontrado en el evento" };
}

async function isStaffAssignedToGate(
  staffId: string,
  gateId: string,
  eventId: string,
): Promise<boolean> {
  if (!STAFF_ACCESS_TABLE || !gateId?.trim() || !staffId?.trim()) return true;
  const sk = `${eventId}#${gateId.trim()}`;
  try {
    const r = await doc.send(
      new GetCommand({
        TableName: STAFF_ACCESS_TABLE,
        Key: { userId: staffId.trim(), sk },
      }),
    );
    return r.Item != null;
  } catch {
    return false;
  }
}

type ScanCtx = { id: string; scanAtIso: string; input: RegisterScanInput };

function buildScanItem(
  ctx: ScanCtx,
  statusResult: ScanStatusResult,
  ticketIdOverride?: string | null,
  hasSeating = false,
): TicketScanItem {
  const { id, scanAtIso, input } = ctx;
  const ticketId =
    ticketIdOverride !== undefined ? ticketIdOverride : input.ticketId;
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

function buildScanDynamoItem(item: TicketScanItem): Record<string, unknown> {
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

async function saveScanAndRespond(
  item: TicketScanItem,
  message: string,
  extra?: {
    event?: Record<string, unknown> | null;
    venue?: Record<string, unknown> | null;
    ticketOwner?: Record<string, unknown> | null;
  },
): Promise<APIGatewayProxyResult> {
  try {
    await doc.send(
      new PutCommand({
        TableName: TABLE,
        Item: buildScanDynamoItem(item),
      }),
    );
  } catch (e) {
    console.error("DynamoDB PutCommand failed:", e);
    return replyErr(
      503,
      "No se pudo guardar el escaneo. Intenta de nuevo.",
      process.env.NODE_ENV === "development" ? { details: String(e) } : undefined,
    );
  }
  const body: Record<string, unknown> = { scan: item, message };
  if (extra?.event != null) body.event = extra.event;
  if (extra?.venue != null) body.venue = extra.venue;
  if (extra?.ticketOwner != null) body.ticketOwner = extra.ticketOwner;
  return ok(body, 201);
}

async function respondScan(
  ctx: ScanCtx,
  status: ScanStatusResult,
  message: string,
  ticketId?: string | null,
  hasSeating = false,
): Promise<APIGatewayProxyResult> {
  const item = buildScanItem(ctx, status, ticketId, hasSeating);
  return saveScanAndRespond(item, message);
}

async function registerScanHandler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  let body: unknown;
  try {
    body =
      typeof event.body === "string"
        ? JSON.parse(event.body ?? "{}")
        : (event.body ?? {});
  } catch {
    return replyErr(400, "INVALID_JSON_BODY");
  }

  let input: RegisterScanInput;
  try {
    input = parseBody(body);
    if (!input.staffId && event.requestContext?.authorizer?.userId) {
      input.staffId = String(event.requestContext.authorizer.userId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "VALIDATION_ERROR";
    return replyErr(400, msg);
  }

  const scanAt = new Date();
  const ctx: ScanCtx = {
    id: randomUUID(),
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
    if (
      orderUserId &&
      input.userId?.trim() &&
      orderUserId !== input.userId.trim()
    ) {
      return respondScan(ctx, "invalidCode", "El usuario no es el propietario del ticket.");
    }
    const paymentStatus = toStr(order.payment_status)?.toUpperCase();
    if (paymentStatus !== "APPROVED") {
      return respondScan(
        ctx,
        "invalidCode",
        "La orden no está aprobada (pagada). Solo se pueden escanear tickets de órdenes pagadas.",
      );
    }
  }

  if (STAFF_ACCESS_TABLE && gateId.trim() && !staffId.trim()) {
    return replyErr(
      400,
      "MISSING_STAFF_ID: Se requiere staffUserId (o staffId) cuando se envía gateId para validar asignación a la puerta.",
    );
  }

  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let ticketId: string | null = input.ticketId;
  if (!ticketId && uuidLike.test(rawScanValue.trim())) {
    ticketId = rawScanValue.trim();
  }
  if (!ticketId) {
    return respondScan(ctx, "invalidCode", "Código no válido o no se pudo identificar el ticket.", null);
  }

  const validation = await findAndValidateTicket(
    ticketId,
    eventId,
    input.orderId,
  );
  if (!validation.valid) {
    return respondScan(
      ctx,
      "invalidCode",
      validation.reason ??
        "El ticket no pertenece a este evento o no está vendido (SOLD).",
      ticketId,
    );
  }

  const staffAssigned = await isStaffAssignedToGate(staffId, gateId, eventId);
  if (!staffAssigned) {
    return respondScan(
      ctx,
      "invalidCode",
      "El staff no está asignado a esta puerta para el evento. Solo el personal asignado puede escanear en esta puerta.",
      ticketId,
    );
  }

  const eventRow = await getEvent(eventId);
  if (!eventRow) {
    return respondScan(ctx, "wrongEvent", "Evento no encontrado o escaneo fuera de fechas.");
  }

  const hasSeating = eventRow.hasSeating === true;

  if (hasSeating && (!input.seat || !input.seat.seatLabel?.trim())) {
    return respondScan(
      ctx,
      "invalidCode",
      "Este evento tiene ubicaciones asignadas; se requiere el asiento.",
      ticketId,
      hasSeating,
    );
  }

  const fechaIni = toStr(eventRow.fechaIni ?? eventRow.fecha_ini) ?? "";
  const fechaFin = toStr(eventRow.fechaFin ?? eventRow.fecha_fin) ?? "";
  if (
    !fechaIni ||
    !fechaFin ||
    !isScanDateWithinEvent(scanAt, fechaIni, fechaFin)
  ) {
    return respondScan(
      ctx,
      "wrongEvent",
      "El escaneo está fuera de las fechas del evento. Solo se permite escanear entre fecha de inicio y fecha de fin.",
      ticketId,
      hasSeating,
    );
  }

  const ticketOwnerId = validation.ownerId?.trim();
  const payloadUserId = input.userId?.trim();
  if (ticketOwnerId && payloadUserId && ticketOwnerId !== payloadUserId) {
    return respondScan(
      ctx,
      "invalidCode",
      "El usuario no es el propietario del ticket. Solo el comprador puede utilizar este ticket.",
      ticketId,
      hasSeating,
    );
  }

  const alreadyUsed = await isTicketAlreadyUsed(ticketId);
  const statusResult: ScanStatusResult = alreadyUsed ? "alreadyUsed" : "success";
  const message =
    statusResult === "success"
      ? "Escaneo registrado correctamente."
      : "Este ticket ya fue utilizado (escaneado previamente).";

  const item = buildScanItem(ctx, statusResult, ticketId, hasSeating);
  const venueId = toStr(eventRow.venueId ?? eventRow.venue_id);
  let venue: Record<string, unknown> | null = null;
  let ticketOwner: Record<string, unknown> | null = null;
  try {
    [venue, ticketOwner] = await Promise.all([
      venueId ? getVenue(venueId) : Promise.resolve(null),
      ticketOwnerId ? getUser(ticketOwnerId) : Promise.resolve(null),
    ]);
  } catch (e) {
    console.warn("Enrichment (venue/user) failed, returning without them:", e);
  }
  return saveScanAndRespond(item, message, {
    event: eventRow,
    venue: venue ?? undefined,
    ticketOwner: ticketOwner ?? undefined,
  });
}

function normalizeEvent(event: APIGatewayProxyEvent): APIGatewayProxyEvent {
  return {
    ...event,
    pathParameters: event.pathParameters ?? {},
    queryStringParameters: event.queryStringParameters ?? {},
  };
}

function wrap(
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>,
) {
  return async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      return await handler(normalizeEvent(event));
    } catch (e) {
      return onError(e);
    }
  };
}

export const registerScan = wrap(registerScanHandler);
