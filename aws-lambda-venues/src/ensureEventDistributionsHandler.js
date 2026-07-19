const AWS = require("aws-sdk");
const { generateTicketsDistribution } = require("./cloneVenueForEventHandler");
const {
  normalizeBoletas,
  findVenueIdForEvent,
  bootstrapTicketsFromVenue,
  buildSeatsMappingForCategories,
} = require("./bootstrapEventTickets");

AWS.config.update({
  region:
    process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

const tableName = (envKey, fallback) => process.env[envKey] || fallback;

const TABLES = {
  EVENTS_TABLE: tableName("EVENTS_TABLE", "Eventos"),
  TICKETS_TABLE: tableName("TICKETS_TABLE", "Tickets"),
  TICKETS_DIST_TABLE: tableName("TICKETS_DIST_TABLE", "TicketsDistribution"),
  VENUE_TABLE: tableName("VENUE_TABLE", "Venues"),
  VENUE_CATEGORY_TABLE: tableName("VENUE_CATEGORY_TABLE", "Venue_Category"),
  VENUE_SEAT_TABLE: tableName("VENUE_SEAT_TABLE", "Venue_Seat"),
};

const EVENT_KEY_CANDIDATES = ["eventId", "id_evento", "event_id"];

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

async function queryDistributionsByEvent(eventId) {
  for (const keyName of EVENT_KEY_CANDIDATES) {
    try {
      const result = await dynamodb
        .query({
          TableName: TABLES.TICKETS_DIST_TABLE,
          IndexName: "eventIdIndex",
          KeyConditionExpression: "#eventKey = :eventId",
          ExpressionAttributeNames: { "#eventKey": keyName },
          ExpressionAttributeValues: { ":eventId": eventId },
        })
        .promise();
      if (result.Items?.length) return result.Items;
    } catch (err) {
      console.warn(`Query distributions with ${keyName} failed:`, err.message);
    }
  }

  const scan = await dynamodb
    .scan({
      TableName: TABLES.TICKETS_DIST_TABLE,
      FilterExpression:
        "#eventId = :eventId OR #idEvento = :eventId OR #event_id = :eventId",
      ExpressionAttributeNames: {
        "#eventId": "eventId",
        "#idEvento": "id_evento",
        "#event_id": "event_id",
      },
      ExpressionAttributeValues: { ":eventId": eventId },
    })
    .promise();

  return scan.Items || [];
}

async function findTicketRecordByEvent(eventId) {
  try {
    const indexed = await dynamodb
      .query({
        TableName: TABLES.TICKETS_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
      })
      .promise();
    if (indexed.Items?.length) {
      return indexed.Items.sort((a, b) =>
        String(b.createDate || "").localeCompare(String(a.createDate || "")),
      )[0];
    }
  } catch (err) {
    console.warn("Tickets eventIdIndex query failed:", err.message);
  }

  const result = await dynamodb
    .scan({
      TableName: TABLES.TICKETS_TABLE,
      FilterExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
    })
    .promise();

  const items = result.Items || [];
  if (!items.length) return null;
  return items.sort((a, b) =>
    String(b.createDate || "").localeCompare(String(a.createDate || "")),
  )[0];
}

exports.handler = async (event) => {
  try {
    const eventId = String(event.pathParameters?.eventId || "").trim();
    if (!eventId) {
      return response(400, {
        error: "MissingParameters",
        message: "eventId es requerido",
      });
    }

    console.log(`🔧 ensureEventDistributions para evento ${eventId}`);

    const existing = await queryDistributionsByEvent(eventId);
    if (existing.length > 0) {
      return response(200, {
        eventId,
        alreadyExisted: true,
        distributions: existing.length,
        message: "Las distribuciones ya existen para este evento",
      });
    }

    let ticketRecord = await findTicketRecordByEvent(eventId);

    if (!ticketRecord) {
      const venueId = await findVenueIdForEvent(dynamodb, TABLES, eventId);
      if (venueId) {
        console.log(`🏟️ Reconstruyendo tickets desde venue ${venueId}`);
        const bootstrapped = await bootstrapTicketsFromVenue(dynamodb, TABLES, {
          eventId,
          venueId,
          generateTicketsDistribution,
        });
        if (bootstrapped?.created) {
          return response(200, {
            eventId,
            created: bootstrapped.created,
            venueId,
            bootstrapped: true,
            message: `${bootstrapped.created} distribución(es) creada(s) desde el lugar del evento`,
          });
        }
      }

      return response(404, {
        error: "TicketsNotFound",
        message:
          "No hay boletas configuradas para este evento. Edita el evento, configura el mapa de silletería o el lugar, y vuelve a publicar.",
        eventId,
      });
    }

    const boletas = normalizeBoletas(ticketRecord);
    const {
      id: ticketId,
      venueId: ticketVenueId,
      hasSeating,
      createDate,
    } = ticketRecord;

    let venueId = ticketVenueId || (await findVenueIdForEvent(dynamodb, TABLES, eventId));

    if (!venueId || !ticketId || !boletas.length) {
      if (venueId && boletas.length === 0) {
        const rebuilt = await bootstrapTicketsFromVenue(dynamodb, TABLES, {
          eventId,
          venueId,
          generateTicketsDistribution,
        });
        if (rebuilt?.created) {
          return response(200, {
            eventId,
            created: rebuilt.created,
            venueId,
            rebuilt: true,
            message: `${rebuilt.created} distribución(es) reconstruida(s) desde el lugar`,
          });
        }
      }

      return response(422, {
        error: "InvalidTicketRecord",
        message:
          "El registro de boletas está incompleto. Edita el evento y vuelve a guardar la boletería.",
        eventId,
        details: {
          hasVenueId: Boolean(venueId),
          hasTicketId: Boolean(ticketId),
          categories: boletas.length,
        },
      });
    }

    let seatsMapping = {};
    if (hasSeating) {
      const categoryIds = boletas.map((b) => b.id).filter(Boolean);
      seatsMapping = await buildSeatsMappingForCategories(
        dynamodb,
        TABLES,
        venueId,
        categoryIds,
      );
    }

    const now = createDate || new Date().toISOString();
    const created = await generateTicketsDistribution(
      eventId,
      venueId,
      ticketId,
      boletas,
      now,
      seatsMapping,
    );

    if (!created) {
      return response(422, {
        error: "NoDistributionsCreated",
        message:
          "No se generaron distribuciones. Verifica que las categorías tengan cantidad de boletas mayor a cero.",
        eventId,
      });
    }

    return response(200, {
      eventId,
      created,
      venueId,
      ticketId,
      message: `${created} distribución(es) creada(s) correctamente`,
    });
  } catch (error) {
    console.error("ensureEventDistributions error:", error);
    return response(500, {
      error: "InternalServerError",
      message: error.message,
    });
  }
};
