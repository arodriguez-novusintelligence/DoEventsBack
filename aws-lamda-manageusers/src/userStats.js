const AWS = require("aws-sdk");

// userStats.js

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const FEED_PUBLICATIONS_TABLE =
  process.env.FEED_PUBLICATIONS_TABLE
  || process.env.DYNAMODB_FEED_PUBLICATIONS_TABLE
  || "FeedPublications";
const FEED_PUBLICATION_LIKES_TABLE =
  process.env.FEED_PUBLICATION_LIKES_TABLE
  || process.env.DYNAMODB_FEED_PUBLICATION_LIKES_TABLE
  || "FeedPublicationLikes";
const FEED_PUBLICATIONS_BY_AUTHOR_INDEX = "authorId-createdAt-index";
const FEED_PUBLICATION_LIKES_BY_USER_INDEX = "userId-createdAt-index";

function isMissingIndexError(error) {
  return (
    error?.code === "ValidationException" &&
    /index|schema|key/i.test(String(error?.message || ""))
  );
}

async function queryAllItems(params = {}) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const data = await dynamoDb
      .query({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    items.push(...(data.Items || []));
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function scanAllItems(params = {}) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const data = await dynamoDb
      .scan({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    items.push(...(data.Items || []));
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function listUserFeedPublications(userId) {
  if (!userId) return [];

  try {
    return await queryAllItems({
      TableName: FEED_PUBLICATIONS_TABLE,
      IndexName: FEED_PUBLICATIONS_BY_AUTHOR_INDEX,
      KeyConditionExpression: "authorId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
    });
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }
  }

  return scanAllItems({
    TableName: FEED_PUBLICATIONS_TABLE,
    FilterExpression: "authorId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  });
}

async function listUserFeedLikes(userId) {
  if (!userId) return [];

  try {
    return await queryAllItems({
      TableName: FEED_PUBLICATION_LIKES_TABLE,
      IndexName: FEED_PUBLICATION_LIKES_BY_USER_INDEX,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
    });
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }
  }

  return scanAllItems({
    TableName: FEED_PUBLICATION_LIKES_TABLE,
    FilterExpression: "userId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  });
}

async function countUserInvitations(userId) {
  let lastEvaluatedKey;
  const counts = {
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
  };

  do {
    const params = {
      TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
      IndexName: "UserIdIndex",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ProjectionExpression: "#status",
      ExpressionAttributeNames: { "#status": "status" },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const data = await dynamoDb.query(params).promise();
    (data.Items || []).forEach((item) => {
      counts.total += 1;
      if (item.status === "pending") counts.pending += 1;
      else if (item.status === "accepted") counts.accepted += 1;
      else if (item.status === "rejected") counts.rejected += 1;
      else if (item.status === "expired") counts.expired += 1;
    });

    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return counts;
}

async function getUserStats(userId) {
  const EVENTOS_TABLE = process.env.EVENTS_TABLE || "Eventos";
  const USER_FAVORITES_TABLE =
    process.env.USER_FAVORITE_EVENTS_TABLE
    || process.env.FAV_TABLE
    || "userFavoriteEvents";
  const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders";
  const FAVORITE_USERS_TABLE = process.env.FAVORITE_USERS_TABLE || "FavoriteUsers";

  const safeQuery = async (params, fallback = []) => {
    try {
      const data = await dynamoDb.query(params).promise();
      return data.Items || [];
    } catch (error) {
      console.warn("userStats query skipped:", params.TableName, error?.message || error);
      return fallback;
    }
  };

  // 1. Conteo de eventos creados por el usuario
  const eventos = await safeQuery({
    TableName: EVENTOS_TABLE,
    IndexName: "userIdIndex",
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  });
  const totalEventos = eventos.length;

  // 2. Conteo de eventos por estado
  const estados = ["activo", "ejecucion", "finalizado"];
  const eventosPorEstado = { activo: 0, ejecucion: 0, finalizado: 0 };
  let sumaCalificaciones = 0;
  let totalCalificados = 0;

  eventos.forEach((ev) => {
    if (estados.includes(ev.estatus)) {
      eventosPorEstado[ev.estatus]++;
      if (ev.calificacion && typeof ev.calificacion === "number") {
        sumaCalificaciones += ev.calificacion;
        totalCalificados++;
      }
    }
  });

  // 3. Conteo de eventos favoritos
  const favItems = await safeQuery({
    TableName: USER_FAVORITES_TABLE,
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  });
  const totalEventosFavoritos = favItems.length;

  // 4. Conteo de invitados registrados en FavoriteUsers (owner = userId)
  const favoriteUsersItems = await safeQuery({
    TableName: FAVORITE_USERS_TABLE,
    KeyConditionExpression: "userId = :uid",
    ExpressionAttributeValues: { ":uid": userId },
  });
  // CRM: contar todos los contactos de gestión de invitados (no solo REGISTERED).
  const totalInvitadosRegistrados = favoriteUsersItems.filter(
    (fav) => fav && (fav.favoriteId || fav.invitedUserId || fav.email || fav.phone || fav.user),
  ).length;

  // 5. Conteo de boletas compradas
  const orderItems = await safeQuery({
    TableName: ORDERS_TABLE,
    IndexName: "user_id-created_at-index",
    KeyConditionExpression: "user_id = :uid",
    FilterExpression: "payment_status = :approved",
    ExpressionAttributeValues: { ":uid": userId, ":approved": "APPROVED" },
  });
  const totalBoletasCompradas = orderItems.length;

  // 6. Calificación promedio
  const calificacionPromedio =
    totalCalificados > 0 ? sumaCalificaciones / totalCalificados : 0;

  const [invitationCounts, feedPublications, feedLikes] = await Promise.all([
    countUserInvitations(userId),
    listUserFeedPublications(userId),
    listUserFeedLikes(userId),
  ]);

  const totalPublicaciones = (feedPublications || []).filter(
    (item) => item && !item.deletedAt,
  ).length;

  const totalPostFavoritos = (feedLikes || []).filter((item) => {
    const publicationId = String(item?.publicationId || "");
    return (
      publicationId &&
      !publicationId.startsWith("event#") &&
      !publicationId.startsWith("service#")
    );
  }).length;

  // 8. Otros conteos por defecto
  const defaultCounts = {
    Invitados: totalInvitadosRegistrados,
    Publicaciones: totalPublicaciones,
    PostFavoritos: totalPostFavoritos,
    LugaresFavoritos: 0,
    PerfilesFavoritos: 0,
    UserPlaces: 0,
    UserServices: 0,
    UserInvitations: invitationCounts.total,
  };

  // Experiencia del usuario como organizador: solo eventos finalizados a su nombre.
  const eventosRealizados = eventosPorEstado.finalizado;
  const experienciaEventosRealizados = eventosRealizados;

  return {
    totalEventos,
    eventosActivos: eventosPorEstado.activo,
    eventosEnEjecucion: eventosPorEstado.ejecucion,
    eventosFinalizados: eventosPorEstado.finalizado,
    totalEventosFavoritos,
    totalBoletasCompradas,
    calificacionPromedio,
    totalInvitaciones: invitationCounts.total,
    invitacionesPendientes: invitationCounts.pending,
    invitacionesAceptadas: invitationCounts.accepted,
    invitacionesRechazadas: invitationCounts.rejected,
    invitacionesExpiradas: invitationCounts.expired,
    totalPublicaciones,
    totalPostFavoritos,
    eventosRealizados,
    experienciaEventosRealizados,
    ...defaultCounts,
  };
}

// Handler para AWS Lambda (API Gateway)
exports.handler = async (event) => {
  const { userId } = event.pathParameters;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "userId es requerido" }),
    };
  }
  try {
    const stats = await getUserStats(userId);
    return {
      statusCode: 200,
      body: JSON.stringify(stats),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error obteniendo estadísticas",
        details: err.message,
      }),
    };
  }
};
