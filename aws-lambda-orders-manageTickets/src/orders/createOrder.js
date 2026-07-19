const AWS = require("aws-sdk");
const QR = require("qrcode");
const { v4: uuidv4 } = require("uuid");

AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: "v4" });

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const IMAGE_BUCKET = process.env.IMAGE_BUCKET;
const TTL_MINUTES = 15; // TTL de 15 minutos para reservas

const buildResponse = (code, body) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body, null, 2),
});

// Sube el QR a S3 y devuelve una URL firmada válida hasta 1 día después del fin del evento
const uploadQR = async (ticketID, qrData, eventEndDate) => {
  const key = `tickets/${ticketID}.png`;
  const buffer = await QR.toBuffer(JSON.stringify(qrData));

  await s3
    .putObject({
      Bucket: IMAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    })
    .promise();

  // Calcular expiración: hasta 1 día después de eventEndDate. Si no se provee, usar 24 horas desde ahora.
  let expiresSeconds = 24 * 60 * 60; // default 1 day
  try {
    if (eventEndDate) {
      const endMs = new Date(eventEndDate).getTime();
      const targetMs = endMs + 24 * 60 * 60 * 1000; // 1 day after event end
      const nowMs = Date.now();
      const diffSeconds = Math.floor((targetMs - nowMs) / 1000);
      if (diffSeconds > 0) expiresSeconds = diffSeconds;
    }
  } catch (e) {
    // si falla el parseo, mantenemos el default
  }

  // S3 signed URL max TTL (v4) puede tener limitaciones; cap a 7 dias por seguridad
  const MAX_EXPIRES = 7 * 24 * 60 * 60;
  if (expiresSeconds > MAX_EXPIRES) expiresSeconds = MAX_EXPIRES;

  // Generar URL firmada para GET
  const signedUrl = s3.getSignedUrl("getObject", {
    Bucket: IMAGE_BUCKET,
    Key: key,
    Expires: expiresSeconds,
  });

  return signedUrl;
};

