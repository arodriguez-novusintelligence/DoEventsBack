/**
 * Template de WhatsApp para evento finalizado
 * Template en Meta Business Suite: "event_finished"
 *
 * Estructura esperada:
 * Header: Imagen del evento
 * Body: "Hola, {{1}}. El evento {{2}} ha finalizado."
 * Button URL dinámico: https://doevents.com/DetalleEvento/{{1}}
 */
module.exports = function eventFinishedTemplate(metadata = {}) {
  const { eventName, userName, eventId, eventImage } = metadata;

  // WhatsApp CDN necesita URL pública. Descartar URLs firmadas de S3 privado.
  const isPrivateSignedUrl =
    eventImage &&
    (eventImage.includes("X-Amz-Signature") ||
      eventImage.includes("X-Amz-Credential") ||
      eventImage.includes("X-Amz-Security-Token"));

  const imageUrl =
    eventImage && !isPrivateSignedUrl
      ? eventImage
      : "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";

  return [
    {
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: imageUrl,
          },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: userName || "Usuario" },
        { type: "text", text: eventName || "tu evento" },
      ],
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: eventId || "",
        },
      ],
    },
  ];
};
