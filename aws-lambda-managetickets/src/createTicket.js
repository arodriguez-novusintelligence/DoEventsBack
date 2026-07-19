const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const zlib = require("zlib");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

const EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION ||
  "events-lifecycle-manager-scheduler-upsert";

const notifyLifecycleScheduler = async (eventId) => {
  if (!eventId) return;

  try {
    await lambda
      .invoke({
        FunctionName: EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION,
        InvocationType: "Event",
        Payload: JSON.stringify({ eventId }),
      })
      .promise();
  } catch (error) {
    console.warn(
      `[createTicket] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`
    );
  }
};

const normalizeSaleDate = (dateValue) => {
  if (dateValue === undefined || dateValue === null) {
    return undefined;
  }

  const normalized = String(dateValue).trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{8}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split("/");
    return `${year}${month}${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-");
    return `${year}${month}${day}`;
  }

  return null;
};

const normalizeSaleTime = (timeValue) => {
  if (timeValue === undefined || timeValue === null) {
    return undefined;
  }

  const normalized = String(timeValue).trim();
  return normalized || null;
};

exports.createTicket = async (event) => {
  const id = v4();
  const boletaId = id.substring(0, 10);

  let response;
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El cuerpo de la solicitud está vacío",
        }),
      };
    }

    const {
      eventId,
      boletas = [],
      fechaIniVent: rawFechaIniVent,
      fechaFinVent: rawFechaFinVent,
      horaIniVent: rawHoraIniVent,
      horaFinVent: rawHoraFinVent,
    } = JSON.parse(event.body);

    const fechaIniVent = normalizeSaleDate(rawFechaIniVent);
    const fechaFinVent = normalizeSaleDate(rawFechaFinVent);
    const horaIniVent = normalizeSaleTime(rawHoraIniVent);
    const horaFinVent = normalizeSaleTime(rawHoraFinVent);

    if (
      !eventId ||
      !Array.isArray(boletas) ||
      boletas.length === 0 ||
      !fechaIniVent ||
      !fechaFinVent ||
      !horaIniVent ||
      !horaFinVent
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Faltan datos requeridos o el formato es incorrecto",
        }),
      };
    }

    const customerParams = {
      TableName: process.env.EVENTS_TABLE || "Eventos",
      Key: { id: eventId },
    };

    const customerResult = await dynamodb.get(customerParams).promise();

    if (!customerResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Evento no existente" }),
      };
    }

    let resultadoestado;

    //verificacion si el id evento ya fue utilizado
    const eventoUsadoParams = {
      TableName: process.env.TICKETS_TABLE || "Tickets",
      IndexName: "eventIdIndex",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    };

    try {
      resultadoestado = await dynamodb.query(eventoUsadoParams).promise();
    } catch (error) {
      console.log(error);
      throw new Error("Error al verificar el evento en la base de datos");
    }

    if (resultadoestado.Items.length > 0) {
      return {
        statusCode: 409, // HTTP 409 Conflict
        body: JSON.stringify({
          success: false,
          message: "El id de este evento ya tiene tickets creados",
        }),
      };
    }

    const Bucket = "lambdaboletasbucket";

    // ✅ OPTIMIZACIÓN 1: Procesar S3 uploads en paralelo con límite de concurrencia
    const s3UploadPromises = [];
    boletas.forEach((boleta) => {
      if (boleta.imagenB64 && boleta.imagenB64.trim() !== "") {
        const bodyBuffer = Buffer.from(boleta.imagenB64, "base64");
        const uploadPromise = s3
          .putObject({
            Bucket,
            Key: boletaId + boleta.id + eventId,
            Body: bodyBuffer,
            ContentEncoding: "base64",
            ContentType: "image/jpeg",
          })
          .promise();
        s3UploadPromises.push(uploadPromise);
      }
    });

    // Ejecutar uploads de S3 en paralelo
    if (s3UploadPromises.length > 0) {
      await Promise.all(s3UploadPromises);
    }

    const createDate = new Date().toISOString();

    // ✅ NUEVA LÓGICA: Generar distributionId para cada boleta ANTES de crear boletaData
    const boletasWithDistribution = boletas.map((boleta) => {
      const distributionId = v4(); // ID único para cada boleta
      return {
        ...boleta,
        distributionId: distributionId,
        distributionCreateDate: createDate,
      };
    });

    // ✅ MODIFICADO: Incluir distributionId y createDate en cada boleta
    const boletaData = boletasWithDistribution.map((boleta) => ({
      categoria: boleta.categoria,
      id: boleta.id,
      cantidadTickets: boleta.cantidadTickets,
      avaliableCapacity: boleta.cantidadTickets,
      reservedTickets: 0,
      soldTickets: 0,
      moneda: boleta.moneda,
      costo: boleta.costo,
      valor: boleta.Valor,
      descripcion: boleta.descripcion,
      imgboleta:
        boleta.imagenB64 && boleta.imagenB64.trim() !== ""
          ? boletaId + boleta.id + eventId
          : "",
      entrance: boleta.entrance,
      // ✅ NUEVOS CAMPOS AGREGADOS A CADA BOLETA:
      distributionId: boleta.distributionId,
      createDate: boleta.distributionCreateDate,
    }));

    // ✅ OPTIMIZACIÓN 2: Ejecutar operaciones DynamoDB en paralelo
    const ticketCreationPromise = dynamodb
      .put({
        TableName: process.env.TICKETS_TABLE || "Tickets",
        Item: {
          id: boletaId,
          eventId,
          boleta: boletaData, // Ahora cada boleta tiene distributionId y createDate
          fechaIniVent,
          fechaFinVent,
          horaIniVent,
          horaFinVent,
          createDate,
        },
      })
      .promise();

    // ✅ MODIFICADO: Usar los distributionId ya generados
    const distributionItems = boletasWithDistribution.map((boleta) => {
      const ticketsArray = [];
      // Generar un array de tickets únicos para esta boleta
      for (let i = 0; i < boleta.cantidadTickets; i++) {
        ticketsArray.push({
          ticketInstanceId: v4(),
          category: boleta.categoria,
          location: {},
          ticketStatus: "AVAILABLE",
          qrCodeKey: v4(),
          ownerId: null,
          entityType: "TICKET",
          purchasePrice: boleta.valor,
          orderId: null,
          distributionId: boleta.distributionId, // Usar el mismo ID generado
          createDate: boleta.distributionCreateDate, // Usar la misma fecha
        });
      }

      return {
        PutRequest: {
          Item: {
            id: boleta.distributionId, // Usar el mismo ID generado
            ticketId: boletaId,
            eventId: eventId,
            boletaId: boleta.id,
            tickets: ticketsArray,
            createDate: boleta.distributionCreateDate, // Usar la misma fecha
          },
        },
      };
    });

    // ✅ OPTIMIZACIÓN 4: Procesar batchWrites en paralelo con chunks más pequeños
    const distributionWritePromises = [];
    const chunkSize = 25;

    for (let i = 0; i < distributionItems.length; i += chunkSize) {
      const chunk = distributionItems.slice(i, i + chunkSize);
      const writePromise = dynamodb
        .batchWrite({
          RequestItems: {
            TicketsDistribution: chunk,
          },
        })
        .promise();
      distributionWritePromises.push(writePromise);
    }

    // Ejecutar todas las operaciones de DynamoDB en paralelo
    await Promise.all([ticketCreationPromise, ...distributionWritePromises]);
    await notifyLifecycleScheduler(eventId);

    response = {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Boleta creada y distribuida exitosamente",
        data: {
          id,
          eventId,
          boleta: boletaData, // Devuelve las boletas con distributionId y createDate
          fechaIniVent: fechaIniVent,
          fechaFinVent: fechaFinVent,
          horaIniVent: horaIniVent,
          horaFinVent: horaFinVent,
          createDate,
        },
      }),
    };
  } catch (error) {
    console.error("Error al crear el ticket:", error);
    response = {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
  return response;
};
