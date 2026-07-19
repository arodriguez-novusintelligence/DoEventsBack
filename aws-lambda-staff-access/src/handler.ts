/**
 * Staff Access – Control de acceso por evento/puerta
 *
 * 1. Admin guarda/edita: POST body con accessControl → se guarda en DynamoDB y se notifica (push, inApp, email) a cada userId del payload.
 * 2. Usuario consulta: GET por userId → devuelve a qué evento, venue y puerta está asignado.
 * 3. Admin consulta: GET por eventId → devuelve el control de acceso guardado (para pintar en el front).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

// ----- Tipos -----

interface AccessControlItem {
  gateId: string;
  gateName?: string;
  assignedUsers: string[];
}

interface SaveAssignmentsInput {
  eventId: string;
  eventName?: string;
  venueId: string;
  venueName?: string;
  accessControl: AccessControlItem[];
}

/** Tabla: PK = userId, SK = sk (eventId#gateId) */
interface StaffAccessItem {
  userId: string;
  sk: string;
  eventId: string;
  gateId: string;
  gateName: string;
  venueId: string;
  venueName: string;
  eventName: string;
  assignedAt: string;
}

/** User data from Client table; always includes userId, rest of fields come from the table. */
type UserInfo = Record<string, unknown>;

// ----- Config -----

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": "true",
};

const TABLE = process.env.STAFF_ACCESS_TABLE_NAME ?? "";
const GSI_NAME = "AdminEventIndex";
const USERS_TABLE = process.env.USERS_TABLE ?? "Client";
const EVENTS_TABLE = process.env.EVENTS_TABLE ?? "Eventos";
const VENUES_TABLE = process.env.VENUES_TABLE ?? "Venues";
const NOTIFICATIONS_FUNCTION = process.env.NOTIFICATIONS_FUNCTION ?? "";
const MAX_BATCH = 25;
const BATCH_GET_LIMIT = 100;

const PK = "userId";
const SK = "sk";

const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2" }),
);
const lambda = new LambdaClient({});

const PROFILE_BUCKET = process.env.PROFILE_IMAGES_BUCKET ?? "doeventprofileimagesbucket";
const s3 = new S3Client({
  region: process.env.PROFILE_IMAGES_BUCKET_REGION || process.env.AWS_REGION || "us-east-1",
});

function toStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/**
 * Convierte hora en formato 12h (ej. "01:29 P. M.", "12:00 A. M.") o ya 24h a "HH:mm" en 24h.
 * Devuelve siempre formato estándar para API (sin AM/PM).
 */
