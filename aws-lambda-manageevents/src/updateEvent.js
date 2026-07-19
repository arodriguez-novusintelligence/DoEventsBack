const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const NOTIFICATIONS_LAMBDA =
  process.env.NOTIFICATIONS_LAMBDA ||
  (process.env.STAGE === "qa"
    ? "notifications-qa-triggerNotification"
    : "notifications-dev-triggerNotification");

const EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA ||
  "events-lifecycle-manager-scheduler-upsert";

const LIFECYCLE_ENABLED_STATUSES = new Set([
  "activo",
  "ejecucion",
  "en_ejecucion",
  "finalizado",
]);

const shouldSyncLifecycleSchedules = (eventItem = {}) =>
  LIFECYCLE_ENABLED_STATUSES.has(String(eventItem.estatus || "").trim().toLowerCase());

const collectResponsibleTasks = (eventDays = []) => {
  if (!Array.isArray(eventDays)) return [];

  const tasks = [];
  for (const day of eventDays) {
    if (!day || !Array.isArray(day.activities)) continue;

    for (const activity of day.activities) {
      const responsible = activity?.responsible;
      const responsibleId =
        typeof responsible === "object"
          ? responsible?.id || responsible?.userId
          : null;
      if (!responsibleId) continue;

      tasks.push({
        userId: String(responsibleId),
        taskId: String(activity?.id || `${day?.id || "day"}-${activity?.startTime || "task"}`),
        taskTitle: String(activity?.description || activity?.name || "Actividad de itinerario"),
      });
    }
  }

  return tasks;
};

