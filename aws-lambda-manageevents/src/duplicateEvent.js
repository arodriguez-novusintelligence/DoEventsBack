const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

const CLONE_VENUE_FUNCTION =
  process.env.CLONE_VENUE_FUNCTION ||
  "aws-lambda-venues-dev-cloneVenueForEvent";

const EVENT_TABLE = process.env.EVENTS_TABLE || "Eventos";
const TICKET_TABLE = process.env.TICKETS_TABLE || "Tickets";
const DISTRIBUTION_TABLE =
  process.env.TICKETS_DIST_TABLE || "TicketsDistribution";
const VENUE_TABLE = process.env.VENUES_TABLE || process.env.VENUE_TABLE || "Venues";
const IMAGES_TABLE = process.env.IMAGE_TABLE || process.env.IMAGES_TABLE || "imagenes";

const IMAGES_BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";
const TICKET_IMAGES_BUCKET = "lambdaboletasbucket";

const normalizeApiDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}${slash[2]}${slash[1]}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
};

const parseApiDate = (value) => {
  const normalized = normalizeApiDate(value);
  if (!normalized) return null;
  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6)) - 1;
  const day = Number(normalized.slice(6, 8));
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const applyTimeToDate = (base, time, endOfDay = false) => {
  const result = new Date(base);
  if (time?.trim()) {
    const [hours, minutes] = time.split(":").map((part) => Number(part));
    if (Number.isFinite(hours)) {
      result.setHours(hours, Number.isFinite(minutes) ? minutes : 0, 0, 0);
      return result;
    }
  }
  if (endOfDay) {
    result.setHours(23, 59, 59, 999);
  } else {
    result.setHours(0, 0, 0, 0);
  }
  return result;
};

const isScheduleInFuture = ({ fechaIni, fechaFin, horaIni, horaFin }) => {
  const startDate = parseApiDate(fechaIni);
  if (!startDate) return false;
  const start = applyTimeToDate(startDate, horaIni);
  if (start <= new Date()) return false;

  const endDate = parseApiDate(fechaFin || fechaIni);
  if (!endDate) return false;
  const end = applyTimeToDate(endDate, horaFin, !horaFin);
  return end >= start;
};

/**
 * Extrae la key de S3 a partir de una URL completa o una key relativa.
 */
