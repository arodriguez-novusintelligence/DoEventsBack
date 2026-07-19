module.exports = function buildChatUserAnnouncement(metadata = {}) {
  const title = metadata.title || "Anuncio";
  const body = metadata.body || metadata.message || "";
  const eventName = metadata.eventName;
  const link = metadata.link;

  const components = [
    {
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png",
          },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        {
          type: "text",
          text: userName,
        },
        {
          type: "text",
          text: eventName,
        },
      ],
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: link,
        },
      ],
    },
  ];

  return components;
}
