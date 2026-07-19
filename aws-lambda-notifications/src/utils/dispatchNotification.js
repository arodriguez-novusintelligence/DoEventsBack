// CHANNELS HANDLERS
const emailNotification = require("../gateways/emailNotification");
const pushNotification = require("../gateways/pushNotification");
const whatsappNotification = require("../gateways/whatsappNotification");
const inAppNotification = require("../gateways/inAppNotification");
const { v4: uuidv4 } = require("uuid");

// TEMPLATES UTILITIES
const { TEMPLATES } = require("../templates");

// MAIN FUNCTION DISPATCH NOTIFICATION
const dispatchNotification = async (event = {}) => {
  // INPUT EXTRACTION
  const { templateKey, metadata = {}, channels: incomingChannels } = event;

  // VALIDATIONS
  const template = findTemplate(templateKey);

  // TEMPLATE EXISTENCE
  if (!template) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Template ${templateKey} no encontrado.` }),
    };
  }

  // DETERMINE CHANNELS TO USE OR DEFAULTS
  const channels =
    Array.isArray(incomingChannels) && incomingChannels.length
      ? incomingChannels
      : template.defaultChannels || [];

  const normalizedChannels = normalizeChannels(channels);

  // VALIDATE REQUIRED FIELDS
  const reqCheck = validateRequired(template, metadata);

  // GLOBAL REQUIRED FIELDS
  if (!reqCheck.ok) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Faltan campos requeridos",
        missing: reqCheck.missing,
      }),
    };
  }

  // BUILD CONTENT
  let content;

  // BUILD CONTENT WITH TEMPLATE
  try {
    content = buildContent(template, metadata);
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error construyendo plantilla",
        message: err.message,
      }),
    };
  }

  // ENRICH PUSH/INAPP WITH A CONSISTENT FRONTEND ENVELOPE
  content = enrichInteractivePayload(content, templateKey, metadata);

  // PREPARE HANDLERS (gateways resolverán destinatarios internamente por userId)
  const handlers = makeHandlers(content, metadata);

  // RUN IN PARALLEL AND COLLECT RESULTS
  const tasks = normalizedChannels.map((channel) => {
    // GET HANDLER FUNCTION WITH RECIPIENT
    const fn = handlers[channel];

    // CHECK IF HANDLER EXISTS
    if (!fn) {
      console.log(`⚠️ Canal no soportado: ${channel}`);
      return Promise.resolve({ channel, status: "unsupported" });
    }

    // CALL HANDLER FUNCTION
    console.log(`📤 Enviando notificación por canal: ${channel}`);
    return fn()
      .then((result) => {
        console.log(`✅ ${channel} - Resultado:`, result);
        return { channel, status: "sent", result };
      })
      .catch((err) => {
        console.error(`❌ ${channel} - Error:`, err.message);
        return {
          channel,
          status: "error",
          error: err?.message || String(err),
        };
      });
  });

  // AWAIT ALL RESULTS
  const results = await Promise.all(tasks);

  // FILTER OUT UNSUPPORTED CHANNELS
  const supported = results.filter((r) => r.status === "sent");

  // RETURN ONLY SUCCESSFUL RESULTS
  return {
    statusCode: 200,
    body: JSON.stringify({
      results: supported,
      requestedChannels: channels,
      normalizedChannels,
    }),
  };
};

const CHANNEL_ALIASES = {
  email: "email",
  mail: "email",
  correo: "email",
  push: "push",
  notification: "push",
  whatsapp: "whatsapp",
  whats_app: "whatsapp",
  whatsap: "whatsapp",
  wa: "whatsapp",
  inapp: "inApp",
  in_app: "inApp",
  "in-app": "inApp",
  app: "inApp",
};

const normalizeChannels = (channels = []) => {
  const seen = new Set();
  const normalized = [];

  for (const raw of channels) {
    const key = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z_\-]/g, "");
    const resolved = CHANNEL_ALIASES[key] || raw;
    if (!seen.has(resolved)) {
      seen.add(resolved);
      normalized.push(resolved);
    }
  }

  if (normalized.length !== channels.length) {
    console.log("🔧 Canales normalizados:", { requested: channels, normalized });
  }

  return normalized;
};

// FIND TEMPLATES UTILITIES
const findTemplate = (templateKey) =>
  !templateKey
    ? null
    : TEMPLATES[templateKey] ||
      Object.values(TEMPLATES).find((t) => t.triggerId === templateKey) ||
      null;

// REQUIRED FIELDS
const missingFields = (obj = {}, fields = []) =>
  fields.filter(
    (f) => obj[f] === undefined || obj[f] === null || obj[f] === ""
  );

// VALIDATE REQUIRED FIELDS
const validateRequired = (template, metadata = {}) => {
  const globalMissing = missingFields(metadata, template?.required || []);
  return {
    ok: globalMissing.length === 0,
    missing: globalMissing,
  };
};

// BUILD CONTENT UTILITIES
const buildContent = (template, metadata = {}) => {
  if (!template) return null;
  if (typeof template.build === "function") return template.build({ metadata });
  // fallback: if template is a simple string
  if (typeof template === "string") {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => metadata[k] || "");
  }
  return template;
};

// MAKE HANDLERS UTILITIES
const makeHandlers = (content, metadata = {}) => ({
  email: async () => {
    const payload = content?.email || content;
    if (!payload) throw new Error("No email payload");
    const effectiveUserId =
      metadata.userId || payload.userId || payload.metadata?.userId || null;
    return emailNotification.send({
      ...payload,
      userId: effectiveUserId,
      metadata: {
        ...(payload.metadata || {}),
        userId: effectiveUserId,
      },
    });
  },
  push: async () => {
    const payload = content?.push || content;
    if (!payload) throw new Error("No push payload");
    return pushNotification.send(payload);
  },
  inApp: async () => {
    const payload = content?.inApp || content;
    if (!payload) throw new Error("No inApp payload");
    const effectiveUserId =
      metadata.userId || payload.userId || payload.metadata?.userId || null;
    return inAppNotification.send({
      ...payload,
      userId: effectiveUserId,
      metadata: {
        ...(payload.metadata || {}),
        userId: effectiveUserId,
      },
    });
  },
  whatsapp: async () => {
    const payload = content?.whatsapp || content;
    if (!payload) throw new Error("No whatsapp payload");
    const effectiveUserId =
      metadata.userId || payload.userId || payload.metadata?.userId || null;
    return whatsappNotification.send({
      ...payload,
      userId: effectiveUserId,
      templateName: payload.templateName || payload.metadata?.templateName,
      metadata: {
        ...(payload.metadata || {}),
        userId: effectiveUserId,
        templateName:
          payload.templateName ||
          payload.metadata?.templateName ||
          "promo_code_shared",
      },
    });
  },
});

module.exports = { dispatchNotification };

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function normalizeForData(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch (_) {
    return "";
  }
}

function enrichChannelPayload(payload, envelope) {
  if (!payload || typeof payload !== "object") return payload;

  const metadata = payload.metadata || {};
  const data = payload.data || {};

  const mergedMeta = {
    ...metadata,
    ...envelope,
  };

  // FCM data supports strings only; inApp can consume same data safely.
  const mergedData = {
    ...data,
    notificationId: normalizeForData(envelope.notificationId),
    templateKey: normalizeForData(envelope.templateKey),
    triggerId: normalizeForData(envelope.triggerId),
    userId: normalizeForData(envelope.userId),
    eventId: normalizeForData(envelope.eventId),
    eventName: normalizeForData(envelope.eventName),
    publicationId: normalizeForData(envelope.publicationId),
    entityId: normalizeForData(envelope.entityId),
    entityType: normalizeForData(envelope.entityType),
    invokeId: normalizeForData(envelope.invokeId),
    route: normalizeForData(envelope.route),
    triggeredByUserId: normalizeForData(envelope.triggeredByUserId),
    triggeredByName: normalizeForData(envelope.triggeredByName),
    notificationTimestamp: normalizeForData(envelope.notificationTimestamp),
    createdAt: normalizeForData(envelope.createdAt),
    read: normalizeForData(envelope.read),
    readStatus: normalizeForData(envelope.readStatus),
    status: normalizeForData(envelope.status),
  };

  return {
    ...payload,
    metadata: mergedMeta,
    data: mergedData,
  };
}

function enrichInteractivePayload(content, templateKey, metadata = {}) {
  if (!content || typeof content !== "object") return content;

  const now = new Date().toISOString();
  const notificationId = pickFirst(metadata.notificationId, metadata.id, uuidv4());

  const eventId = pickFirst(metadata.eventId, metadata.event_id);
  const eventName = pickFirst(metadata.eventName, metadata.event_name);
  const publicationId = pickFirst(
    metadata.publicationId,
    metadata.postId,
    metadata.feedId,
    metadata.publication_id,
  );
  const entityId = pickFirst(
    metadata.entityId,
    publicationId,
    eventId,
    metadata.orderId,
    metadata.order_id,
    metadata.messageId,
    metadata.roomId,
  );
  const entityType = pickFirst(
    metadata.entityType,
    publicationId ? "publication" : null,
    eventId ? "event" : null,
    pickFirst(metadata.orderId, metadata.order_id) ? "order" : null,
    metadata.messageId ? "message" : null,
    metadata.roomId ? "room" : null,
    "notification",
  );

  const envelope = {
    notificationId,
    templateKey,
    triggerId: templateKey,
    userId: pickFirst(metadata.userId, metadata.user_id),
    eventId,
    eventName,
    publicationId,
    entityId,
    entityType,
    invokeId: pickFirst(metadata.invokeId, metadata.eventId, metadata.orderId, publicationId),
    route: pickFirst(metadata.route, metadata.deepLink, metadata.navigationTarget, metadata.screen),
    triggeredByUserId: pickFirst(
      metadata.triggeredByUserId,
      metadata.actorUserId,
      metadata.actorId,
      metadata.senderUserId,
      metadata.inviterId,
      metadata.ownerId,
      metadata.userActionBy,
    ),
    triggeredByName: pickFirst(
      metadata.triggeredByName,
      metadata.actorName,
      metadata.senderName,
      metadata.inviterName,
      metadata.reviewerName,
      metadata.userName,
      "Sistema",
    ),
    notificationTimestamp: pickFirst(metadata.notificationTimestamp, metadata.timestamp, now),
    createdAt: pickFirst(metadata.createdAt, now),
    read: false,
    readStatus: "UNREAD",
    status: pickFirst(metadata.status, "active"),
  };

  return {
    ...content,
    ...(content.push ? { push: enrichChannelPayload(content.push, envelope) } : {}),
    ...(content.inApp ? { inApp: enrichChannelPayload(content.inApp, envelope) } : {}),
  };
}