function normalizeTimeTo24h(value: string): string {
  const s = (value ?? "").trim();
  if (!s) return "00:00";
  // Si ya es HH:mm o HH:mm:ss (24h), normalizar y devolver
  const match24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = match24[2];
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:${m}`;
  }
  // Formato 12h: "1:29 P. M.", "01:29 P. M.", "12:00 A. M."
  const match12 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(A\.?\s*M\.?|P\.?\s*M\.?|AM|PM)/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const ampm = (match12[4] ?? "").toUpperCase().replace(/\s/g, "").replace(/\./g, "");
    if (ampm.startsWith("P") && h !== 12) h += 12;
    if (ampm.startsWith("A") && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  return "00:00";
}

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Resuelve la URL de foto de perfil:
 * - Si es URL externa (http/https) → se devuelve sin firmar (usuario de otra plataforma: Google, Facebook, etc.).
 * - Si es clave S3 (usuario registrado en la app) → se devuelve signed URL.
 */
async function resolveUserProfileImageUrl(
  fotoPerfilUrl: string | undefined,
  _platform?: string,
): Promise<string | null> {
  if (!fotoPerfilUrl || typeof fotoPerfilUrl !== "string") return null;
  if (isHttpUrl(fotoPerfilUrl)) return fotoPerfilUrl;
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: PROFILE_BUCKET, Key: fotoPerfilUrl }),
      { expiresIn: 3600 },
    );
  } catch {
    return fotoPerfilUrl;
  }
}

const ok = (body: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: CORS,
  body: JSON.stringify(body),
});

const replyErr = (statusCode: number, message: string, extra?: Record<string, unknown>): APIGatewayProxyResult => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify({ message, ...extra }),
});

function onError(error: unknown): APIGatewayProxyResult {
  console.error("Handler error:", error);
  const errMsg = error instanceof Error ? error.message : String(error);
  const errName = error instanceof Error ? error.name : "";
  let code = 500;
  let message = "Error interno del servidor.";

  if (errMsg.includes("MISSING_") || errMsg.includes("INVALID_") || errMsg.includes("GATE_") || errMsg.includes("USER_")) {
    code = 400;
    message = errMsg;
  } else if (errMsg.includes("UNAUTHORIZED") || errMsg.includes("FORBIDDEN")) {
    code = 403;
    message = errMsg;
  } else if (errMsg.includes("NOT_FOUND")) {
    code = 404;
    message = errMsg;
  } else if (errName === "ResourceNotFoundException" || errMsg.includes("ResourceNotFoundException")) {
    code = 503;
    message = "Recurso no encontrado (tabla o índice). Comprueba que la tabla y el GSI existan.";
  } else if (errName === "ValidationException" || errMsg.includes("ValidationException") || errMsg.includes("does not have the specified index")) {
    code = 503;
    message = "La tabla no tiene el GSI AdminEventIndex. Despliega con la tabla incluida en serverless (staff-access-{stage}) o crea el índice en tu tabla.";
    return replyErr(code, message, { tableUsed: TABLE, gsiUsed: GSI_NAME });
  } else if (errName === "AccessDeniedException" || errMsg.includes("AccessDeniedException")) {
    code = 503;
    message = "Sin permiso para acceder a la base de datos. Revisa los permisos IAM de la Lambda.";
  } else if (errMsg.includes("key element does not match the schema") || errMsg.includes("does not match the schema")) {
    code = 503;
    message = "Las claves no coinciden con el esquema. La tabla debe tener partition key 'userId' y sort key 'sk'.";
    return replyErr(code, message, { tableUsed: TABLE });
  } else if (errMsg.includes("DynamoDB") || errMsg.includes("write failed")) {
    message = "Error al guardar o leer datos. Comprueba la tabla y el índice.";
  }

  return replyErr(
    code,
    message,
    process.env.NODE_ENV === "development" ? { details: String(error) } : undefined,
  );
}

// ----- DynamoDB -----

const sk = (eventId: string, gateId: string) => `${eventId}#${gateId}`;

function toStaffAccessItem(row: Record<string, unknown>): StaffAccessItem {
  return {
    userId: toStr(row[PK]) ?? toStr(row.userId) ?? "",
    sk: toStr(row[SK]) ?? toStr(row.sk) ?? "",
    eventId: toStr(row.eventId) ?? "",
    gateId: toStr(row.gateId) ?? "",
    gateName: toStr(row.gateName) ?? "",
    venueId: toStr(row.venueId) ?? "",
    venueName: toStr(row.venueName) ?? "",
    eventName: toStr(row.eventName) ?? "",
    assignedAt: toStr(row.assignedAt) ?? "",
  };
}

async function queryByEventId(eventId: string): Promise<StaffAccessItem[]> {
  const r = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: GSI_NAME,
      KeyConditionExpression: "eventId = :e",
      ExpressionAttributeValues: { ":e": eventId },
    }),
  );
  return ((r.Items ?? []) as Record<string, unknown>[]).map(toStaffAccessItem);
}

async function queryByUserId(userId: string): Promise<StaffAccessItem[]> {
  const r = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: `${PK} = :u`,
      ExpressionAttributeValues: { ":u": userId },
    }),
  );
  return ((r.Items ?? []) as Record<string, unknown>[]).map(toStaffAccessItem);
}

/** Builds a plain object from a Client row: userId + all primitive fields (string, number, boolean). */
function toUserInfo(row: Record<string, unknown>): UserInfo {
  const userId = toStr(row.id) ?? toStr(row.userId) ?? "";
  const info: UserInfo = { userId };
  if (userId) {
    info.userName = toStr(row.userName) ?? toStr(row.name);
    info.userEmail = toStr(row.userEmail) ?? toStr(row.email);
  }
  Object.entries(row).forEach(([key, value]) => {
    if (key === "id" || key === "userId") return;
    if (value !== null && value !== undefined && typeof value !== "object") {
      info[key] = value;
    }
  });
  return info;
}