exports.handler = async (event) => {
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event;
    const metadata = body.metadata || {};

    // Aceptar eventId/userId/userId en múltiples formatos (snake_case, camelCase) y ubicaciones (root, metadata)
    const eventId = body.event_id || body.eventId || metadata.eventId;
    const userID =
      body.user_id ||
      body.userId ||
      body.userID ||
      metadata.userID ||
      metadata.userId;
    const qty = metadata.qty || 1;
    const orderID = body.reference || uuidv4();

    if (!eventId || !userID) {
      return buildResponse(400, {
        message:
          "Faltan parámetros requeridos: eventId (event_id/eventId) y userId (user_id/userId/userID)",
        debug: {
          eventId,
          userID,
          body_keys: Object.keys(body),
          metadata_keys: Object.keys(metadata),
        },
      });
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const ttl = Math.floor(now.getTime() / 1000) + TTL_MINUTES * 60; // TTL en segundos
    const created_at_ts = now.getTime(); // Timestamp en milisegundos
    const expired_at_ts = created_at_ts + TTL_MINUTES * 60 * 1000; // Timestamp de expiración en milisegundos

    // Resolver isReferred: determina si el comprador conoce al creador del evento
    // true = "Conozco al creador (Pago Directo)", false = "No conozco al creador (Plataforma)"
    const parseBooleanLike = (value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1;
      const normalized = String(value || "").trim().toLowerCase();
      if (["true", "1", "yes", "si", "sí"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
      return undefined;
    };
    const resolvedIsReferred = [
      body.isReferred,
      body.is_referred,
      body.referred,
      metadata.isReferred,
      metadata.is_referred,
    ]
      .map(parseBooleanLike)
      .find((v) => v !== undefined);

    const tickets = [];
    const writes = [];

    // Support detailed ticket metadata: metadata.ticketsDetails = [{ seatId, categoryId, price, additionalCharges, venueLocation, seatLabel, section, row }]
    // Also accept grouped tickets by category: metadata.tickets = [{ category, quantity, selectedSeats: [...] }]
    // New: accept top-level tickets array (structure documented en ORDER_CREATION_API_GUIDE)
    let ticketDetails = null;

    if (Array.isArray(body.tickets) && body.tickets.length > 0) {
      ticketDetails = body.tickets.map((t) => ({
        ticketId: t.ticket_id || t.ticketId || t.ticketInstanceId || null,
        ticketsDistId: t.ticketsDistId || t.distributionId || null,
        distributionCreateDate:
          t.distributionCreateDate || t.createDate || t.create_date || null,
        price:
          typeof t.purchasePrice !== "undefined"
            ? Number(t.purchasePrice)
            : typeof t.price !== "undefined"
              ? Number(t.price)
              : null,
        categoryId: t.category_id || t.categoryId || null,
        category: t.category || null,
        categoryColor: t.categoryColor || t.category_color || null,
        gateId: t.gateId || t.gate_id || null,
        gateName: t.gateName || t.gate_name || null,
        seatId: t.seat_id || t.seatId || null,
        seatLabel:
          t.seatLabel ||
          (t.location && (t.location.seatLabel || t.location.seat_label)) ||
          null,
        row: t.row || (t.location && t.location.row) || null,
        colNumber: t.colNumber || (t.location && t.location.number) || null,
        additionalCharges: Array.isArray(t.additionalCharges)
          ? t.additionalCharges
          : [],
      }));

      // VALIDACIÓN: Si se proporcionan ticket_ids, verificar que no estén ya en uso (PENDING, SOLD, RESERVED)
      const ticketIdsToCheck = ticketDetails
        .filter((t) => t.ticketId)
        .map((t) => t.ticketId);
      if (ticketIdsToCheck.length > 0) {
        console.log(
          `🔍 Validando ${ticketIdsToCheck.length} tickets existentes...`,
        );

        for (const ticketId of ticketIdsToCheck) {
          try {
            const existingTicket = await doc
              .get({
                TableName: TICKETS_TABLE,
                Key: { id: ticketId },
              })
              .promise();

            if (existingTicket.Item) {
              const status = existingTicket.Item.status;
              console.log(`   - Ticket ${ticketId}: status = ${status}`);

              if (
                status === "PENDING" ||
                status === "SOLD" ||
                status === "RESERVED" ||
                status === "APPROVED"
              ) {
                return buildResponse(400, {
                  message: `El ticket ${ticketId} ya está en uso y no puede ser comprado nuevamente.`,
                  ticket_id: ticketId,
                  current_status: status,
                  order_id: existingTicket.Item.order_id || null,
                });
              }
            }
          } catch (err) {
            console.error(`Error validando ticket ${ticketId}:`, err);
            // Continuar si el ticket no existe (se creará nuevo)
          }
        }
        console.log(`✅ Todos los tickets están disponibles para procesar`);
      }
    }

    // If no top-level tickets, fallback to metadata.ticketsDetails
    if (
      !ticketDetails &&
      Array.isArray(metadata.ticketsDetails) &&
      metadata.ticketsDetails.length > 0
    ) {
      ticketDetails = metadata.ticketsDetails;
    }

    // If grouped tickets provided, map to ticketDetails (when ticketDetails was not provided)
    if (
      !ticketDetails &&
      Array.isArray(metadata.tickets) &&
      metadata.tickets.length > 0
    ) {
      const grouped = metadata.tickets;
      // Count total quantity
      let totalQty = 0;
      grouped.forEach((g) => {
        const q =
          Number(g.quantity) ||
          (Array.isArray(g.selectedSeats) ? g.selectedSeats.length : 0);
        totalQty += q;
      });

      // If client provided orderTotals.total_ticket_amount, use it to derive per-ticket base price when specific prices are missing
      const providedTotals = metadata.orderTotals || {};
      const providedTicketTotal = Number(
        providedTotals.total_ticket_amount || 0,
      );
      const avgPrice =
        totalQty > 0 ? Math.round(providedTicketTotal / totalQty) : 0;

      ticketDetails = [];
      grouped.forEach((group) => {
        const cat = group.category || group.categoryId || null;
        const seats = Array.isArray(group.selectedSeats)
          ? group.selectedSeats
          : [];
        const qty = Number(group.quantity) || seats.length || 0;

        if (seats.length > 0) {
          seats.forEach((seat) => {
            ticketDetails.push({
              seatId: seat.seatId || seat.id || null,
              seat_label: seat.seatCode || seat.seat_label || null,
              row: seat.rowLabel || seat.row || null,
              colNumber: seat.colNumber || seat.col_number || null,
              categoryId: cat,
              categoryColor:
                group.categoryColor ||
                group.category_color ||
                seat.categoryColor ||
                null,
              gateId: group.gateId || group.gate_id || seat.gateId || null,
              gateName:
                group.gateName || group.gate_name || seat.gateName || null,
              price:
                typeof seat.price !== "undefined"
                  ? Number(seat.price)
                  : typeof group.price !== "undefined"
                    ? Number(group.price)
                    : avgPrice,
              additionalCharges: Array.isArray(seat.additionalCharges)
                ? seat.additionalCharges
                : Array.isArray(group.additionalCharges)
                  ? group.additionalCharges
                  : [],
            });
          });
        } else {
          // create anonymous seats if no selectedSeats provided
          for (let i = 0; i < qty; i++) {
            ticketDetails.push({
              seatId: null,
              seat_label: null,
              row: null,
              colNumber: null,
              categoryId: cat,
              categoryColor:
                group.categoryColor || group.category_color || null,
              gateId: group.gateId || group.gate_id || null,
              gateName: group.gateName || group.gate_name || null,
              price:
                typeof group.price !== "undefined"
                  ? Number(group.price)
                  : avgPrice,
              additionalCharges: Array.isArray(group.additionalCharges)
                ? group.additionalCharges
                : [],
            });
          }
        }
      });
    }

    // Totales acumulados
    let totalTicketAmount = 0;
    let totalAdditionalCharges = 0;

    const effectiveQty = ticketDetails ? ticketDetails.length : qty;

    for (let i = 0; i < effectiveQty; i++) {
      const ticketID = uuidv4();

      // Determinar info por ticket
      const detail = ticketDetails ? ticketDetails[i] : {};
      const price =
        (detail && (Number(detail.price) || 0)) ||
        (metadata.defaultPrice ? Number(metadata.defaultPrice) : 0);
      const additionalChargesArr =
        detail && Array.isArray(detail.additionalCharges)
          ? detail.additionalCharges
          : metadata.additionalChargesPerTicket || [];
      const additionalAmount = additionalChargesArr.reduce(
        (s, a) => s + (Number(a.amount || a) || 0),
        0,
      );
      const ticketTotal = price + additionalAmount;

      totalTicketAmount += price;
      totalAdditionalCharges += additionalAmount;

      const qrPayload = {
        ticket_id: ticketID,
        order_id: orderID,
        event_id: eventId,
        price: price,
        additional_amount: additionalAmount,
      };

      // Use event end date if provided in metadata to set signed url expiry
      const eventEndDate =
        metadata.eventEndDate || metadata.event_end_date || null;
      const qrUrl = await uploadQR(ticketID, qrPayload, eventEndDate);

      const ticketItem = {
        id: ticketID, // DynamoDB partition key
        ticket_id: ticketID, // Mantener para compatibilidad con código existente
        event_id: eventId,
        user_id: userID,
        order_id: orderID,
        created_at: createdAt,
        qr_url: qrUrl,
        status: "RESERVED",
        ttl, // para que expire automáticamente en 15 minutos
        // pricing breakdown
        ticket_amount: price,
        additional_charges: additionalChargesArr,
        additional_charges_amount: additionalAmount,
        total_amount: ticketTotal,
        // seat / venue info
        seat_id:
          detail && detail.seatId
            ? detail.seatId
            : detail && detail.seat_id
              ? detail.seat_id
              : null,
        category_id:
          detail && detail.categoryId
            ? detail.categoryId
            : detail && detail.category_id
              ? detail.category_id
              : null,
        category_color:
          detail && detail.categoryColor
            ? detail.categoryColor
            : detail && detail.category_color
              ? detail.category_color
              : null,
        gate_id:
          detail && detail.gateId
            ? detail.gateId
            : detail && detail.gate_id
              ? detail.gate_id
              : null,
        gate_name:
          detail && detail.gateName
            ? detail.gateName
            : detail && detail.gate_name
              ? detail.gate_name
              : null,
        seat_label:
          detail && detail.seatLabel
            ? detail.seatLabel
            : detail && detail.seat_label
              ? detail.seat_label
              : null,
        section: detail && detail.section ? detail.section : null,
        row: detail && detail.row ? detail.row : null,
        venue_location:
          detail && detail.venueLocation
            ? detail.venueLocation
            : metadata.venueLocation || null,
      };

      tickets.push(ticketItem);
      writes.push({ PutRequest: { Item: ticketItem } });
    }

    // Guardar tickets por lotes (máximo 25 por operación)
    while (writes.length) {
      const batch = writes.splice(0, 25);
      await doc
        .batchWrite({
          RequestItems: { [TICKETS_TABLE]: batch },
        })
        .promise();
    }

    // VALIDAR totales proporcionados por el cliente (requerido) con fallback a body.amount
    let providedTotals = metadata.orderTotals || body.orderTotals || null;
    if (!providedTotals) {
      providedTotals = {
        total_ticket_amount: totalTicketAmount,
        total_additional_charges: totalAdditionalCharges,
        total_amount:
          typeof body.amount !== "undefined"
            ? Number(body.amount)
            : totalTicketAmount + totalAdditionalCharges,
      };
    }
    if (
      typeof providedTotals.total_ticket_amount === "undefined" ||
      typeof providedTotals.total_additional_charges === "undefined" ||
      typeof providedTotals.total_amount === "undefined"
    ) {
      return buildResponse(400, {
        message:
          "Se requieren totales: total_ticket_amount, total_additional_charges, total_amount",
      });
    }

    const pTicket = Number(providedTotals.total_ticket_amount || 0);
    const pAdd = Number(providedTotals.total_additional_charges || 0);
    const pTotal = Number(providedTotals.total_amount || 0);
    const calcTotal =
      Number(totalTicketAmount || 0) + Number(totalAdditionalCharges || 0);

    // Allow small rounding tolerance (1 cent)
    const TOLERANCE = 1;
    if (
      Math.abs(pTicket - Number(totalTicketAmount)) > TOLERANCE ||
      Math.abs(pAdd - Number(totalAdditionalCharges)) > TOLERANCE ||
      Math.abs(pTotal - calcTotal) > TOLERANCE
    ) {
      return buildResponse(400, {
        message: "Totales enviados no coinciden con los cálculos del servidor",
        provided: {
          total_ticket_amount: pTicket,
          total_additional_charges: pAdd,
          total_amount: pTotal,
        },
        computed: {
          total_ticket_amount: totalTicketAmount,
          total_additional_charges: totalAdditionalCharges,
          total_amount: calcTotal,
        },
      });
    }

    // Crear la orden sin los detalles finales del pago (estado inicial: PENDING)
    const orderItem = {
      order_id: orderID,
      created_at: body.created_at || createdAt,
      created_at_ts: created_at_ts, // Timestamp en milisegundos
      expired_at_ts: expired_at_ts, // Timestamp de expiración en milisegundos
      status: "PENDING",
      event_id: eventId,
      user_id: userID,
      metadata: metadata,
      // Include buyer email and hasSeating indicator
      hasSeating: Boolean(metadata.hasSeating || false),
      customer_email: body.customer_email || metadata.customer_email || null,
      tickets: tickets.map((t) => ({
        ticket_id: t.ticket_id,
        qr_url: t.qr_url,
        ticket_amount: t.ticket_amount,
        additional_charges_amount: t.additional_charges_amount,
        total_amount: t.total_amount,
        seat_id: t.seat_id,
        category_id: t.category_id,
        category_color: t.category_color,
        gate_id: t.gate_id,
        gate_name: t.gate_name,
      })),
      // Totales de la orden
      total_ticket_amount: totalTicketAmount,
      total_additional_charges: totalAdditionalCharges,
      total_amount: totalTicketAmount + totalAdditionalCharges,
      // Modalidad de pago: true = "Conozco al creador (Pago Directo)", false = "No conozco al creador"
      ...(resolvedIsReferred !== undefined ? { isReferred: resolvedIsReferred } : {}),
    };

    console.log(
      "🔍 Intentando guardar en Orders table:",
      JSON.stringify(
        {
          TableName: ORDERS_TABLE,
          order_id: orderItem.order_id,
          created_at: orderItem.created_at,
        },
        null,
        2,
      ),
    );

    await doc
      .put({
        TableName: ORDERS_TABLE,
        Item: orderItem,
      })
      .promise();

    return buildResponse(200, {
      message: "Orden registrada y boletos reservados temporalmente.",
      order_id: orderID,
      tickets,
    });
  } catch (err) {
    console.error("Error al procesar createOrder:", err);
    return buildResponse(500, {
      message: "Error interno al crear la orden.",
      error: err.message,
    });
  }
};
