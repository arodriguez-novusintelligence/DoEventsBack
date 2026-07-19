/**
 * Script de prueba para notificación EVENT_PUBLISHED
 *
 * Este script simula el envío de una notificación cuando se publica un evento
 *
 * Uso: node test-event-published-notification.js
 */

const AWS = require("aws-sdk");

const lambda = new AWS.Lambda({ region: "us-east-1" });

async function testEventPublishedNotification() {
  console.log("🧪 Iniciando prueba de notificación EVENT_PUBLISHED\n");

  const testPayload = {
    triggerId: "EVENT_PUBLISHED",
    userId: "42c2e4a4-0", // ID del organizador real
    eventId: "test-event-456",
    channels: ["email", "push", "inApp"],
    metadata: {
      eventName: "Festival de Música Rock 2024",
      eventSlug: "festival-musica-rock-2024",
      eventDate: "20240510", // Formato YYYYMMDD
      eventLocation: "Bogotá",
      organizerName: "Rock Events CO",
      eventId: "test-event-456",
    },
  };

  console.log("📋 Payload de prueba:");
  console.log(JSON.stringify(testPayload, null, 2));
  console.log("\n");

  try {
    const params = {
      FunctionName: "notifications-dev-triggerNotification",
      InvocationType: "RequestResponse", // Síncrono para ver la respuesta
      Payload: JSON.stringify({
        body: JSON.stringify(testPayload),
      }),
    };

    console.log("🚀 Invocando lambda de notificaciones...\n");

    const response = await lambda.invoke(params).promise();

    console.log("✅ Respuesta recibida:");
    console.log("Status Code:", response.StatusCode);

    if (response.Payload) {
      const payload = JSON.parse(response.Payload);
      console.log("\n📦 Payload de respuesta:");
      console.log(JSON.stringify(payload, null, 2));

      if (payload.statusCode === 200 || payload.statusCode === 201) {
        console.log("\n✅ ¡Notificación enviada exitosamente!");
        console.log("\n📧 Verifica tu email para confirmar la recepción");
      } else {
        console.log(
          "\n⚠️  La notificación fue procesada pero con advertencias"
        );
      }
    }
  } catch (error) {
    console.error(
      "\n❌ Error al enviar notificación de prueba:",
      error.message
    );

    if (error.code === "ResourceNotFoundException") {
      console.error(
        "\n💡 La función Lambda de notificaciones no existe o no está disponible."
      );
      console.error(
        "   Verifica que aws-lambda-notifications esté desplegada correctamente."
      );
    }
  }
}

// Ejecutar prueba
testEventPublishedNotification()
  .then(() => {
    console.log("\n🏁 Prueba completada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error inesperado:", error);
    process.exit(1);
  });