async function getUsersByIds(userIds: string[]): Promise<Map<string, UserInfo>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0 || !USERS_TABLE) return new Map();

  const out = new Map<string, UserInfo>();
  for (let i = 0; i < ids.length; i += BATCH_GET_LIMIT) {
    const chunk = ids.slice(i, i + BATCH_GET_LIMIT);
    const r = await doc.send(
      new BatchGetCommand({
        RequestItems: { [USERS_TABLE]: { Keys: chunk.map((id) => ({ id })) } },
      }),
    );
    const rows = (r.Responses?.[USERS_TABLE] ?? []) as Array<Record<string, unknown>>;
    rows.forEach((row) => {
      const info = toUserInfo(row);
      const userId = toStr(info.userId) ?? "";
      if (userId) out.set(userId, info);
    });
  }
  return out;
}

const EVENTS_USER_INDEX = "userIdIndex";

/** Eventos table: GSI userIdIndex. Returns list of event ids that belong to this user (organizer). */
async function getEventIdsByUserId(userId: string): Promise<string[]> {
  if (!EVENTS_TABLE) return [];
  const eventIds: string[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const r = await doc.send(
      new QueryCommand({
        TableName: EVENTS_TABLE,
        IndexName: EVENTS_USER_INDEX,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ExclusiveStartKey: lastKey,
      }),
    );
    const items = (r.Items ?? []) as Array<Record<string, unknown>>;
    for (const row of items) {
      const id = toStr(row.id) ?? "";
      if (id) eventIds.push(id);
    }
    lastKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return eventIds;
}

/** Eventos table: PK = id. Returns map eventId -> full event item. */
async function getEventsByIds(eventIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const ids = [...new Set(eventIds)].filter(Boolean);
  if (ids.length === 0 || !EVENTS_TABLE) return new Map();

  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += BATCH_GET_LIMIT) {
    const chunk = ids.slice(i, i + BATCH_GET_LIMIT);
    const r = await doc.send(
      new BatchGetCommand({
        RequestItems: { [EVENTS_TABLE]: { Keys: chunk.map((id) => ({ id })) } },
      }),
    );
    const rows = (r.Responses?.[EVENTS_TABLE] ?? []) as Array<Record<string, unknown>>;
    rows.forEach((row) => {
      const id = toStr(row.id) ?? "";
      if (id) out.set(id, row);
    });
  }
  return out;
}

/** Venues table: PK = venue_id. Returns map venueId -> full venue item. */
async function getVenuesByIds(venueIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const ids = [...new Set(venueIds)].filter(Boolean);
  if (ids.length === 0 || !VENUES_TABLE) return new Map();

  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += BATCH_GET_LIMIT) {
    const chunk = ids.slice(i, i + BATCH_GET_LIMIT);
    const r = await doc.send(
      new BatchGetCommand({
        RequestItems: { [VENUES_TABLE]: { Keys: chunk.map((venueId) => ({ venue_id: venueId })) } },
      }),
    );
    const rows = (r.Responses?.[VENUES_TABLE] ?? []) as Array<Record<string, unknown>>;
    rows.forEach((row) => {
      const vid = toStr(row.venue_id) ?? "";
      if (vid) out.set(vid, row);
    });
  }
  return out;
}

/** Borra y luego escribe en lotes de 25 (límite DynamoDB). Reintenta una vez si hay no procesados. */
async function saveToDynamo(
  keysToDelete: { userId: string; sk: string }[],
  itemsToPut: StaffAccessItem[],
): Promise<void> {
  const run = async (ops: Record<string, unknown>[]) => {
    if (ops.length === 0) return;
    let unprocessed = ops;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await doc.send(
        new BatchWriteCommand({ RequestItems: { [TABLE]: unprocessed } }),
      );
      unprocessed = (result.UnprocessedItems?.[TABLE] ?? []) as Record<string, unknown>[];
      if (unprocessed.length === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("DynamoDB: write failed after retry");
  };

  for (let i = 0; i < keysToDelete.length; i += MAX_BATCH) {
    await run(
      keysToDelete.slice(i, i + MAX_BATCH).map((k) => ({
        DeleteRequest: { Key: { [PK]: k.userId, [SK]: k.sk } },
      })),
    );
  }
  for (let i = 0; i < itemsToPut.length; i += MAX_BATCH) {
    await run(
      itemsToPut.slice(i, i + MAX_BATCH).map((item) => ({
        PutRequest: {
          Item: {
            [PK]: item.userId,
            [SK]: item.sk,
            eventId: item.eventId,
            gateId: item.gateId,
            gateName: item.gateName,
            venueId: item.venueId,
            venueName: item.venueName,
            eventName: item.eventName,
            assignedAt: item.assignedAt,
          },
        },
      })),
    );
  }
}

// ----- Notificaciones -----

async function notifyUser(item: StaffAccessItem): Promise<void> {
  if (!NOTIFICATIONS_FUNCTION) return;
  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: NOTIFICATIONS_FUNCTION,
        InvocationType: "Event",
        Payload: new TextEncoder().encode(
          JSON.stringify({
            triggerId: "STAFF_ASSIGNED",
            userId: item.userId,
            eventId: item.eventId,
            channels: ["push", "inApp", "email"],
            metadata: {
              userId: item.userId,
              eventId: item.eventId,
              eventName: item.eventName,
              gateId: item.gateId,
              gateName: item.gateName,
              venueName: item.venueName,
            },
          }),
        ),
      }),
    );
  } catch (e) {
    console.warn("Notificación staff:", item.userId, e);
  }
}

