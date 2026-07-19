const AWS = require("aws-sdk");
const { v4 } = require("uuid");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders";
const TICKETS_TABLE = process.env.TICKETS_TABLE || "Tickets";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const RESCHEDULE_TABLE =
  process.env.RESCHEDULE_TABLE || "RescheduleEvents";
const EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA ||
  "events-lifecycle-manager-scheduler-upsert";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

exports.handler = async (event) => {
  try {
    console.log(
      "📅 Reschedule Event - Evento recibido:",
      JSON.stringify(event, null, 2)
    );

    // Obtener todos los parámetros del body en lugar de pathParameters
    const payload =
      typeof event?.body === "string"
        ? JSON.parse(event.body || "{}")
        : event?.body || {};
    const {
      eventId,
      newStartDate,
      newEndDate,
      newStartTime,
      newEndTime,
      reason,
      ticketSaleStartDate,
      ticketSaleEndDate,
      ticketSaleStartTime,
      ticketSaleEndTime,
    } = payload;

    console.log("📅 Parámetros extraídos:", {
      eventId,
      newStartDate,
      newEndDate,
      newStartTime,
      newEndTime,
      reason,
      ticketSaleStartDate,
      ticketSaleEndDate,
      ticketSaleStartTime,
      ticketSaleEndTime,
    });

    // Validaciones
    if (!eventId) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "eventId es obligatorio",
        }),
      };
    }

    if (!newStartDate || !newEndDate) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "newStartDate y newEndDate son obligatorios",
        }),
      };
    }

    // Validación del formato de fecha YYYYMMDD
    const dateRegex = /^\d{8}$/;
    if (!dateRegex.test(newStartDate) || !dateRegex.test(newEndDate)) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "Las fechas deben estar en formato YYYYMMDD",
        }),
      };
    }

    // Validar que newStartDate no sea mayor que newEndDate
    if (newStartDate > newEndDate) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message:
            "La fecha de inicio no puede ser posterior a la fecha de fin",
        }),
      };
    }

    // 1. Verificar que el evento existe
    console.log(
      "📅 Consultando evento con ID:",
      eventId,
      "en tabla:",
      EVENTS_TABLE
    );
    const eventParams = {
      TableName: EVENTS_TABLE,
      Key: { id: eventId },
    };

    const eventResult = await dynamodb.get(eventParams).promise();
    console.log("📅 Resultado de consulta:", eventResult);

    if (!eventResult.Item) {
      console.log("❌ Evento no encontrado para ID:", eventId);
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
    const currentStartDate = currentEvent.fechaIni;
    const currentEndDate = currentEvent.fechaFin;

    // 2. Validar que las nuevas fechas sean diferentes a las actuales
    if (newStartDate === currentStartDate && newEndDate === currentEndDate) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message:
            "Las nuevas fechas son idénticas a las fechas actuales del evento",
          data: {
            currentStartDate: currentStartDate,
            currentEndDate: currentEndDate,
            newStartDate: newStartDate,
            newEndDate: newEndDate,
          },
        }),
      };
    }

    // 3. Buscar órdenes APPROVED directamente usando el nuevo índice eventIdIndex
    const ordersParams = {
      TableName: ORDERS_TABLE,
      IndexName: "eventIdIndex",
      KeyConditionExpression: "event_id = :eventId",
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":eventId": eventId,
        ":status": "APPROVED",
      },
    };

    console.log("🔍 Buscando órdenes APPROVED usando eventIdIndex...");
    const ordersResult = await dynamodb.query(ordersParams).promise();
    const approvedOrders = ordersResult.Items || [];

    console.log(
      `Encontradas ${approvedOrders.length} órdenes APPROVED para reprogramar`
    );

    // 4. Extraer OrderIds únicos y userIds afectados de las órdenes APPROVED
    const orderIds = new Set(approvedOrders.map((order) => order.id));
    const affectedUserIds = [
      ...new Set(
        approvedOrders.map((order) => order.userId || order.user_id).filter(Boolean)
      ),
    ];

    console.log(`Procesando ${orderIds.size} OrderIds únicos para reprogramar`);

    // 5. Crear registros en la tabla Reschedule con ID único
    const reschedulePromises = Array.from(orderIds).map((orderId) => {
      const rescheduleItem = {
        id: v4(), // ID único para cada registro
        orderId: orderId,
        eventId: eventId,
        originalStartDate: currentStartDate,
        originalEndDate: currentEndDate,
        newStartDate: newStartDate,
        newEndDate: newEndDate,
        reason: reason || "Reprogramación del evento",
        refundStatus: "PENDING",
        createdAt: new Date().toISOString(),
        executionDate: new Date().toISOString(),
        eventName: currentEvent.nombre || currentEvent.name,
        ...(ticketSaleStartDate && { ticketSaleStartDate }),
        ...(ticketSaleEndDate && { ticketSaleEndDate }),
        ...(ticketSaleStartTime && { ticketSaleStartTime }),
        ...(ticketSaleEndTime && { ticketSaleEndTime }),
      };

      return dynamodb
        .put({
          TableName: RESCHEDULE_TABLE,
          Item: rescheduleItem,
        })
        .promise();
    });

    // 6. Ejecutar todas las inserciones en paralelo
    await Promise.all(reschedulePromises);

    // 7. Actualizar el evento con las nuevas fechas, estado y fechas de venta
    // Reset estatus to 'activo' if it was in a running/finished state so that
    // the lifecycle START/FINISH transitions fire again with the new dates.
    const LIFECYCLE_RESET_STATUSES = new Set(['ejecucion', 'en_ejecucion', 'finalizado']);
    const needsStatusReset = LIFECYCLE_RESET_STATUSES.has(currentEvent.estatus);

    const eventUpdateExpr =
      "SET #reschedStatus = :status, updatedAt = :updatedAt, fechaIni = :fechaIni, fechaFin = :fechaFin" +
      (needsStatusReset ? ", estatus = :activo" : "") +
      (newStartTime ? ", horaIni = :horaIni" : "") +
      (newEndTime   ? ", horaFin = :horaFin" : "") +
      (ticketSaleStartDate ? ", ticketSaleStartDate = :tss" : "") +
      (ticketSaleEndDate   ? ", ticketSaleEndDate = :tse"   : "") +
      (ticketSaleStartTime ? ", ticketSaleStartTime = :tssi" : "") +
      (ticketSaleEndTime   ? ", ticketSaleEndTime = :tsei"  : "") +
      // Clear all ticket-sale lifecycle markers so the new cycle can re-fire
      " REMOVE ticketSalesReminderSentAt, ticketSalesStartedSentAt, ticketSalesEndingSoonSentAt, ticketSalesFinishedSentAt, ticketSalesSummarySentAt, ticketSalesWindowKey";

    const eventUpdateValues = {
      ":status": "RESCHEDULED",
      ":updatedAt": new Date().toISOString(),
      ":fechaIni": newStartDate,
      ":fechaFin": newEndDate,
      ...(needsStatusReset && { ":activo": "activo" }),
      ...(newStartTime && { ":horaIni": newStartTime }),
      ...(newEndTime   && { ":horaFin": newEndTime }),
      ...(ticketSaleStartDate && { ":tss": ticketSaleStartDate }),
      ...(ticketSaleEndDate   && { ":tse": ticketSaleEndDate }),
      ...(ticketSaleStartTime && { ":tssi": ticketSaleStartTime }),
      ...(ticketSaleEndTime   && { ":tsei": ticketSaleEndTime }),
    };

    await dynamodb
      .update({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        UpdateExpression: eventUpdateExpr,
        ExpressionAttributeNames: {
          "#reschedStatus": "rescheduleStatus",
        },
        ExpressionAttributeValues: eventUpdateValues,
      })
      .promise();

    // 7.5. Actualizar la tabla Tickets con las nuevas fechas de venta si se proporcionaron.
    // El lifecycle manager lee fechaIniVent/fechaFinVent de la tabla Tickets, no del evento.
    // Si no se actualizan, los schedules de ventas se crean con las fechas antiguas.
    if (ticketSaleStartDate || ticketSaleEndDate || ticketSaleStartTime || ticketSaleEndTime) {
      try {
        const ticketQueryResult = await dynamodb
          .query({
            TableName: TICKETS_TABLE,
            IndexName: "eventIdIndex",
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": eventId },
            Limit: 1,
          })
          .promise();

        const ticketItem = ticketQueryResult.Items && ticketQueryResult.Items[0];
        if (ticketItem) {
          const ticketSetParts = [];
          const ticketUpdateValues = {};

          if (ticketSaleStartDate) {
            ticketSetParts.push("fechaIniVent = :tssd");
            ticketUpdateValues[":tssd"] = ticketSaleStartDate;
          }
          if (ticketSaleEndDate) {
            ticketSetParts.push("fechaFinVent = :tsed");
            ticketUpdateValues[":tsed"] = ticketSaleEndDate;
          }
          if (ticketSaleStartTime) {
            ticketSetParts.push("horaIniVent = :tsst");
            ticketUpdateValues[":tsst"] = ticketSaleStartTime;
          }
          if (ticketSaleEndTime) {
            ticketSetParts.push("horaFinVent = :tset");
            ticketUpdateValues[":tset"] = ticketSaleEndTime;
          }

          if (ticketSetParts.length > 0) {
            await dynamodb
              .update({
                TableName: TICKETS_TABLE,
                Key: { id: ticketItem.id },
                UpdateExpression: "SET " + ticketSetParts.join(", "),
                ExpressionAttributeValues: ticketUpdateValues,
              })
              .promise();
            console.log("✅ Fechas de venta actualizadas en tabla Tickets:", ticketItem.id);
          }
        } else {
          console.log("ℹ️ No se encontró ticket para el evento, omitiendo actualización de Tickets");
        }
      } catch (ticketUpdateError) {
        console.error("⚠️ Error actualizando tabla Tickets con nuevas fechas de venta:", ticketUpdateError);
        // No fatal: el lifecycle continúa con lo que tenga en la tabla
      }
    }

    // 8. Enviar notificaciones a compradores afectados
    const NOTIFY_LAMBDA =
      process.env.NOTIFY_AFFECTED_USERS_LAMBDA ||
      "notifications-dev-notifyEventAffectedUsers";

    if (affectedUserIds.length > 0) {
      try {
        const buyerNotificationPayload = {
          eventId: eventId,
          templateKey: "EVENT_RESCHEDULED",
          targetUserIds: affectedUserIds,
          eventData: {
            eventId,
            eventName: currentEvent.nombre || currentEvent.name,
            eventImage: currentEvent.imageUrl || currentEvent.imagen || "",
            venue: currentEvent.lugar || currentEvent.venue || "Por confirmar",
            originalStartDate: currentStartDate,
            originalEndDate: currentEndDate,
            newStartDate: newStartDate,
            newEndDate: newEndDate,
            reason: reason || "Reprogramación del evento",
            ticketSaleStartDate: ticketSaleStartDate || "",
            ticketSaleEndDate: ticketSaleEndDate || "",
            ticketSaleStartTime: ticketSaleStartTime || "",
            ticketSaleEndTime: ticketSaleEndTime || "",
          },
        };

        console.log("Enviando notificaciones a compradores para evento reprogramado:", eventId);

        await lambda
          .invoke({
            FunctionName: NOTIFY_LAMBDA,
            InvocationType: "Event",
            Payload: JSON.stringify(buyerNotificationPayload),
          })
          .promise();

        console.log("Notificaciones a compradores enviadas exitosamente");
      } catch (notificationError) {
        console.error("Error enviando notificaciones a compradores:", notificationError);
      }
    }

    // 9. Notificar al creador, anfitrión (si aplica) y recopilar IDs de organizadores
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
          eventId: eventId,
          templateKey: "EVENT_RESCHEDULED_OWNER",
          targetUserIds: organizerIds,
          eventData: {
            eventId,
            eventName: currentEvent.nombre || currentEvent.name,
            originalStartDate: currentStartDate,
            originalEndDate: currentEndDate,
            newStartDate: newStartDate,
            newEndDate: newEndDate,
            affectedOrders: affectedUserIds.length,
            reason: reason || "Reprogramación del evento",
            ticketSaleStartDate: ticketSaleStartDate || "",
            ticketSaleEndDate: ticketSaleEndDate || "",
            ticketSaleStartTime: ticketSaleStartTime || "",
            ticketSaleEndTime: ticketSaleEndTime || "",
            executionDate: new Date().toLocaleDateString("es-CO"),
          },
        };

        await lambda
          .invoke({
            FunctionName: NOTIFY_LAMBDA,
            InvocationType: "Event",
            Payload: JSON.stringify(ownerNotificationPayload),
          })
          .promise();

        console.log("Notificación de reagendamiento enviada a organizadores:", organizerIds);
      } catch (ownerNotifError) {
        console.error("Error enviando notificación a organizadores:", ownerNotifError);
      }
    }

    try {
      await lambda
        .invoke({
          FunctionName: EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA,
          InvocationType: "Event",
          Payload: JSON.stringify({
            body: JSON.stringify({
              eventId,
            }),
          }),
        })
        .promise();
    } catch (scheduleError) {
      console.error(
        "⚠️ Error sincronizando lifecycle después de reprogramar evento:",
        scheduleError,
      );
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        message: "Evento reprogramado exitosamente",
        data: {
          eventId: eventId,
          affectedOrders: orderIds.size,
          affectedUsers: affectedUserIds.length,
          originalStartDate: currentStartDate,
          originalEndDate: currentEndDate,
          newStartDate: newStartDate,
          newEndDate: newEndDate,
          executionDate: new Date().toISOString(),
          reason: reason || "Reprogramación del evento",
          ...(ticketSaleStartDate && { ticketSaleStartDate }),
          ...(ticketSaleEndDate   && { ticketSaleEndDate }),
          ...(ticketSaleStartTime && { ticketSaleStartTime }),
          ...(ticketSaleEndTime   && { ticketSaleEndTime }),
        },
      }),
    };
  } catch (error) {
    console.error("Error reprogramando evento:", error);
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
