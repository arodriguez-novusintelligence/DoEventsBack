const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const FAV_TABLE = process.env.FAV_TABLE || "userFavoriteEvents";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const IMAGES_TABLE =
  process.env.IMAGE_TABLE || process.env.IMAGES_TABLE || "imagenes";
const IMAGE_BUCKET =
  process.env.imageBucket || process.env.IMAGE_BUCKET || "doeventimageeventbucket";

const isDeletedEvent = (item) =>
  String(item?.estatus || "").trim().toUpperCase() === "DELETED" ||
  Boolean(item?.deletedAt);

const DISCOVER_EVENT_STATUSES = ["activo", "ejecucion", "en_ejecucion"];
const HIDDEN_EVENT_STATUSES = new Set([
  "deleted",
  "deactivated",
  "inactivo",
  "cancelado",
  "cancelled",
  "finalizado",
  "borrador",
  "draft",
]);

function normalizeFechaIniKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return `${yyyy}${mm.padStart(2, "0")}${dd.padStart(2, "0")}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function todayKeyFromDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function isDiscoverableEvent(item, todayKey) {
  const status = String(item?.estatus || "").trim().toLowerCase();
  if (!DISCOVER_EVENT_STATUSES.includes(status)) return false;
  if (HIDDEN_EVENT_STATUSES.has(status) || item?.deletedAt) return false;
  const fechaKey = normalizeFechaIniKey(item?.fechaIni);
  return Boolean(fechaKey && fechaKey >= todayKey);
}

exports.getFavoriteUserEvent = async (event) => {
  let response;

  try {
    const { userId } = event.pathParameters;
    const limit = Number(event.queryStringParameters?.limit) || 40;
    const todayKey = todayKeyFromDate(new Date());

    const favoriteData = await dynamodb
      .query({
        TableName: FAV_TABLE,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
      })
      .promise();

    const favoriteEventIds =
      favoriteData.Items?.map((item) => item.eventId).filter(Boolean) || [];

    if (favoriteEventIds.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ data: { datosEvento: [] } }),
      };
    }

    const batchParams = {
      RequestItems: {
        [EVENTS_TABLE]: {
          Keys: favoriteEventIds.map((id) => ({ id })),
        },
      },
    };

    const eventosData = await dynamodb.batchGet(batchParams).promise();
    let datosEvento = (eventosData.Responses?.[EVENTS_TABLE] || []).filter(
      (item) => item && !isDeletedEvent(item),
    );

    const staleFavoriteIds = favoriteEventIds.filter((eventId) => {
      const eventItem = (eventosData.Responses?.[EVENTS_TABLE] || []).find(
        (item) => item?.id === eventId,
      );
      return !eventItem || isDeletedEvent(eventItem) || !isDiscoverableEvent(eventItem, todayKey);
    });

    if (staleFavoriteIds.length > 0) {
      await Promise.all(
        staleFavoriteIds.map((eventId) =>
          dynamodb
            .delete({
              TableName: FAV_TABLE,
              Key: { userId, eventId },
            })
            .promise()
            .catch((err) => {
              console.warn("No se pudo limpiar favorito obsoleto", eventId, err?.message);
            }),
        ),
      );
    }
    datosEvento = datosEvento.filter((item) => isDiscoverableEvent(item, todayKey));

    const consultaImagen = async (eventId) => {
      const paramsImage = {
        TableName: IMAGES_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "id_evento = :id_evento",
        ExpressionAttributeValues: {
          ":id_evento": eventId,
        },
      };

      const result = await dynamodb.query(paramsImage).promise();
      if (!result.Items?.length) return " ";

      const imagenes = result.Items[0].imagenesCargadas;
      if (!imagenes?.length) return " ";

      let imagen = imagenes[0];
      const posicionInicial = imagen.indexOf(".com/");
      const key =
        posicionInicial === -1
          ? imagen
          : imagen.substring(imagen.indexOf(".com/") + 5);

      return `https://${IMAGE_BUCKET}.s3.amazonaws.com/${key}`;
    };

    datosEvento.sort((a, b) => {
      const dateA = new Date(a.createDate || 0).getTime();
      const dateB = new Date(b.createDate || 0).getTime();
      return dateB - dateA;
    });

    datosEvento = datosEvento.slice(0, limit);

    datosEvento.forEach((item) => {
      if (item.fechaIni && /^\d{8}$/.test(String(item.fechaIni))) {
        const fechaIni = String(item.fechaIni);
        item.fechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
          4,
          6,
        )}/${fechaIni.substring(0, 4)}`;
      }
      if (item.fechaFin && /^\d{8}$/.test(String(item.fechaFin))) {
        const fechaFin = String(item.fechaFin);
        item.fechaFin = `${fechaFin.substring(6, 8)}/${fechaFin.substring(
          4,
          6,
        )}/${fechaFin.substring(0, 4)}`;
      }
      item.liked = true;
      if (item.calificacion === undefined) {
        item.calificacion = 0;
      }
    });

    await Promise.all(
      datosEvento.map(async (datos) => {
        datos.imagen = await consultaImagen(datos.id);
      }),
    );

    if (datosEvento.length === 0) {
      response = {
        statusCode: 404,
        body: JSON.stringify({ message: "No se encontraron eventos" }),
      };
    } else {
      response = {
        statusCode: 200,
        body: JSON.stringify({
          data: { datosEvento },
        }),
      };
    }
  } catch (error) {
    console.error("Error al obtener favoritos:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }

  return response;
};
