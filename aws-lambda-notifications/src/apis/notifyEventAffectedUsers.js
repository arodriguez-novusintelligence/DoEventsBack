const AWS = require("aws-sdk");
const { dispatchNotification } = require("../utils/dispatchNotification");

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Configurar Lambda para invocar el servicio de notificaciones
const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION || "us-east-1",
});

exports.handler = async (event) => {
  try {
    console.log(
      "🔔 Iniciando notificaciones para usuarios afectados:",
      JSON.stringify(event, null, 2)
    );

    const { eventId, templateKey, eventData, targetUserIds } = event;

    if (!eventId || !templateKey || !eventData) {
      throw new Error(
        "Faltan parámetros requeridos: eventId, templateKey, eventData"
      );
    }

    // 1. Obtener todos los usuarios afectados por el evento.
    const affectedUsers =
      Array.isArray(targetUserIds) && targetUserIds.length > 0
        ? await getUsersByIds(targetUserIds)
        : await getAffectedUsersByEvent(eventId);
    console.log(`📊 Encontrados ${affectedUsers.length} usuarios afectados`);

    if (affectedUsers.length === 0) {
      console.log("ℹ️ No hay usuarios afectados para notificar");
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "No hay usuarios para notificar",
          affectedUsers: 0,
        }),
      };
    }

    // 2. Enviar notificaciones a cada usuario
    const notificationPromises = affectedUsers.map(async (user) => {
      return await sendNotificationsToUser(
        user,
        templateKey,
        eventData,
        eventId
      );
    });

    const results = await Promise.allSettled(notificationPromises);

    // 3. Procesar resultados
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(
      `✅ Notificaciones completadas: ${successful} exitosas, ${failed} fallidas`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Notificaciones procesadas",
        stats: {
          totalUsers: affectedUsers.length,
          successful,
          failed,
        },
      }),
    };
  } catch (error) {
    console.error("❌ Error en notifyEventAffectedUsers:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error enviando notificaciones",
        error: error.message,
      }),
    };
  }
};

/**
 * Obtiene todos los usuarios afectados por un evento específico
 * @param {string} eventId - ID del evento
 * @returns {Array} Lista de usuarios afectados
 */
