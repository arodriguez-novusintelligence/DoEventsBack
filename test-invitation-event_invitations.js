#!/usr/bin/env node

/**
 * Script de Prueba - Invitación de Evento via WhatsApp
 * Verifica que el template event_invitations funciona correctamente
 */

const { execSync } = require("child_process");

async function testEventInvitationWhatsApp() {
  console.log(
    "🚀 Probando invitación de evento con template event_invitations...\n"
  );

  const testPayload = {
    templateKey: "EVENT_INVITATION",
    channels: ["whatsapp", "push", "email"],
    metadata: {
      userId: "test-user-001",
      eventId: "test-event-001",
      eventName: "Test Concert Event",
      inviterName: "Test User",
      invitedBy: "test-inviter-001",
      favoriteUserName: "Test Invited",
      eventSlug: "concierto-prueba-whatsapp",
      eventImage: null,
      eventDate: "2026-04-15",
      eventLocation: "Bogota",
      eventCity: "Bogota",
      message: "Looking forward!",
      link: "https://doeventsapp.com/Wall/DetalleEvento?eventId=test-event-001",
      shareLink: "https://doeventsapp.com/Wall/DetalleEvento?eventId=test-event-001",
    },
  };

  try {
    console.log("📦 Enviando payload:");
    console.log(JSON.stringify(testPayload, null, 2));
    console.log("\n⏳ Invocando Lambda...\n");

    // Crear archivo temporal con el payload
    const fs = require("fs");
    const payloadFile = "/tmp/test-invitation-payload.json";
    fs.writeFileSync(payloadFile, JSON.stringify(testPayload));

    // Invocar Lambda
    const cmd = `aws lambda invoke --function-name notifications-dev-triggerNotification --invocation-type RequestResponse --payload file://${payloadFile} --region us-east-1 /tmp/response.json 2>&1`;

    console.log("Ejecutando:", cmd);
    execSync(cmd, { stdio: "inherit" });

    // Leer y mostrar respuesta
    try {
      const response = fs.readFileSync("/tmp/response.json", "utf-8");
      const parsed = JSON.parse(response);

      console.log("\n✅ Respuesta Lambda:");
      console.log(JSON.stringify(parsed, null, 2));

      // Verificar si WhatsApp fue exitoso
      if (parsed.body) {
        const bodyParsed = JSON.parse(parsed.body);
        const whatsappResult = bodyParsed.results?.find(
          (r) => r.channel === "whatsapp"
        );

        if (whatsappResult) {
          console.log("\n📱 Resultado WhatsApp:");
          if (whatsappResult.status === "sent") {
            const whatsappBody = whatsappResult.result?.body;
            if (whatsappBody) {
              const whatsappParsed = JSON.parse(whatsappBody);
              if (whatsappParsed.error) {
                console.log("❌ ERROR:", whatsappParsed.error.message);
                console.log(
                  "Details:",
                  whatsappParsed.error.error_data?.details
                );
              } else if (whatsappParsed.messages) {
                console.log("✅ ÉXITO - Mensaje enviado!");
                console.log("Message ID:", whatsappParsed.messages[0]?.id);
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("⚠️ Error leyendo respuesta:", e.message);
    }

    // Esperar y obtener logs
    console.log("\n⏳ Esperando 3 segundos para que se escriban los logs...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("\n📖 Obteniendo logs de CloudWatch...\n");
    try {
      const logsCmd = `aws logs tail /aws/lambda/notifications-dev-triggerNotification --since=5s --region us-east-1 2>&1 | grep -i "event_invitations\|template.*error\|whatsapp.*request"`;
      const logs = execSync(logsCmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      if (logs.length > 0) {
        console.log("Logs relevantes:");
        console.log(logs);
      }
    } catch (e) {
      console.log("⚠️ No se encontraron logs específicos");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testEventInvitationWhatsApp().catch(console.error);
