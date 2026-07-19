/**
 * Test completo del flujo de notificaciones
 * Simula exactamente lo que hace sendEventInvitationsHandler
 */

const { dispatchNotification } = require("./src/utils/dispatchNotification");

async function testEventInvitationDirect() {
  console.log(
    "\n🧪 Test 1: Llamada directa a dispatchNotification (como examples-dispatch)\n"
  );

  const payload = {
    templateKey: "EVENT_INVITATION",
    channels: ["email", "push"],
    metadata: {
      userId: "42c2e4a4-0",
      eventId: "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
      eventName: "Evento de Prueba",
      eventSlug: "evento-prueba",
      eventDate: "20/12/2025",
      eventStartTime: "19:00",
      eventLocation: "Centro de Eventos",
      eventCity: "Bogotá",
      organizerName: "Organizador Test",
      inviterName: "Juan Invitador",
      invitedBy: "42c2e4a4-0",
      message: "¡Te invito a mi evento especial!",
      link: "https://app.doevents.com/events/evento-prueba",
      shareLink: "https://app.doevents.com/event/evento-prueba/invite",
      invitationId: "test-001",
    },
  };

  console.log("📦 Payload:", JSON.stringify(payload, null, 2));

  try {
    const result = await dispatchNotification(payload);
    console.log("\n✅ Resultado:", JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    throw error;
  }
}

async function testEventInvitationViaHandler() {
  console.log(
    "\n🧪 Test 2: Via triggerNotification.handler (como lo hace Lambda)\n"
  );

  const triggerNotification = require("./src/apis/triggerNotification");

  // Simular evento HTTP que recibe la lambda
  const event = {
    body: JSON.stringify({
      templateKey: "EVENT_INVITATION",
      channels: ["email", "push", "whatsapp"],
      metadata: {
        userId: "42c2e4a4-0",
        eventId: "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
        eventName: "Evento de Prueba",
        eventSlug: "evento-prueba",
        eventDate: "20/12/2025",
        eventStartTime: "19:00",
        eventLocation: "Centro de Eventos",
        eventCity: "Bogotá",
        organizerName: "Organizador Test",
        inviterName: "Juan Invitador",
        invitedBy: "42c2e4a4-0",
        message: "¡Te invito a mi evento especial!",
        link: "https://app.doevents.com/events/evento-prueba",
        shareLink: "https://app.doevents.com/event/evento-prueba/invite",
        invitationId: "test-002",
      },
    }),
  };

  console.log("📦 Event:", JSON.stringify(JSON.parse(event.body), null, 2));

  try {
    const result = await triggerNotification.handler(event);
    console.log("\n✅ Resultado HTTP:", JSON.stringify(result, null, 2));

    if (result.body) {
      const body = JSON.parse(result.body);
      console.log("\n📄 Body parseado:", JSON.stringify(body, null, 2));
    }

    return result;
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
}

// Ejecutar ambos tests
(async () => {
  console.log("🚀 Iniciando tests de notificaciones EVENT_INVITATION\n");
  console.log("═".repeat(80));

  try {
    await testEventInvitationDirect();
    console.log("\n" + "═".repeat(80));
    await testEventInvitationViaHandler();
    console.log("\n" + "═".repeat(80));
    console.log("\n✨ Todos los tests completados exitosamente\n");
  } catch (error) {
    console.error("\n💥 Test falló:", error.message);
    process.exit(1);
  }
})();
