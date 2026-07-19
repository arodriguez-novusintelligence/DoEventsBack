#!/usr/bin/env node

/**
 * Script de Prueba - Invitación de Evento via WhatsApp
 * Verifica que el template event_invitations funciona correctamente
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function testEventInvitationWhatsApp() {
  console.log(
    "Testing event invitation with template event_invitations...\n"
  );

  const testPayload = {
    templateKey: "EVENT_INVITATION",
    channels: ["whatsapp", "push", "email"],
    metadata: {
      userId: "test-user-001",
      eventId: "test-event-001",
      eventName: "Test Concert",
      inviterName: "Test User",
      invitedBy: "test-inviter-001",
      favoriteUserName: "Test Invited",
      eventSlug: "test-concert",
      eventImage: null,
      eventDate: "2026-04-15",
      eventLocation: "Bogota",
      eventCity: "Bogota",
      message: "Test",
      link: "https://doeventsapp.com/Wall/DetalleEvento?eventId=test-event-001",
      shareLink: "https://doeventsapp.com/events/test-concert",
    },
  };

  try {
    console.log("Sending payload:");
    console.log(JSON.stringify(testPayload, null, 2));

    // Save to temp file
    const payloadFile = "/tmp/payload.json";
    fs.writeFileSync(payloadFile, JSON.stringify(testPayload));

    console.log("\nInvoking Lambda...");
    execSync(
      `aws lambda invoke --function-name notifications-dev-triggerNotification --invocation-type RequestResponse --payload file://${payloadFile} --region us-east-1 /tmp/response.json`,
      { stdio: "pipe" }
    );

    const response = fs.readFileSync("/tmp/response.json", "utf-8");
    const parsed = JSON.parse(response);

    console.log("\nLambda Response:");
    console.log(JSON.stringify(parsed, null, 2));

    if (parsed.body) {
      const body = JSON.parse(parsed.body);
      const whatsapp = body.results?.find((r) => r.channel === "whatsapp");

      if (whatsapp) {
        console.log("\nWhatsApp Result:");
        if (whatsapp.result?.body) {
          const details = JSON.parse(whatsapp.result.body);
          if (details.error) {
            console.log("ERROR:", details.error.message);
            console.log("Details:", details.error.error_data?.details);
          } else {
            console.log("SUCCESS - Message sent!");
          }
        }
      }
    }

    // Get logs
    console.log("\nWaiting for logs...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\nFetching CloudWatch logs...");
    try {
      const logs = execSync(
        `aws logs tail /aws/lambda/notifications-dev-triggerNotification --since=5s --region us-east-1 2>&1 | grep -i "event_invitations\\|template\\|whatsapp" | head -50`,
        { encoding: "utf-8", stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
      );
      if (logs.trim()) {
        console.log(logs);
      } else {
        console.log("No specific logs found");
      }
    } catch (e) {
      console.log("Could not fetch logs");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testEventInvitationWhatsApp().catch(console.error);
