const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const CLIENT_TABLE = process.env.DYNAMODB_CLIENT_TABLE || "Client";
const NOTIFICATIONS_TRIGGER_FUNCTION_NAME =
  process.env.NOTIFICATIONS_TRIGGER_FUNCTION_NAME ||
  (process.env.STAGE === "qa"
    ? "notifications-qa-triggerNotification"
    : "notifications-dev-triggerNotification");
const FOLLOW_NOTIFICATION_CHANNELS = ["push", "inApp", "email"];
const APP_BASE_URL = String(process.env.FEED_PUBLIC_BASE_URL || "https://dev.doeventsapp.com")
  .replace(/\/p\/?$/, "");

function buildUserDisplayName(user = {}) {
  return (
    [user.nombre, user.apellido].filter(Boolean).join(" ").trim() ||
    user.name ||
    user.user ||
    "Usuario"
  );
}

function buildUserUsername(user = {}) {
  if (user.user) {
    return `@${user.user}`;
  }

  if (user.username) {
    return String(user.username).startsWith("@")
      ? user.username
      : `@${user.username}`;
  }

  return null;
}

function buildNotificationActor(userId, user = {}) {
  return {
    actorUserId: userId || user.id || null,
    actorName: buildUserDisplayName(user),
    actorUsername: buildUserUsername(user),
  };
}

async function getUserById(userId) {
  if (!userId) {
    return null;
  }

  try {
    const result = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
      })
      .promise();

    return result.Item || null;
  } catch (error) {
    console.warn(
      `No se pudo obtener el usuario ${userId} para notificaciones de follow`,
      error?.message || error,
    );
    return null;
  }
}

function buildProfileLink(userId) {
  if (!userId) return `${APP_BASE_URL}/profile`;
  return `${APP_BASE_URL}/users/${encodeURIComponent(userId)}`;
}

async function invokeFollowNotification(templateKey, userId, metadata = {}) {
  if (!templateKey || !userId || !NOTIFICATIONS_TRIGGER_FUNCTION_NAME) {
    console.warn(
      `⚠️ invokeFollowNotification: parámetros faltantes - templateKey=${templateKey}, userId=${userId}, fn=${NOTIFICATIONS_TRIGGER_FUNCTION_NAME}`,
    );
    return false;
  }

  const recipient = await getUserById(userId);
  const actorUserId = metadata.actorUserId || null;
  const profileLink = actorUserId ? buildProfileLink(actorUserId) : `${APP_BASE_URL}/profile`;

  const payload = {
    templateKey,
    userId,
    channels: FOLLOW_NOTIFICATION_CHANNELS,
    metadata: {
      userId,
      userName: buildUserDisplayName(recipient || {}),
      link: profileLink,
      profileLink,
      notificationsLink: `${APP_BASE_URL}/`,
      route: actorUserId ? `/users/${actorUserId}` : "/profile",
      triggerId: templateKey,
      templateKey,
      ...metadata,
    },
  };

  console.log(
    `📤 invokeFollowNotification: ${templateKey} → userId=${userId}, fn=${NOTIFICATIONS_TRIGGER_FUNCTION_NAME}`,
  );
  console.log(`📦 Payload:`, JSON.stringify(payload));

  try {
    const result = await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify(payload),
      })
      .promise();

    console.log(
      `✅ invokeFollowNotification: ${templateKey} enviado (StatusCode=${result.StatusCode})`,
    );
    return true;
  } catch (error) {
    console.error(
      `❌ invokeFollowNotification: Error al invocar ${templateKey} para ${userId}:`,
      error?.message || error,
    );
    return false;
  }
}

module.exports = {
  buildNotificationActor,
  getUserById,
  invokeFollowNotification,
};