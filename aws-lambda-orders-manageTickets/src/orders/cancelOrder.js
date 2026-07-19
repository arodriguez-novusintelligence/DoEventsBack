// src/orders/cancelOrder.js
const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORD_TABLE = process.env.ORDERS_TABLE;
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const VENUE_BOOKINGS_TABLE =
  process.env.VENUE_BOOKINGS_TABLE ||
  (process.env.STAGE === "qa" ? "VenueBookings-qa" : "VenueBookings");
const SERVICE_BOOKINGS_TABLE =
  process.env.SERVICE_BOOKINGS_TABLE ||
  (process.env.STAGE === "qa" ? "ServiceBookings-qa" : "ServiceBookings");
const s3 = new AWS.S3();
const IMAGE_BUCKET = process.env.IMAGE_BUCKET;

const { deleteQrImage, resolveQrKey } = require("../helpers/qrGenerator");

const deleteReservedQr = async (ticket, ownerId) => {
  const qrKey = resolveQrKey(ticket, ownerId || ticket.ownerId || ticket.user_id);
  if (!qrKey) return;
  await deleteQrImage(qrKey);
  if (ticket.qrCodeKey && ticket.qrCodeKey !== qrKey) {
    await deleteQrImage(ticket.qrCodeKey);
  }
  const ticketId = ticket.ticketInstanceId || ticket.ticket_id;
  if (ticketId && ticketId !== qrKey) {
    await deleteQrImage(ticketId);
  }
};

