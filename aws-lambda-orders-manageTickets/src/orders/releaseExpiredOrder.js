const AWS = require("aws-sdk");
const { buildSuccess, buildError } = require("../helpers/responses");
const { deleteQrImage, resolveQrKey } = require("../helpers/qrGenerator");

AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();

const deleteReservedQr = async (ticket) => {
  const ownerId = ticket.ownerId || ticket.user_id || null;
  const qrKey = resolveQrKey(ticket, ownerId);
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

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;

const nowUnix = () => Math.floor(Date.now() / 1000);

// Libera una única orden (si sigue en PENDING y expiró)
const releaseOneOrder = async (orderId) => {
  // 1. Obtener la orden
  const orderRes = await doc
    .get({
      TableName: ORDERS_TABLE,
      Key: { order_id: orderId },
    })
    .promise();

  if (!orderRes.Item) {
    console.log(`Orden ${orderId} no encontrada, saltando`);
    return { order_id: orderId, released: 0, status: "NOT_FOUND" };
  }

  const order = orderRes.Item;
  if (order.payment_status !== "PENDING") {
    console.log(
      `⚠️ Orden ${orderId} no está en PENDING (status=${order.payment_status}), saltando`,
    );
    return { order_id: orderId, released: 0, status: order.payment_status };
  }

  const contadores = {}; // eventId#category -> count

  // 2. Buscar todos los tickets RESERVED de esa orden en TicketsDistribution (con paginación)
  let allDistributions = [];
  let lastKey = undefined;
  do {
    const page = await doc
      .scan({
        TableName: TICKETS_DIST_TABLE,
        ExclusiveStartKey: lastKey,
      })
      .promise();
    allDistributions = allDistributions.concat(page.Items || []);
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  console.log(
    `[releaseOneOrder] Distribuciones escaneadas: ${allDistributions.length} para orden ${orderId}`,
  );

  for (const dist of allDistributions) {
    if (!dist.tickets) continue;
    for (let i = 0; i < dist.tickets.length; i++) {
      const t = dist.tickets[i];
      if (t.orderId === orderId && t.ticketStatus === "RESERVED") {
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

        await deleteReservedQr(t);

        const clave = `${dist.eventId}#${t.category}`;
        contadores[clave] = (contadores[clave] || 0) + 1;
      }
    }
  }

  // 3. Actualizar contadores en Tickets
  let totalLiberados = 0;
  for (const clave in contadores) {
    const [eventId, category] = clave.split("#");
    const ticketsRes = await doc
      .query({
        TableName: TICKETS_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
      })
      .promise();

    if (ticketsRes.Items && ticketsRes.Items.length > 0) {
      const ticketRow = ticketsRes.Items[0];
      const rawBoletaRel = Array.isArray(ticketRow.boletas)
        ? ticketRow.boletas
        : Array.isArray(ticketRow.boleta)
          ? ticketRow.boleta
          : null;
      if (!rawBoletaRel) {
        console.warn(
          `[releaseOneOrder] boletas para evento=${eventId} no es array, omitiendo contadores.`,
        );
        totalLiberados += contadores[clave];
        continue;
      }
      let boleta = [...rawBoletaRel];
      const idx = boleta.findIndex((b) => b.categoria === category);
      if (idx !== -1) {
        boleta[idx].avaliableCapacity = (
          parseInt(boleta[idx].avaliableCapacity, 10) + contadores[clave]
        ).toString();
        boleta[idx].reservedTickets = Math.max(
          parseInt(boleta[idx].reservedTickets, 10) - contadores[clave],
          0,
        ).toString();
      }
      await doc
        .update({
          TableName: TICKETS_TABLE,
          Key: { id: ticketRow.id },
          UpdateExpression: "SET boletas = :newBoleta",
          ExpressionAttributeValues: { ":newBoleta": boleta },
        })
        .promise();
    }
    totalLiberados += contadores[clave];
  }

  // 4. Cancelar la orden
  await doc
    .update({
      TableName: ORDERS_TABLE,
      Key: { order_id: orderId },
      UpdateExpression: "SET payment_status = :cancelled, finalized_at = :now",
      ExpressionAttributeValues: {
        ":cancelled": "CANCELLED",
        ":now": new Date().toISOString(),
      },
    })
    .promise();

  console.log(
    `✅ Orden ${orderId} cancelada y tickets liberados (total: ${totalLiberados})`,
  );
  return { order_id: orderId, released: totalLiberados, status: "CANCELLED" };
};

exports.handler = async (event) => {
  try {
    const body =
      typeof event?.body === "string"
        ? JSON.parse(event.body)
        : event?.body || {};
    const action = body.action || event?.action || event?.detail?.action;

    // Batch mode: ejecutado por schedule periódico (seguridad adicional)
    if (action === "batch_check_all") {
      const now = nowUnix();
      console.log(`🕒 Batch liberación: buscando órdenes expiradas <= ${now}`);
      const expired = [];

      let ExclusiveStartKey = undefined;
      do {
        const scanRes = await doc
          .scan({
            TableName: ORDERS_TABLE,
            ProjectionExpression: "order_id, payment_status, order_ttl",
            ExclusiveStartKey,
          })
          .promise();
        for (const it of scanRes.Items || []) {
          if (
            it.payment_status === "PENDING" &&
            Number(it.order_ttl || 0) <= now
          ) {
            expired.push(it.order_id);
          }
        }
        ExclusiveStartKey = scanRes.LastEvaluatedKey;
      } while (ExclusiveStartKey);

      console.log(`🔍 Órdenes expiradas encontradas: ${expired.length}`);
      const results = [];
      for (const oid of expired) {
        try {
          results.push(await releaseOneOrder(oid));
        } catch (e) {
          console.error(`Error liberando ${oid}:`, e.message);
        }
      }
      const total = results.reduce((s, r) => s + (r.released || 0), 0);
      return buildSuccess("releaseBatch", {
        processedOrders: results.length,
        ticketsLiberados: total,
        results,
      });
    }

    // Modo específico (EventBridge Scheduler o HTTP)
    const orderId =
      event.pathParameters?.orderId ||
      event.detail?.orderId ||
      body.orderId ||
      event.orderId;
    if (!orderId) {
      return buildError("orderId es requerido", "MISSING_ORDER_ID");
    }
    const res = await releaseOneOrder(orderId);
    if (res.status === "NOT_FOUND")
      return buildError(`Orden ${orderId} no encontrada`, "ORDER_NOT_FOUND");
    if (res.status !== "CANCELLED") {
      return buildSuccess("releaseSpecificOrder", {
        message: "Orden ya procesada",
        order_id: orderId,
        status: res.status,
      });
    }
    return buildSuccess("releaseSpecificOrder", {
      message: "Orden expirada: tickets liberados y orden cancelada",
      order_id: orderId,
      ticketsLiberados: res.released,
    });
  } catch (err) {
    console.error("Error liberando orden:", err);
    return buildError(
      "Error al liberar orden expirada",
      "RELEASE_ORDER_FAILED",
      { error: err.message },
    );
  }
};
