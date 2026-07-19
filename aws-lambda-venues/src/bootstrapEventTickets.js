const { v4: uuidv4 } = require("uuid");

function normalizeBoletas(ticketRecord) {
  if (!ticketRecord) return [];
  if (Array.isArray(ticketRecord.boletas) && ticketRecord.boletas.length) {
    return ticketRecord.boletas;
  }
  const { boleta } = ticketRecord;
  if (!boleta) return [];
  if (Array.isArray(boleta)) return boleta;
  if (typeof boleta === "object") return Object.values(boleta);
  return [];
}

async function findVenueIdForEvent(dynamodb, tables, eventId) {
  const eventResult = await dynamodb
    .get({
      TableName: tables.EVENTS_TABLE,
      Key: { id: eventId },
    })
    .promise()
    .catch(() => ({ Item: null }));

  const eventVenueId = eventResult.Item?.venueId;
  if (eventVenueId) return String(eventVenueId);

  const venueScan = await dynamodb
    .scan({
      TableName: tables.VENUE_TABLE,
      FilterExpression: "eventId = :eventId OR event_id = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
      Limit: 5,
    })
    .promise()
    .catch(() => ({ Items: [] }));

  const venue = (venueScan.Items || [])[0];
  return venue?.venue_id || venue?.venueId || null;
}

async function loadVenueCategories(dynamodb, tables, venueId) {
  const result = await dynamodb
    .query({
      TableName: tables.VENUE_CATEGORY_TABLE,
      IndexName: "venueIdIndex",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: { ":venueId": venueId },
    })
    .promise()
    .catch(() => ({ Items: [] }));

  return result.Items || [];
}

async function buildSeatsMappingForCategories(dynamodb, tables, venueId, categoryIds) {
  const mapping = {};
  for (const categoryId of categoryIds) {
    const result = await dynamodb
      .query({
        TableName: tables.VENUE_SEAT_TABLE,
        IndexName: "categoryIdIndex",
        KeyConditionExpression: "categoryId = :categoryId",
        ExpressionAttributeValues: { ":categoryId": categoryId },
      })
      .promise()
      .catch(() => ({ Items: [] }));

    const seats = result.Items || [];
    seats.sort((a, b) => {
      const ra = (a.rowLabel || "").toString();
      const rb = (b.rowLabel || "").toString();
      if (ra === rb) return (a.colNumber || 0) - (b.colNumber || 0);
      return ra.localeCompare(rb, undefined, { numeric: true });
    });

    mapping[categoryId] = seats.map((s) => ({
      seatId: s.seatId,
      rowLabel: s.rowLabel || "",
      colNumber: s.colNumber || 0,
      seatLabel: s.seatLabel || `${s.rowLabel || ""}${s.colNumber || ""}`,
      floorId: s.floorId || null,
      venueId,
    }));
  }
  return mapping;
}

async function bootstrapTicketsFromVenue(
  dynamodb,
  tables,
  { eventId, venueId, generateTicketsDistribution },
) {
  const venueResult = await dynamodb
    .get({
      TableName: tables.VENUE_TABLE,
      Key: { venue_id: venueId },
    })
    .promise()
    .catch(async () =>
      dynamodb
        .get({
          TableName: tables.VENUE_TABLE,
          Key: { venueId },
        })
        .promise(),
    );

  const venue = venueResult.Item;
  if (!venue) return null;

  const hasSeating = Boolean(venue.hasSeating);
  const categories = await loadVenueCategories(dynamodb, tables, venueId);
  if (!categories.length) return null;

  const now = new Date().toISOString();
  const ticketId = uuidv4().substring(0, 10);
  const boletas = categories.map((cat) => {
    const qty = Number(
      cat.ticketQuantity ||
        cat.cantidadTickets ||
        cat.availableCapacity ||
        cat.quantity ||
        0,
    );
    return {
      categoria: cat.name || cat.categoria || "General",
      id: cat.categoryId || cat.id,
      cantidadTickets: qty,
      avaliableCapacity: qty,
      moneda: cat.currency || cat.moneda || "COP",
      costo: cat.costo !== undefined ? cat.costo : cat.hasPrice || false,
      valor: Number(cat.valor ?? cat.ticketPrice ?? cat.price ?? 0),
      descripcion: cat.description || "",
      imgboleta: cat.imgboleta || "",
      distributionId: uuidv4(),
      distributionCreateDate: now,
      gateId: cat.gateId || null,
      color: cat.color || cat.categoryColor || null,
    };
  });

  let seatsMapping = {};
  if (hasSeating) {
    const categoryIds = boletas.map((b) => b.id).filter(Boolean);
    seatsMapping = await buildSeatsMappingForCategories(
      dynamodb,
      tables,
      venueId,
      categoryIds,
    );
    boletas.forEach((batch) => {
      const seatCount = (seatsMapping[batch.id] || []).length;
      if (seatCount > 0) {
        batch.cantidadTickets = seatCount;
        batch.avaliableCapacity = seatCount;
      }
    });
  }

  const ticketRecord = {
    id: ticketId,
    eventId,
    venueId,
    boletas,
    createDate: now,
    hasSeating,
  };

  await dynamodb
    .put({
      TableName: tables.TICKETS_TABLE,
      Item: ticketRecord,
    })
    .promise();

  const created = await generateTicketsDistribution(
    eventId,
    venueId,
    ticketId,
    boletas.filter((b) => Number(b.cantidadTickets) > 0),
    now,
    seatsMapping,
  );

  await dynamodb
    .update({
      TableName: tables.EVENTS_TABLE,
      Key: { id: eventId },
      UpdateExpression:
        "SET venueId = :venueId, skipVenue = :skipVenue, hasSeating = :hasSeating, updatedAt = :now",
      ExpressionAttributeValues: {
        ":venueId": venueId,
        ":skipVenue": false,
        ":hasSeating": hasSeating,
        ":now": now,
      },
    })
    .promise()
    .catch(() => undefined);

  return { ticketRecord, created };
}

module.exports = {
  normalizeBoletas,
  findVenueIdForEvent,
  bootstrapTicketsFromVenue,
  buildSeatsMappingForCategories,
};
