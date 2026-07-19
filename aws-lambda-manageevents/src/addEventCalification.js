const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const EVENT_CALIFICATION_TABLE = "EventCalification";
const EVENTS_TABLE = "Eventos";
const CLIENT_TABLE = "Client";
const NOTIFICATIONS_LAMBDA =
  process.env.NOTIFICATIONS_LAMBDA || "notifications-dev-triggerNotification";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

/**
 * Calcula y actualiza el promedio de calificación de un evento.
 */
const updateEventAverageRating = async (eventId) => {
  try {
    const { Items: ratings } = await dynamodb
      .query({
        TableName: EVENT_CALIFICATION_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
        ProjectionExpression: "rating",
      })
      .promise();

    if (!ratings || ratings.length === 0) return;

    const totalRating = ratings.reduce((sum, item) => sum + item.rating, 0);
    const roundedAverage = Math.round((totalRating / ratings.length) * 10) / 10;

    await dynamodb
      .update({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        UpdateExpression: "SET calificacion = :calificacion",
        ExpressionAttributeValues: { ":calificacion": roundedAverage },
      })
      .promise();

    console.log(`Promedio actualizado para evento ${eventId}: ${roundedAverage}`);
  } catch (error) {
    console.error("Error actualizando el promedio de calificación:", error);
  }
};

/**
 * Verifica si el usuario ya calificó el evento.
 */
const normalizeValue = (value) => String(value || "").trim();

const hasSameEventAndUser = (item, eventId, userId) => {
  return (
    item &&
    normalizeValue(item.eventId) === eventId &&
    normalizeValue(item.userId) === userId
  );
};

const getFreshRecord = async (item) => {
  if (!item || !item.id || !item.createdAt) {
    return null;
  }

  const freshRecord = await dynamodb
    .get({
      TableName: EVENT_CALIFICATION_TABLE,
      Key: { id: item.id, createdAt: item.createdAt },
      ConsistentRead: true,
    })
    .promise();

  return freshRecord.Item || null;
};

const findCandidateByQueryPagination = async ({ eventId, userId }) => {
  let ExclusiveStartKey;

  do {
    const result = await dynamodb
      .query({
        TableName: EVENT_CALIFICATION_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
          ":userId": userId,
        },
        ExclusiveStartKey,
      })
      .promise();

    const candidate = (result.Items || [])[0];
    if (candidate) {
      return candidate;
    }

    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return null;
};

const findCandidateByScanPagination = async ({ eventId, userId }) => {
  let ExclusiveStartKey;

  do {
    const result = await dynamodb
      .scan({
        TableName: EVENT_CALIFICATION_TABLE,
        FilterExpression: "eventId = :eventId AND userId = :userId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
          ":userId": userId,
        },
        ExclusiveStartKey,
      })
      .promise();

    const candidate = (result.Items || [])[0];
    if (candidate) {
      return candidate;
    }

    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return null;
};

const getUserCalification = async (eventId, userId) => {
  const normalizedEventId = normalizeValue(eventId);
  const normalizedUserId = normalizeValue(userId);

  try {
    const candidate = await findCandidateByQueryPagination({
      eventId: normalizedEventId,
      userId: normalizedUserId,
    });
    if (!candidate) {
      return null;
    }

    const freshItem = await getFreshRecord(candidate);
    return hasSameEventAndUser(freshItem, normalizedEventId, normalizedUserId)
      ? freshItem
      : null;
  } catch (error) {
    if (error && error.code !== "ValidationException") {
      throw error;
    }

    const candidate = await findCandidateByScanPagination({
      eventId: normalizedEventId,
      userId: normalizedUserId,
    });
    if (!candidate) {
      return null;
    }

    const freshItem = await getFreshRecord(candidate);
    return hasSameEventAndUser(freshItem, normalizedEventId, normalizedUserId)
      ? freshItem
      : null;
  }
};

/**
 * Notifica al dueño del evento que recibió una calificación.
 */
