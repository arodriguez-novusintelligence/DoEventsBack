/**
 * Script de prueba para invitaciones de eventos
 * Ejecutar con: node test-invitations-local.js
 */

const AWS = require("aws-sdk");

// Configurar AWS SDK para local o dev
AWS.config.update({ region: "us-east-1" });

const lambda = new AWS.Lambda();

async function testInvitation() {
  console.log("🧪 Iniciando prueba de invitaciones...\n");

  const testPayload = {
    pathParameters: {
      eventId: "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
    },
    body: JSON.stringify({
      invitedBy: "42c2e4a4-0",
      users: ["46b7f861-630e-4304-a8b0-d6fafd4a54ce"],
      groups: ["0ab32ef8-e3a9-44cd-a196-e1e45fe04686"],
      channels: ["email", "push", "whatsapp", "inApp"],
      message: "¡Te invito a mi evento especial!",
    }),
  };

  console.log("📤 Payload de prueba:");
  console.log(JSON.stringify(testPayload, null, 2));
  console.log("\n");

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-sendEventInvitations",
        InvocationType: "RequestResponse", // Síncrono para ver respuesta
        Payload: JSON.stringify(testPayload),
      })
      .promise();

    console.log("✅ Respuesta de la lambda:");
    const response = JSON.parse(result.Payload);
    console.log(JSON.stringify(response, null, 2));

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      console.log("\n📊 Resumen:");
      console.log(`  - Total invitaciones: ${body.totalInvitations}`);
      console.log(`  - Nuevas invitaciones: ${body.newInvitations}`);
      console.log(`  - Notificaciones enviadas: ${body.notificationsSent}`);
      console.log(`  - Canales: ${body.channels.join(", ")}`);
    }
  } catch (error) {
    console.error("❌ Error al invocar la lambda:", error);
  }
}

// Ejecutar prueba
testInvitation();
