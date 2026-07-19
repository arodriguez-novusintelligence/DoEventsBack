/**
 * Script para probar directamente el envío de notificaciones EVENT_INVITATION
 * Ejecutar con: node test-notification-direct.js
 */

const AWS = require("aws-sdk");
AWS.config.update({ region: "us-east-1" });

const lambda = new AWS.Lambda();

async function testDirectNotification() {
  console.log("🧪 Prueba directa de notificación EVENT_INVITATION\n");

  // Payload según lo que envía sendEventInvitationsHandler
  const notificationPayload = {
    body: JSON.stringify({
      templateKey: "EVENT_INVITATION",
      channels: ["email", "push", "whatsapp", "inApp"],
      metadata: {
        userId: "46b7f861-630e-4304-a8b0-d6fafd4a54ce",
        eventId: "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
        eventName: "Evento de Prueba",
        eventSlug: "evento-prueba",
        eventDate: "2025-12-20",
        eventStartTime: "19:00",
        eventLocation: "Centro de Eventos",
        eventCity: "Bogotá",
        eventImage: "",
        organizerName: "Organizador Test",
        inviterName: "Juan Invitador",
        invitedBy: "42c2e4a4-0",
        message: "¡Te invito a mi evento especial!",
        link: "https://app.doevents.com/events/evento-prueba",
        shareLink: "https://app.doevents.com/event/evento-prueba/invite",
        invitationId: "test-invitation-001",
      },
    }),
  };

  console.log("📤 Payload que se enviará:");
  console.log(JSON.stringify(JSON.parse(notificationPayload.body), null, 2));
  console.log("\n");

  try {
    console.log("🚀 Invocando función de notificaciones...\n");

    const result = await lambda
      .invoke({
        FunctionName: "notifications-dev-triggerNotification",
        InvocationType: "RequestResponse", // Cambiar a RequestResponse para ver respuesta
        Payload: JSON.stringify(notificationPayload),
      })
      .promise();

    console.log("✅ Respuesta de la lambda de notificaciones:");
    const response = JSON.parse(result.Payload);
    console.log(JSON.stringify(response, null, 2));

    if (result.FunctionError) {
      console.error("\n❌ Error en la función:", result.FunctionError);
    }
  } catch (error) {
    console.error("❌ Error al invocar la lambda:", error.message);
    console.error("Stack:", error.stack);
  }
}

// Ejecutar prueba
testDirectNotification();