exports.handler = async (event) => {
  const build = (c, b) => ({
    statusCode: c,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(b),
  });
  try {
    const { orderID } = JSON.parse(event.body || "{}");
    if (!orderID)
      return build(400, {
        error: "MissingParameter",
        message: "orderID requerido",
      });

    console.log("Cancelando orden:", orderID);

    // 1. Obtener la orden para obtener los tickets
    const orderRes = await doc
      .get({
        TableName: ORD_TABLE,
        Key: { order_id: orderID },
      })
      .promise();

    if (!orderRes.Item) {
      return build(404, { error: "NotFound", message: "Orden no encontrada" });
    }

    const order = orderRes.Item;
    const tickets = order.tickets || [];

    console.log(`Orden encontrada con ${tickets.length} tickets`);

    // 2. Liberar tickets en TicketsDistribution
    const distributionUpdates = {};

    for (const ticket of tickets) {
      const distId = ticket.distributionId;
      if (!distId) continue;

      if (!distributionUpdates[distId]) {
        distributionUpdates[distId] = {
          createDate: ticket.distributionCreateDate,
          seatIds: [],
        };
      }
      distributionUpdates[distId].seatIds.push(ticket.seatId);
    }

    console.log(
      `Liberando tickets en ${Object.keys(distributionUpdates).length} distribuciones`,
    );

    // 2.1 Buscar todos los tickets RESERVED de esa orden en TicketsDistribution (con paginación)
    let allDistributions = [];
    let lastKey = undefined;
    do {
      const page = await doc
        .scan({ TableName: TICKETS_DIST_TABLE, ExclusiveStartKey: lastKey })
        .promise();
      allDistributions = allDistributions.concat(page.Items || []);
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    console.log(
      `[cancelOrder] Distribuciones escaneadas: ${allDistributions.length} para orden ${orderID}`,
    );

    let ticketsLiberados = 0;
    const liberadosPorTicketId = {}; // { ticketId: count }

    for (const dist of allDistributions) {
      if (!dist.tickets) continue;

      for (let i = 0; i < dist.tickets.length; i++) {
        const t = dist.tickets[i];
        if (t.orderId === orderID && t.ticketStatus === "RESERVED") {
          console.log(
            `  Liberando ticket index ${i} seatId=${t.seatId} en distribución ${dist.id}`,
          );

          const updateExp = [`tickets[${i}].ticketStatus = :available`];
          const removeExp = [];
          if ("orderId" in t) removeExp.push(`tickets[${i}].orderId`);
          if ("reservationExpiry" in t)
            removeExp.push(`tickets[${i}].reservationExpiry`);
          if ("ownerId" in t) removeExp.push(`tickets[${i}].ownerId`);
          if ("qrUrl" in t) removeExp.push(`tickets[${i}].qrUrl`);

          await doc
            .update({
              TableName: TICKETS_DIST_TABLE,
              Key: { id: dist.id, createDate: dist.createDate },
              UpdateExpression: `SET ${updateExp.join(", ")}${removeExp.length ? " REMOVE " + removeExp.join(", ") : ""}`,
              ExpressionAttributeValues: { ":available": "AVAILABLE" },
            })
            .promise();

          await deleteReservedQr(t, order.user_id);

          // Agrupar por ticketId para actualizar contadores en Tickets
          const tid = dist.ticketId || dist.id;
          liberadosPorTicketId[tid] = (liberadosPorTicketId[tid] || 0) + 1;
          ticketsLiberados++;
        }
      }
    }

    console.log(`Total de tickets liberados: ${ticketsLiberados}`);

    // 2.2 Actualizar avaliableCapacity / reservedTickets en la tabla Tickets
    if (TICKETS_TABLE) {
      for (const [ticketId, count] of Object.entries(liberadosPorTicketId)) {
        try {
          const ticketRes = await doc
            .get({ TableName: TICKETS_TABLE, Key: { id: ticketId } })
            .promise();
          if (ticketRes.Item) {
            const boleta = Array.isArray(ticketRes.Item.boletas)
              ? ticketRes.Item.boletas
              : Array.isArray(ticketRes.Item.boleta)
                ? ticketRes.Item.boleta
                : null;
            if (Array.isArray(boleta)) {
              // Tickets con sub-array boletas
              const updatedBoleta = boleta.map((b) => ({
                ...b,
                avaliableCapacity: (b.avaliableCapacity || 0) + count,
                reservedTickets: Math.max(0, (b.reservedTickets || 0) - count),
              }));
              await doc
                .update({
                  TableName: TICKETS_TABLE,
                  Key: { id: ticketId },
                  UpdateExpression: "SET boletas = :b",
                  ExpressionAttributeValues: { ":b": updatedBoleta },
                })
                .promise();
            } else {
              await doc
                .update({
                  TableName: TICKETS_TABLE,
                  Key: { id: ticketId },
                  UpdateExpression:
                    "SET avaliableCapacity = avaliableCapacity + :n, reservedTickets = if_not_exists(reservedTickets, :zero) - :n",
                  ExpressionAttributeValues: { ":n": count, ":zero": 0 },
                })
                .promise();
            }
            console.log(
              `  [cancelOrder] Tickets tabla actualizada: ticketId=${ticketId} +${count} available`,
            );
          }
        } catch (e) {
          console.error(
            `  [cancelOrder] Error actualizando Tickets ticketId=${ticketId}:`,
            e.message,
          );
        }
      }
    }

    if (
      order.order_type === "VENUE_RENTAL" ||
      order.metadata?.orderType === "VENUE_RENTAL"
    ) {
      try {
        const bookingScan = await doc
          .scan({
            TableName: VENUE_BOOKINGS_TABLE,
            FilterExpression: "orderId = :orderId",
            ExpressionAttributeValues: { ":orderId": orderID },
          })
          .promise();
        const booking = (bookingScan.Items || [])[0];
        if (booking) {
          await doc
            .update({
              TableName: VENUE_BOOKINGS_TABLE,
              Key: { venueId: booking.venueId, bookingId: booking.bookingId },
              UpdateExpression: "SET #status = :status, cancelledAt = :ts REMOVE #ttl",
              ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
              ExpressionAttributeValues: {
                ":status": "CANCELLED",
                ":ts": new Date().toISOString(),
              },
            })
            .promise();
        }
      } catch (venueErr) {
        console.error("[cancelOrder] venue booking cancel error:", venueErr.message);
      }
    }

    if (
      order.order_type === "SERVICE_RENTAL" ||
      order.metadata?.orderType === "SERVICE_RENTAL"
    ) {
      try {
        const bookingScan = await doc
          .scan({
            TableName: SERVICE_BOOKINGS_TABLE,
            FilterExpression: "orderId = :orderId",
            ExpressionAttributeValues: { ":orderId": orderID },
          })
          .promise();
        const booking = (bookingScan.Items || [])[0];
        if (booking) {
          await doc
            .update({
              TableName: SERVICE_BOOKINGS_TABLE,
              Key: { serviceId: booking.serviceId, bookingId: booking.bookingId },
              UpdateExpression: "SET #status = :status, cancelledAt = :ts REMOVE #ttl",
              ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
              ExpressionAttributeValues: {
                ":status": "CANCELLED",
                ":ts": new Date().toISOString(),
              },
            })
            .promise();
        }
      } catch (serviceErr) {
        console.error("[cancelOrder] service booking cancel error:", serviceErr.message);
      }
    }

    // 3. Actualizar el estado de la orden
    await doc
      .update({
        TableName: ORD_TABLE,
        Key: { order_id: orderID },
        UpdateExpression: "SET #st = :c, payment_status = :c",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: { ":c": "CANCELLED" },
      })
      .promise();

    console.log("Orden cancelada exitosamente:", orderID);

    return build(200, {
      message: "Orden cancelada y tickets liberados",
      order_id: orderID,
      status: "CANCELLED",
      tickets_released: ticketsLiberados,
    });
  } catch (err) {
    console.error("cancelOrder error:", err);
    return build(500, { error: "InternalError", detail: err.message });
  }
};
