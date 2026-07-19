const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function testRescheduleIntegration() {
  try {
    console.log("🧪 Iniciando prueba de integración de reprogramación...");

    // Payload de prueba para reprogramar un evento
    const testPayload = {
      body: JSON.stringify({
        eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2", // ID de evento de prueba
        newStartDate: "20251225", // 25 de diciembre 2025
        newEndDate: "20251225", // Mismo día
        reason:
          "Prueba de integración de notificaciones - cambio de fecha por disponibilidad de venue",
      }),
    };

    console.log("📅 Invocando función rescheduleEvent...");
    console.log("Payload:", JSON.stringify(testPayload, null, 2));

    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-manageevent-dev-rescheduleEvent",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(testPayload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log(
      "✅ Respuesta de rescheduleEvent:",
      JSON.stringify(response, null, 2)
    );

    if (response.statusCode === 200) {
      console.log("🎉 ¡Evento reprogramado exitosamente!");
      console.log(
        "📊 Usuarios afectados:",
        JSON.parse(response.body).data?.affectedOrders || 0
      );
      console.log(
        "🔔 Las notificaciones se están enviando de forma asíncrona..."
      );
      console.log(
        "💡 Revisa CloudWatch Logs para ver el progreso de las notificaciones"
      );

      // Esperar un poco y luego verificar logs
      console.log(
        "\n⏳ Esperando 10 segundos para que se procesen las notificaciones..."
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));

      console.log("\n📋 Para verificar las notificaciones, revisa:");
      console.log(
        "1. CloudWatch Logs: /aws/lambda/notifications-dev-notifyEventAffectedUsers"
      );
      console.log(
        "2. CloudWatch Logs: /aws/lambda/notifications-dev-emailNotificationHandler"
      );
      console.log(
        "3. CloudWatch Logs: /aws/lambda/notifications-dev-whatsappNotificationHandler"
      );
      console.log(
        "4. CloudWatch Logs: /aws/lambda/notifications-dev-pushNotificationHandler"
      );
      console.log(
        "5. CloudWatch Logs: /aws/lambda/notifications-dev-inAppNotificationHandler"
      );
    } else {
      console.error("❌ Error en la reprogramación:", response);
    }
  } catch (error) {
    console.error("💥 Error en la prueba:", error);
  }
}

// Ejecutar la prueba
testRescheduleIntegration();
