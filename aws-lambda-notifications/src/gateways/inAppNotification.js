// INSTANCE AWS
const AWS = require("aws-sdk");
const { DYNAMODB_REGION } = require("../utils/awsRegion");

AWS.config.update({ region: DYNAMODB_REGION });

// AWS Clients
const docClient = new AWS.DynamoDB.DocumentClient();

// API GATEWAY MANAGEMENT API
let apigateway = null;

function parseWsRequestContextFromEnv() {
  const endpoint = String(process.env.WS_API_ENDPOINT || "").trim();
  if (!endpoint) return null;

  try {
    const url = new URL(endpoint);
    const stage =
      url.pathname.replace(/^\/+/, "").split("/")[0]
      || process.env.STAGE
      || "dev";
    if (!url.hostname) return null;
    return { domainName: url.hostname, stage };
  } catch (err) {
    console.warn("WS_API_ENDPOINT invalido para inApp push:", endpoint, err.message);
    return null;
  }
}

// Función para inicializar API Gateway con endpoint dinámico
const getApiGateway = (event) => {
  if (apigateway) return apigateway;

  if (event && event.requestContext) {
    const { stage, domainName } = event.requestContext;
    const endpoint = `https://${domainName}/${stage}`;
    apigateway = new AWS.ApiGatewayManagementApi({ endpoint });
    return apigateway;
  }

  const wsContext = parseWsRequestContextFromEnv();
  if (wsContext) {
    const endpoint = `https://${wsContext.domainName}/${wsContext.stage}`;
    apigateway = new AWS.ApiGatewayManagementApi({ endpoint });
  }

  return apigateway;
};

// UUID
const { v4: uuidv4 } = require("uuid");

// UTILS
const { getExpirationDate, saveNotificationToDb } = require("../utils/index");