function validateBody(body: unknown): asserts body is SaveAssignmentsInput {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object") throw new Error("INVALID_REQUEST_BODY");
  const eventId = b.eventId ?? b.event_id;
  const venueId = b.venueId ?? b.venue_id;
  const accessControl = b.accessControl;
  if (!eventId || typeof eventId !== "string") throw new Error("MISSING_OR_INVALID_EVENT_ID");
  if (!venueId || typeof venueId !== "string") throw new Error("MISSING_OR_INVALID_VENUE_ID");
  if (!Array.isArray(accessControl) || accessControl.length === 0) throw new Error("ACCESS_CONTROL_REQUIRED");

  accessControl.forEach((gate: unknown, i: number) => {
    const g = gate as { gateId?: string; assignedUsers?: unknown[] };
    const ids = g?.assignedUsers;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error(`GATE_MUST_HAVE_AT_LEAST_ONE_USER: gateIndex=${i}`);
    ids.forEach((id) => {
      if (typeof id !== "string" || !id.trim()) throw new Error(`INVALID_USER_ID: gateIndex=${i}`);
    });
  });

  const allIds = accessControl.flatMap((g: unknown) => (g as AccessControlItem).assignedUsers);
  if (allIds.length !== new Set(allIds).size) throw new Error("USER_CANNOT_BE_IN_TWO_GATES_SAME_EVENT");
}

// ----- Handlers -----

/** 1. Admin guarda/edita control de acceso → guarda en DB y notifica a cada usuario del payload */
async function saveAssignmentsHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: unknown;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body ?? "{}") : event.body ?? {};
  } catch {
    return replyErr(400, "INVALID_JSON_BODY");
  }

  try {
    validateBody(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "VALIDATION_ERROR";
    if (msg.startsWith("GATE_MUST_HAVE")) return replyErr(400, "Cada puerta debe tener al menos un usuario asignado.", { code: msg });
    if (msg === "USER_CANNOT_BE_IN_TWO_GATES_SAME_EVENT") return replyErr(400, "Un usuario no puede estar en dos puertas en el mismo evento.", { code: msg });
    return replyErr(400, msg);
  }

  try {
    const eventId = body.eventId;
    const venueId = body.venueId;
    const eventName = body.eventName ?? "";
    const venueName = body.venueName ?? "";
    const now = new Date().toISOString();

    const toPut: StaffAccessItem[] = body.accessControl.flatMap((gate) =>
      gate.assignedUsers.map((userId) => ({
        userId,
        sk: sk(eventId, gate.gateId),
        eventId,
        gateId: gate.gateId,
        gateName: gate.gateName ?? gate.gateId,
        venueId,
        venueName,
        eventName,
        assignedAt: now,
      })),
    );

    const desired = new Set(toPut.map((x) => `${x.userId}::${x.sk}`));
    const current = await queryByEventId(eventId);
    const existingKeys = new Set(current.map((x) => `${x.userId}::${x.sk}`));
    const toDelete = current.filter((x) => !desired.has(`${x.userId}::${x.sk}`));
    const keysToDelete = toDelete.map((x) => ({ userId: x.userId, sk: x.sk }));

    await saveToDynamo(keysToDelete, toPut);

    const newlyAssigned = toPut.filter((item) => !existingKeys.has(`${item.userId}::${item.sk}`));
    await Promise.allSettled(newlyAssigned.map(notifyUser));

    return ok({ message: "Asignaciones guardadas.", deleted: toDelete.length, saved: toPut.length });
  } catch (e) {
    return onError(e);
  }
}

