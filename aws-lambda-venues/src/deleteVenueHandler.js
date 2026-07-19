const AWS = require("aws-sdk");
const { respond, handleOptions, tableName } = require("./venueSocialUtils");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

const DEFAULT_TIMEZONE = "America/Bogota";

const TABLES = {
  venue: () => tableName("VENUE_TABLE", "Venues"),
  floor: () => tableName("VENUE_FLOOR_TABLE", "Venue_Floor"),
  element: () => tableName("VENUE_ELEMENT_TABLE", "Venue_Element"),
  category: () => tableName("VENUE_CATEGORY_TABLE", "Venue_Category"),
  seat: () => tableName("VENUE_SEAT_TABLE", "Venue_Seat"),
  gate: () => tableName("VENUE_GATE_TABLE", "Venue_Gate"),
  entrance: () => tableName("VENUE_ENTRANCE_TABLE", "Venue_Entrance"),
  entranceCategory: () =>
    tableName("VENUE_ENTRANCE_CATEGORY_TABLE", "Venue_Entrance_Category"),
  events: () => tableName("EVENTS_TABLE", "Eventos"),
  tickets: () => tableName("TICKETS_TABLE", "Tickets"),
  ticketsDist: () => tableName("TICKETS_DIST_TABLE", "TicketsDistribution"),
  likes: () => tableName("VENUE_LIKES_TABLE", "Venue_Likes"),
  ratings: () => tableName("VENUE_RATINGS_TABLE", "VenueCalification"),
};

const normalizeTime = (timeValue = "00:00") => {
  const [h = "00", m = "00"] = String(timeValue).split(":");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const getNowInTimezone = (timezone) => {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = dateFormatter.format(now).replace(/-/g, "");
  const time = timeFormatter.format(now);
  return { date, time };
};

const batchDelete = async (table, keys, keyMapper) => {
  if (!keys || keys.length === 0) return;
  const batchSize = 25;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    await dynamodb
      .batchWrite({
        RequestItems: {
          [table]: batch.map((item) => ({
            DeleteRequest: { Key: keyMapper(item) },
          })),
        },
      })
      .promise();
  }
};

