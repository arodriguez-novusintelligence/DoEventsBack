/**
 * Template de WhatsApp para reembolso aprobado
 * Template en Meta Business Suite: "refund_approved"
 *
 * Estructura:
 * Header: (sin imagen - solo texto)
 * Body: "Hola {{1}}, tu reembolso de {{2}} {{3}} para el evento {{4}} ha sido aprobado. Recibirás el pago en tu método original en {{5}} días hábiles."
 *
 * Parámetros:
 * - {{1}} Body: userName
 * - {{2}} Body: refundAmount
 * - {{3}} Body: currency
 * - {{4}} Body: eventName
 * - {{5}} Body: processingDays
 */

module.exports = function refundApprovedTemplate(metadata = {}) {
  console.log(
    "🔍 Template WhatsApp Refund Approved - Metadata recibida:",
    JSON.stringify(metadata, null, 2)
  );

  const components = [
    {
      type: "body",
      parameters: [
        { type: "text", text: metadata.userName || "Usuario" },              // {{1}}
        { type: "text", text: String(metadata.refundAmount || "0") },        // {{2}}
        { type: "text", text: metadata.currency || "COP" },                   // {{3}}
        { type: "text", text: metadata.eventName || "tu evento" },            // {{4}}
        { type: "text", text: String(metadata.processingDays || "3-5") },    // {{5}}
      ],
    },
  ];

  console.log(
    "📤 Template WhatsApp Refund Approved generado:",
    JSON.stringify(components, null, 2)
  );

  return components;
};