// MAIN SEND FUNCTION
const send = async (notificationData = {}, event = null) => {
  try {
    // Inicializa ApiGateway desde requestContext o WS_API_ENDPOINT (env DEV/QA/PROD)
    const apiGatewayClient = getApiGateway(event);
    // NORMALIZE AND EXTRACT FIELDS
    const meta = notificationData.metadata || {};
    // Dominio de invitación (invitation-pending, etc.) no es estado del registro in-app.
    const rawStatus = notificationData.status || meta.status || "active";
    const status =
      ["active", "inactive", "deleted", "archived"].includes(
        String(rawStatus).trim().toLowerCase(),
      )
        ? String(rawStatus).trim().toLowerCase()
        : "active";
    const type = notificationData.type || meta.type || "info";
    const userId = notificationData.userId || meta.userId;
    const action = notificationData.action || meta.action || "inApp";
    const priority = notificationData.priority || meta.priority || "normal";
    const title = notificationData.title || meta.title || "";
    const body =
      notificationData.body || notificationData.message || meta.body || "";
    const data = notificationData.data || meta.data || {};
    const isChatMessage =
      type === "chat-message" || meta.type === "chat-message";
    const chatRoomId = meta.roomId ? String(meta.roomId) : "";
    const stableChatTimestamp =
      isChatMessage && chatRoomId
        ? `chat-message#${chatRoomId}`
        : null;

    const notificationId =
      notificationData.id || meta.notificationId || meta.id || stableChatTimestamp || uuidv4();
    const recordId = stableChatTimestamp || uuidv4();
    const now = meta.notificationTimestamp || meta.timestamp || new Date().toISOString();
    const read =
      typeof notificationData.read === "boolean"
        ? notificationData.read
        : typeof meta.read === "boolean"
          ? meta.read
          : false;

    // VALIDATE REQUIRED FIELDS
    if (!userId || !title || !body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId, title y body son requeridos" }),
      };
    }

    const persistedMeta = {
      ...meta,
      ...(rawStatus && String(rawStatus) !== status
        ? { inviteStatus: rawStatus }
        : {}),
      status,
    };

    // FIELD EXTRACTION & VALIDATION
    const item = {
      id: recordId,
      notificationId: notificationId,
      userId: userId || null,
      channel: "inApp",
      action: action,
      status: status,
      type: type,
      title,
      body,
      data,
      priority,
      read: stableChatTimestamp ? false : read,
      readStatus: stableChatTimestamp ? "UNREAD" : (read ? "READ" : "UNREAD"),
      createdAt: now,
      // Sufijo de canal evita colisión de SK (userId+timestamp) con push/email en paralelo
      timestamp: stableChatTimestamp || `${new Date().toISOString()}#inApp#${recordId.slice(0, 8)}`,
      expiresAt: getExpirationDate(),
      metadata: stableChatTimestamp
        ? { ...persistedMeta, lastMessageAt: now, roomId: chatRoomId }
        : persistedMeta,
    };

    // SAVE TO DYNAMODB NOTIFICATIONS TABLE
    await saveNotificationToDb(item);

    // RESOLVE CONNECTIONS FOR USER
    const channelId = `notification-user-${userId}`;

    // QUERY CONNECTIONS
    const connections = await docClient
      .query({
        TableName: process.env.USER_CHANNELS_TABLE || "UserChannels",
        KeyConditionExpression: "channelId = :cid",
        ExpressionAttributeValues: { ":cid": channelId },
      })
      .promise();

    // CONNECTIONS ARRAY
    const items = Array.isArray(connections.Items) ? connections.Items : [];

    // If there is no ApiGateway client (e.g., invoked without requestContext), skip websocket push gracefully
    if (!apiGatewayClient || items.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          notificationId,
          skippedWebsocket: true,
          connections: items.length,
        }),
      };
    }

    // BROADCAST TO EACH CONNECTION; REMOVE GONE CONNECTIONS
    const tasks = items.map(({ connectionId }) =>
      apiGatewayClient
        .postToConnection({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            id: notificationId,
            status: status,
            channel: "notification",
            type: type,
            userId,
            title,
            message: body,
            body,
            metadata: meta,
            action: action || "InApp",
            priority,
            read,
            readStatus: read ? "READ" : "UNREAD",
            data,
            createdAt: now,
            expiresAt: getExpirationDate(),
            timestamp: now,
          }),
        })
        .promise()
        .catch((err) => {
          if (err.statusCode === 410) {
            return docClient
              .delete({
                TableName: process.env.USER_CHANNELS_TABLE || "UserChannels",
                Key: { channelId, connectionId },
              })
              .promise();
          }
        }),
    );

    // AWAIT ALL RESULTS
    await Promise.all(tasks);

    // RETURN SUCCESS
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        notificationId,
        sent: items.length,
      }),
    };
  } catch (error) {
    console.error("❌ inAppNotification.send error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

module.exports = { send, handler };

// Handler para AWS Lambda
async function handler(event) {
  try {
    console.log(
      "📱 InApp notification handler - Event:",
      JSON.stringify(event, null, 2),
    );

    const { userId, templateKey, userData, eventData } = JSON.parse(
      event.body || "{}",
    );

    if (!userId || !templateKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "userId y templateKey son requeridos",
        }),
      };
    }

    // Preparar el título y mensaje según el template
    const formatDate = (dateStr) => {
      if (!dateStr || String(dateStr).length !== 8) return dateStr || "nueva fecha";
      return `${String(dateStr).substring(6, 8)}/${String(dateStr).substring(4, 6)}/${String(dateStr).substring(0, 4)}`;
    };

    let title, message, type;
    if (templateKey === "EVENT_CANCELLED") {
      title = "⚠️ Evento Cancelado";
      message = `El evento "${
        eventData.eventName || "que compraste"
      }" ha sido cancelado. Recibirás un reembolso automático.`;
      type = "warning";
    } else if (templateKey === "EVENT_RESCHEDULED") {
      title = "📅 Evento Reprogramado";
      message = `El evento "${
        eventData.eventName || "que compraste"
      }" ha sido reprogramado para el ${formatDate(eventData.newStartDate)}.`;
      type = "info";
    } else if (templateKey === "EVENT_CANCELLED_OWNER") {
      title = "❌ Tu evento fue cancelado";
      message = `Tu evento "${eventData.eventName || "tu evento"}" ha sido cancelado. ${
        eventData.affectedOrders || 0
      } comprador(es) fueron notificados.`;
      type = "warning";
    } else if (templateKey === "EVENT_RESCHEDULED_OWNER") {
      title = "📅 Reagendamiento confirmado";
      message = `Tu evento "${eventData.eventName || "tu evento"}" fue reagendado para el ${formatDate(
        eventData.newStartDate
      )}. ${eventData.affectedOrders || 0} comprador(es) notificados.`;
      type = "info";
    } else {
      title = "Notificación DoEvents";
      message = "Tienes una nueva notificación sobre tu evento.";
      type = "info";
    }

    // Preparar los metadatos
    const metadata = {
      userId: userId,
      templateKey,
      eventId: eventData.eventId,
      ...userData,
      ...eventData,
    };

    // Usar la función send existente
    const result = await send(
      {
        userId,
        title,
        message,
        type,
        metadata,
        action: "inapp_notification",
      },
      event,
    );

    return {
      statusCode: result.statusCode || 200,
      body:
        typeof result.body === "string" ? result.body : JSON.stringify(result),
    };
  } catch (error) {
    console.error("Error in inApp notification handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}
