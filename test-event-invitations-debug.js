#!/usr/bin/env node

/**
 * Script de Debug para Invitaciones de Eventos via WhatsApp
 * 
 * Envía una invitación completa y captura todos los logs
 */

const { execSync } = require("child_process");

// Test data
const testEventId = "evt-test-invitations-123";
const testInvitedBy = "user-inviter-001";
const testInvitedUser = "user-invited-001";

async function debugEventInvitation() {
  console.log("🚀 Iniciando test de invitaciones de eventos vía WhatsApp...\n");

  try {
    // 1. Obtener timestamp actual
    const beforeTimestamp = Math.floor((Date.now() - 10000) / 1000); // 10 segundos atrás
    console.log("📋 Timestamp antes del envío:", new Date(beforeTimestamp * 1000).toISOString());

    // 2. Preparar payload
    console.log("\n📤 Enviando invitación...\n");

    const payload = {
      templateKey: "EVENT_INVITATION",
      channels: ["whatsapp", "email", "push"],
      metadata: {
        userId: testInvitedUser,
        eventId: testEventId,
        eventName: "Concierto de Prueba",
        inviterName: "Juan Pérez",
        invitedBy: testInvitedBy,
        favoriteUserName: "Carlos López",
        eventSlug: "concierto-prueba",
        eventImage: null,
        eventDate: "2026-04-15",
        eventLocation: "Bogotá",
        eventCity: "Bogotá",
        message: "Te espero en este evento!",
        link: `https://doeventsapp.com/Wall/DetalleEvento?eventId=${testEventId}`,
        shareLink: `https://doeventsapp.com/Wall/DetalleEvento?eventId=${testEventId}`,
      },
    };

    console.log("📦 Payload enviado:");
    console.log(JSON.stringify(payload, null, 2));

    // 3. Invocar lambda con AWS CLI
    const lambdaCommand = `aws lambda invoke --function-name notifications-dev-triggerNotification --invocation-type RequestResponse --payload '${JSON.stringify(payload).replace(/'/g, "'\\''")}' --region us-east-1 /tmp/response.json 2>&1`;
    
    console.log("\n⏳ Invocando Lambda...\n");
    const lambdaOutput = execSync(lambdaCommand, { encoding: "utf-8" });
    console.log(lambdaOutput);

    // 4. Leer respuesta
    try {
      const response = execSync("cat /tmp/response.json", { encoding: "utf-8" });
      console.log("\n✅ Respuesta Lambda:");
      console.log(JSON.stringify(JSON.parse(response), null, 2));
    } catch (e) {
      console.log("No se pudo leer respuesta");
    }

    // 5. Obtener logs de CloudWatch
    console.log("\n📖 Obteniendo logs de CloudWatch...\n");

    try {
      const logsCommand = `aws logs tail /aws/lambda/notifications-dev-triggerNotification --follow=false --since=10s --region us-east-1 2>/dev/null`;
      const logs = execSync(logsCommand, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      
      if (logs.length > 0) {
        console.log("=".repeat(80));
        console.log(logs);
        console.log("=".repeat(80));

        // Análisis de logs
        const linesArray = logs.split("\n");
        
        const errors = linesArray.filter((l) => l.toLowerCase().includes("error"));
        if (errors.length > 0) {
          console.log("\n❌ ERRORES ENCONTRADOS:");
          errors.forEach((error) => {
            console.log("  -", error.substring(0, 200));
          });
        }

        const whatsappEvents = linesArray.filter((l) =>
          l.toLowerCase().includes("whatsapp")
        );
        if (whatsappEvents.length > 0) {
          console.log("\n📱 EVENTOS WHATSAPP:");
          whatsappEvents.forEach((event) => {
            console.log("  -", event.substring(0, 200));
          });
        }
      } else {
        console.log("⚠️ No se encontraron logs recientes");
      }
    } catch (error) {
      console.log("⚠️ Error obteniendo logs", error.message);
    }
  } catch (error) {
    console.error("❌ Error en test:", error.message);
  }
}

debugEventInvitation().catch(console.error);
