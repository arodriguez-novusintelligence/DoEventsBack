const axios = require("axios");

// Tu configuración (reemplaza con tus valores)
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "588313857701989";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const WABA_ID = "1147186170287904"; // Este ID apareció en los logs anteriores

async function checkWhatsAppLimits() {
  console.log("🔍 Verificando límites y estado de WhatsApp Business...\n");

  try {
    // 1. Verificar el estado del número de teléfono
    console.log("📱 Verificando estado del número de teléfono...");
    const phoneResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}`,
      {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        params: {
          fields:
            "display_phone_number,verified_name,code_verification_status,quality_rating,name_status",
        },
      },
    );
    console.log(
      "✅ Estado del teléfono:",
      JSON.stringify(phoneResponse.data, null, 2),
    );

    // 2. Verificar las plantillas de mensajes
    console.log("\n📋 Verificando plantillas de WhatsApp...");
    const templatesResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${WABA_ID}/message_templates`,
      {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        params: { fields: "name,status,language,category" },
      },
    );

    console.log("✅ Plantillas encontradas:");
    templatesResponse.data.data.forEach((template) => {
      const statusIcon =
        template.status === "APPROVED"
          ? "✅"
          : template.status === "PENDING"
            ? "⏳"
            : template.status === "REJECTED"
              ? "❌"
              : "⚠️";
      console.log(
        `  ${statusIcon} ${template.name} (${template.language}) - ${template.status}`,
      );
    });

    // 3. Verificar analytics y límites
    console.log("\n📊 Verificando analytics del WABA...");
    const analyticsResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${WABA_ID}`,
      {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        params: {
          fields: "analytics,account_review_status,message_template_namespace",
        },
      },
    );
    console.log(
      "✅ Analytics:",
      JSON.stringify(analyticsResponse.data, null, 2),
    );

    // 4. Verificar límites de mensajería
    console.log("\n📈 Verificando límites de mensajería...");
    const limitsResponse = await axios.get(
      `https://graph.facebook.com/v18.0/${WABA_ID}`,
      {
        headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` },
        params: {
          fields: "message_template_namespace,on_behalf_of_business_info",
        },
      },
    );
    console.log(
      "✅ Información de límites:",
      JSON.stringify(limitsResponse.data, null, 2),
    );
  } catch (error) {
    console.error(
      "❌ Error al verificar:",
      error.response?.data || error.message,
    );

    if (error.response?.data?.error) {
      const err = error.response.data.error;
      console.error("\n🔴 Detalles del error:");
      console.error(`  Código: ${err.code}`);
      console.error(`  Tipo: ${err.type}`);
      console.error(`  Mensaje: ${err.message}`);

      if (err.error_user_title) {
        console.error(`  Título: ${err.error_user_title}`);
      }
      if (err.error_user_msg) {
        console.error(`  Descripción: ${err.error_user_msg}`);
      }
    }
  }
}

checkWhatsAppLimits();
