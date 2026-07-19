const AWS = require("aws-sdk");
const { enrichEventFromVenue } = require("./eventVenueEnrichment");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const EVENT_CALIFICATION_TABLE = process.env.EVENT_CALIFICATION_TABLE || "EventCalification";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const IMAGE_TABLE = process.env.IMAGE_TABLE || "imagenes";
const FAV_TABLE = process.env.FAV_TABLE || "userFavoriteEvents";

const isDeletedEvent = (item) =>
  String(item?.estatus || "").trim().toUpperCase() === "DELETED";

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getEventCalificationStats = async (eventId) => {
  const items = [];
  let lastEvaluatedKey;

  do {
    const result = await dynamodb
      .query({
        TableName: EVENT_CALIFICATION_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
        ProjectionExpression: "rating",
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  const validRatings = items
    .map((item) => toNumber(item?.rating))
    .filter((rating) => rating !== null);

  if (validRatings.length === 0) {
    return { count: 0, average: null };
  }

  const total = validRatings.reduce((acc, current) => acc + current, 0);
  return {
    count: validRatings.length,
    average: Math.round((total / validRatings.length) * 10) / 10,
  };
};

exports.getEventByUser = async (event) => {
  let response;

  try {
    // Obtener el id del evento desde los parámetros de la solicitud
    const { userId } = event.pathParameters;
    const fechaActual = event.queryStringParameters?.fechaActual; // formato YYYYMMDD
    const limit = event.queryStringParameters?.limit;
    const allEvents = event.queryStringParameters?.allEvents === "true";

    // Parámetros de consulta para obtener el evento por su id
    let params = {
      TableName: EVENTS_TABLE,
      IndexName: "userIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    // Aplicar filtros solo si se proporcionan
    if (fechaActual) {
      if (allEvents) {
        // Traer todos los eventos sin filtrar por estatus
        params.FilterExpression = "fechaIni >= :fechaActual";
        params.ExpressionAttributeValues[":fechaActual"] = fechaActual;
      } else {
        // Solo eventos en estado activo o en ejecucion
        params.FilterExpression =
          "fechaIni >= :fechaActual AND (estatus = :activo OR estatus = :enEjecucion)";
        params.ExpressionAttributeValues[":fechaActual"] = fechaActual;
        params.ExpressionAttributeValues[":activo"] = "activo";
        params.ExpressionAttributeValues[":enEjecucion"] = "en_ejecucion";
      }
    } else if (!allEvents) {
      // Si no hay fechaActual pero allEvents es false, filtrar solo por estatus
      params.FilterExpression = "estatus = :activo OR estatus = :enEjecucion";
      params.ExpressionAttributeValues[":activo"] = "activo";
      params.ExpressionAttributeValues[":enEjecucion"] = "en_ejecucion";
    }
    // Si allEvents es true y no hay fechaActual, no se aplica ningún filtro

    const consultaImagen = async (event) => {
      // metodo que consulta y firma la primera imagen de un evento

      let imagen = " ";
      console.log(event + " Inicio consulta imagen");
      const paramsImage = {
        TableName: IMAGE_TABLE, // Nombre de la tabla
        IndexName: "eventIdIndex", // Nombre del índice secundario global (si aplica)
        KeyConditionExpression: "id_evento = :id_evento",
        ExpressionAttributeValues: {
          ":id_evento": event,
        },
      };

      // Ejecutar consulta
      const result = await dynamodb.query(paramsImage).promise();

      if (!result.Items || result.Items.length === 0) {
        return (imagen = " ");
      }
      const Imagenes = result.Items[0].imagenesCargadas;
      if (!Imagenes || Imagenes.length === 0) {
        return (imagen = " ");
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
      imagen = getImageUrl("doeventimageeventbucket", key);
      return imagen;
    };
    // Realizar la consulta a DynamoDB
    const data = await dynamodb.query(params).promise();
    let datosEvento = (data.Items || []).filter((item) => !isDeletedEvent(item));
    datosEvento.sort((a, b) => {
      const dateA = new Date(a.createDate).getTime();
      const dateB = new Date(b.createDate).getTime();
      return dateB - dateA; // Orden descendente (más reciente primero)
    });
    datosEvento = datosEvento.slice(0, limit);

    await Promise.all(
      datosEvento.map(async (item) => {
        try {
          const { hasSeating, coords } = await enrichEventFromVenue(item);
          if (hasSeating) item.hasSeating = true;
          if (coords) {
            item.latitude = coords.latitude;
            item.longitude = coords.longitude;
            item.ubicacion = {
              ...(item.ubicacion || {}),
              latitude: coords.latitude,
              longitude: coords.longitude,
            };
          }
        } catch (enrichErr) {
          console.warn(`enrichEventFromVenue ${item.id}:`, enrichErr?.message || enrichErr);
        }
      }),
    );

    // Convertir las fechas de cada item de datos de YYYYMMDD a DD/MM/YYYY
    datosEvento.forEach((item) => {
      if (item.fechaIni) {
        const fechaIni = item.fechaIni;
        item.fechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
          4,
          6
        )}/${fechaIni.substring(0, 4)}`;
      }
      if (item.fechaFin) {
        const fechaFin = item.fechaFin;
        item.fechaFin = `${fechaFin.substring(6, 8)}/${fechaFin.substring(
          4,
          6
        )}/${fechaFin.substring(0, 4)}`;
      }
    });
    await Promise.all(
      datosEvento.map(async (datos) => {
        let eventId = datos.id;
        let imagenes = " ";
        datos.imagen = await consultaImagen(eventId);
      })
    );
    await Promise.all(
      datosEvento.map(async (item) => {
        try {
          const calificationStats = await getEventCalificationStats(item.id);
          item.calificacion =
            calificationStats.average !== null
              ? calificationStats.average
              : 0;
          item.totalComentariosCalificaciones = calificationStats.count;
        } catch (err) {
          console.error(
            `Error fetching calification stats for event ${item.id}:`,
            err
          );
          item.calificacion =
            toNumber(item.calificacion) ??
            toNumber(item.calificacionPromedio) ??
            toNumber(item.rating) ??
            0;
          item.totalComentariosCalificaciones =
            toNumber(item.CommentsCount) ??
            toNumber(item.commentsCount) ??
            0;
        }

        const paramsFavorite = {
          TableName: FAV_TABLE,
          Key: {
            userId: item.userId,
            eventId: item.id,
          },
        };
        try {
          const favResult = await dynamodb.get(paramsFavorite).promise();
          item.liked = !!favResult.Item;
        } catch (err) {
          item.liked = false;
        }
      })
    );
    datosEvento.forEach((item) => {
      if (item.calificacion === undefined) {
        item.calificacion = 0;
      }
      if (item.totalComentariosCalificaciones === undefined) {
        item.totalComentariosCalificaciones =
          toNumber(item.CommentsCount) ??
          toNumber(item.commentsCount) ??
          0;
      }
    });
    // Verificar si se encontró el evento
    if (!data.Items) {
      response = {
        statusCode: 404,
        body: JSON.stringify({ message: "Evento no encontrado" }),
      };
    } else {
      response = {
        statusCode: 200,
        body: JSON.stringify({
          data: {
            datosEvento,
          },
        }),
      };
    }
  } catch (error) {
    console.error("Error al obtener el evento:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }

  return response;
};
