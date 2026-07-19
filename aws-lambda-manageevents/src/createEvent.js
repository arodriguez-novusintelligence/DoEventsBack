const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const {
  assertRefundCategoryConfigured,
  isValidRefundCategory,
} = require("./lib/refundPolicyValidation");

AWS.config.update({
  region:
    process.env.DYNAMODB_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

exports.createEvent = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  let response;
  const rquid = v4(); // Generar el RQUID completo aquí para incluirlo en los logs
  const userID = rquid.substring(0, 10); // Acotar el RQUID a las primeras 10 posiciones para usar como userID

  const logEvent = async (action, requestBody, responseBody, statusCode) => {
    const logPayload = {
      rquid,
      action,
      requestBody,
      responseBody,
      statusCode,
    };

    const params = {
      FunctionName: "aws-lambda-auditeventlog-dev", // Reemplaza con el nombre de tu función Lambda de logs
      InvocationType: "Event", // InvocationType 'Event' para ejecución asincrónica
      Payload: JSON.stringify({ body: JSON.stringify(logPayload) }),
    };

    response = {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        //statusDesc,
        statusCode: 201,
        //eventoId,
        //createDate,
        newEvent,
      }),
    };
    try {
      await lambda.invoke(params).promise();
      console.log("Log registrado exitosamente.");
    } catch (error) {
      console.error("Error al invocar el Lambda de log:", error);
    }
  };
  const {
    nombre,
    descripcion,
    fechaIni,
    fechaFin,
    horaIni,
    horaFin,
    organizerName,
    TelPrin,
    TelSec,
    email,
    userId,
    tipoEvento,
    Categoria,
    aforo,
    modalidadEvt,
    IndicativoTelPrinOrg,
    IndicativoTelSecOrg,
    anfitrioName,
    TelPrinAnf,
    IndicativoTelPrinAnf,
    IndicativoTelSecAnf,
    TelSecAnf,
    emailAnf,
    clase,
    video,
    Hashtags,
    pais,
    ubicacion,
    ciudad,
    tipoLugar,
    direccion,
    departamento,
    latitude,
    longitude,
    // Nuevos campos del modelo EVENT
    slug,
    timezone,
    skipVenue,
    venueId,
    layoutId,
    currency,
    faq, // Opcional - Array de preguntas frecuentes
    policies, // Opcional
    salesStartAt,
    salesEndAt,
    publishAt,
    itinerary, // Opcional - Array de actividades con hora y descripción
    eventDays, // Opcional - Array de días con actividades (agenda estructurada)
    categoriaReembolso,
  } = JSON.parse(event.body);
  try {
    // Parsear el cuerpo de la solicitud
    /*const {
      nombre,
      descripcion,
      //calendar: { fechaIni, fechaFin, horaIni, horaFin },
      ubicacion,
      //organizer: { organizerName, TelPrin, TelSec, email },
      userId,
      tipoEvento,
      Categoria,
      aforo,
      modalidadEvt,
      costoEvt,
      clase,
    } = JSON.parse(event.body);*/

    /*if (
      !nombre ||
      !descripcion ||
      !calendar ||
      !fechaIni ||
      !fechaFin ||
      !ubicacion ||
      !organizer ||
      !userId ||
      !tipoEvento ||
      !Categoria ||
      !aforo ||
      !horaIni ||
      !horaFin ||
      !modalidadEvt ||
      !costoEvt ||
      !clase
    ) {
      throw new Error("Todos los campos son obligatorios");
    }*/

    // Generar un ID único para el evento
    const id = v4();
    const createDate = new Date().toISOString();

    // Generar slug automáticamente si no se proporciona
    const generateSlug = (text) => {
      if (!text) return "";
      return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
        .replace(/[^a-z0-9\s-]/g, "") // Eliminar caracteres especiales
        .trim()
        .replace(/\s+/g, "-") // Reemplazar espacios con guiones
        .replace(/-+/g, "-"); // Eliminar guiones duplicados
    };

    let eventSlug = slug || generateSlug(nombre);

    // Validar unicidad del slug
    const checkSlugExists = async (slugToCheck) => {
      const queryParams = {
        TableName: EVENTS_TABLE,
        IndexName: "slug-index",
        KeyConditionExpression: "slug = :slug",
        ExpressionAttributeValues: {
          ":slug": slugToCheck,
        },
        Limit: 1,
      };

      try {
        const result = await dynamodb.query(queryParams).promise();
        return result.Items && result.Items.length > 0;
      } catch (err) {
        if (err.code === "ResourceNotFoundException") {
          console.warn(
            `slug-index no disponible en ${EVENTS_TABLE}, omitiendo validación`,
          );
          return false;
        }
        throw err;
      }
    };

    // Si el slug existe, agregar sufijo único
    const slugExists = await checkSlugExists(eventSlug);
    if (slugExists) {
      eventSlug = `${eventSlug}-${id.substring(0, 8)}`;
      console.log(`⚠️  Slug duplicado detectado. Nuevo slug: ${eventSlug}`);
    }

    // Validar venueId si skipVenue es false
    if (skipVenue === false && !venueId) {
      throw new Error("venueId es obligatorio cuando skipVenue es false");
    }

    let normalizedRefundCategory;
    if (categoriaReembolso !== undefined && categoriaReembolso !== null && categoriaReembolso !== "") {
      if (!isValidRefundCategory(categoriaReembolso)) {
        throw new Error(
          "La categoría de reembolso no es válida. Valores permitidos: 1, 7, 30, 0, N.",
        );
      }
      normalizedRefundCategory = assertRefundCategoryConfigured(categoriaReembolso);
    }

    // Extraer timezone desde parametro o usar default
    const eventTimezone = timezone || "America/Bogota";

    function convertDateToComparableString(date) {
      // Si recibes "DD/MM/YYYY"
      const [day, month, year] = date.split("/");
      return `${year}${month}${day}`; // "20250510"
    }
    const parsedLat = latitude !== undefined && latitude !== null && latitude !== ""
      ? Number(latitude)
      : null;
    const parsedLng = longitude !== undefined && longitude !== null && longitude !== ""
      ? Number(longitude)
      : null;
    const ubicacionObj =
      parsedLat !== null && !Number.isNaN(parsedLat) && parsedLng !== null && !Number.isNaN(parsedLng)
        ? {
            latitude: parsedLat,
            longitude: parsedLng,
            city: ciudad || ubicacion || "",
            departamento: departamento || "",
            label: ubicacion || ciudad || "",
          }
        : null;

    const newEvent = {
      id,
      nombre,
      slug: eventSlug,
      descripcion,
      fechaIni: convertDateToComparableString(fechaIni),
      fechaFin: convertDateToComparableString(fechaFin),
      horaIni,
      horaFin,
      organizerName,
      TelPrin,
      TelSec,
      email,
      createDate,
      userId,
      tipoEvento,
      Categoria,
      aforo,
      avaliableCapacity: aforo, // Inicializar aforo disponible igual al total
      modalidadEvt, // visibility (public/private/unlisted)
      IndicativoTelPrinOrg,
      IndicativoTelSecOrg,
      anfitrioName,
      TelPrinAnf,
      IndicativoTelPrinAnf,
      IndicativoTelSecAnf,
      TelSecAnf,
      emailAnf,
      clase,
      video,
      Hashtags,
      pais,
      ...(ubicacion && { ubicacionLabel: ubicacion }),
      ...(ubicacionObj && { ubicacion: ubicacionObj }),
      ...(parsedLat !== null && !Number.isNaN(parsedLat) && { latitude: parsedLat }),
      ...(parsedLng !== null && !Number.isNaN(parsedLng) && { longitude: parsedLng }),
      ciudad: ciudad || ubicacionObj?.city || ubicacion || "",
      tipoLugar,
      direccion,
      departamento: departamento || ubicacionObj?.departamento || "",
      estatus: "inactivo",
      calificacion: 0, // Inicializar calificación en 0
      // Nuevos campos del modelo EVENT
      timezone: eventTimezone,
      skipVenue: skipVenue || false,
      ...(venueId && !skipVenue && { venueId }), // Solo incluir si existe y skipVenue es false
      ...(layoutId && { layoutId }), // Solo incluir si existe
      currency: currency || "COP",
      ...(faq && Array.isArray(faq) && { faq }), // Opcional - Array de FAQs
      ...(policies && { policies }), // Opcional
      ...(salesStartAt && { salesStartAt }), // Solo incluir si existe
      ...(salesEndAt && { salesEndAt }), // Solo incluir si existe
      ...(publishAt && { publishAt }), // Solo incluir si existe
      ...(itinerary && Array.isArray(itinerary) && { itinerary }), // Opcional - Array de actividades
      ...(eventDays && Array.isArray(eventDays) && { eventDays }), // Opcional - Array de días con agenda estructurada
      ...(normalizedRefundCategory && { categoriaReembolso: normalizedRefundCategory }),
      updatedAt: createDate,
      createdBy: userId,
      updatedBy: userId,
    };

    // Intentar insertar el nuevo evento en DynamoDB
    await dynamodb
      .put({
        TableName: EVENTS_TABLE,
        Item: newEvent,
      })
      .promise();

    const { triggerNotification } = require("./notificationUtils");
    await triggerNotification({
      templateKey: "EVENT_CREATED",
      userId,
      metadata: {
        eventId: id,
        eventName: nombre,
        entityId: id,
        entityName: nombre,
        entityType: "EVENT",
      },
    });

    const statusDesc = "Evento creado exitosamente";
    response = jsonResponse(201, {
      success: true,
      message: "exitoso",
      data: { statusDesc, id, createDate },
    });
    //await logEvent("createEvent", event.body, response.body, 201);
  } catch (error) {
    console.error("Error al crear el evento:", error);

    // Manejo de errores
    let errorMessage = "Error interno del servidor";

    let statusCode = 500;
    //await logEvent("createEvent", event.body, response.body, 500);
    if (error.message === "Todos los campos son obligatorios") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (
      error.statusCode === 400 ||
      /reembolso/i.test(String(error.message || "")) ||
      /categoría de reembolso/i.test(String(error.message || ""))
    ) {
      errorMessage = error.message;
      statusCode = 400;
    }

    response = jsonResponse(statusCode, {
      success: false,
      statusDesc: error?.message || errorMessage,
      message: error?.message || errorMessage,
      statusMessage: error,
      statusCode,
      cuerpo: nombre,
    });
  }

  return response;
};
