const AWS = require("aws-sdk");
const axios = require("axios");
const { dynamodb, TABLE } = require("./promoCodesShared");

const lambda = new AWS.Lambda({
  region:
    process.env.NOTIFICATIONS_LAMBDA_REGION ||
    process.env.DYNAMODB_REGION ||
    process.env.AWS_REGION ||
    "sa-east-1",
});

const NOTIFICATIONS_LAMBDA =
  process.env.NOTIFICATIONS_LAMBDA || "notifications-dev-triggerNotification";
const NOTIFICATIONS_API =
  process.env.NOTIFICATIONS_API ||
  "https://api-dev.doeventsapp.com/notifications/trigger-notification";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-dev";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const WEB_APP_BASE_URL = String(
  process.env.WEB_APP_BASE_URL || "https://dev.doeventsapp.com",
).replace(/\/$/, "");

function mapShareChannels(channels = []) {
  const mapped = new Set();
  channels.forEach((channel) => {
    const key = String(channel || "").toLowerCase().trim();
    if (key === "mail" || key === "email" || key === "correo") mapped.add("email");
    else if (key === "whatsapp" || key === "wa" || key === "whats_app") mapped.add("whatsapp");
    else if (
      key === "campana" ||
      key === "inapp" ||
      key === "in_app" ||
      key === "push" ||
      key === "bell"
    ) {
      mapped.add("inApp");
      mapped.add("push");
    }
  });
  return [...mapped];
}

async function getEventSummary(eventId) {
  const result = await dynamodb
    .get({
      TableName: EVENTS_TABLE,
      Key: { id: eventId },
    })
    .promise();
  const item = result.Item || {};
  return {
    eventName: item.nombre || item.name || "Evento",
    eventDate: item.fechaIni || item.date || "",
    eventImage: item.imagenPrincipal || item.main_image || item.coverImage || "",
    eventLocation: item.ubicacion || item.ciudad || item.direccion || "",
  };
}

async function resolveRecipientContact(userId) {
  if (!userId) return { email: "", phone: "", name: "" };
  const candidates = [String(userId)];
  if (String(userId).length === 36 && String(userId).includes("-")) {
    candidates.push(String(userId).substring(0, 10));
  }
  for (const id of [...new Set(candidates)]) {
    try {
      const result = await dynamodb
        .get({
          TableName: CLIENT_TABLE,
          Key: { id },
        })
        .promise();
      const item = result.Item;
      if (!item) continue;
      return {
        email: String(item.email || "").trim(),
        phone: String(item.phone || item.phoneNumber || item.fullPhone || "").trim(),
        name:
          [item.name, item.lastName].filter(Boolean).join(" ").trim() ||
          item.user ||
          item.username ||
          "",
      };
    } catch (err) {
      console.warn(`resolveRecipientContact(${id}) failed:`, err.message);
    }
  }
  return { email: "", phone: "", name: "" };
}

async function dispatchPromoNotification({ triggerId, userId, channels, metadata }) {
  if (!triggerId || !userId || !channels?.length) return null;

  const payload = {
    triggerId,
    templateKey: triggerId,
    userId,
    channels,
    metadata: { userId, ...metadata },
  };

  try {
    const invokeResult = await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_LAMBDA,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({ body: JSON.stringify(payload) }),
      })
      .promise();

    const rawPayload = invokeResult.Payload
      ? Buffer.isBuffer(invokeResult.Payload)
        ? invokeResult.Payload.toString("utf8")
        : String(invokeResult.Payload)
      : "{}";
    const parsed = JSON.parse(rawPayload || "{}");
    console.log(
      `dispatchPromoNotification lambda ok (${triggerId}):`,
      JSON.stringify({
        functionError: invokeResult.FunctionError || null,
        statusCode: parsed.statusCode,
        channels,
      }),
    );
    if (invokeResult.FunctionError) {
      throw new Error(parsed.errorMessage || invokeResult.FunctionError);
    }
    return parsed;
  } catch (lambdaErr) {
    console.warn(
      `dispatchPromoNotification lambda failed (${triggerId}): ${lambdaErr.message}. Trying HTTP API...`,
    );
    try {
      const { data } = await axios.post(NOTIFICATIONS_API, payload, {
        timeout: 25000,
        headers: { "Content-Type": "application/json" },
      });
      console.log(
        `dispatchPromoNotification HTTP ok (${triggerId}):`,
        JSON.stringify({ channels, success: data?.success }),
      );
      return data;
    } catch (httpErr) {
      console.error(
        `dispatchPromoNotification ${triggerId} failed:`,
        httpErr.response?.data || httpErr.message,
      );
      return null;
    }
  }
}

