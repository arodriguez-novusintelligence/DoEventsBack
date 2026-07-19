const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const doc = DynamoDBDocumentClient.from(ddbClient);

const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;
const VENUE_GATE_TABLE = process.env.VENUE_GATE_TABLE || "Venue_Gate";

const EVENT_KEY_CANDIDATES = ["eventId", "id_evento", "event_id"];

const queryByIndexKey = async (eventId, keyName) => {
  return doc.send(
    new QueryCommand({
      TableName: TICKETS_DIST_TABLE,
      IndexName: "eventIdIndex",
      KeyConditionExpression: "#eventKey = :eventId",
      ExpressionAttributeNames: {
        "#eventKey": keyName,
      },
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    }),
  );
};

const scanByAnyEventKey = async (eventId) => {
  let items = [];
  let lastEvaluatedKey;

  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: TICKETS_DIST_TABLE,
        FilterExpression:
          "#eventId = :eventId OR #idEvento = :eventId OR #event_id = :eventId",
        ExpressionAttributeNames: {
          "#eventId": "eventId",
          "#idEvento": "id_evento",
          "#event_id": "event_id",
        },
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    items = items.concat(page.Items || []);
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
};

exports.handler = async (event) => {
  const build = (code, body) => ({
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body, null, 2),
  });

  try {
    const eventId = String(event.pathParameters?.eventId || "").trim();

    if (!eventId) {
      return build(400, {
        error: "MissingParameters",
        message: "eventId es requerido",
        example: "/events/{eventId}/available-seats",
      });
    }

    console.log(
      `🔍 Consultando todas las distribuciones para evento: ${eventId}`,
    );

    // Intentar query con GSI para distintos nombres de atributo usados históricamente.
    // Si no encuentra resultados o el índice no soporta una clave, intentar la siguiente.
    let distributions = [];
    let lastQueryError = null;

    for (const keyName of EVENT_KEY_CANDIDATES) {
      try {
        const result = await queryByIndexKey(eventId, keyName);
        if (result.Items && result.Items.length > 0) {
          distributions = result.Items;
          console.log(
            `✅ Distribuciones encontradas con eventIdIndex usando clave: ${keyName}`,
          );
          break;
        }
      } catch (queryErr) {
        lastQueryError = queryErr;
        console.warn(
          `⚠️ Query con clave ${keyName} falló en eventIdIndex: ${queryErr.message}`,
        );
      }
    }

    // Fallback de compatibilidad para datos legacy/migraciones: scan por eventId/id_evento/event_id.
    if (distributions.length === 0) {
      console.log(
        "🔄 Sin resultados por índice. Intentando fallback scan por claves legacy...",
      );
      distributions = await scanByAnyEventKey(eventId);
    }

    if (!distributions || distributions.length === 0) {
      return build(404, {
        error: "NotFound",
        message: `No se encontraron distribuciones para el evento: ${eventId}`,
        eventId,
        debug:
          process.env.NODE_ENV === "development"
            ? {
                attemptedKeys: EVENT_KEY_CANDIDATES,
                lastQueryError: lastQueryError?.message || null,
              }
            : undefined,
      });
    }

    console.log(`✅ Encontradas ${distributions.length} distribuciones`);

    // Organizar por categoría
    const categoriesMap = {};
    const gateIds = new Set();
    let totalSeats = 0;
    let totalAvailable = 0;
    let totalReserved = 0;
    let totalSold = 0;

    for (const distribution of distributions) {
      const tickets = distribution.tickets || [];
      const categoryId = distribution.boletaId || distribution.categoryId;
      const ticketCategoryHint = tickets.find((t) => t && (t.category || t.categoryName));
      const categoryName =
        distribution.categoryName
        || ticketCategoryHint?.category
        || ticketCategoryHint?.categoryName
        || "Sin categoría";

      if (!categoriesMap[categoryId]) {
        categoriesMap[categoryId] = {
          categoryId: categoryId,
          categoryName: categoryName,
          categoryColor: distribution.categoryColor || null,
          distributionId: distribution.id,
          createDate: distribution.createDate,
          venueId: distribution.venueId,
          ticketId: distribution.ticketId,
          gateId: distribution.gateId || null,
          seats: [],
          summary: {
            totalSeats: 0,
            availableSeats: 0,
            reservedSeats: 0,
            soldSeats: 0,
          },
        };
      }

      if (distribution.gateId) {
        gateIds.add(distribution.gateId);
      }

      // Procesar tickets de esta distribución
      for (const ticket of tickets) {
        const seatInfo = {
          ticketInstanceId: ticket.ticketInstanceId,
          distributionId: distribution.id,           // ID exacto de la distribución
          distributionCreateDate: distribution.createDate, // createDate exacto
          location: ticket.location || {},
          ticketStatus: ticket.ticketStatus || "AVAILABLE",
          price: ticket.purchasePrice || 0,
          qrCodeKey: ticket.qrCodeKey,
          ownerId: ticket.ownerId || null,
          orderId: ticket.orderId || null,
        };

        categoriesMap[categoryId].seats.push(seatInfo);
        categoriesMap[categoryId].summary.totalSeats++;
        totalSeats++;

        // Contar por estado
        switch (ticket.ticketStatus) {
          case "AVAILABLE":
            categoriesMap[categoryId].summary.availableSeats++;
            totalAvailable++;
            break;
          case "RESERVED":
            categoriesMap[categoryId].summary.reservedSeats++;
            totalReserved++;
            break;
          case "SOLD":
          case "USED":
            categoriesMap[categoryId].summary.soldSeats++;
            totalSold++;
            break;
        }
      }

      // Ordenar asientos por fila y número
      categoriesMap[categoryId].seats.sort((a, b) => {
        const rowA = a.location?.row || "";
        const rowB = b.location?.row || "";
        const numA = a.location?.number || 0;
        const numB = b.location?.number || 0;

        if (rowA !== rowB) {
          return rowA.localeCompare(rowB);
        }
        return numA - numB;
      });
    }

    // Convertir mapa a array
    const categories = Object.values(categoriesMap);

    // Enriquecer con datos de gates (puertas) si hay gateId
    if (gateIds.size > 0) {
      try {
        const keys = Array.from(gateIds).map((gateId) => ({ gateId }));

        const gateRes = await doc.send(
          new BatchGetCommand({
            RequestItems: {
              [VENUE_GATE_TABLE]: {
                Keys: keys,
              },
            },
          }),
        );

        const gateItems = gateRes.Responses?.[VENUE_GATE_TABLE] || [];
        const gateMap = gateItems.reduce((acc, g) => {
          acc[g.gateId] = {
            gateId: g.gateId,
            gateNumber: g.gateNumber,
            name: g.name,
            description: g.description,
            venueId: g.venueId,
            eventId: g.eventId || null,
            status: g.status || null,
          };
          return acc;
        }, {});

        categories.forEach((cat) => {
          if (cat.gateId && gateMap[cat.gateId]) {
            cat.gate = gateMap[cat.gateId];
          }
        });
      } catch (gateErr) {
        console.warn("⚠️ No se pudo enriquecer gates:", gateErr.message);
      }
    }

    // Ordenar categorías alfabéticamente
    categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

    console.log(
      `📊 Resumen: ${categories.length} categorías, ${totalSeats} asientos totales`,
    );

    return build(200, {
      eventId: eventId,
      totalCategories: categories.length,
      summary: {
        totalSeats: totalSeats,
        availableSeats: totalAvailable,
        reservedSeats: totalReserved,
        soldSeats: totalSold,
      },
      categories: categories,
    });
  } catch (error) {
    console.error("❌ Error consultando asientos:", error);
    return build(500, {
      error: "InternalServerError",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
