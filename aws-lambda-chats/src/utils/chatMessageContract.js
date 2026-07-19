/**
 * Contrato chat WebSocket: envelope en raíz (`channel`, `action`, `status`) y el payload del
 * mensaje solo en `message` (sin duplicar campos en la raíz).
 */

function nowIso() {
  return new Date().toISOString();
}

function nowTs() {
  return Date.now();
}

function buildRealtimeEnvelope({
  event,
  connectionId = null,
  roomId = null,
  userId = null,
  clientMessageId = null,
  serverMessageId = null,
  ts,
  payload = {},
  meta = {},
}) {
  return {
    version: "1.0",
    event,
    connectionId,
    roomId,
    userId,
    clientMessageId,
    serverMessageId,
    ts: typeof ts === "number" ? ts : nowTs(),
    payload,
    meta: {
      retryable: Boolean(meta.retryable),
      retryAfterMs:
        meta.retryAfterMs == null || Number.isNaN(Number(meta.retryAfterMs))
          ? null
          : Number(meta.retryAfterMs),
      code: meta.code || null,
      reason: meta.reason || null,
    },
  };
}

function resolveTimestamps(message) {
  const createdAt = message.createdAt || nowIso();
  const updatedAt = message.updatedAt || createdAt;
  return { createdAt, updatedAt };
}

/**
 * Payload WebSocket para mensaje nuevo (texto o ya normalizado).
 */
function buildNewMessageWsPayload({
  id,
  roomId,
  sender,
  text,
  reactions,
  reads,
  type,
  asset,
  replyMeta,
  createdAt,
  updatedAt,
  deletedAt,
  clientMessageId,
  action = "sendChatMessage",
  media = null,
  location = null,
  sharedEvent = null,
}) {
  const messageBody = {
    id,
    roomId,
    status: "active",
    text,
    reactions: reactions || [],
    reads: reads || [],
    sender,
    type,
    asset: asset ?? null,
    replyMeta: replyMeta ?? null,
    createdAt,
    updatedAt,
    deletedAt: deletedAt ?? null,
    clientMessageId: clientMessageId ?? null,
    ...(media ? { media } : {}),
    ...(location ? { location } : {}),
    ...(sharedEvent ? { sharedEvent } : {}),
  };

  const legacy = {
    channel: "chat",
    action,
    status: "active",
    message: messageBody,
  };

  return {
    ...legacy,
    ...buildRealtimeEnvelope({
      event: "chat.message.new",
      roomId,
      userId: sender && sender.id != null ? String(sender.id) : null,
      clientMessageId: clientMessageId ?? null,
      serverMessageId: id,
      ts: Date.parse(createdAt) || nowTs(),
      payload: messageBody,
      meta: {
        retryable: false,
      },
    }),
  };
}

/** Normaliza un ítem Dynamo para GET REST (URL de adjunto + sender resuelto). */
function enrichMessageForRestApi(message, senderResolved, assetUrl, mediaObj) {
  return {
    ...message,
    asset: assetUrl,
    ...(mediaObj ? { media: mediaObj } : {}),
    sender: senderResolved,
  };
}

function buildEditMessageWsPayload({
  id,
  roomId,
  text,
  newText,
  status,
  updatedAt,
  deletedAt,
  createdAt,
  sender,
  clientMessageId,
  action,
}) {
  const t = text ?? "";
  const nt = newText !== undefined ? newText : t;
  const messageBody = {
    id,
    roomId,
    text: t,
    newText: nt,
    status,
    updatedAt,
    deletedAt: deletedAt ?? null,
    createdAt: createdAt ?? null,
    sender: sender ?? null,
    clientMessageId: clientMessageId ?? null,
  };
  const legacy = {
    channel: "chat",
    action,
    message: messageBody,
  };

  return {
    ...legacy,
    ...buildRealtimeEnvelope({
      event: "chat.message.new",
      roomId,
      userId: sender != null ? String(sender) : null,
      clientMessageId: clientMessageId ?? null,
      serverMessageId: id,
      ts: updatedAt ? Date.parse(updatedAt) || nowTs() : nowTs(),
      payload: messageBody,
      meta: {
        retryable: false,
      },
    }),
  };
}

function buildChatAckWsPayload({
  roomId,
  userId,
  clientMessageId,
  serverMessageId,
  duplicate = false,
}) {
  const payload = {
    roomId,
    userId,
    clientMessageId: clientMessageId ?? null,
    serverMessageId,
    duplicate: Boolean(duplicate),
  };

  return {
    channel: "chat",
    action: "chatMessageAck",
    status: "active",
    message: payload,
    ...buildRealtimeEnvelope({
      event: "chat.message.ack",
      roomId,
      userId,
      clientMessageId: clientMessageId ?? null,
      serverMessageId,
      payload,
      meta: {
        retryable: false,
      },
    }),
  };
}

function buildReactionMessageWsPayload({
  id,
  roomId,
  reactions,
  updatedAt,
}) {
  const messageBody = {
    id,
    roomId,
    reactions: reactions || [],
    updatedAt: updatedAt || nowIso(),
  };

  const legacy = {
    channel: "chat",
    action: "reactChatMessage",
    status: "active",
    message: messageBody,
  };

  return {
    ...legacy,
    ...buildRealtimeEnvelope({
      event: "chat.message.reaction",
      roomId,
      serverMessageId: id,
      ts: updatedAt ? Date.parse(updatedAt) || nowTs() : nowTs(),
      payload: messageBody,
      meta: {
        retryable: false,
      },
    }),
  };
}

module.exports = {
  nowIso,
  nowTs,
  buildRealtimeEnvelope,
  resolveTimestamps,
  buildNewMessageWsPayload,
  buildEditMessageWsPayload,
  buildReactionMessageWsPayload,
  buildChatAckWsPayload,
  enrichMessageForRestApi,
};
