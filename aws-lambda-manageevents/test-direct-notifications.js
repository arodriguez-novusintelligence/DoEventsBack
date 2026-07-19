const AWS = require("aws-sdk");

const lambda = new AWS.Lambda({
  region: "us-east-1",
});

// Función para probar reprogramación directamente
async function testRescheduleWithId() {
  console.log("🧪 Probando reprogramación con ID específico...");

  const eventId = "6ea51d60-8515-42a5-ab41-f9f7cfbfa939";

  const reschedulePayload = {
    body: JSON.stringify({
      eventId: eventId,
      newStartDate: "20251225",
      newEndDate: "20251225",
      reason: "Prueba de notificaciones completas - Reprogramación",
    }),
  };

  try {
    console.log("📤 Enviando invocación directa a rescheduleEvent...");
    console.log("Event ID:", eventId);
    console.log("Payload:", JSON.stringify(reschedulePayload, null, 2));

    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-manageevent-dev-rescheduleEvent",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(reschedulePayload),
      })
      .promise();

    console.log("📥 Resultado recibido:");
    const response = JSON.parse(result.Payload);
    console.log("Response:", JSON.stringify(response, null, 2));

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      console.log("\n✅ Reprogramación exitosa!");
      console.log(`📊 Órdenes afectadas: ${body.data.affectedOrders}`);
      console.log(`📅 Evento ID: ${body.data.eventId}`);
      console.log(
        `📅 Fecha original: ${body.data.originalStartDate} - ${body.data.originalEndDate}`
      );
      console.log(
        `📅 Nueva fecha: ${body.data.newStartDate} - ${body.data.newEndDate}`
      );

      if (body.data.affectedOrders > 0) {
        console.log(
          "\n🎯 Se enviaron notificaciones a los usuarios afectados!"
        );
        console.log("📱 Revisa:");
        console.log("- WhatsApp para mensajes");
        console.log("- Push notifications en móvil");
        console.log("- Notificaciones in-app en WebSocket");
        console.log("- Email");
      } else {
        console.log(
          "\n⚠️ No hay órdenes APPROVED para este evento, no se enviaron notificaciones a usuarios"
        );
      }
    } else {
      console.log("❌ Error en reprogramación:", response);
    }
  } catch (error) {
    console.error("❌ Error en la prueba:", error);
  }
}

// Función para probar cancelación directamente
async function testCancelWithId() {
  console.log("\n🧪 Probando cancelación con ID específico...");

  const eventId = "ea51d60-8515-42a5-ab41-f9f7cfbfa939";

  const cancelPayload = {
    body: JSON.stringify({
      eventId: eventId,
      reason: "Prueba de notificaciones completas - Cancelación",
    }),
  };

  try {
    console.log("📤 Enviando invocación directa a cancelEvent...");
    console.log("Event ID:", eventId);
    console.log("Payload:", JSON.stringify(cancelPayload, null, 2));

    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-manageevent-dev-cancelEvent",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(cancelPayload),
      })
      .promise();

    console.log("📥 Resultado recibido:");
    const response = JSON.parse(result.Payload);
    console.log("Response:", JSON.stringify(response, null, 2));

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      console.log("\n✅ Cancelación exitosa!");
      console.log(`📊 Órdenes afectadas: ${body.data.affectedOrders}`);
      console.log(`📅 Evento ID: ${body.data.eventId}`);

      if (body.data.affectedOrders > 0) {
        console.log(
          "\n🎯 Se enviaron notificaciones a los usuarios afectados!"
        );
        console.log("📱 Revisa:");
        console.log("- WhatsApp para mensajes");
        console.log("- Push notifications en móvil");
        console.log("- Notificaciones in-app en WebSocket");
        console.log("- Email");
      } else {
        console.log(
          "\n⚠️ No hay órdenes APPROVED para este evento, no se enviaron notificaciones a usuarios"
        );
      }
    } else {
      console.log("❌ Error en cancelación:", response);
    }
  } catch (error) {
    console.error("❌ Error en la prueba:", error);
  }
}

// Función principal
async function runDirectTests() {
  console.log('🚀 Iniciando pruebas directas con ID específico\n');
  console.log('Event ID a usar: 6ea51d60-8515-42a5-ab41-f9f7cfbfa939');
  console.log('📊 Este evento tiene 2 órdenes APPROVED y está ACTIVO');
  console.log('='.repeat(60));

  await testRescheduleWithId();
  console.log("\n" + "=".repeat(60));
  await testCancelWithId();

  console.log("\n✨ Pruebas completadas");
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runDirectTests().catch(console.error);
}

module.exports = {
  testRescheduleWithId,
  testCancelWithId,
  runDirectTests,
};