const hasReservedTickets = async (eventId, venueId) => {
  const ticketsDistTable = TABLES.ticketsDist();
  let lastKey;
  do {
    const res = await dynamodb
      .query({
        TableName: ticketsDistTable,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        FilterExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
          ":venueId": venueId,
        },
        ExclusiveStartKey: lastKey,
      })
      .promise();

    for (const dist of res.Items || []) {
      if (!Array.isArray(dist.tickets)) {
        continue;
      }
      if (
        dist.tickets.some(
          (t) => t.ticketStatus === "RESERVED" || t.ticketStatus === "SOLD",
        )
      ) {
        return true;
      }
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return false;
};

const deleteTicketsDistributionByEventVenue = async (eventId, venueId) => {
  const ticketsDistTable = TABLES.ticketsDist();
  let lastKey;
  do {
    const res = await dynamodb
      .query({
        TableName: ticketsDistTable,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        FilterExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
          ":venueId": venueId,
        },
        ExclusiveStartKey: lastKey,
      })
      .promise();

    if (res.Items && res.Items.length > 0) {
      await batchDelete(ticketsDistTable, res.Items, (item) => ({
        id: item.id,
        createDate: item.createDate,
      }));
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
};

const deleteTicketsByEventVenue = async (eventId, venueId) => {
  const ticketsTable = TABLES.tickets();
  let lastKey;
  do {
    const res = await dynamodb
      .query({
        TableName: ticketsTable,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        FilterExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
          ":venueId": venueId,
        },
        ExclusiveStartKey: lastKey,
      })
      .promise();

    if (res.Items && res.Items.length > 0) {
      await batchDelete(ticketsTable, res.Items, (item) => ({ id: item.id }));
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
};

exports.handler = async (event) => {
  const optionsResponse = handleOptions(event);
  if (optionsResponse) return optionsResponse;

  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId } = event.pathParameters || {};

    if (!venueId) {
      return respond(400, { error: "venueId is required" });
    }

    const venueResult = await dynamodb
      .get({
        TableName: TABLES.venue(),
        Key: { venue_id: venueId },
      })
      .promise();

    if (!venueResult.Item) {
      return respond(404, { error: "Venue not found" });
    }

    const venueItem = venueResult.Item;
    const eventId = venueItem.eventId || venueItem.event_id;
    const isTemplate =
      venueItem.isTemplate === true || venueItem.is_template === true;

    let requestUserId = null;
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      requestUserId =
        event.requestContext?.authorizer?.claims?.sub
        || body.userId
        || body.ownerUserId
        || event.queryStringParameters?.userId
        || null;
    } catch {
      requestUserId = event.queryStringParameters?.userId || null;
    }

    const ownerId = venueItem.ownerUserId || venueItem.owner_user_id;
    if (ownerId && requestUserId && ownerId !== requestUserId) {
      return respond(403, {
        error: "No tienes permiso para eliminar este lugar",
      });
    }

    if (eventId && !isTemplate) {
      const eventResult = await dynamodb
        .get({
          TableName: TABLES.events(),
          Key: { id: eventId },
        })
        .promise();

      if (!eventResult.Item) {
        return respond(409, {
          error: "Event not found for venue",
          eventId,
        });
      }

      const eventItem = eventResult.Item;
      const eventDate = eventItem.fechaIni;
      const eventTime = normalizeTime(eventItem.horaIni || "00:00");
      if (!eventDate) {
        return respond(409, {
          error: "Cannot validate event start date",
          eventId,
        });
      }

      const timezone = eventItem.timezone || DEFAULT_TIMEZONE;
      const nowInTz = getNowInTimezone(timezone);
      const hasStarted =
        eventDate < nowInTz.date
        || (eventDate === nowInTz.date && eventTime <= nowInTz.time);

      if (hasStarted) {
        return respond(409, {
          error: "Event already started",
          eventId,
          eventDate,
          eventTime,
        });
      }

      const reservedFound = await hasReservedTickets(eventId, venueId);
      if (reservedFound) {
        return respond(409, {
          error: "Cannot delete venue with reserved TicketsDistribution",
          eventId,
        });
      }
    }

    const floors = await dynamodb
      .query({
        TableName: TABLES.floor(),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: { ":venueId": venueId },
      })
      .promise();

    for (const floor of floors.Items || []) {
      const elements = await dynamodb
        .query({
          TableName: TABLES.element(),
          IndexName: "floorIdIndex",
          KeyConditionExpression: "floorId = :floorId",
          ExpressionAttributeValues: { ":floorId": floor.floorId },
        })
        .promise();

      if (elements.Items && elements.Items.length > 0) {
        await batchDelete(TABLES.element(), elements.Items, (element) => ({
          elementId: element.elementId,
        }));
      }

      const categories = await dynamodb
        .query({
          TableName: TABLES.category(),
          IndexName: "floorIdIndex",
          KeyConditionExpression: "floorId = :floorId",
          ExpressionAttributeValues: { ":floorId": floor.floorId },
        })
        .promise();

      for (const category of categories.Items || []) {
        const seats = await dynamodb
          .query({
            TableName: TABLES.seat(),
            IndexName: "categoryIdIndex",
            KeyConditionExpression: "categoryId = :categoryId",
            ExpressionAttributeValues: { ":categoryId": category.categoryId },
          })
          .promise();

        if (seats.Items && seats.Items.length > 0) {
          await batchDelete(TABLES.seat(), seats.Items, (seat) => ({
            seatId: seat.seatId,
          }));
        }

        await dynamodb
          .delete({
            TableName: TABLES.category(),
            Key: { categoryId: category.categoryId },
          })
          .promise();
      }

      await dynamodb
        .delete({
          TableName: TABLES.floor(),
          Key: { floorId: floor.floorId },
        })
        .promise();
    }

    const independentCategories = await dynamodb
      .query({
        TableName: TABLES.category(),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        FilterExpression: "attribute_not_exists(floorId)",
        ExpressionAttributeValues: { ":venueId": venueId },
      })
      .promise();

    for (const category of independentCategories.Items || []) {
      const seats = await dynamodb
        .query({
          TableName: TABLES.seat(),
          IndexName: "categoryIdIndex",
          KeyConditionExpression: "categoryId = :categoryId",
          ExpressionAttributeValues: { ":categoryId": category.categoryId },
        })
        .promise();

      if (seats.Items && seats.Items.length > 0) {
        await batchDelete(TABLES.seat(), seats.Items, (seat) => ({
          seatId: seat.seatId,
        }));
      }

      await dynamodb
        .delete({
          TableName: TABLES.category(),
          Key: { categoryId: category.categoryId },
        })
        .promise();
    }

    const gates = await dynamodb
      .query({
        TableName: TABLES.gate(),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: { ":venueId": venueId },
      })
      .promise();

    if (gates.Items && gates.Items.length > 0) {
      await batchDelete(TABLES.gate(), gates.Items, (gate) => ({
        gateId: gate.gateId,
      }));
    }

    try {
      const entrances = await dynamodb
        .query({
          TableName: TABLES.entrance(),
          IndexName: "venueIdIndex",
          KeyConditionExpression: "venueId = :venueId",
          ExpressionAttributeValues: { ":venueId": venueId },
        })
        .promise();

      for (const entrance of entrances.Items || []) {
        const entranceCategories = await dynamodb
          .query({
            TableName: TABLES.entranceCategory(),
            IndexName: "entranceIdIndex",
            KeyConditionExpression: "entranceId = :entranceId",
            ExpressionAttributeValues: { ":entranceId": entrance.entranceId },
          })
          .promise();

        if (entranceCategories.Items && entranceCategories.Items.length > 0) {
          await batchDelete(
            TABLES.entranceCategory(),
            entranceCategories.Items,
            (item) => ({ entranceCategoryId: item.entranceCategoryId }),
          );
        }

        await dynamodb
          .delete({
            TableName: TABLES.entrance(),
            Key: { entranceId: entrance.entranceId },
          })
          .promise();
      }
    } catch (entranceErr) {
      console.warn("No se pudieron eliminar entrances del venue:", entranceErr.message);
    }

    if (eventId && !isTemplate) {
      await deleteTicketsDistributionByEventVenue(eventId, venueId);
      await deleteTicketsByEventVenue(eventId, venueId);
    }

    const likesTable = TABLES.likes();
    const ratingsTable = TABLES.ratings();

    try {
      let likesKey;
      do {
        const likesRes = await dynamodb
          .query({
            TableName: likesTable,
            IndexName: "venueIdIndex",
            KeyConditionExpression: "venueId = :venueId",
            ExpressionAttributeValues: { ":venueId": venueId },
            ExclusiveStartKey: likesKey,
          })
          .promise();
        for (const like of likesRes.Items || []) {
          await dynamodb
            .delete({
              TableName: likesTable,
              Key: { userId: like.userId, venueId: like.venueId },
            })
            .promise();
        }
        likesKey = likesRes.LastEvaluatedKey;
      } while (likesKey);
    } catch (likesErr) {
      console.warn("No se pudieron eliminar likes del venue:", likesErr.message);
    }

    try {
      let ratingsKey;
      do {
        const ratingsRes = await dynamodb
          .query({
            TableName: ratingsTable,
            KeyConditionExpression: "venueId = :venueId",
            ExpressionAttributeValues: { ":venueId": venueId },
            ExclusiveStartKey: ratingsKey,
          })
          .promise();
        for (const rating of ratingsRes.Items || []) {
          await dynamodb
            .delete({
              TableName: ratingsTable,
              Key: {
                venueId: rating.venueId,
                calificationId: rating.calificationId,
              },
            })
            .promise();
        }
        ratingsKey = ratingsRes.LastEvaluatedKey;
      } while (ratingsKey);
    } catch (ratingsErr) {
      console.warn(
        "No se pudieron eliminar calificaciones del venue:",
        ratingsErr.message,
      );
    }

    await dynamodb
      .delete({
        TableName: TABLES.venue(),
        Key: { venue_id: venueId },
      })
      .promise();

    return respond(200, {
      message: "Venue and all related data deleted successfully",
      venueId,
    });
  } catch (error) {
    console.error("Error in deleteVenueHandler:", error);
    return respond(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};
