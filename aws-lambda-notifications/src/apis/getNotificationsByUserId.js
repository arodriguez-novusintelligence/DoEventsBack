const AWS = require("aws-sdk");
const { DYNAMODB_REGION } = require("../utils/awsRegion");
AWS.config.update({ region: DYNAMODB_REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { jsonResponse } = require("../utils/corsHeaders");
const { clientIdCandidates } = require("../utils/getClientByUserId");

const pickFirst = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
};

const normalizeRead = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "read";
  }
  return false;
};

const normalizeNotification = (item = {}) => {
  const metadata = item.metadata || {};
  const data = item.data || {};

  const read = normalizeRead(pickFirst(item.read, metadata.read, data.read));

  return {
    id: pickFirst(item.id, metadata.notificationId, data.notificationId),
    notificationId: pickFirst(item.id, metadata.notificationId, data.notificationId),
    userId: pickFirst(item.userId, metadata.userId, data.userId),
    channel: pickFirst(item.channel, "inApp"),
    action: pickFirst(item.action, metadata.action, "inApp"),
    status: pickFirst(item.status, metadata.status, data.status, "active"),
    type: pickFirst(item.type, metadata.type, metadata.entityType, data.entityType, "notification"),
    title: pickFirst(item.title, metadata.title, ""),
    body: pickFirst(item.body, item.message, metadata.body, ""),
    read,
    readStatus: pickFirst(item.readStatus, metadata.readStatus, data.readStatus, read ? "READ" : "UNREAD"),
    priority: pickFirst(item.priority, metadata.priority, "normal"),
    createdAt: pickFirst(item.createdAt, metadata.createdAt, metadata.notificationTimestamp, item.timestamp),
    timestamp: pickFirst(item.timestamp, metadata.notificationTimestamp, metadata.createdAt, item.createdAt),
    expiresAt: pickFirst(item.expiresAt, metadata.expiresAt, null),
    templateKey: pickFirst(metadata.templateKey, metadata.triggerId, data.templateKey, data.triggerId),
    triggerId: pickFirst(metadata.triggerId, metadata.templateKey, data.triggerId, data.templateKey),
    eventId: pickFirst(metadata.eventId, data.eventId),
    eventName: pickFirst(metadata.eventName, data.eventName),
    publicationId: pickFirst(metadata.publicationId, data.publicationId),
    entityId: pickFirst(metadata.entityId, data.entityId),
    entityType: pickFirst(metadata.entityType, data.entityType),
    invokeId: pickFirst(metadata.invokeId, data.invokeId),
    route: pickFirst(metadata.route, data.route, metadata.deepLink, data.deepLink),
    triggeredByUserId: pickFirst(metadata.triggeredByUserId, data.triggeredByUserId),
    triggeredByName: pickFirst(metadata.triggeredByName, data.triggeredByName),
    metadata,
    data,
  };
};

async function queryNotificationsForUserId(userId) {
  const result = await dynamodb
    .query({
      TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false,
    })
    .promise();
  return Array.isArray(result.Items) ? result.Items : [];
}

exports.handler = async (event) => {
  const userId = event.pathParameters.userId;

  if (!userId) {
    return jsonResponse(400, { error: "Missing userId" }, event);
  }

  try {
    const candidates = clientIdCandidates(userId);
    const pages = await Promise.all(candidates.map((id) => queryNotificationsForUserId(id)));
    const seen = new Set();
    const notifications = [];
    for (const items of pages) {
      for (const item of items) {
        const key = `${item.channel || ""}#${item.id || ""}#${item.timestamp || ""}#${item.notificationId || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        notifications.push(item);
      }
    }

    const notificationsInAppOnly = notifications
      .filter((n) => n.channel === "inApp")
      .map(normalizeNotification)
      .sort((a, b) => {
        const ta = Date.parse(a.createdAt || a.timestamp || "") || 0;
        const tb = Date.parse(b.createdAt || b.timestamp || "") || 0;
        return tb - ta;
      });

    return jsonResponse(200, notificationsInAppOnly, event);
  } catch (err) {
    return jsonResponse(500, { error: err.message }, event);
  }
};
