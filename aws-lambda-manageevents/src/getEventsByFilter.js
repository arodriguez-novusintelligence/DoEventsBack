const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

function convertDateToComparableString(date) {
  if (!date) return undefined;
  const [day, month, year] = date.split("/");
  return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
}

// Calcula la distancia entre dos puntos geográficos en km
function haversineDistance(lat1, lon1, lat2, lon2) {
  function toRad(x) {
    return (x * Math.PI) / 180;
  }
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

exports.getEventsByFilter = async (event) => {
  try {
    const payload =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const {
      categorias = [],
      tiposEvento = [],
      fechaIni,
      fechaFin,
      limit = 10,
      offset = 0,
      latitude,
      longitude,
      distanciaMax = 0,
    } = payload;
    const favoriteUserId = payload?.userId || null;

    // Construir filtros dinámicos
    let filterExpressions = [];
    let expressionAttributeValues = {};

    // Filtro por categorias (IN)
    if (categorias.length > 0) {
      const catExpr = categorias.map((_, i) => `:cat${i}`).join(", ");
      filterExpressions.push(`Categoria IN (${catExpr})`);
      categorias.forEach((cat, i) => {
        expressionAttributeValues[`:cat${i}`] = cat;
      });
    }

    // Filtro por tiposEvento (IN)
    if (tiposEvento.length > 0) {
      const tipoExpr = tiposEvento.map((_, i) => `:tipo${i}`).join(", ");
      filterExpressions.push(`tipoEvento IN (${tipoExpr})`);
      tiposEvento.forEach((tipo, i) => {
        expressionAttributeValues[`:tipo${i}`] = tipo;
      });
    }

    // Filtro por fechaIni
    if (fechaIni) {
      filterExpressions.push("fechaIni >= :fechaIni");
      expressionAttributeValues[":fechaIni"] =
        convertDateToComparableString(fechaIni);
    }

    // Filtro por fechaFin solo si viene en el request
    if (fechaFin) {
      filterExpressions.push("fechaFin <= :fechaFin");
      expressionAttributeValues[":fechaFin"] =
        convertDateToComparableString(fechaFin);
    }

    // Solo eventos activos
    filterExpressions.push("estatus = :estatus");
    expressionAttributeValues[":estatus"] = "activo";

    const params = {
      TableName: "Eventos",
      FilterExpression: filterExpressions.join(" AND "),
      ExpressionAttributeValues: expressionAttributeValues,
    };

    // DynamoDB scan (no eficiente para tablas grandes)
    const result = await dynamodb.scan(params).promise();
    const consultaImagen = async (event) => {
      // metodo que consulta y firma la primera imagen de un evento

      let imagen = " ";
      console.log(event + " Inicio consulta imagen");
      const paramsImage = {
        TableName: "imagenes", // Nombre de la tabla
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
    let items = result.Items || [];

    // SIEMPRE enriquecer items con ubicación de Venues si no tienen ubicacion
    await Promise.all(
      items.map(async (item) => {
        if (!item.ubicacion && item.venueId) {
          try {
            const venueParams = {
              TableName: "Venues",
              Key: {
                venue_id: item.venueId,
              },
            };
            const venueResult = await dynamodb.get(venueParams).promise();
            if (venueResult.Item) {
              const venue = venueResult.Item;
              if (
                typeof venue.latitude === "number" &&
                typeof venue.longitude === "number"
              ) {
                item.ubicacion = {
                  latitude: venue.latitude,
                  longitude: venue.longitude,
                };
              }
            }
          } catch (err) {
            console.error(
              `Error obteniendo venue para evento ${item.id}:`,
              err,
            );
          }
        }
      }),
    );

    // Si hay lat/lon y distanciaMax > 0, filtra por distancia
    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      distanciaMax > 0
    ) {
      items = items
        .map((item) => {
          if (
            item.ubicacion &&
            typeof item.ubicacion.latitude === "number" &&
            typeof item.ubicacion.longitude === "number"
          ) {
            item.distancia = haversineDistance(
              latitude,
              longitude,
              item.ubicacion.latitude,
              item.ubicacion.longitude,
            );
          } else {
            item.distancia = Infinity;
          }
          return item;
        })
        .filter((item) => item.distancia <= distanciaMax)
        .sort((a, b) => a.distancia - b.distancia);
    }

    // Ordenar por fechaIni ascendente (YYYYMMDD) si no hay filtro de distancia
    if (
      !(
        typeof latitude === "number" &&
        typeof longitude === "number" &&
        distanciaMax > 0
      )
    ) {
      items.sort((a, b) => {
        if (!a.fechaIni) return 1;
        if (!b.fechaIni) return -1;
        return a.fechaIni.localeCompare(b.fechaIni);
      });
    }

    // Aplicar offset y limit
    const paginatedItems = items.slice(offset, offset + limit);
    paginatedItems.forEach((item) => {
      if (item.fechaIni) {
        const fechaIni = item.fechaIni;
        item.fechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
          4,
          6,
        )}/${fechaIni.substring(0, 4)}`;
      }
      if (item.fechaFin) {
        const fechaFin = item.fechaFin;
        item.fechaFin = `${fechaFin.substring(6, 8)}/${fechaFin.substring(
          4,
          6,
        )}/${fechaFin.substring(0, 4)}`;
      }
    });
    await Promise.all(
      paginatedItems.map(async (datos) => {
        let eventId = datos.id;
        let imagenes = " ";
        datos.imagen = await consultaImagen(eventId);
      }),
    );
    await Promise.all(
      paginatedItems.map(async (item) => {
        if (!favoriteUserId) {
          item.liked = false;
          return;
        }
        const paramsFavorite = {
          TableName: "userFavoriteEvents",
          Key: {
            userId: favoriteUserId,
            eventId: item.id,
          },
        };
        try {
          const favResult = await dynamodb.get(paramsFavorite).promise();
          item.liked = !!favResult.Item;
        } catch (err) {
          item.liked = false;
        }
      }),
    );
    paginatedItems.forEach((item) => {
      if (item.calificacion === undefined) {
        item.calificacion = 0;
      }
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        data: paginatedItems,
        total: items.length,
        offset,
        limit,
        nextOffset: offset + paginatedItems.length,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