/**
 * Formatea fecha+hora del evento en ISO estándar (24h, sin AM/PM) y dirección.
 * Si raw es null, devuelve null. Opcionalmente usa venueRow para dirección si el evento no tiene.
 */
function eventSummaryForStaff(
  raw: Record<string, unknown> | null,
  venueRow?: Record<string, unknown> | null,
): {
  fechaInicio: string;
  fechaFin: string;
  direccion: string;
  estatus: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const fechaIni = toStr(raw.fechaIni ?? raw.fecha_ini) ?? "";
  const fechaFin = toStr(raw.fechaFin ?? raw.fecha_fin) ?? "";
  const horaIniRaw = toStr(raw.horaIni ?? raw.hora_ini) ?? "00:00";
  const horaFinRaw = toStr(raw.horaFin ?? raw.hora_fin) ?? "23:59";
  const horaIni = normalizeTimeTo24h(horaIniRaw);
  const horaFin = normalizeTimeTo24h(horaFinRaw);
  // Dirección: evento primero, luego venue como fallback
  let direccion = toStr(raw.direccion) ?? toStr(raw.address) ?? "";
  if (!direccion && venueRow && typeof venueRow === "object") {
    direccion = toStr(venueRow.direccion ?? venueRow.address ?? venueRow.ubicacion) ?? "";
  }
  const estatus = toStr(raw.estatus) ?? "";
  // ISO estándar: YYYY-MM-DDTHH:mm:ss (24h, sin AM/PM)
  const toIso = (f: string, h: string) => {
    if (f.length !== 8) return "";
    const timePart = /^\d{1,2}:\d{2}$/.test(h) ? `${h}:00` : "00:00:00";
    return `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}T${timePart}`;
  };
  const fechaInicio = toIso(fechaIni, horaIni) || "";
  const fechaFinStr = toIso(fechaFin, horaFin) || "";
  return {
    fechaInicio,
    fechaFin: fechaFinStr,
    direccion,
    estatus,
  };
}

/** 2. Usuario: GET por userId → evento, venue y puerta asignados (evento con fecha inicio/fin con hora, direccion, estatus) */
async function getStaffViewHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId =
    event.requestContext?.authorizer?.userId ??
    event.pathParameters?.userId ??
    event.queryStringParameters?.userId;
  if (!userId) return replyErr(400, "MISSING_USER_ID");

  const items = await queryByUserId(userId);
  if (items.length === 0) {
    return ok({ userId, assignments: [] });
  }

  const eventIds = [...new Set(items.map((x) => x.eventId).filter(Boolean))];
  const eventsMap = await getEventsByIds(eventIds);

  const venueIds = [...new Set(items.map((x) => x.venueId).filter(Boolean))];
  const venuesMap = await getVenuesByIds(venueIds);

  const ownerIds = [...new Set(
    eventIds.map((id) => toStr(eventsMap.get(id)?.userId)).filter(Boolean),
  )] as string[];
  const ownersMap = await getUsersByIds(ownerIds);

  const assignments = await Promise.all(
    items.map(async (x) => {
      const rawEvent = eventsMap.get(x.eventId) ?? null;
      const venue = x.venueId ? (venuesMap.get(x.venueId) ?? null) : null;
      const eventSummary = eventSummaryForStaff(rawEvent, venue);
      const ownerId = rawEvent ? (toStr(rawEvent.userId) ?? "") : "";
      const owner = ownerId ? (ownersMap.get(ownerId) ?? null) : null;
      const fotoPerfil = owner
        ? await resolveUserProfileImageUrl(
            toStr(owner.fotoPerfilUrl),
            toStr(owner.PLATFORM ?? owner.platform),
          )
        : null;
      const eventOwner = owner
        ? { ...owner, fotoPerfil: fotoPerfil ?? undefined }
        : null;
      return {
        eventId: x.eventId,
        eventName: x.eventName,
        venueId: x.venueId,
        venueName: x.venueName,
        gateId: x.gateId,
        gateName: x.gateName,
        assignedAt: x.assignedAt,
        event: eventSummary,
        eventOwner,
      };
    }),
  );

  return ok({ userId, assignments });
}

