// Simple WhatsApp template builder for chat start
// Required: { eventName } ; Optional: { userName, link, headerImage }
// Returns { components } matching a template with optional header image and body params
module.exports = function buildChatUserStart(metadata = {}) {
  const userName = metadata.userName;
  const eventName = metadata.eventName || metadata.title || "";
  const link = metadata.link;
  const headerImage = metadata.headerImage ||
    "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";

  const components = [];
  // Header image (keep simple default)
  components.push({
    type: "header",
    parameters: [
      { type: "image", image: { link: String(headerImage) } },
    ],
  });

  const bodyParams = [];
  if (userName) bodyParams.push({ type: "text", text: String(userName) });
  bodyParams.push({ type: "text", text: String(eventName) });
  if (link) bodyParams.push({ type: "text", text: String(link) });

  components.push({
    type: "body",
    parameters: bodyParams,
  });

  return { components };
}
