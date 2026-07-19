const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const { v4: uuidv4 } = require("uuid");
const {
  generateTicketsDistribution,
} = require("./cloneVenueForEventHandler");
const { pickLabelLayoutFields } = require("./seatGridUtils");

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
      `[createCategory] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`,
    );
  }
};

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId, floorId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub || body.createdBy;

    if (!floorId || !body.name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "floorId and name are required" }),
      };
    }

    // Verificar que el floor existe
    const floorExists = await dynamodb
      .get({
        TableName: "Venue_Floor",
        Key: { floorId },
      })
      .promise();

    if (!floorExists.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Floor not found" }),
      };
    }

    const categoryId = body.categoryId || uuidv4();
    const now = new Date().toISOString();

    // Campos de tickets (para venues de eventos)
    const cantidadTickets = Number(body.cantidadTickets || body.ticketQuantity || 0);
    const valor = Number(body.valor || body.ticketPrice || 0);
    const moneda = body.moneda || body.currency || "COP";
    const costo = body.costo !== undefined ? body.costo : valor > 0;
    const hasPrice = body.hasPrice !== undefined ? body.hasPrice : valor > 0;

    const category = {
      categoryId,
      floorId,
      venueId,
      name: body.name,
      color: body.color || "#000000",
      level: body.level || 0,
      sortOrder: body.sortOrder || 0,
      gateId: body.gateId || "",
      gateName: body.gateName || "",
      relX: body.relX || 0,
      relY: body.relY || 0,
      width: body.width || 0,
      height: body.height || 0,
      config: body.config || "",
      isAccessibleZone: body.isAccessibleZone || false,
      ...pickLabelLayoutFields(body),
      // Ticket fields
      cantidadTickets,
      ticketQuantity: cantidadTickets,
      availableCapacity: cantidadTickets,
      valor,
      ticketPrice: valor,
      moneda,
      currency: moneda,
      costo,
      hasPrice,
      createDate: now,
      createdBy: userId,
    };

    await dynamodb
      .put({
        TableName: "Venue_Category",
        Item: category,
      })
      .promise();

    console.log(`✅ Venue_Category creada: ${categoryId}`);

    // ────────────────────────────────────────────────────────────────────────────
    // Si el venue está asociado a un evento y la categoría tiene tickets,
    // crear TicketsDistribution y actualizar (o crear) el registro Tickets.
    // ────────────────────────────────────────────────────────────────────────────
    let ticketsDistributionCreated = false;
    let eventId = null;

    if (cantidadTickets > 0) {
      // Obtener el venue para ver si tiene eventId
      const venueRes = await dynamodb
        .get({ TableName: process.env.VENUE_TABLE || "Venues", Key: { venue_id: venueId } })
        .promise();
      eventId = venueRes.Item?.eventId || null;

      if (eventId) {
        console.log(
          `🎫 Venue es de evento (eventId: ${eventId}). Creando distribución de tickets...`,
        );

        const distributionId = uuidv4();
        const distributionCreateDate = now;

        // Objeto categoría en el formato que espera generateTicketsDistribution
        const ticketCategory = {
          id: categoryId,
          categoria: body.name,
          color: body.color || null,
          gateId: body.gateId || null,
          valor,
          moneda,
          costo,
          cantidadTickets,
          avaliableCapacity: cantidadTickets,
          reservedTickets: 0,
          soldTickets: 0,
          distributionId,
          distributionCreateDate,
        };

        // Crear la distribución de tickets (sin seatsMapping para categorías nuevas)
        await generateTicketsDistribution(
          eventId,
          venueId,
          null, // ticketId se asigna más abajo tras buscar/crear el registro Tickets
          [ticketCategory],
          now,
          {}, // seatsMapping vacío — los asientos se asignan después via createSeatsHandler
        );

        // Buscar el registro Tickets existente para este evento
        const ticketsRes = await dynamodb
          .query({
            TableName: TICKETS_TABLE,
            IndexName: "eventIdIndex",
            KeyConditionExpression: "eventId = :eventId",
            ExpressionAttributeValues: { ":eventId": eventId },
          })
          .promise();

        if (ticketsRes.Items && ticketsRes.Items.length > 0) {
          // Actualizar el registro existente: añadir la nueva categoría a boletas
          const ticketRow = ticketsRes.Items[0];
          const boletasActuales = Array.isArray(ticketRow.boletas)
            ? ticketRow.boletas
            : Array.isArray(ticketRow.boleta)
              ? ticketRow.boleta
              : [];

          // Evitar duplicados (por si se llama dos veces)
          const yaExiste = boletasActuales.some(
            (b) => b.id === categoryId || b.categoria === body.name,
          );

          if (!yaExiste) {
            const nuevaBoleta = {
              ...ticketCategory,
              distributionId,
              distributionCreateDate,
            };
            const boletasActualizadas = [...boletasActuales, nuevaBoleta];

            await dynamodb
              .update({
                TableName: TICKETS_TABLE,
                Key: { id: ticketRow.id },
                UpdateExpression: "SET boletas = :boletas",
                ExpressionAttributeValues: { ":boletas": boletasActualizadas },
              })
              .promise();

            console.log(
              `✅ Categoría "${body.name}" añadida a Tickets.boletas (ticketId: ${ticketRow.id})`,
            );

            // Actualizar el ticketId en la distribución recién creada
            await dynamodb
              .update({
                TableName: TICKETS_DIST_TABLE,
                Key: { id: distributionId, createDate: distributionCreateDate },
                UpdateExpression: "SET ticketId = :tid",
                ExpressionAttributeValues: { ":tid": ticketRow.id },
              })
              .promise();
          } else {
            console.warn(
              `⚠️ Categoría "${body.name}" ya existe en Tickets.boletas — omitiendo duplicado`,
            );
          }

          ticketsDistributionCreated = true;
        } else {
          // No existe registro Tickets para este evento — crear uno nuevo
          const newTicketId = uuidv4().substring(0, 10);
          const nuevaBoleta = {
            ...ticketCategory,
            distributionId,
            distributionCreateDate,
          };

          await dynamodb
            .put({
              TableName: TICKETS_TABLE,
              Item: {
                id: newTicketId,
                eventId,
                venueId,
                boletas: [nuevaBoleta],
                fechaIniVent: now,
                fechaFinVent: now,
                horaIniVent: "00:00",
                horaFinVent: "23:59",
                createDate: now,
                hasSeating: venueRes.Item?.hasSeating || false,
              },
            })
            .promise();

          console.log(
            `✅ Nuevo registro Tickets creado (ticketId: ${newTicketId}) con categoría "${body.name}"`,
          );

          // Actualizar el ticketId en la distribución recién creada
          await dynamodb
            .update({
              TableName: TICKETS_DIST_TABLE,
              Key: { id: distributionId, createDate: distributionCreateDate },
              UpdateExpression: "SET ticketId = :tid",
              ExpressionAttributeValues: { ":tid": newTicketId },
            })
            .promise();

          ticketsDistributionCreated = true;
        }

        // Actualizar Venue_Category con los IDs de distribución para referencia
        await dynamodb
          .update({
            TableName: "Venue_Category",
            Key: { categoryId },
            UpdateExpression:
              "SET distributionId = :did, distributionCreateDate = :dcd, eventId = :eid",
            ExpressionAttributeValues: {
              ":did": distributionId,
              ":dcd": distributionCreateDate,
              ":eid": eventId,
            },
          })
          .promise();

        await notifyLifecycleScheduler(eventId);
      } else {
        console.log(
          `ℹ️  Venue ${venueId} no está asociado a un evento — omitiendo TicketsDistribution`,
        );
      }
    }

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Category created successfully",
        category: {
          ...category,
          eventId,
          ticketsDistributionCreated,
        },
      }),
    };
  } catch (error) {
    console.error("Error in createCategoryHandler:", error);
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
