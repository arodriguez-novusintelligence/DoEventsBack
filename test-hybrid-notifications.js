const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function testHybridNotifications() {
  console.log("🧪 Probando función híbrida notifications-dev...");

  const testPayload = {
    eventId: "test-hybrid-event-123",
    templateKey: "EVENT_RESCHEDULED",
    eventData: {
      eventId: "test-hybrid-event-123",
      eventName: "Evento Híbrido Reprogramado",
      originalStartDate: "2025-11-01",
      originalEndDate: "2025-11-01",
      newStartDate: "2025-11-15",
      newEndDate: "2025-11-15",
      reason: "Prueba de función híbrida",
      venue: "Arena Central",
    },
  };

  try {
    console.log(
      "📤 Enviando payload de prueba:",
      JSON.stringify(testPayload, null, 2)
    );

    const result = await lambda
      .invoke({
        FunctionName: "notifications-dev-notifyEventAffectedUsers",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(testPayload),
      })
      .promise();

    console.log("📥 Resultado recibido:");
    console.log("StatusCode:", result.StatusCode);

    if (result.Payload) {
      const response = JSON.parse(result.Payload);
      console.log("Response:", JSON.stringify(response, null, 2));
      
      if (response.statusCode === 200) {
        console.log("✅ Función híbrida ejecutada exitosamente!");
        const body = JSON.parse(response.body);
        console.log("📊 Stats:", body.stats);
      } else {
        console.log("❌ Error en la función:", response);
      }
    }

    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, "base64").toString();
      console.log("🔍 Logs de ejecución:");
      console.log(logs);
    }
  } catch (error) {
    console.error("❌ Error en prueba híbrida:", error);
  }
}

// Ejecutar la prueba
testHybridNotifications().catch(console.error);