const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const AWS_REGION = process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const IMAGE_TABLE = process.env.IMAGE_TABLE || "imagenes";
const PREFERENCES_TABLE = process.env.PREFERENCES_TABLE || "Preferences";
const EVENT_TYPE_TABLE = process.env.EVENT_TYPE_TABLE || "TipoEvento";
const PLACE_TYPE_TABLE = process.env.PLACE_TYPE_TABLE || "TipoLugar";
const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";
const { enrichEventFromVenue } = require("./eventVenueEnrichment");

// Configurar clientes de AWS SDK v3
const dynamoDBClient = new DynamoDBClient({ region: AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);
const s3Client = new S3Client({ region: AWS_REGION });

const PROFILE_IMAGES_BUCKET = "doeventprofileimagesbucket";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveUserProfileImageUrl = async (fotoPerfilUrl, platform) => {
  if (!fotoPerfilUrl) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: PROFILE_IMAGES_BUCKET,
      Key: fotoPerfilUrl,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    return fotoPerfilUrl;
  }
};

exports.getEventById = async (event) => {
  let response;

  try {
    // Obtener el id del evento desde los parámetros de la solicitud
    const eventId = String(event.pathParameters.id);

    // Parámetros de consulta para obtener el evento por su id
    const params = {
      TableName: EVENTS_TABLE,
      Key: {
        id: eventId,
      },
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.send(new GetCommand(params));
    console.log(data.Item);

    if (!data.Item) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        body: JSON.stringify({ message: "Evento no encontrado" }),
      };
    }

    const eventosParams = {
      TableName: EVENTS_TABLE,
      IndexName: "userIdIndex", // Asegúrate de tener este GSI
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": data.Item.userId },
    };
    const eventosData = await dynamodb.send(new QueryCommand(eventosParams));
    const eventos = eventosData.Items || [];
    const totalEventos = eventos.length;

    // 2. Conteo de eventos por estado
    const estados = ["activo", "ejecucion", "finalizado"];
    const eventosPorEstado = { activo: 0, ejecucion: 0, finalizado: 0 };
    let sumaCalificaciones = 0;
    let totalCalificados = 0;

    // Filtrar eventos que cumplen los estados requeridos
    const eventosValidos = eventos.filter((ev) => estados.includes(ev.estatus));
    let experiencia = 0;
    const totalValidos = eventosValidos.length;
    if (totalValidos >= 15) {
      experiencia = 100;
    } else if (totalValidos === 0) {
      experiencia = 0;
    } else {
      experiencia = Math.round((totalValidos / 15) * 100);
    }

    eventosValidos.forEach((ev) => {
      eventosPorEstado[ev.estatus]++;
      if (ev.calificacion && typeof ev.calificacion === "number") {
        sumaCalificaciones += ev.calificacion;
        totalCalificados++;
      }
    });

    const calificacionPromedio =
      totalCalificados > 0
        ? Math.floor(sumaCalificaciones / totalCalificados)
        : 0;
    // --- DATOS DEL ORGANIZADOR (siempre presente, userId del evento) ---
    const organizadorUserId = data.Item.userId;
    let datosOrganizador = null;

    if (organizadorUserId) {
      try {
        const resultOrganizador = await dynamodb.send(
          new GetCommand({
            TableName: CLIENT_TABLE,
            Key: { id: organizadorUserId },
          }),
        );

        if (resultOrganizador.Item) {
          const userItem = resultOrganizador.Item;
          let fotoPerfilSignedUrl = null;
          if (userItem.fotoPerfilUrl) {
            fotoPerfilSignedUrl = await resolveUserProfileImageUrl(
              userItem.fotoPerfilUrl,
              userItem.PLATFORM || userItem.platform || "",
            );
          }
          datosOrganizador = {
            ...userItem,
            fotoPerfilUrl: fotoPerfilSignedUrl || userItem.fotoPerfilUrl || null,
            calificacionPromedio,
            experiencia,
            totalEventos,
          };
        } else {
          console.warn(`⚠️ Organizador no encontrado en Client para userId: ${organizadorUserId}`);
          datosOrganizador = {
            userId: organizadorUserId,
            calificacionPromedio,
            experiencia,
            totalEventos,
          };
        }
      } catch (orgErr) {
        console.error("Error al obtener datos del organizador:", orgErr.message);
        datosOrganizador = {
          userId: organizadorUserId,
          calificacionPromedio,
          experiencia,
          totalEventos,
        };
      }
    }

    // --- DATOS DEL ANFITRIÓN (opcional, identificado por emailAnf en el evento) ---
    let datosAnfitrion = null;
    const emailAnf = data.Item.emailAnf;

    if (emailAnf) {
      try {
        const anfitrionResult = await dynamodb.send(
          new QueryCommand({
            TableName: CLIENT_TABLE,
            IndexName: "EmailIndex",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: { ":email": emailAnf },
            Limit: 1,
          }),
        );
        const anfitrionItem = anfitrionResult.Items && anfitrionResult.Items[0];
        if (anfitrionItem) {
          let fotoPerfilSignedUrl = null;
          if (anfitrionItem.fotoPerfilUrl) {
            fotoPerfilSignedUrl = await resolveUserProfileImageUrl(
              anfitrionItem.fotoPerfilUrl,
              anfitrionItem.PLATFORM || anfitrionItem.platform || "",
            );
          }
          datosAnfitrion = {
            ...anfitrionItem,
            fotoPerfilUrl: fotoPerfilSignedUrl || anfitrionItem.fotoPerfilUrl || null,
          };
        } else {
          console.warn(`⚠️ Anfitrión no encontrado en Client para email: ${emailAnf}`);
          datosAnfitrion = { email: emailAnf };
        }
      } catch (anfErr) {
        console.error("Error al obtener datos del anfitrión:", anfErr.message);
        datosAnfitrion = { email: emailAnf };
      }
    }

    const tipoEvento = data.Item.tipoEvento;
    const Categoria = data.Item.Categoria;
    const tipoLugar = data.Item.tipoLugar;
    const tipoEventoId = String(tipoEvento || "").trim();
    const tipoLugarId = String(tipoLugar || "").trim();
    const categoriaId = Number(Categoria);

    const paramsTipoEvento = {
      TableName: EVENT_TYPE_TABLE,
      Key: {
        id: tipoEventoId,
      },
    };

    // ✅ CORRECCIÓN: Usar preference_id como clave y convertir a número
    const paramsCategoria = {
      TableName: PREFERENCES_TABLE,
      Key: {
        preference_id: categoriaId, // Usar preference_id y convertir a número
      },
    };

    const paramsTipolugar = {
      TableName: PLACE_TYPE_TABLE,
      Key: {
        id: tipoLugarId,
      },
    };
    let dataTipoEvento = [];
    let dataCategoria = [];
    let dataTipoLugar = [];

    if (tipoEventoId) {
      try {
        dataTipoEvento = await dynamodb.send(new GetCommand(paramsTipoEvento));
        console.log("dataTipoEvento", dataTipoEvento);
      } catch (error) {
        console.error("Error al obtener datos de TipoEvento:", error);
      }
    }

    if (Number.isFinite(categoriaId)) {
      try {
        dataCategoria = await dynamodb.send(new GetCommand(paramsCategoria));
        console.log("dataCategoria", dataCategoria);
      } catch (error) {
        console.error("Error al obtener datos de Categoria:", error);
      }
    }

    if (tipoLugarId) {
      try {
        dataTipoLugar = await dynamodb.send(new GetCommand(paramsTipolugar));
        console.log("dataTipoLugar", dataTipoLugar);
      } catch (error) {
        console.error("Error al obtener datos de TipoLugar:", error);
      }
    }

    // Verificar si se encontró el evento y asignar valores solo si existen
    const datosTipoEvento = dataTipoEvento.Item || null;
    const datosCategoria = dataCategoria.Item || null;
    const datosTipoLugar = dataTipoLugar.Item || null;
    // Convertir las fechas de formato YYYYMMDD a DD/MM/YYYY si existen
    if (data.Item.fechaIni) {
      const fechaIni = data.Item.fechaIni;
      data.Item.fechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
        4,
        6,
      )}/${fechaIni.substring(0, 4)}`;
    }

    if (data.Item.fechaFin) {
      const fechaFin = data.Item.fechaFin;
      data.Item.fechaFin = `${fechaFin.substring(6, 8)}/${fechaFin.substring(
        4,
        6,
      )}/${fechaFin.substring(0, 4)}`;
    }
    if (!("calificacion" in data.Item)) {
      data.Item.calificacion = 0;
    }
    const EVENT_IMAGES_BUCKET = IMAGE_BUCKET;

    /**
     * Resuelve las URLs de imágenes del evento.
     * - Si la URL ya es https:// (imagen pública) → la devuelve tal cual.
     * - Si es una key relativa (sin http) → genera URL firmada.
     * Nunca lanza excepción; devuelve null en caso de error.
     */
    const resolveImageUrl = async (urlOrKey) => {
      if (!urlOrKey) return null;
      // Ya es una URL pública completa
      if (urlOrKey.startsWith("https://") || urlOrKey.startsWith("http://")) {
        return urlOrKey;
      }
      // Es una key relativa → URL pública
      try {
        return `https://${EVENT_IMAGES_BUCKET}.s3.amazonaws.com/${urlOrKey}`;
      } catch {
        return null;
      }
    };

    // Consultar imágenes del evento en la tabla imagenes
    let eventImages = [];
    try {
      const imagesResult = await dynamodb.send(
        new QueryCommand({
          TableName: IMAGE_TABLE,
          IndexName: "eventIdIndex",
          KeyConditionExpression: "id_evento = :eid",
          ExpressionAttributeValues: { ":eid": eventId },
        }),
      );
      if (imagesResult.Items && imagesResult.Items.length > 0) {
        const imgRecord = imagesResult.Items[0];
        const rawUrls = imgRecord.imagenesCargadas || [];
        eventImages = (await Promise.all(rawUrls.map(resolveImageUrl))).filter(
          Boolean,
        );
      }
    } catch (imgErr) {
      console.warn(
        "⚠️ No se pudieron obtener imágenes del evento:",
        imgErr.message,
      );
    }

    if (!data.Item) {
      response = {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        body: JSON.stringify({ message: "Evento no encontrado" }),
      };
    } else {
      let eventItem = data.Item;
      try {
        const { hasSeating, coords } = await enrichEventFromVenue(eventItem);
        eventItem = {
          ...eventItem,
          ...(hasSeating ? { hasSeating: true } : {}),
          ...(coords || {}),
        };
      } catch (enrichErr) {
        console.warn("⚠️ enrichEventFromVenue:", enrichErr?.message || enrichErr);
      }

      response = {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        body: JSON.stringify({
          data: {
            datosEvento: eventItem,
            datosTipoEvento: dataTipoEvento.Item,
            datosCategoria: dataCategoria.Item,
            datosTipoLugar: dataTipoLugar.Item,
            datosOrganizador,
            datosAnfitrion,
            eventImages,
          },
        }),
      };
    }
  } catch (error) {
    console.error("Error al obtener el evento:", error);
    response = {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      },
      body: JSON.stringify({
        error: "No se pudo obtener el evento",
      }),
    };
  }

  return response;
};