async function getAffectedUsersByEvent(eventId) {
  try {
    console.log(`🔍 Buscando usuarios afectados para eventId: ${eventId}`);

    // Buscar órdenes aprobadas para el evento
    const ordersParams = {
      TableName: process.env.ORDERS_TABLE || "Orders",
      IndexName: "eventIdIndex",
      KeyConditionExpression: "event_id = :eventId",
      FilterExpression: "#paymentStatus = :status",
      ExpressionAttributeNames: {
        "#paymentStatus": "payment_status",
      },
      ExpressionAttributeValues: {
        ":eventId": eventId,
        ":status": "APPROVED",
      },
    };

    console.log(
      `📋 Parámetros de consulta:`,
      JSON.stringify(ordersParams, null, 2)
    );

    const ordersResult = await dynamodb.query(ordersParams).promise();
    console.log(
      `📊 Resultado de consulta Orders:`,
      JSON.stringify(ordersResult, null, 2)
    );

    const approvedOrders = ordersResult.Items || [];
    console.log(`✅ Órdenes aprobadas encontradas: ${approvedOrders.length}`);

    // Si no encontramos órdenes con el índice, intentemos un scan como fallback
    if (approvedOrders.length === 0) {
      console.log("🔄 Intentando búsqueda alternativa con scan...");

      const scanParams = {
        TableName: process.env.ORDERS_TABLE || "Orders",
        FilterExpression: "event_id = :eventId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
      };

      const scanResult = await dynamodb.scan(scanParams).promise();
      console.log(
        `📊 Resultado de scan Orders:`,
        JSON.stringify(scanResult, null, 2)
      );

      const allOrdersForEvent = scanResult.Items || [];
      console.log(
        `🔍 Total órdenes para el evento (cualquier status): ${allOrdersForEvent.length}`
      );

      // Filtrar manualmente por payment_status APPROVED
      const approvedOrdersScan = allOrdersForEvent.filter(
        (order) => order.payment_status === "APPROVED"
      );
      console.log(
        `✅ Órdenes APPROVED encontradas con scan: ${approvedOrdersScan.length}`
      );

      if (approvedOrdersScan.length > 0) {
        // Usar el resultado del scan si encontramos órdenes
        approvedOrders.push(...approvedOrdersScan);
      }
    }

    // Extraer user_ids únicos
    const userIds = [
      ...new Set(approvedOrders.map((order) => order.user_id).filter(Boolean)),
    ];

    const orderContextByUser = approvedOrders.reduce((acc, order) => {
      const userId = order.user_id;
      if (!userId) return acc;

      const current = acc[userId];
      const incomingDate = Date.parse(order.created_at || order.createdAt || order.purchaseDate || "") || 0;
      const currentDate = current
        ? Date.parse(current.created_at || current.createdAt || current.purchaseDate || "") || 0
        : 0;

      // Keep the most recent approved order context for each buyer.
      if (!current || incomingDate >= currentDate) {
        acc[userId] = order;
      }

      return acc;
    }, {});

    console.log(
      `👥 Encontrados ${userIds.length} usuarios únicos con órdenes aprobadas`
    );
    console.log(`👥 User IDs:`, userIds);

    // Obtener información completa de los usuarios
    const userPromises = userIds.map(async (userId) => {
      try {
        console.log(`👤 Obteniendo datos del usuario: ${userId}`);
        const userParams = {
          TableName: process.env.CLIENT_TABLE || "Client",
          Key: { id: userId },
        };

        const userResult = await dynamodb.get(userParams).promise();
        console.log(
          `👤 Resultado usuario ${userId}:`,
          userResult.Item ? "✅ Encontrado" : "❌ No encontrado"
        );
        if (!userResult.Item) return null;
        return {
          ...userResult.Item,
          __orderContext: orderContextByUser[userId] || null,
        };
      } catch (error) {
        console.error(`Error obteniendo usuario ${userId}:`, error);
        return null;
      }
    });

    const users = await Promise.all(userPromises);
    const validUsers = users.filter((user) => user !== null);

    console.log(`👥 Usuarios válidos finales: ${validUsers.length}`);

    return validUsers;
  } catch (error) {
    console.error("Error obteniendo usuarios afectados:", error);
    throw error;
  }
}

/**
 * Obtiene usuarios a partir de una lista explícita de userIds.
 * @param {Array<string>} userIds - Lista de IDs de usuario
 * @returns {Array} Lista de usuarios válidos
 */
async function getUsersByIds(userIds) {
  const uniqueUserIds = [
    ...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean)),
  ];

  if (uniqueUserIds.length === 0) {
    return [];
  }

  console.log(`👥 Resolviendo ${uniqueUserIds.length} usuarios explícitos`);

  const userPromises = uniqueUserIds.map(async (userId) => {
    try {
      const result = await dynamodb
        .get({
          TableName: process.env.CLIENT_TABLE || "Client",
          Key: { id: userId },
        })
        .promise();

      return result.Item || null;
    } catch (error) {
      console.error(`Error obteniendo usuario ${userId}:`, error);
      return null;
    }
  });

  const users = await Promise.all(userPromises);
  return users.filter(Boolean);
}

/**
 * Envía notificaciones a un usuario específico por todos los canales
 * @param {Object} user - Datos del usuario
 * @param {string} templateKey - Clave del template (EVENT_CANCELLED, EVENT_RESCHEDULED)
 * @param {Object} eventData - Datos del evento
 * @param {string} eventId - ID del evento
 */
