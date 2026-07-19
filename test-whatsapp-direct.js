const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function testWhatsAppDirect() {
  console.log("📱 Probando WhatsApp directamente...");

  const testUser = {
    id: "42c2e4a4-0",
    name: "Usuario de Prueba",
    email: "visbalgomez@gmail.com",
    telefono: "+573158929677",
  };

  const templateKey = "EVENT_RESCHEDULED";
  const eventData = {
    eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
    eventName: "Concierto de Rock Reprogramado",
    originalStartDate: "2025-11-01",
    originalEndDate: "2025-11-01",
    newStartDate: "2025-11-15",
    newEndDate: "2025-11-15",
    reason: "Por motivos de logística se reprogramó el evento",
    venue: "Arena Central",
  };

  try {
    console.log(
      "Payload a enviar:",
      JSON.stringify(
        {
          to: testUser.telefono,
          templateKey: templateKey,
          userData: { userName: testUser.name, userId: testUser.id },
          eventData: eventData,
        },
        null,
        2
      )
    );

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

    console.log("StatusCode:", whatsappResult.StatusCode);
    const response = JSON.parse(whatsappResult.Payload);
    console.log("📱 WhatsApp result:", JSON.stringify(response, null, 2));

    if (response.statusCode === 200) {
      console.log("✅ WhatsApp funcionando correctamente!");
      const body = JSON.parse(response.body);
      if (body.result && body.result.body) {
        const whatsappResponse = JSON.parse(body.result.body);
        if (whatsappResponse.messages && whatsappResponse.messages[0]) {
          console.log("📱 Message ID:", whatsappResponse.messages[0].id);
          console.log(
            "📱 Status:",
            whatsappResponse.messages[0].message_status
          );
        }
      }
    } else {
      console.log("❌ Error en WhatsApp:", response);
      if (response.body) {
        const errorBody = JSON.parse(response.body);
        console.log("Error details:", errorBody);
      }
    }
  } catch (error) {
    console.error("❌ Error completo:", error);
  }
}

// Ejecutar test
testWhatsAppDirect().catch(console.error);
