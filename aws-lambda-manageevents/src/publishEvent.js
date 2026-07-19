const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const { assertRefundCategoryConfigured } = require("./lib/refundPolicyValidation");
const { syncPublishedEventToTimeline } = require("./eventTimelineSync");
const { enrichEventFromVenue } = require("./eventVenueEnrichment");
AWS.config.update({ region: process.env.AWS_REGION });

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: "v4" });
const lambda = new AWS.Lambda();

const tableName = (envKey, fallback) => process.env[envKey] || fallback;
const EVENT_TABLE = () => tableName("EVENTS_TABLE", "Eventos");
const IMAGE_TABLE = () => tableName("IMAGE_TABLE", "imagenes");
const CHATS_TABLE = () => tableName("CHATS_TABLE", "Chats");
const USER_STATS_TABLE = () => tableName("USER_STATS_TABLE", "UserStats");
const S3_BUCKET = process.env.IMAGE_BUCKET || process.env.S3_BUCKET;
const EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA ||
  "events-lifecycle-manager-scheduler-upsert";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

const FINISHED_EVENT_STATUSES = new Set([
  "finalizado",
  "finished",
  "ended",
  "terminated",
  "closed",
]);

const resolveEventStatus = (eventItem = {}) => {
  const rawStatus =
    eventItem.estatus ||
    eventItem.status ||
    eventItem.event_status ||
    eventItem.estado ||
    eventItem.estadoEvt ||
    "";
  return String(rawStatus || "").trim();
};

const isEventFinalized = (eventItem = {}) => {
  const normalizedStatus = resolveEventStatus(eventItem).toLowerCase();
  return FINISHED_EVENT_STATUSES.has(normalizedStatus);
};

const resolveEventOwnerUserId = (eventItem = {}) => {
  const candidateUserId =
    eventItem.userId ||
    eventItem.createdBy ||
    eventItem.user_id ||
    eventItem.id_usuario ||
    "";

  return String(candidateUserId || "").trim();
};

const parseIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

// Function to get event info and image
const getEventDetails = async (eventId) => {
  let eventInfo = {};
  try {
    console.log(`pusblishEvent - Fetching event info for eventId: ${eventId}`);
    const eventRes = await dynamodb
      .get({
        TableName: EVENT_TABLE(),
        Key: { id: eventId },
      })
      .promise();
    if (!eventRes.Item) {
      throw new Error("El evento no fue encontrado");
    }

    eventInfo.name = eventRes.Item.nombre;
    eventInfo.nombre = eventRes.Item.nombre || "";
    eventInfo.slug = eventRes.Item.slug || "";
    eventInfo.horaIni = eventRes.Item.horaIni || "";
    eventInfo.publishAt = eventRes.Item.publishAt || "";
    eventInfo.userId = resolveEventOwnerUserId(eventRes.Item);
    eventInfo.organizerName = eventRes.Item.organizerName || "";
    eventInfo.ciudad = eventRes.Item.ciudad || "";
    eventInfo.ubicacion = eventRes.Item.ubicacion || null;
    eventInfo.categoriaReembolso = eventRes.Item.categoriaReembolso || "";
    eventInfo.status = resolveEventStatus(eventRes.Item);
    eventInfo.finalized = isEventFinalized(eventRes.Item);
    const fechaIni = eventRes.Item.fechaIni;
    if (fechaIni && fechaIni.length >= 8) {
      let FechaIni = "";
      FechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
        4,
        6,
      )}/${fechaIni.substring(0, 4)}`;
      eventInfo.fechaIni = FechaIni;
    }
  } catch (err) {
    console.error(
      `pusblishEvent - Error fetching event info for ${eventId}:`,
      err,
    );
    throw err;
  }

  // Get event image
  const consultaImagen = async (event) => {
    let imagen = "";
    console.log(`pusblishEvent - Fetching image for event: ${event}`);
    const paramsImage = {
      TableName: IMAGE_TABLE(),
      IndexName: "eventIdIndex",
      KeyConditionExpression: "id_evento = :id_evento",
      ExpressionAttributeValues: {
        ":id_evento": event,
      },
    };

    try {
      const result = await dynamodb.query(paramsImage).promise();

      if (!result.Items || result.Items.length === 0) {
        console.log(`pusblishEvent - No images found for event: ${event}`);
        return imagen;
      }
      const Imagenes = result.Items[0].imagenesCargadas;
      if (!Imagenes || Imagenes.length === 0) {
        console.log(`pusblishEvent - No images in array for event: ${event}`);
        return imagen;
      }
      imagen = Imagenes[0];

      const getImageUrl = (bucketName, key) =>
        `https://${bucketName}.s3.amazonaws.com/${key}`;

      let key;
      const posicionInicial = imagen.indexOf(".com/");
      if (posicionInicial === -1) {
        key = imagen;
      } else {
        key = imagen.substring(imagen.indexOf(".com/") + 5);
      }
      imagen = getImageUrl(S3_BUCKET, key);
      console.log(`pusblishEvent - Generated signed URL for event: ${event}`);
    } catch (err) {
      console.error(
        `pusblishEvent - Error fetching image for event ${event}:`,
        err,
      );
    }
    return imagen;
  };

  const eventImage = await consultaImagen(eventId);

  return {
    event_id: eventId,
    event_name: eventInfo.name || "",
    nombre: eventInfo.nombre || "",
    slug: eventInfo.slug || "",
    event_fechaIni: eventInfo.fechaIni || "",
    fechaIni: eventInfo.fechaIni || "",
    event_horaIni: eventInfo.horaIni || "",
    event_status: eventInfo.status || "",
    event_finalized: Boolean(eventInfo.finalized),
    publishAt: eventInfo.publishAt || "",
    categoriaReembolso: eventInfo.categoriaReembolso || "",
    userId: eventInfo.userId || "",
    organizerName: eventInfo.organizerName || "",
    ciudad: eventInfo.ciudad || "",
    ubicacion: eventInfo.ubicacion || null,
    event_imagen: eventImage,
  };
};

