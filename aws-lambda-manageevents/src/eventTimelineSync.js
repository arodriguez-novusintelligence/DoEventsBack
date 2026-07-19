const AWS = require("aws-sdk");

AWS.config.update({
  region:
    process.env.DYNAMODB_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "sa-east-1",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const FEED_TIMELINE_TABLE =
  process.env.FEED_TIMELINE_TABLE || "FeedTimeline-dev";
const FEED_SCOPE_HOME_PUBLIC = "HOME_PUBLIC";

function toSortKey(createdAt, id) {
  return `${createdAt}#${id}`;
}

function resolvePublicationTimestamp(item, candidates = []) {
  for (const value of candidates) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

async function syncPublishedEventToTimeline(eventItem, eventImages = []) {
  if (!eventItem?.id || !FEED_TIMELINE_TABLE) return;

  const createdAt = resolvePublicationTimestamp(eventItem, [
    eventItem.publishAt,
    eventItem.updatedAt,
    eventItem.createDate,
    eventItem.createdAt,
  ]);
  const id = `event_${eventItem.id}`;
  const payload = {
    ...eventItem,
    estatus: eventItem.estatus || "activo",
    eventImages: Array.isArray(eventImages) ? eventImages.filter(Boolean) : [],
    imagenPrincipal: eventImages[0] || eventItem.imagenPrincipal || null,
    imageUrl: eventImages[0] || eventItem.imageUrl || null,
    imagen: eventImages[0] || eventItem.imagen || null,
    publishedAt: createdAt,
    publicationTimestamp: createdAt,
    createdAt,
  };

  await dynamodb
    .put({
      TableName: FEED_TIMELINE_TABLE,
      Item: {
        id,
        sourceType: "event",
        sourceId: eventItem.id,
        createdAt,
        sortKey: toSortKey(createdAt, id),
        feedScope: FEED_SCOPE_HOME_PUBLIC,
        listItemType: "publication",
        payload,
        visibility: "PUBLIC",
        updatedAt: new Date().toISOString(),
      },
    })
    .promise();
}

module.exports = {
  syncPublishedEventToTimeline,
};