async function sendNotificationsToUser(user, templateKey, eventData, eventId) {
  try {
    console.log(
      `📱 Enviando notificaciones a usuario: ${user.id} (${user.email})`
    );

    const channels =
      templateKey === "EVENT_CANCELLED" || templateKey === "EVENT_RESCHEDULED"
        ? ["email", "whatsapp", "push", "inApp"]
        : ["email", "push", "inApp"];

    const metadata = buildBuyerLifecycleMetadata(user, eventData, eventId);

    const dispatchResponse = await dispatchNotification({
      templateKey,
      channels,
      metadata,
    });

    const notifications = toNotificationResults(dispatchResponse, channels);

    return {
      userId: user.id,
      notifications,
    };
  } catch (error) {
    console.error(`Error enviando notificaciones a usuario ${user.id}:`, error);
    throw error;
  }
}

function buildBuyerLifecycleMetadata(user, eventData = {}, eventId) {
  const orderContext = user.__orderContext || {};
  const purchaseOptionLabel = resolvePurchaseOptionLabel(orderContext, eventData);

  return {
    userId: user.id,
    userName: user.name || user.nombre || "Usuario",
    email: user.email || "",
    phone: user.phone || "",
    indicativo: user.indicativo || user.countryCode || "",
    eventId: eventId || eventData.eventId,
    eventName: eventData.eventName,
    venue: eventData.venue || "",
    reason: eventData.reason || "",
    eventStartDate:
      eventData.eventStartDate || eventData.originalStartDate || "",
    eventEndDate: eventData.eventEndDate || eventData.originalEndDate || "",
    originalStartDate: eventData.originalStartDate || eventData.eventStartDate || "",
    originalEndDate:
      eventData.originalEndDate || eventData.eventEndDate || eventData.originalStartDate || eventData.eventStartDate || "",
    newStartDate: eventData.newStartDate || "",
    newEndDate: eventData.newEndDate || "",
    ticketSaleStartDate: eventData.ticketSaleStartDate || "",
    ticketSaleEndDate: eventData.ticketSaleEndDate || "",
    ticketSaleStartTime: eventData.ticketSaleStartTime || "",
    ticketSaleEndTime: eventData.ticketSaleEndTime || "",
    orderId:
      orderContext.id ||
      orderContext.orderId ||
      orderContext.order_id ||
      eventData.orderId ||
      "[ID de Compra]",
    purchaseDate:
      orderContext.created_at ||
      orderContext.createdAt ||
      orderContext.purchaseDate ||
      eventData.purchaseDate ||
      "[Insertar Fecha de Compra]",
    ticketPaidAmount: resolveTicketPaidAmount(orderContext, eventData),
    purchaseOptionLabel,
    purchaseOptionSelected: purchaseOptionLabel,
  };
}

function resolvePurchaseOptionLabel(orderContext = {}, eventData = {}) {
  const rawOption =
    orderContext.purchaseOption ||
    orderContext.purchase_option ||
    orderContext.knownOrganizerOption ||
    orderContext.knowsOrganizer ||
    orderContext.conozcoOrganizador ||
    eventData.purchaseOptionLabel ||
    eventData.purchaseOption;

  if (typeof rawOption === "boolean") {
    return rawOption ? "Conozco al organizador" : "No conozco al organizador";
  }

  const normalized = String(rawOption || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "[Insertar: \"Conozco al organizador\" / \"No conozco al organizador\"]";
  }

  if (
    normalized.includes("no conozco") ||
    normalized.includes("no_conozco") ||
    normalized.includes("dont") ||
    normalized.includes("unknown")
  ) {
    return "No conozco al organizador";
  }

  if (
    normalized.includes("conozco") ||
    normalized.includes("know") ||
    normalized.includes("direct") ||
    normalized.includes("trusted")
  ) {
    return "Conozco al organizador";
  }

  return String(rawOption);
}

function resolveTicketPaidAmount(orderContext = {}, eventData = {}) {
  const rawAmount =
    orderContext.ticketPaidAmount ||
    orderContext.ticket_paid_amount ||
    orderContext.totalPaid ||
    orderContext.total_paid ||
    orderContext.total ||
    orderContext.total_amount ||
    orderContext.amount ||
    orderContext.net_amount ||
    eventData.ticketPaidAmount ||
    eventData.totalPaid;

  if (rawAmount === undefined || rawAmount === null || rawAmount === "") {
    return "[Monto total pagado-comisión]";
  }

  if (typeof rawAmount === "number") {
    return rawAmount.toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    });
  }

  return String(rawAmount);
}

