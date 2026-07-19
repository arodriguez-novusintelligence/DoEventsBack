/**
 * WhatsApp template: promo_code_canceled
 * Body: "Hola {{1}}, el código {{2}} para {{3}} fue cancelado y ya no podrá usarse."
 */
module.exports = function promoCodeCanceledTemplate(metadata = {}) {
  const {
    recipientName,
    promoCode,
    eventName,
  } = metadata;

  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: recipientName || "Usuario" },
        { type: "text", text: promoCode || "DOE-XXXXXX" },
        { type: "text", text: eventName || "el evento" },
      ],
    },
  ];
};
