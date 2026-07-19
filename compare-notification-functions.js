const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function compareNotificationFunctions() {
  console.log("🔍 Comparando funciones de notificación...\n");

  const testPayload = {
    eventId: "test-event-rescheduled-123",
    templateKey: "EVENT_RESCHEDULED",
    eventData: {
      eventId: "test-event-rescheduled-123",
      eventName: "Evento de Prueba Reprogramado",
      originalStartDate: "2025-11-01",
      originalEndDate: "2025-11-01",
      newStartDate: "2025-11-05",
      newEndDate: "2025-11-05",
      reason: "Comparación de funciones de notificación",
      venue: "Lugar de Prueba",
    },
  };

  // Función 1: notifications-dev (nueva)
  console.log("📤 Probando notifications-dev-notifyEventAffectedUsers...");
  try {
    const result1 = await lambda
      .invoke({
        FunctionName: "notifications-dev-notifyEventAffectedUsers",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(testPayload),
      })
      .promise();

    console.log("✅ notifications-dev resultado:");
    console.log("StatusCode:", result1.StatusCode);
    if (result1.Payload) {
      const response = JSON.parse(result1.Payload);
      console.log("Response:", JSON.stringify(response, null, 2));
    }
  } catch (error) {
    console.error("❌ Error en notifications-dev:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Función 2: notifications-simple-dev (anterior)
  console.log(
    "📤 Probando notifications-simple-dev-notifyEventAffectedUsers..."
  );
  try {
    const result2 = await lambda
      .invoke({
        FunctionName: "notifications-simple-dev-notifyEventAffectedUsers",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(testPayload),
      })
      .promise();

    console.log("✅ notifications-simple-dev resultado:");
    console.log("StatusCode:", result2.StatusCode);
    if (result2.Payload) {
      const response = JSON.parse(result2.Payload);
      console.log("Response:", JSON.stringify(response, null, 2));
    }
  } catch (error) {
    console.error("❌ Error en notifications-simple-dev:", error.message);
  }

  console.log("\n🔍 Análisis de diferencias:");
  console.log(
    "- notifications-dev: Función actualizada con handlers corregidos"
  );
  console.log(
    "- notifications-simple-dev: Función anterior (posiblemente más estable)"
  );
  console.log(
    "\n💡 Recomendación: Usar la función que envíe todas las notificaciones correctamente"
  );
}

// Ejecutar comparación
compareNotificationFunctions().catch(console.error);
