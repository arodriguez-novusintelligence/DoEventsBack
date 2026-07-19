/**
 * Template de WhatsApp para confirmación de transferencia enviada
 * Template en Meta Business Suite: "tickets_transferred_sent"
 *
 * Estructura del template:
 * Header: Texto fijo en Meta
 * Body: "¡Hola {{1}}! Has transferido exitosamente {{2}} boleta(s) a {{3}} para el evento {{4}}. Las boletas ya están disponibles en la cuenta del receptor."
 * Button: "Ver mis boletas" con URL estática en Meta
 *
 * Parámetros requeridos:
 * - {{1}} Body: senderName (nombre del usuario que envía)
 * - {{2}} Body: ticketCount (cantidad de boletas)
 * - {{3}} Body: receiverName (nombre del usuario que recibe)
 * - {{4}} Body: eventName (nombre del evento)
 */
module.exports = function ticketTransferredSentTemplate(metadata = {}) {
  console.log(
    "🔍 Template WhatsApp Ticket Transfer Sent - Metadata recibida:",
    JSON.stringify(metadata, null, 2)
  );

  const {
    eventName,
    senderName,
    receiverName,
    userName,
    ticketCount,
  } = metadata;

  // Componente body con 4 parámetros
  const bodyParameters = [
    { type: "text", text: senderName || userName || "Usuario" }, // {{1}} - senderName
    { type: "text", text: String(ticketCount || 1) }, // {{2}} - ticketCount
    { type: "text", text: receiverName || "Alguien" }, // {{3}} - receiverName
    { type: "text", text: eventName || "un evento" }, // {{4}} - eventName
  ];

  // Header, footer y botón son estáticos en Meta; solo se envían parámetros del body.
  return [
    {
      type: "body",
      parameters: bodyParameters,
    },
  ];
};
