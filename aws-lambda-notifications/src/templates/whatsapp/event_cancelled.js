/**
 * Template de WhatsApp para evento cancelado
 * Template en Meta Business Suite: "event_cancelled"
 *
 * Estructura:
 * Header: Imagen del evento
 * Body: "Hola {{1}}, lamentamos informarte que el evento {{2}} ha sido cancelado. Motivo: {{3}}. Tu reembolso será procesado automáticamente en los próximos 5-7 días hábiles."
 * Button (URL): URL fija configurada en Meta (sin parámetros dinámicos)
 *
 * Parámetros:
 * - Header: imagen del evento
 * - {{1}} Body: userName
 * - {{2}} Body: eventName
 * - {{3}} Body: reason
 */
const DEFAULT_IMAGE = "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";
const SAFE_PUBLIC_FALLBACK_IMAGE =
  "https://doeventimageeventbucket.s3.amazonaws.com/events/9f709967-3879-4cef-8268-56845587fa09/96B792F9-C10D-430C-99FA-F34C316EDFA8";

module.exports = function buildEventCancelled(metadata = {}) {
  console.log("🔍 Template WhatsApp Event Cancelled - Metadata:", JSON.stringify(metadata, null, 2));

  const userName = metadata.userName || "Usuario";
  const eventName = metadata.eventName || "Evento";
  const reason = metadata.reason || "Motivos ajenos a la organización";

  const rawEventImage = metadata.eventImage || DEFAULT_IMAGE;
  const isPrivateSignedUrl =
    rawEventImage &&
    (rawEventImage.includes("X-Amz-Signature") ||
      rawEventImage.includes("X-Amz-Credential") ||
      rawEventImage.includes("X-Amz-Security-Token"));
  const hasImageExtension = /\.(jpg|jpeg|png|webp)$/i.test(String(rawEventImage || ""));
  const looksLikeS3EventKeyWithoutExtension =
    String(rawEventImage || "").includes("doeventimageeventbucket.s3.amazonaws.com/") &&
    !hasImageExtension;

  const eventImage =
    rawEventImage && !isPrivateSignedUrl && !looksLikeS3EventKeyWithoutExtension
      ? rawEventImage
      : SAFE_PUBLIC_FALLBACK_IMAGE;

  console.log("📸 Event cancelled image source:", {
    eventId: metadata.eventId,
    selectedImage: eventImage,
    usedFallback: eventImage === SAFE_PUBLIC_FALLBACK_IMAGE,
  });

  return [
    {
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: eventImage },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: userName },   // {{1}}
        { type: "text", text: eventName },  // {{2}}
        { type: "text", text: reason },     // {{3}}
      ],
    },
  ];
};