const notifyItineraryResponsible = async ({
  eventId,
  eventName,
  eventDays,
  updatedBy,
}) => {
  const tasks = collectResponsibleTasks(eventDays);
  if (tasks.length === 0) return;

  const dedupe = new Set();
  const notifications = [];
  for (const task of tasks) {
    const key = `${task.userId}:${task.taskId}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    notifications.push(task);
  }

  for (const task of notifications) {
    try {
      await lambda
        .invoke({
          FunctionName: NOTIFICATIONS_LAMBDA,
          InvocationType: "Event",
          Payload: JSON.stringify({
            body: JSON.stringify({
              templateKey: "ITINERARY_TASK_ASSIGNED",
              userId: task.userId,
              eventId,
              channels: ["push", "inApp", "email"],
              metadata: {
                userId: task.userId,
                eventId,
                eventName: eventName || "Evento",
                taskId: task.taskId,
                taskTitle: task.taskTitle,
                triggeredByUserId: updatedBy || null,
              },
            }),
          }),
        })
        .promise();
    } catch (notifyError) {
      console.error(
        `⚠️ Error enviando notificación de itinerario para userId=${task.userId}:`,
        notifyError,
      );
    }
  }
};

exports.updateEvent = async (event) => {
  let response;

  try {
    const eventId = event.pathParameters.id;
    const updatedData = JSON.parse(event.body);
    const updatingUserId =
      event.requestContext?.authorizer?.claims?.sub || updatedData.updatedBy;

    // Validar que el ID del evento esté presente
    if (!eventId) {
      throw new Error(
        "El campo 'id' en la URL es obligatorio para actualizar el evento",
      );
    }

    // Validar venueId si skipVenue es false
    if (updatedData.skipVenue === false && !updatedData.venueId) {
      throw new Error("venueId es obligatorio cuando skipVenue es false");
    }

    const existingEvent = await dynamodb
      .get({ TableName: EVENTS_TABLE, Key: { id: eventId } })
      .promise();
    if (!existingEvent.Item) {
      const err = new Error("Evento no encontrado");
      err.statusCode = 404;
      throw err;
    }
    const { canEditEntity } = require("./coAdminUtils");
    const eventOwnerId =
      existingEvent.Item.userId || existingEvent.Item.createdBy;
    if (
      !canEditEntity(
        updatingUserId,
        eventOwnerId,
        existingEvent.Item.coAdminIds,
      )
    ) {
      const err = new Error("Sin permiso para editar este evento");
      err.statusCode = 403;
      throw err;
    }

    function convertDateToComparableString(date) {
      if (!date) return null;
      if (/^\d{8}$/.test(String(date))) return String(date);
      if (/^\d{4}-\d{2}-\d{2}/.test(String(date))) {
        return String(date).slice(0, 10).replace(/-/g, "");
      }
      const [day, month, year] = String(date).split("/");
      if (year && month && day) return `${year}${month}${day}`;
      return String(date).replace(/\D/g, "").slice(0, 8) || null;
    }

    const updatedAt = new Date().toISOString();
    const parsedLat = updatedData.latitude !== undefined && updatedData.latitude !== null && updatedData.latitude !== ""
      ? Number(updatedData.latitude)
      : null;
    const parsedLng = updatedData.longitude !== undefined && updatedData.longitude !== null && updatedData.longitude !== ""
      ? Number(updatedData.longitude)
      : null;
    const ubicacionLabel = updatedData.ubicacion;
    const ubicacionObj =
      parsedLat !== null && !Number.isNaN(parsedLat) && parsedLng !== null && !Number.isNaN(parsedLng)
        ? {
            latitude: parsedLat,
            longitude: parsedLng,
            city: updatedData.ciudad || ubicacionLabel || "",
            departamento: updatedData.departamento || "",
            label: ubicacionLabel || updatedData.ciudad || "",
          }
        : null;

    const DatosActualizar = {
      nombre: updatedData.nombre,
      slug: updatedData.slug,
      descripcion: updatedData.descripcion,
      fechaIni: convertDateToComparableString(updatedData.fechaIni),
      fechaFin: convertDateToComparableString(updatedData.fechaFin),
      horaIni: updatedData.horaIni,
      horaFin: updatedData.horaFin,
      organizerName: updatedData.organizerName,
      TelPrin: updatedData.TelPrin,
      TelSec: updatedData.TelSec,
      email: updatedData.email,
      userId: updatedData.userId,
      tipoEvento: updatedData.tipoEvento,
      Categoria: updatedData.Categoria,
      aforo: updatedData.aforo,
      avaliableCapacity: updatedData.avaliableCapacity,
      modalidadEvt: updatedData.modalidadEvt, // visibility
      IndicativoTelPrinOrg: updatedData.IndicativoTelPrinOrg,
      IndicativoTelSecOrg: updatedData.IndicativoTelSecOrg,
      anfitrioName: updatedData.anfitrioName,
      TelPrinAnf: updatedData.TelPrinAnf,
      IndicativoTelPrinAnf: updatedData.IndicativoTelPrinAnf,
      IndicativoTelSecAnf: updatedData.IndicativoTelSecAnf,
      TelSecAnf: updatedData.TelSecAnf,
      emailAnf: updatedData.emailAnf,
      clase: updatedData.clase,
      video: updatedData.video,
      Hashtags: updatedData.Hashtags,
      pais: updatedData.pais,
      ciudad: updatedData.ciudad,
      tipoLugar: updatedData.tipoLugar,
      direccion: updatedData.direccion,
      departamento: updatedData.departamento,
      estatus: updatedData.estatus,
      ...(ubicacionLabel && { ubicacionLabel }),
      ...(ubicacionObj && { ubicacion: ubicacionObj }),
      ...(parsedLat !== null && !Number.isNaN(parsedLat) && { latitude: parsedLat }),
      ...(parsedLng !== null && !Number.isNaN(parsedLng) && { longitude: parsedLng }),
      // Nuevos campos del modelo EVENT
      timezone: updatedData.timezone,
      skipVenue: updatedData.skipVenue,
      ...(updatedData.venueId &&
        !updatedData.skipVenue && { venueId: updatedData.venueId }), // Solo incluir si existe y skipVenue es false
      ...(updatedData.layoutId && { layoutId: updatedData.layoutId }), // Solo incluir si existe
      currency: updatedData.currency,
      ...(updatedData.faq &&
        Array.isArray(updatedData.faq) && { faq: updatedData.faq }), // Opcional - Array de FAQs
      ...(updatedData.policies && { policies: updatedData.policies }), // Opcional
      ...(updatedData.salesStartAt && {
        salesStartAt: updatedData.salesStartAt,
      }), // Solo incluir si existe
      ...(updatedData.salesEndAt && { salesEndAt: updatedData.salesEndAt }), // Solo incluir si existe
      ...(updatedData.itinerary &&
        Array.isArray(updatedData.itinerary) && {
          itinerary: updatedData.itinerary,
        }), // Opcional - Array de actividades
      ...(updatedData.eventDays &&
        Array.isArray(updatedData.eventDays) && {
          eventDays: updatedData.eventDays,
        }), // Opcional - Array de días con agenda estructurada
      ...(updatedData.publishAt && { publishAt: updatedData.publishAt }), // Solo incluir si existe
      ...(updatedData.categoriaReembolso !== undefined && {
        categoriaReembolso: updatedData.categoriaReembolso,
      }), // Opcional - se agrega si viene en el body

      updatedAt: updatedAt,
      updatedBy: updatingUserId,
    };
    // Preparar datos de actualización
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    for (const [key, value] of Object.entries(DatosActualizar)) {
      if (value !== undefined && value !== null) {
        updateExpression.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }

    // Verificar si hay campos para actualizar
    if (updateExpression.length > 0) {
      const params = {
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      };

      // Realizar la actualización en DynamoDB
      const data = await dynamodb.update(params).promise();

      // Notificar responsables cuando se actualiza agenda estructurada por días.
      if (Array.isArray(updatedData.eventDays) && updatedData.eventDays.length > 0) {
        await notifyItineraryResponsible({
          eventId,
          eventName: data?.Attributes?.nombre || updatedData.nombre,
          eventDays: updatedData.eventDays,
          updatedBy: updatingUserId,
        });
      }

      if (shouldSyncLifecycleSchedules(data.Attributes)) {
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
            "⚠️ Error sincronizando schedules lifecycle tras actualizar evento:",
            scheduleError,
          );
        }
      }

      // Preparar la respuesta
      response = {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "Datos de evento actualizados correctamente",
          data: data.Attributes,
        }),
      };
    } else {
      throw new Error("No se proporcionaron los campos para actualizar");
    }
  } catch (error) {
    console.error("Error al actualizar el evento:", error);
    response = {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        success: false,
        error: error.message || "Error interno del servidor",
      }),
    };
  }

  return response;
};
