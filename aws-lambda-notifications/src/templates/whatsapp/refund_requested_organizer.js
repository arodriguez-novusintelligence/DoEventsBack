/**
 * WhatsApp — aviso al dueño del evento de una solicitud de reembolso.
 * Reutiliza el template Meta aprobado `refunds_requested` (6 variables)
 * con textos orientados al organizador.
 *
 * {{1}} nombre destinatario (organizador)
 * {{2}} nombre del evento
 * {{3}} cantidad de boletas
 * {{4}} monto
 * {{5}} moneda
 * {{6}} radicación / contexto
 */
module.exports = function refundRequestedOrganizerTemplate(metadata = {}) {
  const organizerName =
    metadata.organizerName || metadata.userName || "Organizador";
  const requesterName = metadata.requesterName || "Un asistente";
  const filingHint = metadata.filingId
    ? `Radicación ${metadata.filingId} · ${requesterName}`
    : requesterName;

  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: String(organizerName) },
        { type: "text", text: String(metadata.eventName || "tu evento") },
        { type: "text", text: String(metadata.ticketCount || 1) },
        { type: "text", text: String(metadata.refundAmount || 0) },
        { type: "text", text: String(metadata.currency || "COP") },
        { type: "text", text: String(filingHint).slice(0, 60) },
      ],
    },
  ];
};