const notifyEventOwner = async ({ eventId, reviewerName, rating, comment }) => {
  try {
    // Obtener el evento para encontrar el dueño
    const eventResult = await dynamodb
      .get({ TableName: EVENTS_TABLE, Key: { id: eventId } })
      .promise();

    const event = eventResult.Item;
    if (!event) return;

    const ownerId = event.userId || event.user_id || event.organizerId;
    if (!ownerId) return;

    const eventName = event.nombre || event.name || "tu evento";
    const eventSlug = event.slug || eventId;
    const eventImage = event.eventImage || event.imagen || event.image || event.urlImagen;
    const eventLink = `https://app.doevents.com/events/${eventSlug}`;

    await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_LAMBDA,
        InvocationType: "Event",
        Payload: JSON.stringify({
          templateKey: "EVENT_CALIFICATION_RECEIVED",
          userId: ownerId,
          eventId,
          channels: ["push", "inApp", "email"],
          metadata: {
            userId: ownerId,
            eventId,
            eventName,
            reviewerName,
            rating,
            comment: comment || null,
            eventImage,
            eventSlug,
            link: eventLink,
            type: "event_calification_received",
          },
        }),
      })
      .promise();

    console.log(`Notificación enviada al dueño ${ownerId} del evento ${eventId}`);
  } catch (error) {
    console.error("Error notificando al dueño del evento:", error);
  }
};

/**
 * Obtiene el nombre del usuario que califica.
 */
const getReviewerName = async (userId) => {
  try {
    const result = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
        ProjectionExpression: "nombre, apellido",
      })
      .promise();

    const item = result.Item;
    if (item) {
      return `${item.nombre || ""} ${item.apellido || ""}`.trim() || "Un asistente";
    }
  } catch (_) {}
  return "Un asistente";
};

exports.handler = async (event) => {
  try {
    const rawEventId = event?.pathParameters?.eventId;
    const eventId = normalizeValue(rawEventId);
    const parsedBody = JSON.parse(event.body || "{}");
    const userId = normalizeValue(parsedBody.userId);
    const { rating, comment } = parsedBody;

    // --- Validación de entrada ---
    if (!eventId || !userId || rating === undefined) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "eventId, userId y rating son obligatorios.",
        }),
      };
    }

    if (typeof rating !== "number" || rating < 0 || rating > 5) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "La calificación (rating) debe ser un número entre 0 y 5.",
        }),
      };
    }

    // --- Verificar si el usuario ya calificó este evento ---
    const existing = await getUserCalification(eventId, userId);
    if (existing) {
      return {
        statusCode: 409,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "El usuario ya calificó este evento.",
          data: {
            id: existing.id,
            rating: existing.rating,
            comment: existing.comment || null,
            createdAt: existing.createdAt,
          },
        }),
      };
    }

    // --- Creación del item de calificación ---
    const timestamp = new Date().toISOString();
    const calificationItem = {
      id: uuidv4(),
      createdAt: timestamp,
      eventId,
      userId,
      rating,
      comment: comment || null,
      updatedAt: timestamp,
    };

    // --- Guardar en DynamoDB ---
    await dynamodb
      .put({ TableName: EVENT_CALIFICATION_TABLE, Item: calificationItem })
      .promise();

    // --- Incrementar el contador de comentarios ---
    try {
      await dynamodb
        .update({
          TableName: EVENTS_TABLE,
          Key: { id: eventId },
          UpdateExpression: "ADD CommentsCount :increment",
          ExpressionAttributeValues: { ":increment": 1 },
        })
        .promise();
    } catch (error) {
      console.error("Error incrementando CommentsCount:", error);
    }

    // --- Actualizar el promedio en segundo plano (sin esperar) ---
    updateEventAverageRating(eventId);

    // --- Obtener nombre del reviewer y notificar al dueño del evento (sin esperar) ---
    getReviewerName(userId).then((reviewerName) =>
      notifyEventOwner({ eventId, reviewerName, rating, comment })
    );

    return {
      statusCode: 201,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        message: "Calificación agregada exitosamente.",
        data: calificationItem,
      }),
    };
  } catch (error) {
    console.error("Error al agregar la calificación:", error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor.",
        error: error.message,
      }),
    };
  }
};

