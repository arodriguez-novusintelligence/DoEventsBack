const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

const TICKETS_DIST_TABLE =
  process.env.TICKETS_DIST_TABLE || "TicketsDistribution";

exports.handler = async (event) => {
  try {
    const { venueId, floorId, categoryId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.createdBy;

    if (!Array.isArray(body.seats) || body.seats.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "seats array is required and must not be empty",
        }),
      };
    }

    const createdSeats = [];
    const seatDetails = []; // guardamos detalles para luego actualizar distributions
    const batchSize = 25;
    const now = new Date().toISOString();

    for (let i = 0; i < body.seats.length; i += batchSize) {
      const batch = body.seats.slice(i, i + batchSize);

      const putRequests = batch.map((seatData) => {
        const seatId = seatData.seatId || uuidv4();
        const seatLabel =
          seatData.seatLabel ||
          `${seatData.rowLabel || ""}${seatData.colNumber || ""}`;
        createdSeats.push(seatId);
        seatDetails.push({
          seatId,
          rowLabel: seatData.rowLabel || "",
          colNumber: seatData.colNumber || 0,
          seatLabel,
          floorId,
          venueId,
        });

        return {
          PutRequest: {
            Item: {
              seatId,
              categoryId,
              floorId,
              venueId,
              rowLabel: seatData.rowLabel || "",
              colNumber: seatData.colNumber || 0,
              seatCode: seatData.seatCode || "",
              seatType: seatData.seatType || "standard",
              status: seatData.status || "available",
              isAccessible: seatData.isAccessible || false,
              notes: seatData.notes || "",
              createdAt: now,
              createdBy: userId,
            },
          },
        };
      });

      await dynamodb
        .batchWrite({
          RequestItems: {
            Venue_Seat: putRequests,
          },
        })
        .promise();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Si la categoría tiene una distribución de tickets, actualizar las
    // instancias de tickets con la ubicación (seat location) de los asientos.
    // Buscar la distribución via Venue_Category.distributionId
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const catRes = await dynamodb
        .get({ TableName: "Venue_Category", Key: { categoryId } })
        .promise();
      const cat = catRes.Item;

      if (cat && cat.distributionId && cat.distributionCreateDate) {
        const distRes = await dynamodb
          .get({
            TableName: TICKETS_DIST_TABLE,
            Key: {
              id: cat.distributionId,
              createDate: cat.distributionCreateDate,
            },
          })
          .promise();

        const dist = distRes.Item;
        if (dist && Array.isArray(dist.tickets)) {
          // Actualizar por índice: el i-ésimo asiento → el i-ésimo ticket disponible sin location
          const ticketsSinSeat = dist.tickets.filter(
            (t) => !t.location || !t.location.seatId,
          );

          if (ticketsSinSeat.length > 0 && seatDetails.length > 0) {
            const updatedTickets = [...dist.tickets];

            let seatIdx = 0;
            for (let ti = 0; ti < updatedTickets.length && seatIdx < seatDetails.length; ti++) {
              const ticket = updatedTickets[ti];
              if (!ticket.location || !ticket.location.seatId) {
                updatedTickets[ti] = {
                  ...ticket,
                  location: seatDetails[seatIdx],
                };
                seatIdx++;
              }
            }

            await dynamodb
              .put({
                TableName: TICKETS_DIST_TABLE,
                Item: {
                  ...dist,
                  tickets: updatedTickets,
                },
              })
              .promise();

            console.log(
              `✅ TicketsDistribution actualizado con ${seatIdx} asientos para categoría ${categoryId}`,
            );
          }
        }
      }
    } catch (distErr) {
      // No fallar si la actualización de distribución falla
      console.warn(
        `⚠️ No se pudo actualizar TicketsDistribution con seats: ${distErr.message}`,
      );
    }

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${createdSeats.length} seats created successfully`,
        seatIds: createdSeats,
        count: createdSeats.length,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
