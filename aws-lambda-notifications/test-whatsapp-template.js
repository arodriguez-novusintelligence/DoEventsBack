/**
 * Script de prueba para verificar el template de WhatsApp
 */

const eventInvitationTemplate = require("./src/templates/whatsapp/event_invitation.js");

// Metadata de prueba
const testMetadata = {
  metadata: {
    favoriteUserName: "Jeison Andres Visbal Gomez",
    inviterName: "Jeison Andres Visbal Gomez",
    eventName: "un evento",
    eventSlug: "evento-de-prueba-vn",
    eventId: "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
    languageCode: "es_CO",
  },
};

console.log("\n=== TEST WHATSAPP TEMPLATE ===\n");
console.log("Input metadata:", JSON.stringify(testMetadata.metadata, null, 2));

try {
  const components = eventInvitationTemplate(testMetadata);

  console.log("\n=== Generated Components ===");
  console.log(JSON.stringify(components, null, 2));

  console.log("\n=== Component Analysis ===");
  components.forEach((comp, index) => {
    console.log(`\nComponent ${index + 1}:`);
    console.log(`  Type: ${comp.type}`);
    console.log(`  Parameters Count: ${comp.parameters?.length || 0}`);
    if (comp.parameters) {
      comp.parameters.forEach((param, pIndex) => {
        console.log(`    [${pIndex + 1}] ${param.type}: "${param.text}"`);
      });
    }
  });

  console.log("\n=== Expected WhatsApp Payload ===");
  const payload = {
    messaging_product: "whatsapp",
    to: "3158929677",
    type: "template",
    template: {
      name: "invitacion_evento",
      language: { code: "es_CO" },
      components: components,
    },
  };

  console.log(JSON.stringify(payload, null, 2));
} catch (error) {
  console.error("\n❌ ERROR:", error.message);
  console.error(error.stack);
}

console.log("\n=== END TEST ===\n");
