// INSTANCE AWS
const AWS = require("aws-sdk");
const { DYNAMODB_REGION, SES_REGION } = require("../utils/awsRegion");

AWS.config.update({ region: DYNAMODB_REGION });

// INSTANCE SES (SES suele estar en us-east-1)
const ses = new AWS.SES({ region: SES_REGION });

// INSTANCE SNS
const sns = new AWS.SNS();

// UTILS
const {
  getExpirationDate,
  saveNotificationToDb,
  getClientByUserId,
  resolveClientDisplayName,
  getEventImageUrl,
} = require("../utils/index");

// FILE SYSTEM
const fs = require("fs");

// PATH
const path = require("path");

// HANDLEBARS FOR TEMPLATING
let Handlebars = null;
try {
  Handlebars = require("handlebars");
} catch (_) {
  Handlebars = null; // optional
}

function formatEmailDate(value) {
  const normalized = String(value || "").trim();
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.substring(6, 8)}/${normalized.substring(4, 6)}/${normalized.substring(0, 4)}`;
  }
  return normalized;
}

function normalizeEmailDateMetadata(meta = {}) {
  const nextMeta = { ...meta };
  [
    "eventDate",
    "eventDateDisplay",
    "eventStartDate",
    "eventEndDate",
    "originalStartDate",
    "originalEndDate",
    "newStartDate",
    "newEndDate",
    "ticketSaleStartDate",
    "ticketSaleEndDate",
  ].forEach((key) => {
    if (nextMeta[key]) {
      nextMeta[key] = formatEmailDate(nextMeta[key]);
    }
  });

  if (nextMeta.paymentDate && !nextMeta.paymentDateDisplay) {
    const raw = String(nextMeta.paymentDate);
    const parsed = new Date(raw);
    nextMeta.paymentDateDisplay = Number.isNaN(parsed.getTime())
      ? raw
      : parsed.toISOString();
  }

  return nextMeta;
}

async function enrichPersonMetadata(meta = {}, config = {}) {
  const nextMeta = { ...meta };
  const userId = config.userId;

  if (!userId) return nextMeta;

  try {
    const client = await getClientByUserId(userId, config.ownerId || null);
    const resolvedProfileImageUrl = client?.resolvedProfileImageUrl || "";
    const resolvedName =
      [client?.name, client?.lastName].filter(Boolean).join(" ") ||
      client?.user ||
      client?.username ||
      client?.nombre ||
      config.fallbackName ||
      "";

    if (config.imageKey && resolvedProfileImageUrl && !nextMeta[config.imageKey]) {
      nextMeta[config.imageKey] = resolvedProfileImageUrl;
    }
    if (config.nameKey && resolvedName && !nextMeta[config.nameKey]) {
      nextMeta[config.nameKey] = resolvedName;
    }
    if (config.usernameKey && client?.username && !nextMeta[config.usernameKey]) {
      nextMeta[config.usernameKey] = client.username;
    }
  } catch (error) {
    console.warn(`⚠️ No se pudo enriquecer ${config.nameKey || userId}:`, error.message);
  }

  return nextMeta;
}

async function enrichEventInvitationEmailMetadata(meta = {}) {
  const nextMeta = { ...meta };
  const organizerUserId =
    nextMeta.organizerId || nextMeta.invitedBy || nextMeta.ownerId || nextMeta.userId;
  const hostUserId = nextMeta.hostId || null;

  try {
    if (organizerUserId) {
      const organizerClient = await getClientByUserId(organizerUserId, nextMeta.ownerId || null);
      const organizerSignedImage = organizerClient?.resolvedProfileImageUrl || "";

      if (organizerSignedImage) {
        nextMeta.organizerImage = organizerSignedImage;
      }

      if (!nextMeta.organizerName) {
        nextMeta.organizerName =
          [organizerClient?.name, organizerClient?.lastName].filter(Boolean).join(" ") ||
          organizerClient?.username ||
          nextMeta.inviterName ||
          "Organizador";
      }
    }
  } catch (error) {
    console.warn("⚠️ No se pudo enriquecer organizerImage firmada:", error.message);
  }

  try {
    if (hostUserId) {
      const hostClient = await getClientByUserId(hostUserId, nextMeta.ownerId || nextMeta.invitedBy || null);
      const hostSignedImage = hostClient?.resolvedProfileImageUrl || "";

      nextMeta.hasHost = true;

      if (hostSignedImage) {
        nextMeta.hostImage = hostSignedImage;
      }

      if (!nextMeta.hostName) {
        nextMeta.hostName =
          [hostClient?.name, hostClient?.lastName].filter(Boolean).join(" ") ||
          hostClient?.username ||
          "Anfitrion";
      }
    } else {
      nextMeta.hasHost = Boolean(nextMeta.hostName || nextMeta.hostImage);
    }
  } catch (error) {
    console.warn("⚠️ No se pudo enriquecer hostImage firmada:", error.message);
    nextMeta.hasHost = Boolean(nextMeta.hostName || nextMeta.hostImage);
  }

  return nextMeta;
}

async function enrichOrderEmailMetadata(meta = {}) {
  let nextMeta = { ...meta };

  const buyerUserId = nextMeta.buyerUserId || nextMeta.buyerId || null;
  const organizerUserId =
    nextMeta.organizerId || nextMeta.sellerId || nextMeta.ownerId || null;
  const ownerId = nextMeta.ownerId || organizerUserId || null;

  // Always clear pre-populated image keys so the signed URL from getClientByUserId
  // takes precedence over the raw/unsigned URL sent by the orders service.
  delete nextMeta.buyerProfileImage;
  delete nextMeta.organizerProfileImage;

  nextMeta = await enrichPersonMetadata(nextMeta, {
    userId: buyerUserId,
    ownerId,
    imageKey: "buyerProfileImage",
    nameKey: "buyerName",
    usernameKey: "buyerUsername",
    fallbackName: nextMeta.buyerName,
  });

  nextMeta = await enrichPersonMetadata(nextMeta, {
    userId: organizerUserId,
    ownerId,
    imageKey: "organizerProfileImage",
    nameKey: "organizerName",
    usernameKey: "organizerUsername",
    fallbackName: nextMeta.organizerName,
  });

  if (!nextMeta.userName && nextMeta.buyerName) {
    nextMeta.userName = nextMeta.buyerName;
  }

  const totalRaw = nextMeta.total ?? nextMeta.totalAmount ?? null;
  if (totalRaw != null && !nextMeta.totalAmountPlain) {
    const amount = Number(totalRaw);
    if (Number.isFinite(amount)) {
      nextMeta.totalAmountPlain = Math.round(amount).toLocaleString("es-CO");
    }
  }

  if (!nextMeta.totalAmountPlain && nextMeta.totalFormatted) {
    nextMeta.totalAmountPlain = String(nextMeta.totalFormatted)
      .replace(/[^\d.,]/g, "")
      .trim();
  }

  if (!nextMeta.orderRevenuePlain) {
    nextMeta.orderRevenuePlain = nextMeta.totalAmountPlain || nextMeta.totalFormatted;
  }

  if (!nextMeta.userName && nextMeta.buyerName) {
    nextMeta.userName = nextMeta.buyerName;
  }

  return nextMeta;
}

function looksLikeInternalUserId(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^[a-f0-9]{8,10}-[a-z0-9]$/i.test(v)) return true;
  return v.length === 36 && v.includes("-");
}

async function enrichChatEmailMetadata(meta = {}) {
  const nextMeta = { ...meta };
  const senderId = nextMeta.senderId || nextMeta.senderUserId;
  const currentName = String(nextMeta.senderName || "").trim();
  const shouldResolve =
    !currentName
    || currentName === "Alguien"
    || currentName === "Usuario"
    || looksLikeInternalUserId(currentName);

  if (!shouldResolve || !senderId) return nextMeta;

  try {
    const client = await getClientByUserId(senderId, nextMeta.userId || null);
    const resolved = resolveClientDisplayName(client);
    if (!resolved || looksLikeInternalUserId(resolved)) return nextMeta;

    nextMeta.senderName = resolved;
    if (
      String(nextMeta.message || "").includes("está intentando contactarte")
      && looksLikeInternalUserId(String(nextMeta.message).split(" ")[0])
    ) {
      nextMeta.message = `${resolved} está intentando contactarte`;
    }
    if (
      String(nextMeta.title || "").includes("está intentando contactarte")
      && looksLikeInternalUserId(String(nextMeta.title).split(" ")[0])
    ) {
      nextMeta.title = `${resolved} está intentando contactarte`;
    }
  } catch (error) {
    console.warn("⚠️ enrichChatEmailMetadata:", error.message);
  }

  return nextMeta;
}

async function enrichTransferEmailMetadata(meta = {}) {
  let nextMeta = { ...meta };
  const ownerId = nextMeta.ownerId || nextMeta.userId || null;

  nextMeta = await enrichPersonMetadata(nextMeta, {
    userId: nextMeta.senderUserId || nextMeta.senderId,
    ownerId,
    imageKey: "senderProfileImage",
    nameKey: "senderName",
    usernameKey: "senderUsername",
    fallbackName: nextMeta.senderName,
  });

  nextMeta = await enrichPersonMetadata(nextMeta, {
    userId: nextMeta.receiverUserId || nextMeta.receiverId,
    ownerId,
    imageKey: "receiverProfileImage",
    nameKey: "receiverName",
    usernameKey: "receiverUsername",
    fallbackName: nextMeta.receiverName,
  });

  return nextMeta;
}

// FUNCTION SEND EMAIL NOTIFICATION
const send = async (notificationData = {}) => {
  try {
    console.log(
      "📧 Email Gateway - Datos recibidos:",
      JSON.stringify(notificationData, null, 2),
    );

    // NORMALIZE AND ENRICH FROM TEMPLATE PARAMS (prefer metadata)
    const meta = notificationData.metadata || notificationData.params || {};
    const userId = notificationData.userId || meta.userId;

    console.log("📧 Email Gateway - userId extraído:", userId);

    const subject =
      notificationData.subject ||
      notificationData.title ||
      meta.title ||
      "Notificación";
    const textBody =
      notificationData.body || notificationData.message || meta.body || "";

    // RENDER HTML IF A TEMPLATE PATH IS PROVIDED (E.G., EMAIL/<FILE>.HBS)
    let htmlBody = notificationData.html || null;
    if (
      !htmlBody &&
      notificationData.template &&
      typeof notificationData.template === "string"
    ) {
      const isEmailTpl = notificationData.template.startsWith("email/");
      if (isEmailTpl) {
        Object.assign(meta, normalizeEmailDateMetadata(meta));

        const templatesWithEventImages = [
          "email/event_invitation.hbs",
          "email/event_lifecycle_notice.hbs",
          "email/event_finished.hbs",
          "email/event_rate_request.hbs",
          "email/event_calification_received.hbs",
          "email/order_payment_approved_buyer.hbs",
          "email/order_new_sale_owner.hbs",
          "email/ticket_transferred_received.hbs",
          "email/ticket_transferred_sent.hbs",
          "email/event_cancelled.hbs",
          "email/event_cancelled_owner.hbs",
          "email/event_rescheduled.hbs",
          "email/event_rescheduled_owner.hbs",
        ];

        if (
          templatesWithEventImages.includes(notificationData.template) &&
          meta.eventId
        ) {
          const fetchedEventImage = await getEventImageUrl(meta.eventId, 86400);
          if (fetchedEventImage) meta.eventImage = fetchedEventImage;
        }

        if (notificationData.template === "email/event_invitation.hbs") {
          const enrichedMeta = await enrichEventInvitationEmailMetadata(meta);
          Object.assign(meta, enrichedMeta);
        }

        if (
          notificationData.template === "email/order_payment_approved_buyer.hbs" ||
          notificationData.template === "email/order_new_sale_owner.hbs"
        ) {
          const enrichedMeta = await enrichOrderEmailMetadata(meta);
          Object.assign(meta, enrichedMeta);
        }

        if (
          notificationData.template === "email/ticket_transferred_received.hbs" ||
          notificationData.template === "email/ticket_transferred_sent.hbs"
        ) {
          const enrichedMeta = await enrichTransferEmailMetadata(meta);
          Object.assign(meta, enrichedMeta);
        }

        if (notificationData.template === "email/chat_user_new_message.hbs") {
          const enrichedMeta = await enrichChatEmailMetadata(meta);
          Object.assign(meta, enrichedMeta);
        }

        const filePath = path.resolve(
          __dirname,
          "../templates",
          notificationData.template,
        );
        try {
          if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, "utf8");
            if (Handlebars) {
              const tpl = Handlebars.compile(raw);
              htmlBody = tpl(meta);
            }
          }
        } catch (e) {
          // ignore rendering errors, fallback to text only
        }
      }
    }

    // FIELD EXTRACTION & VALIDATION
    const item = {
      userId: userId || null,
      channel: "email",
      action: notificationData.action || "email",
      title: subject,
      body: textBody,
      data: notificationData.data || meta.data || {},
      priority: notificationData.priority || "normal",
      read: false,
      createdAt: new Date().toISOString(),
      expiresAt: getExpirationDate(),
      metadata: meta,
    };

    // SAVE TO DYNAMODB NOTIFICATIONS TABLE
    await saveNotificationToDb(item);

    // GET CLIENT BY USER ID - con ownerId para buscar en FavoriteUsers
    const ownerId = meta.invitedBy || meta.ownerId || null;
    console.log(
      `🔍 Email Gateway - Obteniendo cliente. userId: ${userId}, ownerId: ${ownerId}`,
    );

    let client = {};
    try {
      client = (await getClientByUserId(userId, ownerId)) || {};
    } catch (lookupErr) {
      console.warn(
        "⚠️ Email Gateway - Cliente no encontrado, usando metadata de respaldo:",
        lookupErr.message,
      );
      client = {
        email: meta.to || meta.buyerEmail || meta.organizerEmail || meta.email || "",
        name: meta.buyerName || meta.organizerName || meta.userName || "",
        username: meta.buyerUsername || meta.organizerUsername || "",
      };
    }

    console.log("📧 Email Gateway - Cliente obtenido:", {
      userId,
      ownerId,
      hasEmail: !!client.email,
      email: client.email,
      originType: client.originType,
    });

    const primaryEmail = (
      client.email
      || meta.to
      || meta.recipientEmail
      || meta.recipient_email
      || meta.buyerEmail
      || meta.organizerEmail
      || meta.email
      || ""
    )
      .trim()
      .toLowerCase();
    const metadataEmails = Array.isArray(meta.emails)
      ? meta.emails
          .filter(Boolean)
          .map((e) => e.toString().trim().toLowerCase())
          .filter((e) => e.length > 0)
      : [];

    // VALIDATE EMAIL OR RECIPIENTS
    if (!primaryEmail && metadataEmails.length === 0) {
      console.log(
        "❌ Email Gateway - No se encontró email del usuario ni recipients",
      );
      throw new Error("email_no_recipient");
    }

    // IF MULTIPLE RECIPIENTS AND EMAIL_TOPIC_ARN CONFIGURED
    if (metadataEmails.length > 1 && process.env.EMAIL_TOPIC_ARN) {
      // CREATE MESSAGE
      const message = {
        subject,
        body: htmlBody || textBody,
        recipients: metadataEmails,
        metadata: item.metadata,
      };

      // CREATE PARAMS
      const params = {
        TopicArn: process.env.EMAIL_TOPIC_ARN,
        Message: JSON.stringify(message),
        Subject:
          notificationData.subject || notificationData.title || "Notificación",
      };

      // PUBLISH TO SNS TOPIC
      await sns.publish(params).promise();

      // RETURN SUCCESS
      return { success: true, sent: true, method: "sns_topic", item };
    }

    // SINGLE RECIPIENT
    if (primaryEmail) {
      // IF SINGLE RECIPIENT OR NO EMAIL_TOPIC_ARN CONFIGURED
      const from = "notificaciones.doevents@doeventsapp.com";

      // TO ADDITIONAL RECIPIENTS
      const recipient = [primaryEmail];

      console.log("Sending email notification:", {
        from,
        recipient,
        subject,
        hasHtml: Boolean(htmlBody),
        body: textBody,
      });

      // CREATE PARAMS SEND EMAIL
      const params = {
        Source: from,
        Destination: { ToAddresses: recipient },
        ConfigurationSetName: "doevents-no-tracking",
        Message: {
          Subject: {
            Data: subject,
          },
          Body: {
            ...(htmlBody
              ? { Html: { Data: htmlBody }, Text: { Data: textBody || "" } }
              : { Text: { Data: textBody } }),
          },
        },
      };

      // SEND EMAIL
      const res = await ses.sendEmail(params).promise();

      // RETURN SUCCESS
      return { success: true, sent: true, results: res, item };
    }
  } catch (err) {
    console.error("Error in emailNotification.send:", err && err.message);
    return { success: false, error: err && err.message };
  }
};

// Handler para AWS Lambda
// Mapeo de templateKey a configuración de email (asunto + plantilla HTML)
const EMAIL_TEMPLATE_CONFIG = {
  EVENT_CANCELLED: {
    subject: (ev) => `Tu evento "${ev.eventName || "tu evento"}" ha sido cancelado`,
    template: "email/event_cancelled.hbs",
  },
  EVENT_RESCHEDULED: {
    subject: (ev) => `Tu evento "${ev.eventName || "tu evento"}" ha sido reprogramado`,
    template: "email/event_rescheduled.hbs",
  },
  EVENT_CANCELLED_OWNER: {
    subject: (ev) => `Tu evento "${ev.eventName || "tu evento"}" fue cancelado`,
    template: "email/event_cancelled_owner.hbs",
  },
  EVENT_RESCHEDULED_OWNER: {
    subject: (ev) => `Reagendamiento confirmado: "${ev.eventName || "tu evento"}"`,
    template: "email/event_rescheduled_owner.hbs",
  },
};

async function handler(event) {
  try {
    console.log(
      "📧 Email notification handler - Event:",
      JSON.stringify(event, null, 2),
    );

    const { to, templateKey, userData, eventData } = JSON.parse(
      event.body || "{}",
    );

    if (!to || !templateKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "to y templateKey son requeridos",
        }),
      };
    }

    // Preparar los metadatos para el template
    const metadata = {
      to: to,
      templateKey: templateKey,
      ...userData,
      ...eventData,
      // Campos adicionales requeridos por las plantillas
      ownerName: (eventData || {}).ownerName || (userData || {}).userName || (userData || {}).name || "Organizador",
      year: new Date().getFullYear(),
    };

    // Resolver asunto y plantilla HTML según el templateKey
    const tplConfig = EMAIL_TEMPLATE_CONFIG[templateKey] || {};
    const resolvedSubject = tplConfig.subject ? tplConfig.subject(eventData || {}) : undefined;
    const resolvedTemplate = tplConfig.template;

    // Usar la función send existente
    const result = await send({
      metadata,
      ...(resolvedSubject ? { subject: resolvedSubject } : {}),
      ...(resolvedTemplate ? { template: resolvedTemplate } : {}),
      action: "email_notification",
    });

    return {
      statusCode: result.success ? 200 : 500,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("Error in email notification handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}

module.exports = { send, saveNotificationToDb, handler };
