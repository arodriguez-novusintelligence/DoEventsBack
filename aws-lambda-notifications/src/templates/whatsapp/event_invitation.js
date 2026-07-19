/**
 * Template de WhatsApp para invitación a evento
 * Template en Meta Business Suite: "event_invitations" (PLURAL)
 *
 * Estructura del template:
 * Header: Imagen
 * Body: "Hola, {{1}}! {{2}} te ha invitado al evento {{3}}. Ver detalles: {{4}}"
 * Button: "Haz click aquí para ver tu invitación al evento" con URL estática
 *
 * Parámetros requeridos:
 * - Header: imagen del evento (o imagen por defecto)
 * - {{1}} Body: FavoriteUserName (nombre del usuario invitado)
 * - {{2}} Body: userName (nombre del usuario que invita)
 * - {{3}} Body: eventName (nombre del evento)
 * - {{4}} Body: link (URL al detalle del evento)
 */
const { resolveWebAppBaseUrl } = require("../../utils/resolveWebAppBaseUrl");

module.exports = function eventInvitationTemplate(metadata = {}) {
  console.log(
    "🔍 Template WhatsApp [event_invitations] - Metadata recibida:",
    JSON.stringify(metadata, null, 2)
  );

  const {
    eventName,
    inviterName,
    favoriteUserName,
    eventId,
    eventImage,
    link,
  } = metadata;

  console.log("🖼️ Template WhatsApp - eventImage extraída:", eventImage);

  // WhatsApp CDN necesita una URL pública. Las URLs firmadas de S3 privado
  // (que contienen X-Amz-Signature) no son accesibles por WhatsApp y causan
  // que el mensaje sea descartado silenciosamente tras el "accepted".
  const isPrivateSignedUrl =
    eventImage &&
    (eventImage.includes("X-Amz-Signature") ||
      eventImage.includes("X-Amz-Credential") ||
      eventImage.includes("X-Amz-Security-Token"));

  // Algunas imagenes de eventos se estan sirviendo con metadata no compatible
  // para CDN de WhatsApp (ej. Content-Encoding base64 o Content-Type generico).
  // Como hotfix, si la key no tiene extension de imagen, usamos una imagen
  // publica conocida que ya probamos que entrega correctamente.
  const hasImageExtension =
    /\.(jpg|jpeg|png|webp)$/i.test(String(eventImage || ""));
  const looksLikeS3EventKeyWithoutExtension =
    String(eventImage || "").includes("doeventimageeventbucket.s3.amazonaws.com/") &&
    !hasImageExtension;

  const safePublicFallbackImage =
    "https://doeventimageeventbucket.s3.amazonaws.com/events/9f709967-3879-4cef-8268-56845587fa09/96B792F9-C10D-430C-99FA-F34C316EDFA8";

  const imageUrl =
    eventImage && !isPrivateSignedUrl && !looksLikeS3EventKeyWithoutExtension
      ? eventImage
      : safePublicFallbackImage;

  console.log(
    "📸 Template WhatsApp - usando imagen:",
    isPrivateSignedUrl
      ? "fallback publico (URL firmada privada detectada)"
      : looksLikeS3EventKeyWithoutExtension
        ? "fallback publico (key sin extension, posible metadata incompatible)"
        : eventImage
          ? "eventImage provista"
          : "fallback publico"
  );
  console.log("📸 Template WhatsApp - imageUrl final:", imageUrl);

  // Componente header con imagen
  const headerParameters = [
    {
      type: "image",
      image: {
        link: imageUrl,
      },
    },
  ];

  const webBase = resolveWebAppBaseUrl();
  const eventLink =
    link ||
    (eventId
      ? `${webBase}/events/${eventId}`
      : webBase);

  const bodyParameters = [
    { type: "text", text: favoriteUserName || "Usuario" }, // {{1}} - FavoriteUserName
    { type: "text", text: inviterName || "Alguien" }, // {{2}} - userName
    { type: "text", text: eventName || "un evento" }, // {{3}} - eventName
    { type: "text", text: eventLink }, // {{4}} - URL al detalle del evento
  ];

  console.log("✅ Componentes construidos:", JSON.stringify({
    header: headerParameters,
    body: bodyParameters,
  }, null, 2));

  // Retornar componentes en formato WhatsApp Business API
  // El botón ahora tiene URL estática en Meta, no requiere parámetro dinámico
  return [
    {
      type: "header",
      parameters: headerParameters,
    },
    {
      type: "body",
      parameters: bodyParameters,
    },
  ];
};
