const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const {
  generateTicketsDistribution,
} = require("./cloneVenueForEventHandler");

const TICKETS_TABLE = process.env.TICKETS_TABLE || "Tickets";
const TICKETS_DIST_TABLE =
  process.env.TICKETS_DIST_TABLE || "TicketsDistribution";
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
      `[updateCategory] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`,
    );
  }
};

exports.handler = async (event) => {
  try {
    const { venueId, categoryId } = event.pathParameters;
    const body = JSON.parse(event.body);

    if (!categoryId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "categoryId is required" }),
      };
    }

    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Layout fields
    const allowedLayoutFields = [
      "name",
      "color",
      "level",
      "sortOrder",
      "gateId",
      "gateName",
      "config",
      "isAccessibleZone",
    ];

    // Ticket fields that also need to sync to Tickets/TicketsDistribution
    const allowedTicketFields = [
      "cantidadTickets",
      "ticketQuantity",
      "valor",
      "ticketPrice",
      "moneda",
      "currency",
      "costo",
      "hasPrice",
    ];

    [...allowedLayoutFields, ...allowedTicketFields].forEach((field) => {
      if (body[field] !== undefined) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = body[field];
      }
    });

    if (updateExpressions.length === 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No fields to update" }),
      };
    }

    await dynamodb
      .update({
        TableName: "Venue_Category",
        Key: { categoryId },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
      .promise();

    // ──────────────────────────────────────────────────────────────────────────
    // Si se actualizaron campos de tickets, sincronizar con Tickets + TicketsDistribution
    // ──────────────────────────────────────────────────────────────────────────
    const ticketFieldsUpdated = allowedTicketFields.some(
      (f) => body[f] !== undefined,
    );

    if (ticketFieldsUpdated) {
      try {
        let reconciledEventId = null;

        // Obtener el registro actualizado de Venue_Category
        const catRes = await dynamodb
          .get({ TableName: "Venue_Category", Key: { categoryId } })
          .promise();
        const cat = catRes.Item;

        if (!cat || !cat.venueId) {
          console.warn(`⚠️ Venue_Category no encontrada para ${categoryId}`);
        } else {
          // Obtener eventId del venue
          const venueRes = await dynamodb
            .get({ TableName: process.env.VENUE_TABLE || "Venues", Key: { venue_id: cat.venueId } })
            .promise();
          const eventId = venueRes.Item?.eventId || cat.eventId || null;

          if (eventId) {
            reconciledEventId = eventId;

            // Sincronizar boletas en Tickets
            const ticketsRes = await dynamodb
              .query({
                TableName: TICKETS_TABLE,
                IndexName: "eventIdIndex",
                KeyConditionExpression: "eventId = :eventId",
                ExpressionAttributeValues: { ":eventId": eventId },
              })
              .promise();

            if (ticketsRes.Items && ticketsRes.Items.length > 0) {
              const ticketRow = ticketsRes.Items[0];
              const boletas = Array.isArray(ticketRow.boletas)
                ? ticketRow.boletas
                : Array.isArray(ticketRow.boleta)
                  ? ticketRow.boleta
                  : [];

              const idx = boletas.findIndex(
                (b) => b.id === categoryId || b.categoria === cat.name,
              );

              if (idx !== -1) {
                const boletasActualizadas = [...boletas];
                const nueva = { ...boletasActualizadas[idx] };

                if (body.cantidadTickets !== undefined || body.ticketQuantity !== undefined) {
                  const qty = Number(body.cantidadTickets ?? body.ticketQuantity ?? nueva.cantidadTickets);
                  nueva.cantidadTickets = qty;
                  nueva.avaliableCapacity = qty;
                }
                if (body.valor !== undefined || body.ticketPrice !== undefined) {
                  nueva.valor = Number(body.valor ?? body.ticketPrice ?? nueva.valor);
                }
                if (body.moneda !== undefined || body.currency !== undefined) {
                  nueva.moneda = body.moneda ?? body.currency ?? nueva.moneda;
                }

                boletasActualizadas[idx] = nueva;
                await dynamodb
                  .update({
                    TableName: TICKETS_TABLE,
                    Key: { id: ticketRow.id },
                    UpdateExpression: "SET boletas = :boletas",
                    ExpressionAttributeValues: {
                      ":boletas": boletasActualizadas,
                    },
                  })
                  .promise();

                console.log(
                  `✅ Tickets.boletas actualizado para categoría ${categoryId}`,
                );
              }

              await notifyLifecycleScheduler(reconciledEventId);
            }
          }
        }
      } catch (syncErr) {
        // No fallar la operación principal si la sincronización falla
        console.warn(
          `⚠️ Error sincronizando Tickets/TicketsDistribution: ${syncErr.message}`,
        );
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Category updated successfully",
        categoryId,
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
