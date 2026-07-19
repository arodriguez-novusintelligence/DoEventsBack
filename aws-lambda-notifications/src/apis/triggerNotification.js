/**
 * Handler: triggerNotification
 *
 * Función principal para disparar notificaciones usando el sistema de templates
 *
 * @param {Object} event - Evento de Lambda
 * @param {string} event.triggerId - ID del template a usar (ej: "EVENT_PUBLISHED")
 * @param {string} event.userId - ID del usuario destinatario
 * @param {string} event.eventId - ID del evento (opcional)
 * @param {Array<string>} event.channels - Canales de notificación (["email", "push", "inApp", "whatsapp"])
 * @param {Object} event.metadata - Datos adicionales para el template
 */

const { dispatchNotification } = require("../utils/dispatchNotification");

exports.handler = async (event) => {
  try {
    console.log(
      "🔔 Trigger Notification - Evento recibido:",
      JSON.stringify(event, null, 2)
    );

    console.log("🔍 Tipo de event:", typeof event);
    console.log("🔍 Tipo de event.body:", typeof event.body);
    console.log("🔍 ¿Tiene body?:", event.body !== undefined);

    // Parsear el body si viene como string
    let requestBody;
    if (typeof event.body === "string") {
      console.log("📦 Parseando body desde string...");
      requestBody = JSON.parse(event.body);
    } else {
      console.log("📦 Usando event directamente...");
      requestBody = event;
    }

    console.log(
      "📋 Request body parseado:",
      JSON.stringify(requestBody, null, 2)
    );

    // Soportar tanto triggerId como templateKey para compatibilidad
    const { triggerId, templateKey, userId, eventId, channels, metadata } =
      requestBody;

    const effectiveTemplateKey = templateKey || triggerId;

    // Validaciones
    if (!effectiveTemplateKey) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "triggerId o templateKey es requerido",
        }),
      };
    }

    // userId puede venir como parámetro o dentro de metadata
    const effectiveUserId = userId || metadata?.userId;

    if (!effectiveUserId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "userId es requerido (como parámetro o en metadata)",
        }),
      };
    }

    console.log(
      `📧 Enviando notificación: ${effectiveTemplateKey} al usuario: ${effectiveUserId}`
    );
    console.log(
      `📊 Canales: ${channels ? channels.join(", ") : "Todos los configurados"}`
    );

    // Preparar el metadata incluyendo userId
    const enrichedMetadata = {
      userId: effectiveUserId, // ✅ Incluir userId en metadata
      eventId: eventId,
      ...metadata, // Combinar con metadata adicional
    };

    console.log(
      "📋 Metadata enriquecido:",
      JSON.stringify(enrichedMetadata, null, 2)
    );

    // Si no vienen canales, dispatchNotification usa template.defaultChannels (p. ej. invite con whatsapp)
    const notificationResult = await dispatchNotification({
      templateKey: effectiveTemplateKey,
      ...(Array.isArray(channels) && channels.length > 0 ? { channels } : {}),
      metadata: enrichedMetadata,
    });

    console.log("✅ Notificación enviada exitosamente:", notificationResult);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "Notificación enviada exitosamente",
        templateKey: effectiveTemplateKey,
        userId: effectiveUserId,
        channels: channels,
        result: notificationResult,
      }),
    };
  } catch (error) {
    console.error("❌ Error en triggerNotification:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Error al enviar las notificaciones",
        error: error.message,
        stack: process.env.STAGE === "dev" ? error.stack : undefined,
      }),
    };
  }
};
