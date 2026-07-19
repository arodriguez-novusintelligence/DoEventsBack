const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const IMAGE_TABLE = process.env.IMAGE_TABLE || process.env.IMAGES_TABLE || "imagenes";
const PROFILE_BUCKET = process.env.PROFILE_BUCKET || "doeventprofileimagesbucket";
const ALLOWED_SEARCH_STATUSES = new Set([
  "activo",
  "en_ejecucion",
  "ejecucion",
  "finalizado",
]);

const isEventPublicForSearch = (evento) => {
  const clase = String(evento.clase || "").trim().toUpperCase();
  if (clase === "P") return false;
  const legacyVisibility = String(evento.modalidadEvt || "").trim().toLowerCase();
  if (legacyVisibility === "private" || legacyVisibility === "privado") return false;
  return true;
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveUserProfileImageUrl = (fotoPerfilUrl, platform) => {
  if (!fotoPerfilUrl) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }

  try {
    return s3.getSignedUrl("getObject", {
      Bucket: PROFILE_BUCKET,
      Key: fotoPerfilUrl,
      Expires: 3600,
    });
  } catch (error) {
    return fotoPerfilUrl;
  }
};

/**
 * Función para buscar eventos por palabras clave
 * Busca en los campos: nombre, descripción, ciudad
 * Si el término empieza con @, busca primero en Client y luego filtra eventos por userId
 * - Case-insensitive (no distingue mayúsculas/minúsculas)
 * - Busca coincidencias parciales en cualquier parte del texto
 */