function toNotificationResults(dispatchResponse, requestedChannels = []) {
  let parsedBody = {};
  if (dispatchResponse && typeof dispatchResponse.body === "string") {
    try {
      parsedBody = JSON.parse(dispatchResponse.body);
    } catch (_) {
      parsedBody = {};
    }
  }

  const sentChannels = new Set(
    (parsedBody.results || []).map((result) => result.channel),
  );

  return requestedChannels.map((channel) => {
    const match = (parsedBody.results || []).find((result) => result.channel === channel);
    if (match) {
      return {
        channel,
        success: true,
        result: match.result,
      };
    }

    return {
      channel,
      success: false,
      error: sentChannels.has(channel) ? "unknown_channel_result" : "channel_not_sent",
    };
  });
}

/**
 * Envía notificación por email usando emailNotificationHandler
 */
async function sendEmailNotification(user, templateKey, eventData, eventId) {
  const stage = process.env.STAGE || "dev";
  const functionName = `notifications-${stage}-emailNotificationHandler`;

  const payload = {
    body: JSON.stringify({
      to: user.email,
      templateKey: templateKey,
      userData: {
        userId: user.id,
        userName: user.name || user.nombre || "Usuario",
      },
      eventData: {
        ...eventData,
        eventId: eventId || eventData.eventId,
      },
    }),
  };

  console.log(`📧 Enviando email usando: ${functionName}`);
  console.log(`📧 Payload para email:`, JSON.stringify(payload, null, 2));

  const result = await lambda
    .invoke({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    })
    .promise();

  const response = JSON.parse(result.Payload);
  console.log(`📧 Respuesta del email:`, JSON.stringify(response, null, 2));
  return response;
}

/**
 * Envía notificación por WhatsApp usando dev (validado funcionando)
 */
async function sendWhatsAppNotification(
  user,
  templateKey,
  eventData,
  fullPhone
) {
  const stage = process.env.STAGE || "dev";
  // Usar dev para WhatsApp ya que está validado funcionando
  const functionName = `notifications-${stage}-whatsappNotificationHandler`;

  const payload = {
    body: JSON.stringify({
      to: fullPhone,
      templateKey: templateKey,
      userData: {
        userName: user.name || user.nombre || "Usuario",
        userId: user.id,
        phone: fullPhone,
      },
      eventData: {
        ...eventData,
        link: `https://doeventsapp.com/events/${eventData.eventId || ""}`,
      },
    }),
  };

  console.log(`📱 Enviando WhatsApp usando: ${functionName}`);
  console.log(`📱 Teléfono completo: ${fullPhone}`);

  const result = await lambda
    .invoke({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    })
    .promise();

  return JSON.parse(result.Payload);
}

/**
 * Envía push notification usando dev (validado funcionando)
 */
async function sendPushNotification(user, templateKey, eventData) {
  const stage = process.env.STAGE || "dev";
  // Usar dev para push ya que está validado funcionando
  const functionName = `notifications-${stage}-pushNotificationHandler`;

  const payload = {
    body: JSON.stringify({
      userId: user.id,
      templateKey: templateKey,
      userData: {
        name: user.name || user.nombre || "Usuario",
      },
      eventData,
    }),
  };

  console.log(`🔔 Enviando push usando: ${functionName}`);

  const result = await lambda
    .invoke({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    })
    .promise();

  return JSON.parse(result.Payload);
}

/**
 * Envía notificación in-app usando global-websocket-gateway (validado funcionando)
 */
async function sendInAppNotification(user, templateKey, eventData) {
  console.log(`📱 Enviando in-app via dispatchNotification: ${templateKey}`);
  return dispatchNotification({
    templateKey,
    channels: ["inApp"],
    metadata: {
      userId: user.id,
      userName: user.name || user.nombre || "Usuario",
      ...eventData,
    },
  });
}
