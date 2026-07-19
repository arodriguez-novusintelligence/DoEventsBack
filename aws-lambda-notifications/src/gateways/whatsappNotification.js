// HTTPS MODULE
const https = require("https");

// PATH MODULE
const path = require("path");

// UTILS
const {
  getExpirationDate,
  saveNotificationToDb,
  getClientByUserId,
  getEventImageUrl,
} = require("../utils/index");
const { resolveWebAppBaseUrl } = require("../utils/resolveWebAppBaseUrl");

// MAIN SEND FUNCTION
const send = async (notificationData = {}) => {
  console.log(
    "📱 WhatsApp Gateway - Datos recibidos:",
    JSON.stringify(notificationData, null, 2)
  );

  // PHONE NUMBER ID FOR WHATSAPP BUSINESS API
  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_ID ||
    "588313857701989";

  // ACCESS TOKEN FOR WHATSAPP BUSINESS API
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    "EAAGzrxZCbEf4BOyBzbItaVxHZB56DrIlxlv72c2fMljhdlrLkF8uY0Xmh00NIYkPaiQWcLM9ZBZCu7Oh4DAfh5UqZC0igUP2TZBYtx5TNlZAzn51NqtyIGOaEYKOESg4tRYNBXl8PuqGiAvCu5yfgYyTxAC3UWMsbjk1ml6zEgLgPL4TQq2x6EfZBfR2ZBYSsqILztQZDZD"; // TODO: move to secure storage

  // METADATA
  const meta = notificationData.metadata || notificationData.params || {};

  // USER ID
  const userId = notificationData.userId || meta.userId;

  console.log("📱 WhatsApp Gateway - userId extraído:", userId);

  // PREPARE NOTIFICATION ITEM
  const item = {
    userId: userId || null,
    channel: "whatsapp",
    action: notificationData.action || meta.action || "whatsapp",
    title: notificationData.title || meta.title || "",
    body: notificationData.body || meta.body || "",
    data: notificationData.data || meta.data || {},
    priority: notificationData.priority || meta.priority || "normal",
    read: false,
    createdAt: new Date().toISOString(),
    expiresAt: getExpirationDate(),
    metadata: meta,
  };

  // SAVE NOTIFICATION TO DB
  await saveNotificationToDb(item);

  // VALIDATE TEMPLATE NAME
  const templateName = notificationData.template;

  // LOAD TEMPLATE BUILDER
  let components = null;
  let templateRel = null;
  if (templateName && typeof templateName === "string") {
    templateRel = templateName.replace(/^whatsapp\//, "").replace(/\.js$/i, "");
    if (templateRel && templateRel.length) {
      const templatePath = path.resolve(
        __dirname,
        "../templates",
        `whatsapp/${templateRel}`
      );
      try {
        // TEMPLATES QUE NECESITAN URLS FIRMADAS DE EVENTOS
        const templatesWithImages = [
          "event_invitation",
          "events_invitation",
          "event_invite",
          "event_invitations",
          "event_cancelled",
          "event_rescheduled",
          "event_finished",
          "evento_compartido",
        ];
        
        // Si el template necesita imagen y hay eventId, generar URL firmada
        if (templatesWithImages.includes(templateRel) && meta.eventId && !meta.eventImage) {
          console.log(`🔗 Generando URL firmada para template ${templateRel} con eventId ${meta.eventId}`);
          meta.eventImage = await getEventImageUrl(meta.eventId, 86400); // 24 horas
          console.log(`✅ URL firmada generada: ${meta.eventImage.substring(0, 50)}...`);
        }
        
        const builder = require(templatePath);
        if (builder && typeof builder === "function") {
          components = builder(meta);
        }
      } catch (e) {
        console.error("WhatsApp template load error:", e && e.message, {
          templateRel,
          metaKeys: Object.keys(meta || {}),
        });
        throw new Error("whatsapp_template_load_error");
      }
    }
  }

  // VALIDATE COMPONENTS
  if (!Array.isArray(components)) {
    console.error(
      "WhatsApp invalid_components: builder did not return components",
      { templateRel, templateName, metaKeys: Object.keys(meta || {}) }
    );
    throw new Error("whatsapp_invalid_components");
  }

  // RECIPIENT PHONE - Ahora con ownerId para buscar en FavoriteUsers
  const ownerId = meta.invitedBy || meta.ownerId || null;
  console.log(`🔍 Obteniendo cliente. userId: ${userId}, ownerId: ${ownerId}`);

  let client = null;
  try {
    client = await getClientByUserId(userId, ownerId);
  } catch (lookupErr) {
    console.warn("WhatsApp client lookup failed:", lookupErr.message);
  }

  const phoneFromMeta = String(
    meta.phone || meta.phoneNumber || meta.fullPhone || meta.whatsappTo || "",
  ).trim();
  if ((!client || (!client.phone && !client.phoneNumber)) && phoneFromMeta) {
    const digits = phoneFromMeta.replace(/[^0-9]/g, "");
    client = {
      ...(client || {}),
      phone: phoneFromMeta,
      phoneNumber: digits.length > 10 ? digits.slice(-10) : digits,
      countryCode: digits.length > 10 ? digits.slice(0, digits.length - 10) : "57",
      originType: client?.originType || "METADATA",
    };
  }

  console.log(`📱 Cliente obtenido:`, {
    hasClient: !!client,
    hasPhone: !!client?.phone,
    hasCountryCode: !!client?.countryCode,
    hasPhoneNumber: !!client?.phoneNumber,
    countryCode: client?.countryCode,
    phoneNumber: client?.phoneNumber
      ? `${client.phoneNumber.substring(0, 3)}***${client.phoneNumber.substring(
          7
        )}`
      : null,
    originType: client?.originType,
  });

  // VALIDATE RECIPIENT
  if (!client || (!client.phone && !client.phoneNumber)) {
    console.error("WhatsApp no_recipient: client or phone not found", {
      userId,
      ownerId,
      hasMetaPhone: Boolean(phoneFromMeta),
    });
    throw new Error("whatsapp_no_recipient");
  }

  // PREPARE PAYLOAD - usar phoneNumber si está separado, sino usar phone completo
  let toSanitized;
  if (client.phoneNumber && client.countryCode) {
    // Ya está separado, construir número completo
    toSanitized = `${client.countryCode}${client.phoneNumber}`.replace(
      /[^0-9]/g,
      ""
    );
  } else {
    // Usar formato antiguo
    toSanitized = String(client.phone || "").replace(/[^0-9]/g, "");
  }

  // MASKED PHONE FOR LOGS
  const maskedTo = toSanitized
    ? `${toSanitized.substring(0, 3)}***${toSanitized.substring(
        toSanitized.length - 4
      )}`
    : null;

  console.log("📱 Preparando envío de WhatsApp:", {
    userId,
    toSanitized: toSanitized ? `${toSanitized.substring(0, 5)}***` : null,
    maskedTo,
    countryCode: client.countryCode,
    phoneLength: toSanitized?.length,
    templateName,
    componentsCount: components?.length,
  });

  // VALIDATE SANITIZED PHONE
  if (!toSanitized || toSanitized.length < 10) {
    console.error("WhatsApp invalid_phone: number seems too short/invalid", {
      userId,
      toSanitized,
      countryCode: client.countryCode,
      phoneNumber: client.phoneNumber,
    });
    throw new Error("whatsapp_invalid_phone");
  }

  // NORMALIZE TEMPLATE NAME
  // If explicit templateName is provided in metadata, use it
  // Otherwise, normalize the file path
  const templateNameNormalized =
    meta.templateName ||
    notificationData.templateName ||
    templateName
      .toLowerCase()
      .replace(/^whatsapp\//, "")
      .replace(/\.(js|ts)$/, "");

  // PREPARE REQUEST DATA
  const data = JSON.stringify({
    messaging_product: "whatsapp",
    to: toSanitized,
    type: "template",
    template: {
      name: templateNameNormalized,
      language: { code: meta.languageCode || "es" },
      components,
    },
  });

  console.log(
    "📤 WhatsApp request payload:",
    JSON.stringify(
      {
        templateName: templateNameNormalized,
        languageCode: meta.languageCode || "es",
        componentsCount: components.length,
        components: components.map((c) => ({
          type: c.type,
          parametersCount: c.parameters?.length || 0,
          parameters: c.parameters,
        })),
      },
      null,
      2
    )
  );

  // PREPARE REQUEST OPTIONS
  const options = {
    hostname: "graph.facebook.com",
    path: `/v22.0/${phoneNumberId}/messages`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  };

  // SEND REQUEST
  return new Promise(async (resolve, reject) => {
    // REQUEST API WHATSAPP BUSINESS API
    const req = https.request(options, (res) => {
      let responseBody = "";

      // COLLECT RESPONSE DATA
      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      // RESPONSE END
      res.on("end", (data) => {
        // LOG RESULT
        console.log("WhatsApp API response:", {
          responseBody,
        });
        const result = {
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody,
        };

        if (res.statusCode >= 400) {
          const error = new Error(
            `whatsapp_http_${res.statusCode}: ${responseBody}`,
          );
          error.result = result;
          return reject(error);
        }

        resolve(result);
      });
    });

    // REQUEST ERROR
    req.on("error", (err) => {
      console.error("WhatsApp request error:", err && err.message, {
        userId,
        toSanitized,
        maskedTo,
      });
      reject(err);
    });

    // SEND DATA
    if (data) {
      req.write(data);
    }

    // END REQUEST
    req.end();
  });
};

module.exports = { send, handler };

// Handler para AWS Lambda
async function handler(event) {
  try {
    console.log(
      "📱 WhatsApp notification handler - Event:",
      JSON.stringify(event, null, 2)
    );

    const { to, templateKey, userData, eventData } = JSON.parse(
      event.body || "{}"
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

    // Por ahora usamos el template funcional chat_user_invite_send
    const whatsappTemplate = "whatsapp/chat_user_invite_send";

    // Preparar los metadatos para el template
    let templateMessage, templateTitle;
    if (templateKey === "EVENT_CANCELLED") {
      templateTitle = "Evento Cancelado";
      templateMessage = `Hola ${
        userData.userName || "Usuario"
      }, lamentamos informarte que el evento ${
        eventData.eventName || "que compraste"
      } ha sido cancelado.`;
    } else if (templateKey === "EVENT_RESCHEDULED") {
      templateTitle = "Evento Reprogramado";
      templateMessage = `Hola ${
        userData.userName || "Usuario"
      }, te informamos que el evento ${
        eventData.eventName || "que compraste"
      } ha sido reprogramado.`;
    } else {
      templateTitle = "Notificación DoEvents";
      templateMessage = `Hola ${
        userData.userName || "Usuario"
      }, tienes una nueva notificación sobre tu evento.`;
    }

    const metadata = {
      userId: userData.userId || "unknown",
      userName: userData.userName || "Usuario",
      phone: to,
      templateKey,
      eventId: eventData.eventId,
      eventName: eventData.eventName,
      message: templateMessage,
      title: templateTitle,
      link:
        eventData.link ||
        `${resolveWebAppBaseUrl()}/events/${eventData.eventId || ""}`,
      ...eventData,
    };

    // Usar la función send existente con el template funcional
    const result = await send({
      userId: userData.userId,
      template: whatsappTemplate,
      metadata,
      action: "whatsapp_notification",
    });

    console.log("📱 WhatsApp send result:", result);

    return {
      statusCode: result.statusCode === 200 ? 200 : 500,
      body: JSON.stringify({
        success: result.statusCode === 200,
        result,
      }),
    };
  } catch (error) {
    console.error("Error in WhatsApp notification handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}
