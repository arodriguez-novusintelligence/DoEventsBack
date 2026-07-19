/**
 * Template de WhatsApp para recepción de boletas transferidas
 * Template en Meta Business Suite: "tickets_transferred_received"
 *
 * Estructura del template:
 * Header: Texto fijo en Meta
 * Body: "¡Hola {{1}}! {{2}} te ha transferido {{3}} boleta(s) para el evento {{4}}. Las boletas ya están disponibles en tu cuenta."
 * Button: "Ver mis boletas" con URL estática en Meta
 *
 * Parámetros requeridos:
 * - {{1}} Body: receiverName (nombre del usuario que recibe)
 * - {{2}} Body: senderName (nombre del usuario que envía)
 * - {{3}} Body: ticketCount (cantidad de boletas)
 * - {{4}} Body: eventName (nombre del evento)
 */
module.exports = function ticketTransferredReceivedTemplate(metadata = {}) {
  console.log(
    "🔍 Template WhatsApp Ticket Transfer - Metadata recibida:",
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
    { type: "text", text: receiverName || userName || "Usuario" }, // {{1}} - receiverName
    { type: "text", text: senderName || "Alguien" }, // {{2}} - senderName
    { type: "text", text: String(ticketCount || 1) }, // {{3}} - ticketCount
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
