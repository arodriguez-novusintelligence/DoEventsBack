// Simple WhatsApp template builder for closing notice
// Required: { eventName } ; Optional: { message/body }
module.exports = function buildChatUserClosingNotice(metadata = {}) {
  const eventName = metadata.eventName || "";
  const text = metadata.body || metadata.message || "";

  const params = [eventName];
  if (text) params.push(text);

  return {
    components: [
      {
        type: "body",
        parameters: params.map((t) => ({ type: "text", text: String(t ?? "") })),
      },
    ],
  };
}