const extractS3Key = (urlOrKey, bucket) => {
  if (!urlOrKey) return null;
  try {
    if (urlOrKey.startsWith("http://") || urlOrKey.startsWith("https://")) {
      const url = new URL(urlOrKey);
      return decodeURIComponent(url.pathname.replace(/^\//, ""));
    }
    return urlOrKey;
  } catch {
    return urlOrKey;
  }
};

const batchWriteDynamoDB = async (tableName, putRequests) => {
  if (putRequests.length === 0) return;
  const chunks = [];
  for (let i = 0; i < putRequests.length; i += 25) {
    chunks.push(putRequests.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const params = { RequestItems: { [tableName]: chunk } };
    await dynamoDb.batchWrite(params).promise();
  }
};

async function findVenueIdForEvent(eventId, eventVenueId) {
  if (eventVenueId) return String(eventVenueId);
  const scan = await dynamoDb
    .scan({
      TableName: VENUE_TABLE,
      FilterExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
      Limit: 1,
    })
    .promise()
    .catch(() => ({ Items: [] }));
  const venue = (scan.Items || [])[0];
  return venue?.venue_id || venue?.venueId || null;
}

const hasScheduleOverlap = (event, fechaIni, fechaFin, horaIni, horaFin) => {
  if (!event?.fechaIni || ["cancelado", "deleted", "inactivo"].includes(String(event.estatus || "").toLowerCase())) {
    return false;
  }
  const start = applyTimeToDate(parseApiDate(fechaIni), horaIni);
  const end = applyTimeToDate(parseApiDate(fechaFin || fechaIni), horaFin, !horaFin);
  const otherStartDate = parseApiDate(event.fechaIni);
  const otherEndDate = parseApiDate(event.fechaFin || event.fechaIni);
  if (!start || !end || !otherStartDate || !otherEndDate) return false;
  const otherStart = applyTimeToDate(otherStartDate, event.horaIni);
  const otherEnd = applyTimeToDate(otherEndDate, event.horaFin, !event.horaFin);
  return start <= otherEnd && otherStart <= end;
};

async function isVenueOccupied(venueId, originalEventId, schedule) {
  if (!venueId) return false;
  let lastEvaluatedKey;
  do {
    const result = await dynamoDb.scan({
      TableName: EVENT_TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
      FilterExpression: "venueId = :venueId AND id <> :originalEventId",
      ExpressionAttributeValues: { ":venueId": venueId, ":originalEventId": originalEventId },
    }).promise();
    if ((result.Items || []).some((item) => hasScheduleOverlap(item, schedule.fechaIni, schedule.fechaFin, schedule.horaIni, schedule.horaFin))) {
      return true;
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return false;
}

function normalizeBoletasForCopy(ticket) {
  if (Array.isArray(ticket.boletas) && ticket.boletas.length) {
    return ticket.boletas.map((b) => ({ ...b }));
  }
  const { boleta } = ticket;
  if (!boleta) return [];
  if (Array.isArray(boleta)) return boleta.map((b) => ({ ...b }));
  if (typeof boleta === "object") {
    return Object.values(boleta).map((b) => ({ ...b }));
  }
  return [];
}

async function cloneVenueForDuplicateEvent({
  baseVenueId,
  eventId,
  userId,
}) {
  const clonePayload = {
    body: JSON.stringify({
      baseVenueId,
      eventId,
      userId: userId || "",
    }),
    requestContext: {
      authorizer: {
        claims: {
          sub: userId || "",
        },
      },
    },
  };

  const cloneResponse = await lambda
    .invoke({
      FunctionName: CLONE_VENUE_FUNCTION,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(clonePayload),
    })
    .promise();

  const cloneResult = JSON.parse(cloneResponse.Payload || "{}");
  const cloneBody = JSON.parse(cloneResult.body || "{}");

  if (cloneResult.statusCode === 201) {
    return cloneBody.venue?.venueId || null;
  }

  console.error(
    `Error al clonar venue (status ${cloneResult.statusCode}):`,
    cloneResult.body,
  );
  return null;
}

exports.handler = async (event) => {
  const { id: originalEventId } = event.pathParameters || {};

  if (!originalEventId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Missing event id" }),
    };
  }

  let schedule = {};
  try {
    schedule =
      typeof event.body === "string"
        ? JSON.parse(event.body || "{}")
        : event.body || {};
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON body" }),
    };
  }

  const fechaIni = normalizeApiDate(schedule.fechaIni);
  const fechaFin = normalizeApiDate(schedule.fechaFin || schedule.fechaIni);
  const horaIni = schedule.horaIni || schedule.newStartTime || null;
  const horaFin = schedule.horaFin || schedule.newEndTime || null;

  if (!fechaIni || !fechaFin) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message:
          "Debes indicar la nueva fecha de inicio y fin para duplicar el evento.",
      }),
    };
  }

  if (!isScheduleInFuture({ fechaIni, fechaFin, horaIni, horaFin })) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message:
          "La nueva fecha y hora del evento deben ser futuras y la fecha fin no puede ser anterior a la de inicio.",
      }),
    };
  }

  try {
    const [originalEvent, ticketsResult, distributionsResult, imagesResult] =
      await Promise.all([
        dynamoDb
          .get({ TableName: EVENT_TABLE, Key: { id: originalEventId } })
          .promise(),
        dynamoDb
          .query({
            TableName: TICKET_TABLE,
            IndexName: "eventIdIndex",
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": originalEventId },
          })
          .promise(),
        dynamoDb
          .query({
            TableName: DISTRIBUTION_TABLE,
            IndexName: "eventIdIndex",
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": originalEventId },
          })
          .promise(),
        dynamoDb
          .query({
            TableName: IMAGES_TABLE,
            IndexName: "eventIdIndex",
            KeyConditionExpression: "id_evento = :eventId",
            ExpressionAttributeValues: { ":eventId": originalEventId },
          })
          .promise(),
      ]);

    if (!originalEvent.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Original event not found" }),
      };
    }

    const newEventId = uuidv4();
    const now = new Date().toISOString();

    const newEvent = {
      ...originalEvent.Item,
      id: newEventId,
      nombre: `Copia de ${originalEvent.Item.nombre}`,
      estatus: "inactivo",
      fechaIni,
      fechaFin,
      horaIni: horaIni || originalEvent.Item.horaIni || "",
      horaFin: horaFin || originalEvent.Item.horaFin || "",
      createDate: now,
      updateDate: now,
    };

    delete newEvent.venueId;
    delete newEvent.publishAt;
    delete newEvent.ticketSalesReminderSentAt;
    delete newEvent.ticketSalesStartedSentAt;
    delete newEvent.ticketSalesEndingSoonSentAt;
    delete newEvent.ticketSalesFinishedSentAt;
    delete newEvent.ticketSalesSummarySentAt;
    delete newEvent.ticketSalesWindowKey;
    delete newEvent.lastReminder3dDate;
    delete newEvent.lastReminderDate3d;
    delete newEvent.lastReminder3DDate;
    delete newEvent.rescheduleStatus;

    if (newEvent.slug) {
      newEvent.slug = `${newEvent.slug}-copia-${newEventId.slice(0, 8)}`;
    }

    newEvent.calificacion = 0;
    newEvent.avaliableCapacity = newEvent.aforo || 0;

    const imagePutRequests = [];
    if (imagesResult.Items) {
      for (const img of imagesResult.Items) {
        const newImageId = uuidv4();
        const newImageKeys = [];
        const sourceKeys =
          Array.isArray(img.s3Keys) && img.s3Keys.length > 0
            ? img.s3Keys
            : Array.isArray(img.imagenesCargadas)
              ? img.imagenesCargadas.map((u) => extractS3Key(u, IMAGES_BUCKET))
              : [];

        for (const sourceKey of sourceKeys) {
          if (!sourceKey) continue;
          const fileName = sourceKey.split("/").pop();
          const newKey = `events/${newEventId}/${uuidv4()}-${fileName}`;
          const newUrl = `https://${IMAGES_BUCKET}.s3.us-east-1.amazonaws.com/${newKey}`;
          try {
            await s3
              .copyObject({
                Bucket: IMAGES_BUCKET,
                CopySource: `${IMAGES_BUCKET}/${sourceKey}`,
                Key: newKey,
              })
              .promise();
            newImageKeys.push(newUrl);
          } catch (s3Err) {
            console.warn(
              `No se pudo copiar imagen ${sourceKey}: ${s3Err.message}`,
            );
            newImageKeys.push(
              img.imagenesCargadas?.[sourceKeys.indexOf(sourceKey)] ??
                sourceKey,
            );
          }
        }
        imagePutRequests.push({
          PutRequest: {
            Item: {
              ...img,
              id: newImageId,
              id_evento: newEventId,
              imagenesCargadas: newImageKeys,
              s3Keys: newImageKeys.map((u) => extractS3Key(u, IMAGES_BUCKET)),
              createDate: now,
            },
          },
        });
      }
    }

    const sourceVenueId = await findVenueIdForEvent(
      originalEventId,
      originalEvent.Item.venueId,
    );
    const venueOccupied = await isVenueOccupied(sourceVenueId, originalEventId, {
      fechaIni,
      fechaFin,
      horaIni,
      horaFin,
    });

    await Promise.all([
      dynamoDb.put({ TableName: EVENT_TABLE, Item: newEvent }).promise(),
      batchWriteDynamoDB(IMAGES_TABLE, imagePutRequests),
    ]);

    let newVenueId = null;
    if (sourceVenueId) {
      try {
        newVenueId = await cloneVenueForDuplicateEvent({
          baseVenueId: sourceVenueId,
          eventId: newEventId,
          userId: originalEvent.Item.userId || originalEvent.Item.user_id || "",
        });
        if (newVenueId) {
          newEvent.venueId = newVenueId;
          newEvent.skipVenue = false;
          await dynamoDb
            .update({
              TableName: EVENT_TABLE,
              Key: { id: newEventId },
              UpdateExpression:
                "SET venueId = :venueId, skipVenue = :skipVenue, updateDate = :now",
              ExpressionAttributeValues: {
                ":venueId": newVenueId,
                ":skipVenue": false,
                ":now": now,
              },
            })
            .promise();
        }
      } catch (venueError) {
        console.error("Error al clonar venue (no crítico):", venueError);
      }
    }

    if (!newVenueId && ticketsResult.Items?.length) {
      const ticketPutRequests = [];
      for (const ticket of ticketsResult.Items) {
        const newTicketId = uuidv4().substring(0, 10);
        const newBoletas = normalizeBoletasForCopy(ticket);

        for (const boleta of newBoletas) {
          if (!boleta.imgboleta) continue;
          const sourceBoletaKey = extractS3Key(
            boleta.imgboleta,
            TICKET_IMAGES_BUCKET,
          );
          if (!sourceBoletaKey) continue;
          const newBoletaKey = `tickets/${newEventId}/${uuidv4()}-${sourceBoletaKey.split("/").pop()}`;
          try {
            await s3
              .copyObject({
                Bucket: TICKET_IMAGES_BUCKET,
                CopySource: encodeURIComponent(
                  `${TICKET_IMAGES_BUCKET}/${sourceBoletaKey}`,
                ).replace(/%2F/g, "/"),
                Key: newBoletaKey,
              })
              .promise();
            boleta.imgboleta = newBoletaKey;
          } catch (s3Err) {
            console.warn(
              `No se pudo copiar imagen boleta ${sourceBoletaKey}: ${s3Err.message}`,
            );
          }
        }

        const ticketItem = {
          ...ticket,
          id: newTicketId,
          eventId: newEventId,
          boletas: newBoletas,
          createDate: now,
        };
        delete ticketItem.boleta;
        ticketPutRequests.push({ PutRequest: { Item: ticketItem } });
      }
      await batchWriteDynamoDB(TICKET_TABLE, ticketPutRequests);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Event duplicated successfully",
        newEventId,
        ...(newVenueId && { newVenueId }),
        venueCloned: Boolean(newVenueId),
        venueOccupied,
        ticketsCopied: !newVenueId && Boolean(ticketsResult.Items?.length),
      }),
    };
  } catch (error) {
    console.error("Error duplicating event:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to duplicate event.",
        error: error.message,
      }),
    };
  }
};
