const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function testWhatsAppFromNotifications() {
  console.log("📱 Probando WhatsApp desde el archivo original...");

  const testUser = {
    id: "42c2e4a4-0",
    name: "Usuario de Prueba",
    email: "visbalgomez@gmail.com",
    telefono: "+573158929677",
  };

  const templateKey = "EVENT_RESCHEDULED";
  const eventData = {
    eventId: "f3a2a56-4978-462a-824e-ab2390a81e27",
    eventName: "Concierto de Rock Reprogramado",
    originalStartDate: "2025-11-01",
    originalEndDate: "2025-11-01",
    newStartDate: "2025-11-15",
    newEndDate: "2025-11-15",
    reason: "Por motivos de logística se reprogramó el evento",
    venue: "Arena Central",
  };

  // Probar WhatsApp Notification para Rescheduled (copiado del archivo original)
  console.log("📱 Probando WhatsApp Notification RESCHEDULED...");
  try {
    const whatsappResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-whatsappNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: testUser.telefono,
            templateKey: templateKey,
            userData: { userName: testUser.name, userId: testUser.id },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    const whatsappResponse = JSON.parse(whatsappResult.Payload);
    console.log("📱 WhatsApp RESCHEDULED result:", whatsappResponse);

    if (whatsappResponse.statusCode === 200) {
      console.log("✅ WhatsApp enviado exitosamente!");

      // Extraer detalles del mensaje
      if (whatsappResponse.body) {
        const body = JSON.parse(whatsappResponse.body);
        if (body.result && body.result.body) {
          const whatsappMeta = JSON.parse(body.result.body);
          if (whatsappMeta.messages && whatsappMeta.messages[0]) {
            console.log("📱 Message ID:", whatsappMeta.messages[0].id);
            console.log("📱 Status:", whatsappMeta.messages[0].message_status);
          }
        }
      }
    } else {
      console.log("❌ Error en WhatsApp:", whatsappResponse);
    }
  } catch (error) {
    console.error("❌ Error WhatsApp RESCHEDULED:", error.message);
    console.error("❌ Error completo:", error);
  }
}

testWhatsAppFromNotifications().catch(console.error);
