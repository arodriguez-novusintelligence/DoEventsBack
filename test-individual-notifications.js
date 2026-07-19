const AWS = require("aws-sdk");

// Configurar AWS Lambda
const lambda = new AWS.Lambda({
  region: "us-east-1",
});

// Función para probar WhatsApp directamente
async function testWhatsAppNotification() {
  console.log("\n=== Probando WhatsApp Notification ===");

  const whatsappPayload = {
    recipientPhone: "573158929677", // Tu número de teléfono
    templateName: "chat_user_invite_send",
    templateData: {
      event_name: "Evento de Prueba Reprogramado",
      event_date: "25 de Octubre, 2025",
      event_time: "8:00 PM",
      event_location: "Centro de Eventos",
      reschedule_reason: "Por motivos de logística se reprogramó el evento",
    },
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "notifications-dev-whatsappNotificationHandler",
        Payload: JSON.stringify({
          body: JSON.stringify(whatsappPayload),
        }),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ WhatsApp Response:", response);

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      console.log("✅ WhatsApp Message ID:", body.messageId);
    }
  } catch (error) {
    console.error("❌ Error en WhatsApp:", error);
  }
}

// Función para probar In-App directamente
async function testInAppNotification() {
  console.log("\n=== Probando In-App Notification ===");

  const inAppPayload = {
    userId: "test-user-456",
    title: "Evento Reprogramado",
    message:
      "Tu evento 'Concierto de Rock' ha sido reprogramado para el 25 de Octubre a las 8:00 PM",
    type: "event_rescheduled",
    data: {
      eventId: "event-123",
      newDate: "2025-10-25T20:00:00Z",
      reason: "Por motivos de logística",
    },
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "notifications-dev-inAppNotificationHandler",
        Payload: JSON.stringify({
          body: JSON.stringify(inAppPayload),
        }),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ In-App Response:", response);

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      console.log("✅ In-App Connections notified:", body.connectionsNotified);
    }
  } catch (error) {
    console.error("❌ Error en In-App:", error);
  }
}

// Función para probar Push Notification directamente
async function testPushNotification() {
  console.log("\n=== Probando Push Notification ===");

  const pushPayload = {
    userId: "test-user-456",
    title: "🔄 Evento Reprogramado",
    body: "Tu evento 'Concierto de Rock' ha sido reprogramado para el 25 de Octubre a las 8:00 PM",
    data: {
      type: "event_rescheduled",
      eventId: "event-123",
      newDate: "2025-10-25T20:00:00Z",
    },
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "notifications-dev-pushNotificationHandler",
        Payload: JSON.stringify({
          body: JSON.stringify(pushPayload),
        }),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ Push Response:", response);

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      console.log("✅ Push FCM ID:", body.fcmResponse?.name);
    }
  } catch (error) {
    console.error("❌ Error en Push:", error);
  }
}

// Ejecutar todas las pruebas
async function runTests() {
  console.log("🚀 Iniciando pruebas de notificaciones individuales...\n");

  await testWhatsAppNotification();
  await testInAppNotification();
  await testPushNotification();

  console.log("\n✨ Pruebas completadas!");
}

// Ejecutar
runTests().catch(console.error);
