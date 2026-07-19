/**
 * Test de notificación local con serverless offline
 * Asegúrate de tener serverless offline corriendo en ambas lambdas:
 * Terminal 1: cd aws-lambda-notifications && serverless offline
 * Terminal 2: cd aws-lambda-guests && serverless offline
 */

const axios = require("axios");

// URLs locales de serverless offline
const NOTIFICATIONS_URL = "http://localhost:3031/dev/trigger-notification";
const GUESTS_URL = "http://localhost:3000/dev/events";

async function testNotificationDirect() {
  console.log("\n🧪 === TEST 1: Notificación Directa ===\n");

  const payload = {
    templateKey: "EVENT_INVITATION",
    channels: ["email", "push", "whatsapp", "inApp"],
    metadata: {
      userId: "46b7f861-630e-4304-a8b0-d6fafd4a54ce",
      eventId: "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
      eventName: "Evento de Prueba Local",
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
  };

  console.log("📤 Enviando a:", NOTIFICATIONS_URL);
  console.log("📦 Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(NOTIFICATIONS_URL, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("\n✅ Respuesta:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("Detalles:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

async function testInvitationComplete() {
  console.log("\n🧪 === TEST 2: Invitación Completa ===\n");

  const eventId = "fc9edc72-23d8-4904-beb5-5a726c1bb1b6";
  const url = `${GUESTS_URL}/${eventId}/invitations`;

  const payload = {
    invitedBy: "42c2e4a4-0",
    users: ["46b7f861-630e-4304-a8b0-d6fafd4a54ce"],
    groups: ["0ab32ef8-e3a9-44cd-a196-e1e45fe04686"],
    channels: ["email", "push", "whatsapp", "inApp"],
    message: "¡Te invito a mi evento especial desde test local!",
  };

  console.log("📤 Enviando a:", url);
  console.log("📦 Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("\n✅ Respuesta:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error.response?.data || error.message);
    if (error.response?.data) {
      console.error("Detalles:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Menú
const args = process.argv.slice(2);
const test = args[0] || "both";

(async () => {
  console.log("🚀 Iniciando pruebas locales con serverless offline...\n");

  if (test === "notification" || test === "both") {
    await testNotificationDirect();
  }

  if (test === "invitation" || test === "both") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await testInvitationComplete();
  }

  console.log("\n✨ Pruebas completadas\n");
})();
