const AWS = require("aws-sdk");
const { v4 } = require("uuid");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const TICKETS_CANCELATION_TABLE =
  process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation";
const NOTIFY_AFFECTED_USERS_LAMBDA =
  process.env.NOTIFY_AFFECTED_USERS_LAMBDA ||
  "notifications-dev-notifyEventAffectedUsers";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

const normalizeValue = (value) => String(value || "").trim();

const normalizeStatus = (value) =>
  normalizeValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const STATUS_GROUPS = {
  RUNNING: new Set(["en_ejecucion", "ejecucion", "running", "in_progress"]),
  CANCELLED: new Set(["cancelado", "cancelled"]),
  ACTIVE: new Set(["activo", "active"]),
};

const isApprovedOrder = (order) => {
  const paymentStatus = normalizeValue(order.payment_status || order.status);
  return paymentStatus.toUpperCase() === "APPROVED";
};

const toOrderIdentity = (order) => {
  return {
    orderId: normalizeValue(order.order_id || order.id),
    userId: normalizeValue(order.user_id || order.userId),
  };
};

const getApprovedOrdersByEvent = async (eventId) => {
  const approvedOrders = [];
  let lastEvaluatedKey;

  try {
    do {
      const result = await dynamodb
        .query({
          TableName: ORDERS_TABLE,
          IndexName: "eventIdIndex",
          KeyConditionExpression: "event_id = :eventId",
          FilterExpression:
            "payment_status = :approvedUpper OR payment_status = :approvedLower",
          ExpressionAttributeValues: {
            ":eventId": eventId,
            ":approvedUpper": "APPROVED",
            ":approvedLower": "approved",
          },
          ...(lastEvaluatedKey
            ? { ExclusiveStartKey: lastEvaluatedKey }
            : {}),
        })
        .promise();

      approvedOrders.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return approvedOrders;
  } catch (error) {
    if (error.code !== "ValidationException") {
      throw error;
    }

    // Fallback para ambientes donde el índice esté ausente o con otro schema.
    const scanResult = await dynamodb
      .scan({
        TableName: ORDERS_TABLE,
        FilterExpression: "event_id = :eventId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
      })
      .promise();

    return (scanResult.Items || []).filter(isApprovedOrder);
  }
};

const hasPendingOrCompletedRefund = async (orderId) => {
  try {
    const result = await dynamodb
      .query({
        TableName: TICKETS_CANCELATION_TABLE,
        IndexName: "orderIdIndex",
        KeyConditionExpression: "orderId = :orderId",
        ExpressionAttributeValues: {
          ":orderId": orderId,
        },
      })
      .promise();

    return (result.Items || []).some((item) => {
      const status = normalizeValue(item.refundStatus).toUpperCase();
      return status === "PENDING" || status === "COMPLETED";
    });
  } catch (error) {
    if (error.code !== "ValidationException") {
      throw error;
    }

    const result = await dynamodb
      .scan({
        TableName: TICKETS_CANCELATION_TABLE,
        FilterExpression: "orderId = :orderId",
        ExpressionAttributeValues: {
          ":orderId": orderId,
        },
      })
      .promise();

    return (result.Items || []).some((item) => {
      const status = normalizeValue(item.refundStatus).toUpperCase();
      return status === "PENDING" || status === "COMPLETED";
    });
  }
};

exports.handler = async (event) => {
  try {
    const payload =
      typeof event?.body === "string"
        ? JSON.parse(event.body || "{}")
        : event?.body || {};
    const { reason } = payload;
    // Compatibilidad: aceptar eventId desde body, pathParameters o queryString.
    const rawEventId =
      payload.eventId ||
      payload.eventID ||
      payload.event_id ||
      payload.id_evento ||
      payload.id ||
      event?.pathParameters?.eventId ||
      event?.pathParameters?.eventID ||
      event?.pathParameters?.event_id ||
      event?.pathParameters?.id ||
      event?.queryStringParameters?.eventId ||
      event?.queryStringParameters?.eventID ||
      event?.queryStringParameters?.event_id ||
      event?.queryStringParameters?.id;
    const eventId = normalizeValue(rawEventId);

    console.log("[cancelEvent] Input received", {
      hasBody: Boolean(event?.body),
      bodyType: typeof event?.body,
      payloadKeys: Object.keys(payload || {}),
      eventId,
    });

    // Validaciones
    if (!eventId) {
      console.warn("[cancelEvent] Validation failed: missing eventId");
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message:
            "eventId es obligatorio (acepta eventId, eventID, event_id, id_evento o id)",
        }),
      };
    }

    // 1. Verificar que el evento existe
    const eventParams = {
      TableName: EVENTS_TABLE,
      Key: { id: eventId },
    };

    const eventResult = await dynamodb.get(eventParams).promise();
    if (!eventResult.Item) {
      return {
        statusCode: 404,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "Evento no encontrado",
        }),
      };
    }

    const currentEvent = eventResult.Item;
    const currentStatus = normalizeStatus(currentEvent.estatus);

    console.log("[cancelEvent] Event status resolved", {
      eventId,
      rawStatus: currentEvent.estatus,
      normalizedStatus: currentStatus,
    });

    if (STATUS_GROUPS.RUNNING.has(currentStatus)) {
      console.warn("[cancelEvent] Validation failed: event is running", {
        eventId,
        status: currentEvent.estatus,
      });
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "No se puede cancelar un evento en_ejecucion",
          data: {
            eventId,
            currentStatus: currentEvent.estatus,
          },
        }),
      };
    }

    if (STATUS_GROUPS.CANCELLED.has(currentStatus)) {
      console.warn("[cancelEvent] Validation failed: event already cancelled", {
        eventId,
        status: currentEvent.estatus,
      });
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "El evento ya está cancelado",
          data: {
            eventId,
            currentStatus: currentEvent.estatus,
          },
        }),
      };
    }

    if (!STATUS_GROUPS.ACTIVE.has(currentStatus)) {
      console.warn("[cancelEvent] Validation failed: event is not active", {
        eventId,
        status: currentEvent.estatus,
      });
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "Solo se pueden cancelar eventos en estado activo",
          data: {
            eventId,
            currentStatus: currentEvent.estatus,
          },
        }),
      };
    }

    console.log("🔍 Buscando órdenes APPROVED usando eventIdIndex...");
    const approvedOrdersRaw = await getApprovedOrdersByEvent(eventId);

    const approvedOrders = [];
    const seenOrders = new Set();
    for (const order of approvedOrdersRaw) {
      const { orderId, userId } = toOrderIdentity(order);
      if (!orderId || !userId || seenOrders.has(orderId)) {
        continue;
      }

      approvedOrders.push({
        ...order,
        orderId,
        userId,
      });
      seenOrders.add(orderId);
    }

    console.log(
      `Encontradas ${approvedOrders.length} órdenes APPROVED para cancelar`
    );

    // 4. Extraer userIds y orderIds únicos de las órdenes APPROVED
    const orderIds = approvedOrders.map((order) => order.orderId);
    const affectedUserIds = [...new Set(approvedOrders.map((order) => order.userId))];

    console.log(`Procesando ${orderIds.length} órdenes únicas para cancelar`);

    // 5. Enviar notificaciones a usuarios afectados por todos los canales.
    if (affectedUserIds.length > 0) {
      try {
        const notificationPayload = {
          eventId,
          templateKey: "EVENT_CANCELLED",
          targetUserIds: affectedUserIds,
          eventData: {
            eventId,
            eventName: currentEvent.nombre || currentEvent.name,
            originalStartDate: currentEvent.fechaIni,
            originalEndDate: currentEvent.fechaFin,
            reason: reason || "Cancelación del evento",
            venue: currentEvent.lugar || currentEvent.venue || "Por confirmar",
          },
        };

        console.log("Enviando notificaciones para evento cancelado:", eventId);

        await lambda
          .invoke({
            FunctionName: NOTIFY_AFFECTED_USERS_LAMBDA,
            InvocationType: "Event",
            Payload: JSON.stringify(notificationPayload),
          })
          .promise();

        console.log("Notificaciones de cancelación enviadas exitosamente");
      } catch (notificationError) {
        console.error(
          "Error enviando notificaciones de cancelación:",
          notificationError
        );
      }
    } else {
      console.log("No hay usuarios con órdenes APPROVED para notificar");
    }

    // 6. Notificar al creador, anfitrión (si aplica) y recopilar IDs de organizadores
    const ownerId =
      currentEvent.userId || currentEvent.user_id || currentEvent.organizerId || currentEvent.createdBy;

    // Buscar userId del anfitrión por su email si existe
    let anfitrionId = null;
    if (currentEvent.emailAnf) {
      try {
        const anfitrionResult = await dynamodb
          .query({
            TableName: CLIENT_TABLE,
            IndexName: "EmailIndex",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: { ":email": currentEvent.emailAnf },
            Limit: 1,
          })
          .promise();
        anfitrionId = (anfitrionResult.Items && anfitrionResult.Items[0]?.id) || null;
        if (anfitrionId) {
          console.log("Anfitrión encontrado como usuario registrado:", anfitrionId);
        } else {
          console.log("Anfitrión no tiene cuenta registrada, email:", currentEvent.emailAnf);
        }
      } catch (e) {
        console.error("Error buscando anfitrión por email:", e);
      }
    }

    const organizerIds = [...new Set([ownerId, anfitrionId].filter(Boolean))];

    if (organizerIds.length > 0) {
      try {
        const ownerNotificationPayload = {
          eventId,
          templateKey: "EVENT_CANCELLED_OWNER",
          targetUserIds: organizerIds,
          eventData: {
            eventId,
            eventName: currentEvent.nombre || currentEvent.name,
            originalStartDate: currentEvent.fechaIni,
            originalEndDate: currentEvent.fechaFin,
            affectedOrders: approvedOrders.length,
            affectedUsers: affectedUserIds.length,
            refundsPending: approvedOrders.length,
            reason: reason || "Cancelación del evento",
            executionDate: new Date().toLocaleDateString("es-CO"),
          },
        };

        await lambda
          .invoke({
            FunctionName: NOTIFY_AFFECTED_USERS_LAMBDA,
            InvocationType: "Event",
            Payload: JSON.stringify(ownerNotificationPayload),
          })
          .promise();

        console.log("Notificación de cancelación enviada a organizadores:", organizerIds);
      } catch (ownerNotifError) {
        console.error(
          "Error enviando notificación a organizadores del evento:",
          ownerNotifError
        );
      }
    }

    // 7. Cambiar órdenes APPROVED a CANCELLED y crear reembolsos pendientes.
    const executionDate = new Date().toISOString();
    const orderOperations = approvedOrders.map(async (order) => {
      await dynamodb
        .update({
          TableName: ORDERS_TABLE,
          Key: { order_id: order.orderId },
          UpdateExpression:
            "SET payment_status = :cancelled, #status = :cancelledLower, updated_at = :updatedAt, cancelled_at = :cancelledAt",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":cancelled": "CANCELLED",
            ":cancelledLower": "cancelled",
            ":updatedAt": executionDate,
            ":cancelledAt": executionDate,
          },
        })
        .promise();

      const alreadyRegistered = await hasPendingOrCompletedRefund(order.orderId);
      if (alreadyRegistered) {
        return;
      }

      const cancelationItem = {
        id: v4(),
        orderId: order.orderId,
        userId: order.userId,
        eventId,
        reason: reason || "Cancelación del evento",
        refundStatus: "PENDING",
        createdAt: executionDate,
        executionDate,
        eventName: currentEvent.nombre || currentEvent.name,
        eventStartDate: currentEvent.fechaIni,
        eventEndDate: currentEvent.fechaFin,
        originalStatus: currentEvent.estatus,
      };

      await dynamodb
        .put({
          TableName: TICKETS_CANCELATION_TABLE,
          Item: cancelationItem,
        })
        .promise();
    });

    await Promise.all(orderOperations);

    // 8. Actualizar el estado del evento
    await dynamodb
      .update({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "estatus",
        },
        ExpressionAttributeValues: {
          ":status": "cancelado",
          ":updatedAt": executionDate,
        },
      })
      .promise();

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        message: "Evento cancelado exitosamente",
        data: {
          eventId,
          affectedUsers: affectedUserIds.length,
          affectedOrders: orderIds.length,
          executionDate,
          reason: reason || "Cancelación del evento",
          originalStartDate: currentEvent.fechaIni,
          originalEndDate: currentEvent.fechaFin,
          previousStatus: currentEvent.estatus,
        },
      }),
    };
  } catch (error) {
    console.error("Error cancelando evento:", error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
};
