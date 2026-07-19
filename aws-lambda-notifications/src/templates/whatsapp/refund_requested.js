/**
 * Template de WhatsApp para solicitud de reembolso
 * Template en Meta Business Suite: "refund_requested"
 *
 * Variables:
 * {{1}} - Nombre del usuario
 * {{2}} - Nombre del evento
 * {{3}} - Cantidad de boletas
 * {{4}} - Monto del reembolso
 * {{5}} - Moneda
 * {{6}} - Días de procesamiento
 *
 * Body: "¡Hola {{1}}! Tu solicitud de reembolso para {{2}} ha sido recibida. Reembolsaremos {{3}} boleta(s) por un total de {{4}} {{5}}. El reembolso será procesado en {{6}} días hábiles."
 */

module.exports = function refundRequestedTemplate(metadata = {}) {
  console.log(
    "🔍 Template WhatsApp Refund Requested - Metadata recibida:",
    JSON.stringify(metadata, null, 2)
  );

  const userName = metadata.userName || "Usuario";

  const components = [
    {
      type: "body",
      parameters: [
        {
          type: "text",
          text: userName, // {{1}}
        },
        {
          type: "text",
          text: metadata.eventName || "tu evento", // {{2}}
        },
        {
          type: "text",
          text: String(metadata.ticketCount || 1), // {{3}}
        },
        {
          type: "text",
          text: String(metadata.refundAmount || 0), // {{4}}
        },
        {
          type: "text",
          text: metadata.currency || "COP", // {{5}}
        },
        {
          type: "text",
          text: metadata.processingDays || "3-5", // {{6}}
        },
      ],
    },
  ];

  console.log(
    "📤 Template WhatsApp Refund Requested generado:",
    JSON.stringify(components, null, 2)
  );

  return components;
};
