// INSTANCE AWS
const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const { DYNAMODB_REGION } = require("../utils/awsRegion");

AWS.config.update({ region: DYNAMODB_REGION });

// UTILS
const {
  getExpirationDate,
  saveNotificationToDb,
  getUserTokens,
} = require("../utils/index");

// FIREBASE ADMIN
const admin = require("../firebase/admin");

// FIREBASE APP INSTANCE
const firebaseApp = admin.app();

// CONVERT FCM DATA PAYLOAD VALUES TO STRINGS (FCM REQUIRES STRING VALUES)
const buildFcmData = (obj = {}) => {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    const v = obj[k];
    out[k] = v == null ? "" : String(v);
  }
  return out;
};

// MAIN SEND FUNCTION
const send = async (notificationData = {}) => {
  try {
    // FIELD EXTRACTION & VALIDATION
    const meta = notificationData.metadata || {};
    const userId = notificationData.userId || meta.userId;
    const action = notificationData.action || "push";
    const priority = notificationData.priority || "normal";
    const notificationId =
      notificationData.id || meta.notificationId || meta.id;
    const recordId = uuidv4();
    const now = meta.notificationTimestamp || meta.timestamp || new Date().toISOString();
    const read =
      typeof notificationData.read === "boolean"
        ? notificationData.read
        : typeof meta.read === "boolean"
          ? meta.read
          : false;

    // PREPARE NOTIFICATION ITEM
    const item = {
      id: recordId,
      ...(notificationId ? { notificationId } : {}),
      userId: userId || null,
      channel: "push",
      action,
      title: notificationData.title || meta.title || "",
      body:
        notificationData.body || notificationData.message || meta.body || "",
      data: notificationData.data || meta.data || {},
      priority,
      read,
      readStatus: read ? "READ" : "UNREAD",
      createdAt: now,
      timestamp: new Date().toISOString(),
      expiresAt: getExpirationDate(),
      metadata: meta,
    };

    // VALIDATE FIREBASE CONFIGURATION
    if (!firebaseApp && (!admin || !admin.apps || !admin.apps.length)) {
      const reason = "firebase_not_configured";
      console.warn("⚠️ Skipping FCM send:", reason);
      return { success: false, saved: false, sent: false, reason, item };
    }

    // SAVE NOTIFICATION TO DB
    await saveNotificationToDb(item);

    // GET DEVICE TOKEN BY USER ID IF NOT PROVIDED
    let token = meta.token || null;
    if (!token) {
      token = await getUserTokens(userId);
    }

    // BUILD BASE MESSAGE
    const messageBase = {
      notification: {
        title: item.title,
        body: item.body,
      },
      data: buildFcmData({ ...(item.metadata || {}), ...(item.data || {}) }),
      android: { priority: "high" },
      apns: { payload: { aps: { badge: 1, sound: "default" } } },
    };

    // VALIDATE TOKEN(S)
    let fcmResult = null;
    if (Array.isArray(meta.tokens) && meta.tokens.length > 0) {
      const multicast = {
        tokens: meta.tokens,
        notification: messageBase.notification,
        data: messageBase.data,
      };
      const response = await admin.messaging().sendMulticast(multicast);
      fcmResult = response;
      console.log("✅ Multicast push result", response);
    }

    // VALIDATE TOPIC
    if (!fcmResult && meta.topic) {
      const msg = { ...messageBase, topic: meta.topic };
      fcmResult = await admin.messaging().send(msg);
      console.log("✅ Push sent to topic", fcmResult);
    }

    // VALIDATE TOKEN
    if (!fcmResult && token) {
      const msg = { ...messageBase, token };
      fcmResult = await admin.messaging().send(msg);
      console.log("✅ Push sent to token", fcmResult);
    }

    return { success: true, saved: true, sent: !!fcmResult, fcmResult, item };
  } catch (error) {
    console.error("❌ Error in pushNotification.send:", error.message || error);
    return { success: false, error: error.message || String(error) };
  }
};

module.exports = { send, saveNotificationToDb, handler };

// Handler para AWS Lambda
async function handler(event) {
  try {
    console.log('🔔 Push notification handler - Event:', JSON.stringify(event, null, 2));
    
    const { userId, templateKey, userData, eventData } = JSON.parse(event.body || '{}');
    
    if (!userId || !templateKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'userId y templateKey son requeridos'
        })
      };
    }

    // Preparar el título y mensaje según el template
    let title, message;
    if (templateKey === 'EVENT_CANCELLED') {
      title = '⚠️ Evento Cancelado';
      message = `El evento ${eventData.eventName || 'que compraste'} ha sido cancelado. Recibirás un reembolso automático.`;
    } else if (templateKey === 'EVENT_RESCHEDULED') {
      title = '📅 Evento Reprogramado';
      message = `El evento ${eventData.eventName || 'que compraste'} ha sido reprogramado para ${eventData.newStartDate || 'nueva fecha'}.`;
    } else {
      title = 'Notificación DoEvents';
      message = 'Tienes una nueva notificación sobre tu evento.';
    }

    // Preparar los metadatos
    const metadata = {
      userId: userId,
      title: title,
      body: message,
      data: {
        templateKey,
        eventId: eventData.eventId,
        type: templateKey
      },
      ...userData,
      ...eventData
    };

    // Usar la función send existente
    const result = await send({
      userId,
      title,
      body: message,
      metadata,
      action: 'push_notification'
    });

    return {
      statusCode: result.success ? 200 : 500,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Error in push notification handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}