/** 3. Admin: GET por eventId → control de acceso para pintar en el front (opcional: enriquecer con nombre/email) */
async function getAdminViewHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const eventId = event.pathParameters?.eventId ?? event.queryStringParameters?.eventId;
  if (!eventId) return replyErr(400, "MISSING_EVENT_ID");

  const items = await queryByEventId(eventId);
  const usersMap = await getUsersByIds(items.map((x) => x.userId));

  const byGate = new Map<string, { gateId: string; gateName: string; assignedUsers: Array<Record<string, unknown>> }>();
  items.forEach((x) => {
    const u = usersMap.get(x.userId) ?? { userId: x.userId };
    if (!byGate.has(x.gateId)) {
      byGate.set(x.gateId, { gateId: x.gateId, gateName: x.gateName, assignedUsers: [] });
    }
    byGate.get(x.gateId)!.assignedUsers.push({
      ...u,
      userId: x.userId,
      assignedAt: x.assignedAt,
    });
  });

  const first = items[0];
  return ok({
    eventId,
    eventName: first?.eventName ?? "",
    venueId: first?.venueId ?? "",
    venueName: first?.venueName ?? "",
    accessControl: Array.from(byGate.values()),
  });
}

/** 4. Admin: GET por userId → eventos del usuario (organizer) con resumen de staff y evento/venue completos. */
async function getEventsStaffSummaryHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId =
    event.requestContext?.authorizer?.userId ??
    event.queryStringParameters?.userId ??
    event.pathParameters?.userId;
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    return replyErr(400, "userId es requerido (query ?userId= o en el autorizador).");
  }

  const eventIds = await getEventIdsByUserId(userId);
  if (eventIds.length === 0) {
    return ok({ events: [] });
  }

  const byEventId = new Map<string, { venueId: string; gateCount: number; assignedCount: number }>();
  const venueIdsSet = new Set<string>();

  await Promise.all(
    eventIds.map(async (eventId) => {
      const items = await queryByEventId(eventId);
      if (items.length === 0) {
        byEventId.set(eventId, { venueId: "", gateCount: 0, assignedCount: 0 });
        return;
      }
      const gates = new Set(items.map((x) => x.gateId));
      const assigned = new Set(items.map((x) => x.userId));
      const first = items[0];
      const venueId = first.venueId ?? "";
      if (venueId) venueIdsSet.add(venueId);
      byEventId.set(eventId, { venueId, gateCount: gates.size, assignedCount: assigned.size });
    }),
  );

  const eventsMap = await getEventsByIds(eventIds);
  for (const eventId of eventIds) {
    const eventData = eventsMap.get(eventId);
    const vid = eventData ? (toStr(eventData.venueId) ?? "") : "";
    if (vid) venueIdsSet.add(vid);
  }
  const venuesMap = await getVenuesByIds([...venueIdsSet]);

  const events = eventIds.map((eventId) => {
    const s = byEventId.get(eventId) ?? { venueId: "", gateCount: 0, assignedCount: 0 };
    const eventData = eventsMap.get(eventId) ?? null;
    const venueIdToUse = s.venueId || (eventData ? (toStr(eventData.venueId) ?? "") : "");
    const venueData = venueIdToUse ? (venuesMap.get(venueIdToUse) ?? null) : null;
    return {
      eventId,
      event: eventData,
      venue: venueData,
      gateCount: s.gateCount,
      assignedCount: s.assignedCount,
    };
  });

  return ok({ events });
}

// ----- Export (wrapper: normalize event + catch errors, no middy) -----

function normalizeEvent(event: APIGatewayProxyEvent): APIGatewayProxyEvent {
  return {
    ...event,
    pathParameters: event.pathParameters ?? {},
    queryStringParameters: event.queryStringParameters ?? {},
  };
}

function wrap(handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      return await handler(normalizeEvent(event));
    } catch (e) {
      return onError(e);
    }
  };
}

export const saveAssignments = wrap(saveAssignmentsHandler);
export const getAdminView = wrap(getAdminViewHandler);
export const getEventsStaffSummary = wrap(getEventsStaffSummaryHandler);
export const getStaffView = wrap(getStaffViewHandler);
