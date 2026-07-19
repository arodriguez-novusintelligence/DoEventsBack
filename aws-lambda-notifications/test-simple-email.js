const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function testDirectEmail() {
  console.log("🧪 Probando con el servicio simple que SÍ funciona...");

  const testPayload = {
    eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
    templateKey: "EVENT_RESCHEDULED",
    eventData: {
      eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
      eventName: "Concierto de Rock Reprogramado",
      originalStartDate: "2025-11-01",
      newStartDate: "2025-11-15",
      reason: "Por motivos de logística se reprogramó el evento",
      venue: "Arena Central",
    },
  };

  try {
    console.log("📧 Enviando con notifications-simple-dev-notifyEventAffectedUsers...");
    
    const result = await lambda.invoke({
      FunctionName: "notifications-simple-dev-notifyEventAffectedUsers",
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(testPayload)
    }).promise();

    const response = JSON.parse(result.Payload);
    console.log("📧 Respuesta del servicio que funciona:", JSON.stringify(response, null, 2));

  } catch (error) {
    console.error("❌ Error:", error);
  }
}

testDirectEmail().catch(console.error);