async function notifyPromoCodeShared({
  eventId,
  shareRecord,
  promoCode,
  batch,
  organizerName,
}) {
  const recipientId = shareRecord.recipient_id;
  if (!recipientId) {
    throw new Error("recipient_id is required to notify a shared promo code");
  }

  const event = await getEventSummary(eventId);
  const channels = mapShareChannels(shareRecord.channels);
  if (!channels.length) {
    console.warn("notifyPromoCodeShared: no channels mapped", shareRecord.channels);
    return;
  }

  const contact = await resolveRecipientContact(recipientId);
  const recipientEmail = String(
    shareRecord.recipient_email || contact.email || "",
  ).trim();
  const recipientPhone = String(
    shareRecord.recipient_phone || shareRecord.recipientPhone || contact.phone || "",
  ).trim();
  const recipientName =
    shareRecord.recipient_name || contact.name || "Usuario";

  const discountLabel = batch
    ? `${batch.currency} ${Number(batch.value || 0).toLocaleString("es-CO")} ${batch.description || ""}`.trim()
    : "";

  const needsEmail = channels.includes("email");
  const needsWhatsapp = channels.includes("whatsapp");
  if (needsEmail && !recipientEmail) {
    throw new Error("El destinatario no tiene correo para enviar el código promocional");
  }
  if (needsWhatsapp && !recipientPhone) {
    throw new Error("El destinatario no tiene teléfono para enviar el código por WhatsApp");
  }

  const dispatched = await dispatchPromoNotification({
    triggerId: "PROMO_CODE_SHARED",
    userId: recipientId,
    channels,
    metadata: {
      eventId,
      eventName: event.eventName,
      eventDate: event.eventDate,
      eventImage: event.eventImage,
      eventLocation: event.eventLocation,
      promoCode,
      discountLabel,
      organizerName: organizerName || shareRecord.organizer_name || "El organizador",
      recipientName,
      recipientUsername: shareRecord.recipient_username || "",
      recipientEmail,
      email: recipientEmail,
      to: recipientEmail,
      phone: recipientPhone,
      phoneNumber: recipientPhone,
      fullPhone: recipientPhone,
      message: shareRecord.message || "",
      link: `${WEB_APP_BASE_URL}/events/${eventId}`,
    },
  });
  if (!dispatched) {
    throw new Error("No se pudo encolar la notificación del código promocional");
  }
}

async function notifyPromoCodeCanceled({
  eventId,
  promoCode,
  batch,
  reason,
  shareRecords = [],
}) {
  if (!shareRecords.length) return;

  const event = await getEventSummary(eventId);
  const discountLabel = batch
    ? `${batch.currency} ${Number(batch.value || 0).toLocaleString("es-CO")} ${batch.description || ""}`.trim()
    : "";

  for (const share of shareRecords) {
    const recipientId = share.recipient_id;
    if (!recipientId) continue;
    const contact = await resolveRecipientContact(recipientId);
    const recipientEmail = String(share.recipient_email || contact.email || "").trim();
    await dispatchPromoNotification({
      triggerId: "PROMO_CODE_CANCELED",
      userId: recipientId,
      channels: ["inApp", "push", "email"],
      metadata: {
        eventId,
        eventName: event.eventName,
        eventImage: event.eventImage,
        promoCode,
        discountLabel,
        cancelReason: reason || "",
        recipientName: share.recipient_name || contact.name || "Usuario",
        recipientEmail,
        email: recipientEmail,
        to: recipientEmail,
        message: `Tu código promocional ${promoCode}${discountLabel ? ` (${discountLabel})` : ""} fue cancelado por el organizador y ya no podrá ser redimido`,
        link: `${WEB_APP_BASE_URL}/events/${eventId}`,
      },
    });
  }
}

module.exports = {
  mapShareChannels,
  notifyPromoCodeShared,
  notifyPromoCodeCanceled,
};
