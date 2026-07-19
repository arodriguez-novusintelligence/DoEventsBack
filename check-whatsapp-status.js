const axios = require("axios");

async function checkWhatsAppStatus() {
  console.log("🔍 Verificando estado de WhatsApp Business API...");

  const accessToken =
    process.env.META_ACCESS_TOKEN ||
    "EAAGzrxZCbEf4BOyBzbItaVxHZB56DrIlxlv72c2fMljhdlrLkF8uY0Xmh00NIYkPaiQWcLM9ZBZCu7Oh4DAfh5UqZC0igUP2TZBYtx5TNlZAzn51NqtyIGOaEYKOESg4tRYNBXl8PuqGiAvCu5yfgYyTxAC3UWMsbjk1ml6zEgLgPL4TQq2x6EfZBfR2ZBYSsqILztQZDZD";
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID || "588313857701989";

  try {
    // Verificar el status del número de teléfono
    const phoneResponse = await axios.get(
      `https://graph.facebook.com/v19.0/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    console.log("📱 Estado del número de WhatsApp:", phoneResponse.data);

    // Verificar templates disponibles
    const templatesResponse = await axios.get(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    console.log("📋 Templates disponibles:");
    templatesResponse.data.data.forEach((template) => {
      console.log(
        `- ${template.name}: ${template.status} (${template.category})`
      );
    });

    // Verificar el template específico que estamos usando
    const chatInviteTemplate = templatesResponse.data.data.find(
      (t) => t.name === "chat_user_invite_send"
    );
    if (chatInviteTemplate) {
      console.log("\n✅ Template 'chat_user_invite_send' encontrado:");
      console.log("Status:", chatInviteTemplate.status);
      console.log("Category:", chatInviteTemplate.category);
      console.log("Quality:", chatInviteTemplate.quality_score);
    } else {
      console.log("\n❌ Template 'chat_user_invite_send' no encontrado");
    }
  } catch (error) {
    console.error(
      "❌ Error verificando WhatsApp:",
      error.response?.data || error.message
    );
  }
}

checkWhatsAppStatus();