exports.getEventDetails = getEventDetails;

exports.publishEvent = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  let response;

  let eventId;
  let publishNow;
  try {
    const parsedBody = JSON.parse(event.body || "{}");
    eventId = parsedBody.eventId;
    publishNow = parsedBody.publishNow;

    if (!eventId) {
      throw new Error("El eventId es obligatorio");
    }

    // 1. Consultar el evento para obtener sus datos
    const eventDetails = await getEventDetails(eventId);
    const adminUserId = eventDetails.userId; // userId del creador del evento

    console.log(`Detalles del evento ${eventId} obtenidos:`, eventDetails);

    assertRefundCategoryConfigured(eventDetails.categoriaReembolso);

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const shouldForcePublishNow = publishNow === true;
    const parsedPublishAt = parseIsoDate(eventDetails.publishAt);
    const hasValidScheduledPublishAt = Boolean(
      eventDetails.publishAt && parsedPublishAt,
    );

    if (eventDetails.publishAt && !parsedPublishAt) {
      console.warn(
        `⚠️ publishAt inválido para evento ${eventId}: ${eventDetails.publishAt}. Se publicará inmediatamente.`,
      );
    }

    const shouldPublishNow =
      shouldForcePublishNow ||
      !hasValidScheduledPublishAt ||
      parsedPublishAt <= nowDate;

    console.log(
      `publishEvent - shouldPublishNow=${shouldPublishNow} (force=${shouldForcePublishNow}, publishAt=${eventDetails.publishAt || "<empty>"}) para evento ${eventId}`,
    );

    // 2. Actualizar el estado del evento
    const updateExpression = shouldPublishNow
      ? "set estatus = :estatus, publishAt = :publishAt, updatedAt = :updatedAt"
      : "set publishAt = :publishAt, updatedAt = :updatedAt";

    const expressionValues = shouldPublishNow
      ? {
          ":estatus": "activo",
          ":publishAt": now,
          ":updatedAt": now,
        }
      : {
          ":publishAt": eventDetails.publishAt,
          ":updatedAt": now,
        };

    const updateEventParams = {
      TableName: EVENT_TABLE(),
      Key: {
        id: eventId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
    };
    await dynamodb.update(updateEventParams).promise();

    let publishedEventRecord = {
      ...eventDetails,
      ...(shouldPublishNow ? { estatus: "activo", publishAt: now } : {}),
    };

    if (shouldPublishNow) {
      try {
        const { hasSeating, coords } = await enrichEventFromVenue(publishedEventRecord);
        const enrichParts = [];
        const enrichValues = {};
        if (hasSeating) {
          enrichParts.push("hasSeating = :hasSeating");
          enrichValues[":hasSeating"] = true;
        }
        if (coords) {
          enrichParts.push("latitude = :latitude", "longitude = :longitude");
          enrichValues[":latitude"] = coords.latitude;
          enrichValues[":longitude"] = coords.longitude;
          enrichParts.push("ubicacion = :ubicacion");
          enrichValues[":ubicacion"] = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            city: publishedEventRecord.ciudad || "",
            label: publishedEventRecord.direccion || publishedEventRecord.ciudad || "",
          };
        }
        if (enrichParts.length) {
          await dynamodb
            .update({
              TableName: EVENT_TABLE(),
              Key: { id: eventId },
              UpdateExpression: `SET ${enrichParts.join(", ")}, updatedAt = :updatedAt`,
              ExpressionAttributeValues: {
                ...enrichValues,
                ":updatedAt": now,
              },
            })
            .promise();
          publishedEventRecord = {
            ...publishedEventRecord,
            ...(hasSeating ? { hasSeating: true } : {}),
            ...(coords || {}),
          };
        }
      } catch (enrichErr) {
        console.warn("⚠️ No se pudo enriquecer evento desde venue:", enrichErr?.message || enrichErr);
      }

      try {
        const freshEventRes = await dynamodb
          .get({ TableName: EVENT_TABLE(), Key: { id: eventId } })
          .promise();
        const freshEvent = freshEventRes.Item || publishedEventRecord;
        const images = eventDetails.event_imagen ? [eventDetails.event_imagen] : [];
        await syncPublishedEventToTimeline(freshEvent, images);
        console.log(`✅ Evento ${eventId} sincronizado al timeline del feed`);
      } catch (timelineErr) {
        console.warn("⚠️ No se pudo sincronizar evento al timeline:", timelineErr?.message || timelineErr);
      }
    }

    // 3. Incrementar contador de eventos publicados del usuario (solo si se publica ahora)
    if (shouldPublishNow && adminUserId) {
      try {
        const statsParams = {
          TableName: USER_STATS_TABLE(),
          Key: {
            userId: adminUserId,
          },
          UpdateExpression:
            "SET publishedEventsCount = if_not_exists(publishedEventsCount, :zero) + :inc, lastPublishedEventId = :eventId, lastPublishedAt = :now",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":inc": 1,
            ":eventId": eventId,
            ":now": now,
          },
        };
        await dynamodb.update(statsParams).promise();
        console.log(
          `✅ Contador de eventos publicados actualizado para usuario ${adminUserId}`,
        );
      } catch (statsError) {
        console.error(
          "⚠️ Error al actualizar estadísticas de usuario:",
          statsError,
        );
        // No fallar la publicación si falla el contador
      }
    } else if (shouldPublishNow && !adminUserId) {
      console.warn(
        `⚠️ No se actualizaron estadísticas de usuario porque no se encontró owner userId para el evento ${eventId}`,
      );
    }

    // 4. Crear o reutilizar el registro en la tabla "Chats"
    // Idempotencia: si el evento ya tiene un chat room, no crear otro.
    const existingChatParams = {
      TableName: CHATS_TABLE(),
      IndexName: "event-index",
      KeyConditionExpression: "event = :event",
      ExpressionAttributeValues: {
        ":event": eventId,
      },
      Limit: 1,
    };

    const existingChatResult = await dynamodb
      .query(existingChatParams)
      .promise();

    const existingChat = existingChatResult.Items?.[0];

    console.log(
      `Chat room ${existingChat ? "encontrado y reutilizado" : "no encontrado, se creará uno nuevo"} para evento ${eventId}`,
    );

    const chatWasReused = Boolean(existingChat);

    const chatItem = existingChat
      ? existingChat
      : {
          id: v4(),
          roomId: `chat-room-event-${eventId}`,
          event: eventId,
          adminId: adminUserId ? [adminUserId] : [],
          administrators: adminUserId ? [adminUserId] : [],
          ownerId: adminUserId || null,
          hostName: eventDetails?.nombre || eventDetails?.name || "Organizador",
          eventName: eventDetails?.nombre || eventDetails?.name || "Evento",
          target: ["room::event"],
          participants: adminUserId ? [adminUserId] : [],
          pendingParticipants: [],
          blacklist: [],
          messages: [],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

    if (!existingChat) {
      await dynamodb
        .put({
          TableName: CHATS_TABLE(),
          Item: chatItem,
        })
        .promise();

      console.log(
        `✅ Chat room creado para evento ${eventId} con roomId ${chatItem.roomId}`,
      );
    }

    // 5. Enviar notificación si el evento se publica inmediatamente
    if (shouldPublishNow && adminUserId) {
      try {
        const notificationPayload = {
          triggerId: "EVENT_PUBLISHED",
          userId: adminUserId,
          eventId: eventId,
          channels: ["email", "push", "inApp"],
          metadata: {
            eventName: eventDetails.nombre,
            eventSlug: eventDetails.slug,
            eventDate: eventDetails.fechaIni,
            eventLocation: eventDetails.ubicacion?.city || eventDetails.ciudad,
            organizerName: eventDetails.organizerName,
            eventId: eventId,
          },
        };

        // Invocar la lambda de notificaciones
        await lambda
          .invoke({
            FunctionName:
              process.env.NOTIFICATIONS_LAMBDA ||
              (process.env.STAGE === "qa"
                ? "notifications-qa-triggerNotification"
                : "notifications-dev-triggerNotification"),
            InvocationType: "Event", // Asíncrono
            Payload: JSON.stringify({
              body: JSON.stringify(notificationPayload),
            }),
          })
          .promise();

        console.log("✅ Notificación de publicación enviada exitosamente");
      } catch (notifError) {
        console.error("❌ Error al enviar notificación:", notifError);
        // No fallar la publicación si falla la notificación
      }
    } else if (shouldPublishNow && !adminUserId) {
      console.warn(
        `⚠️ No se envió notificación de publicación porque no se encontró owner userId para el evento ${eventId}`,
      );
    }

    // 6. Programar transiciones de lifecycle por hora exacta (inicio/fin)
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

      console.log(
        `✅ Scheduler lifecycle solicitado para evento ${eventId} en lambda ${EVENT_LIFECYCLE_SCHEDULER_UPSERT_LAMBDA}`,
      );
    } catch (scheduleError) {
      console.error(
        "⚠️ Error al solicitar programación de lifecycle del evento:",
        scheduleError,
      );
      // No fallar publicación por error de scheduling
    }

    // Respuesta exitosa
    const statusDesc = shouldPublishNow
      ? chatWasReused
        ? "Evento publicado y chat reutilizado exitosamente"
        : "Evento publicado y chat creado exitosamente"
      : `Evento programado para publicación el ${eventDetails.publishAt}`;

    response = {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        message: "exitoso",
        data: {
          message: statusDesc,
          createDate: chatItem.createdAt || now,
          publishedNow: shouldPublishNow,
          publishAt: shouldPublishNow ? now : eventDetails.publishAt,
          chatRoomId: chatItem.roomId,
        },
      }),
    };
  } catch (error) {
    console.error("Error al publicar el evento:", error);

    // Manejo de errores
    let errorMessage = "Error interno del servidor";
    let statusCode = 500;

    if (
      error.name === "SyntaxError" ||
      error.message === "El eventId es obligatorio" ||
      error.message === "El evento no fue encontrado" ||
      error.statusCode === 400 ||
      /reembolso/i.test(String(error.message || ""))
    ) {
      errorMessage =
        error.name === "SyntaxError"
          ? "El body de la solicitud debe ser un JSON válido"
          : error.message;
      statusCode = 400;
    }

    response = {
      statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        statusDesc: errorMessage,
        statusMessage: error.message,
        statusCode,
      }),
    };
  }

  return response;
};