exports.searchEvents = async (event) => {
  let response;

  try {
    // Obtener el término de búsqueda de los query parameters
    const searchTerm =
      event.queryStringParameters?.q || event.queryStringParameters?.search;

    if (!searchTerm || searchTerm.trim() === "") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        body: JSON.stringify({
          statusDesc: "El término de búsqueda es obligatorio",
          statusCode: 400,
        }),
      };
    }

    // Detectar si la búsqueda es por usuario (empieza con @)
    const isUserSearch = searchTerm.startsWith("@");
    const cleanSearchTerm = isUserSearch
      ? searchTerm.substring(1).trim()
      : searchTerm.trim();

    // Normalizar a minúsculas para búsqueda case-insensitive
    const normalizedSearchTerm = cleanSearchTerm.toLowerCase();

    if (normalizedSearchTerm === "") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        body: JSON.stringify({
          statusDesc: "El término de búsqueda es obligatorio",
          statusCode: 400,
        }),
      };
    }

    let userIds = [];

    // Si es búsqueda por usuario, buscar primero en la tabla Client
    if (isUserSearch) {
      const clientParams = {
        TableName: CLIENT_TABLE,
        ProjectionExpression: "id, #user, nombre, apellido",
        ExpressionAttributeNames: {
          "#user": "user",
        },
      };

      const clientResult = await dynamodb.scan(clientParams).promise();

      // Filtrar usuarios que coincidan con el término de búsqueda
      const matchingUsers = clientResult.Items.filter((user) => {
        const username = (user.user || "").toLowerCase();
        const nombre = (user.nombre || "").toLowerCase();
        const apellido = (user.apellido || "").toLowerCase();
        const nombreCompleto = `${nombre} ${apellido}`.trim();

        return (
          username.includes(normalizedSearchTerm) ||
          nombre.includes(normalizedSearchTerm) ||
          apellido.includes(normalizedSearchTerm) ||
          nombreCompleto.includes(normalizedSearchTerm)
        );
      });

      if (matchingUsers.length === 0) {
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
          },
          body: JSON.stringify({
            events: [],
            count: 0,
            message: "No se encontraron usuarios que coincidan con la búsqueda",
            searchTerm: searchTerm,
            isUserSearch: true,
          }),
        };
      }

      // Extraer los IDs de los usuarios encontrados
      userIds = matchingUsers.map((user) => user.id);
    }

    // Buscar eventos en la tabla Eventos
    const eventParams = {
      TableName: EVENTS_TABLE,
      ProjectionExpression:
        "id, nombre, descripcion, fechaIni, horaIni, ciudad, createdBy, venueId, categorias, tipoEvento, precioBase, modalidadEvt, clase, estatus",
    };

    const eventResult = await dynamodb.scan(eventParams).promise();

    // Filtrar eventos según el tipo de búsqueda
    let filteredEvents;

    if (isUserSearch) {
      // Filtrar por userIds encontrados
      filteredEvents = eventResult.Items.filter((evento) => {
        return userIds.includes(evento.createdBy || evento.userId || evento.user_id);
      });
    } else {
      // Búsqueda por palabras clave en nombre, descripción y ciudad
      filteredEvents = eventResult.Items.filter((evento) => {
        const nombre = (evento.nombre || "").toLowerCase();
        const descripcion = (evento.descripcion || "").toLowerCase();
        const ciudad = (evento.ciudad || "").toLowerCase();

        return (
          nombre.includes(normalizedSearchTerm) ||
          descripcion.includes(normalizedSearchTerm) ||
          ciudad.includes(normalizedSearchTerm)
        );
      });
    }

    // Obtener fecha actual en formato YYYYMMDD
    const currentDate = new Date();
    const currentDateStr =
      currentDate.getFullYear() +
      String(currentDate.getMonth() + 1).padStart(2, "0") +
      String(currentDate.getDate()).padStart(2, "0");

    // Filtrar eventos publicados visibles en búsqueda (clase A = público; P/V = modalidad presencial/virtual)
    filteredEvents = filteredEvents.filter((evento) => {
      const status = String(evento.estatus || "").trim().toLowerCase();
      const isPublished = ALLOWED_SEARCH_STATUSES.has(status);
      return isEventPublicForSearch(evento) && isPublished;
    });

    // Si no hay resultados
    if (filteredEvents.length === 0) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        body: JSON.stringify({
          events: [],
          count: 0,
          message: "No se encontraron eventos que coincidan con la búsqueda",
          searchTerm: searchTerm,
          isUserSearch: isUserSearch,
        }),
      };
    }

    // Enriquecer eventos con imágenes y datos del creador
    const bucketName = "doeventimageeventbucket";
    const eventsWithImages = await Promise.all(
      filteredEvents.map(async (evento) => {
        const eventResponse = {
          id: evento.id,
          nombre: evento.nombre || "",
          descripcion: evento.descripcion || "",
          fechaIni: evento.fechaIni || "",
          horaIni: evento.horaIni || "",
          ciudad: evento.ciudad || "",
          createdBy: evento.createdBy || "",
          creatorInfo: null,
          venueId: evento.venueId || "",
          categorias: evento.categorias || [],
          tipoEvento: evento.tipoEvento || "",
          precioBase: evento.precioBase || 0,
          estatus: evento.estatus || "",
          imagenPrincipal: null,
          imagen: null,
        };

        // Obtener información del creador desde la tabla Client
        if (evento.createdBy) {
          try {
            const creatorParams = {
              TableName: CLIENT_TABLE,
              Key: {
                id: evento.createdBy,
              },
              ProjectionExpression:
                "id, #user, nombre, apellido, fotoPerfilUrl, platform",
              ExpressionAttributeNames: {
                "#user": "user",
              },
            };

            const creatorResult = await dynamodb.get(creatorParams).promise();

            if (creatorResult.Item) {
              const creator = creatorResult.Item;
              eventResponse.creatorInfo = {
                id: creator.id,
                user: creator.user || "",
                nombre: creator.nombre || "",
                apellido: creator.apellido || "",
                nombreCompleto:
                  `${creator.nombre || ""} ${creator.apellido || ""}`.trim(),
                fotoPerfilUrl: null,
              };

              if (creator.fotoPerfilUrl) {
                eventResponse.creatorInfo.fotoPerfilUrl =
                  resolveUserProfileImageUrl(
                    creator.fotoPerfilUrl,
                    creator.platform,
                  );
              }
            }
          } catch (error) {
            console.error(
              `Error obteniendo información del creador ${evento.createdBy}:`,
              error,
            );
            // Continuar sin la información del creador
          }
        }

        // Obtener imagen principal del evento (también como `imagen` para el mapper WEB)
        try {
          const imageParams = {
            TableName: IMAGE_TABLE,
            IndexName: "eventIdIndex",
            KeyConditionExpression: "id_evento = :id_evento",
            ExpressionAttributeValues: {
              ":id_evento": evento.id,
            },
          };

          const imageResult = await dynamodb.query(imageParams).promise();

          if (imageResult.Items && imageResult.Items.length > 0) {
            const mediaKeys = [];
            for (const imageRecord of imageResult.Items) {
              const loaded = Array.isArray(imageRecord.imagenesCargadas)
                ? imageRecord.imagenesCargadas
                : [];
              for (const key of loaded) {
                if (typeof key === "string" && key.trim()) mediaKeys.push(key.trim());
              }
            }

            const isLikelyVideo = (key) =>
              /\.(mp4|mov|webm|m4v)(\?|$)/i.test(key) || /\/video\//i.test(key);
            const preferredKey =
              mediaKeys.find((key) => !isLikelyVideo(key)) || mediaKeys[0];

            if (preferredKey) {
              let imageKey = preferredKey;

              // Si la imagen tiene la URL completa, extraer solo el key
              const posicionInicial = imageKey.indexOf(".com/");
              if (posicionInicial !== -1) {
                imageKey = imageKey.substring(imageKey.indexOf(".com/") + 5);
              }

              const publicUrl = `https://${bucketName}.s3.amazonaws.com/${imageKey}`;
              eventResponse.imagenPrincipal = publicUrl;
              eventResponse.imagen = publicUrl;
            }
          }
        } catch (error) {
          console.error(
            `Error obteniendo imagen para evento ${evento.id}:`,
            error,
          );
          // Continuar sin la imagen en caso de error
        }

        return eventResponse;
      }),
    );

    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      },
      body: JSON.stringify({
        events: eventsWithImages,
        count: eventsWithImages.length,
        searchTerm: searchTerm,
        isUserSearch: isUserSearch,
      }),
    };
  } catch (error) {
    console.error("Error al buscar eventos:", error);

    // Manejo de errores
    response = {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      },
      body: JSON.stringify({
        statusDesc: "Error interno del servidor al buscar eventos",
        statusCode: 500,
        error: error.message,
      }),
    };
  }

  return response;
};
