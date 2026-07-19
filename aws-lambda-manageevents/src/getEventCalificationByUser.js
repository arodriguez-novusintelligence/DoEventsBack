const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();

const EVENT_CALIFICATION_TABLE = "EventCalification";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

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

const findExistingCalification = async (eventId, userId) => {
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
    // Fallback seguro cuando el índice no existe o no coincide con la definición esperada.
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
 * GET /events/{eventId}/calification/user/{userId}
 *
 * Verifica si un usuario ya calificó un evento.
 * Retorna { hasRated: boolean, calification?: { id, rating, comment, createdAt } }
 */
exports.handler = async (event) => {
  try {
    const rawEventId = event?.pathParameters?.eventId;
    const rawUserId = event?.pathParameters?.userId;
    const eventId = normalizeValue(rawEventId);
    const userId = normalizeValue(rawUserId);

    if (!eventId || !userId) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "eventId y userId son requeridos.",
        }),
      };
    }

    const existing = await findExistingCalification(eventId, userId);

    if (!existing) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          success: true,
          hasRated: false,
          calification: null,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        hasRated: true,
        calification: {
          id: existing.id,
          rating: existing.rating,
          comment: existing.comment || null,
          createdAt: existing.createdAt,
        },
      }),
    };
  } catch (error) {
    console.error("Error verificando calificación del usuario:", error);
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
