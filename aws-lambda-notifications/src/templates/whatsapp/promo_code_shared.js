/**
 * WhatsApp template: promo_code_shared
 * Body: "Hola {{1}}, {{2}} te compartió el código {{3}} para el evento {{4}}."
 */
module.exports = function promoCodeSharedTemplate(metadata = {}) {
  const {
    recipientName,
    organizerName,
    promoCode,
    eventName,
  } = metadata;

  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: recipientName || "Usuario" },
        { type: "text", text: organizerName || "El organizador" },
        { type: "text", text: promoCode || "DOE-XXXXXX" },
        { type: "text", text: eventName || "un evento" },
      ],
    },
  ];
};
