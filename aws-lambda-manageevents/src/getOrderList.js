const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION });

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: "v4" });

const ORD_TABLE = process.env.ORDERS_TABLE;
const EVENT_TABLE = process.env.EVENTS_TABLE;
const IMAGE_TABLE = process.env.IMAGE_TABLE;
const S3_BUCKET = process.env.IMAGE_BUCKET;
const QR_BUCKET = process.env.QR_BUCKET || process.env.IMAGE_BUCKET;
const QR_SIGN_EXPIRES_SECONDS = 6 * 60 * 60;

const FINISHED_EVENT_STATUSES = new Set([
  "finalizado",
  "finished",
  "ended",
  "terminated",
  "closed",
]);

const resolveEventStatus = (eventItem = {}) => {
  const rawStatus =
    eventItem.estatus ||
    eventItem.status ||
    eventItem.event_status ||
    eventItem.estado ||
    eventItem.estadoEvt ||
    "";
  return String(rawStatus || "").trim();
};

const parseEventDateTime = (fechaRaw, horaRaw) => {
  const fecha = String(fechaRaw || "").trim();
  if (!fecha) return null;

  let year = "";
  let month = "";
  let day = "";

  if (/^\d{8}$/.test(fecha)) {
    const firstFour = Number(fecha.substring(0, 4));
    if (firstFour >= 1900 && firstFour <= 2100) {
      year = fecha.substring(0, 4);
      month = fecha.substring(4, 6);
      day = fecha.substring(6, 8);
    } else {
      day = fecha.substring(0, 2);
      month = fecha.substring(2, 4);
      year = fecha.substring(4, 8);
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    [year, month, day] = fecha.split("-");
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
    const [d, m, y] = fecha.split("/");
    year = y;
    month = m;
    day = d;
  } else {
    return null;
  }

  const hora = String(horaRaw || "23:59:59").trim();
  const horaCompleta = /^\d{2}:\d{2}:\d{2}$/.test(hora)
    ? hora
    : /^\d{2}:\d{2}$/.test(hora)
      ? `${hora}:00`
      : "23:59:59";

  const iso = `${year}-${month}-${day}T${horaCompleta}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isEventFinalized = (eventItem = {}) => {
  const normalizedStatus = resolveEventStatus(eventItem).toLowerCase();
  if (FINISHED_EVENT_STATUSES.has(normalizedStatus)) {
    return true;
  }

  const endDate = parseEventDateTime(
    eventItem.fechaFin || eventItem.fecha_fin,
    eventItem.horaFin || eventItem.hora_fin,
  );

  if (endDate) {
    return endDate.getTime() <= Date.now();
  }

  const startDate = parseEventDateTime(
    eventItem.fechaIni || eventItem.fecha_ini,
    eventItem.horaIni || eventItem.hora_ini || "23:59:59",
  );

  if (!startDate) return false;
  return startDate.getTime() <= Date.now();
};

const extractS3KeyFromUrl = (value) => {
  if (!value || typeof value !== "string") return "";

  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
  } catch (error) {
    const marker = ".com/";
    const index = value.indexOf(marker);
    if (index === -1) return String(value).trim();
    return decodeURIComponent(value.substring(index + marker.length)).trim();
  }
};

const signQrUrl = (key) => {
  if (!key) return "";
  return s3.getSignedUrl("getObject", {
    Bucket: QR_BUCKET,
    Key: key,
    Expires: QR_SIGN_EXPIRES_SECONDS,
  });
};

const qrObjectExists = async (key) => {
  if (!key) return false;

  try {
    await s3
      .headObject({
        Bucket: QR_BUCKET,
        Key: key,
      })
      .promise();
    return true;
  } catch (error) {
    if (
      error?.code === "NotFound" ||
      error?.code === "NoSuchKey" ||
      error?.statusCode === 404
    ) {
      return false;
    }

    throw error;
  }
};

const buildQrKeyCandidates = (order = {}, ticket = {}) => {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (candidate) => {
    const normalized = String(candidate || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  [
    ticket.qr_key,
    ticket.qrKey,
    ticket.qrCodeKey,
    order.qr_key,
    order.qrKey,
    order.qrCodeKey,
  ]
    .filter(Boolean)
    .forEach((value) => {
      const normalized = String(value).trim();
      if (!normalized) return;

      if (normalized.includes("/")) {
        pushCandidate(
          normalized.endsWith(".png") ? normalized : `${normalized}.png`,
        );
        return;
      }

      pushCandidate(`qrs/${normalized}.png`);
      pushCandidate(`tickets/${normalized}.png`);
      pushCandidate(`qr/${normalized}.png`);
    });

  [ticket.qr_url, order.qr_url]
    .map(extractS3KeyFromUrl)
    .filter(Boolean)
    .forEach((value) => {
      pushCandidate(value);
      if (!value.endsWith(".png")) {
        pushCandidate(`${value}.png`);
      }
    });

  [ticket.ticket_id, ticket.ticketInstanceId, ticket.id]
    .filter(Boolean)
    .forEach((value) => {
      const normalized = String(value).trim();
      if (!normalized) return;
      pushCandidate(`qrs/${normalized}.png`);
      pushCandidate(`tickets/${normalized}.png`);
      pushCandidate(`qr/${normalized}.png`);
    });

  return candidates;
};

const isTicketTransferredAway = (ticket = {}, orderUserId) => {
  const status = String(
    ticket.transfer_status || ticket.ticket_status || "",
  ).toUpperCase();
  if (status === "TRANSFERRED") return true;
  const ticketOwner = String(ticket.user_id || "").trim();
  const owner = String(orderUserId || "").trim();
  if (ticketOwner && owner && ticketOwner !== owner) return true;
  return false;
};

const isTicketRefunded = (ticket = {}, order = {}) => {
  const ticketStatus = String(
    ticket.refund_status || ticket.ticket_status || "",
  ).toUpperCase();
  if (
    ticketStatus === "REFUNDED"
    || ticketStatus === "PENDING_REFUND"
    || ticketStatus === "CANCELLED"
    || ticketStatus === "CANCELED"
  ) {
    return true;
  }
  if (ticket.is_refunded === true || ticket.refunded === true) return true;
  // Reembolso total de la orden: todas las boletas quedan inhabilitadas.
  if (order.is_refunded === true) return true;
  const payment = String(order.payment_status || "").toUpperCase();
  if (payment === "REFUNDED") return true;
  return false;
};

const resolveFreshQrUrl = async (order = {}, ticket = {}) => {
  const candidates = buildQrKeyCandidates(order, ticket);

  for (const key of candidates) {
    try {
      if (await qrObjectExists(key)) {
        return signQrUrl(key);
      }
    } catch (error) {
      console.error("getOrderList - Error validating QR object:", {
        orderId: order.order_id,
        ticketId: ticket.ticket_id || ticket.ticketInstanceId || ticket.id,
        key,
        error: error.message,
      });
    }
  }

  return "";
};

const sanitizeOrderForResponse = async (
  order = {},
  { disableQr = false, sourceStatus = undefined } = {},
) => {
  const purchaseDate = (() => {
    const raw = order.created_at || order.order_date || order.metadata?.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  })();

  const baseOrder = {
    ...order,
    display_order_id:
      order.display_order_id
      || order.metadata?.display_order_id
      || order.metadata?.reference
      || null,
    order_date: purchaseDate,
    expired_at_ts: order.expired_at_ts ?? order.expires_at_ts ?? order.order_ttl ?? null,
    expires_at_ts: order.expires_at_ts ?? order.expired_at_ts ?? order.order_ttl ?? null,
    ...(sourceStatus ? { source_status: sourceStatus } : {}),
  };

  if (!Array.isArray(order.tickets) || order.tickets.length === 0) {
    return baseOrder;
  }

  const tickets = await Promise.all(
    order.tickets.map(async (ticket) => {
      if (!ticket || typeof ticket !== "object") {
        return ticket;
      }

      if (
        disableQr
        || isTicketTransferredAway(ticket, order.user_id)
        || isTicketRefunded(ticket, order)
      ) {
        return {
          ...ticket,
          qr_url: "",
          qrCodeKey: ticket.qrCodeKey || null,
          // Normalizar flags para el front aunque el write del refund haya fallado parcialmente.
          ...(isTicketRefunded(ticket, order)
            ? {
                refund_status: ticket.refund_status || "REFUNDED",
                ticket_status: ticket.ticket_status || "REFUNDED",
                is_refunded: true,
              }
            : {}),
        };
      }

      const qrUrl = await resolveFreshQrUrl(order, ticket);
      return {
        ...ticket,
        qr_url: qrUrl,
      };
    }),
  );

  return {
    ...baseOrder,
    tickets,
  };
};

const resolveOrderEventId = (order = {}) =>
  order.event_id
  || order.metadata?.eventId
  || order.metadata?.event_id
  || "unknown";

const resolveOrderBucket = (order = {}) => {
  const raw = String(order.payment_status || "PENDING").toUpperCase();
  if (raw === "SOLD" || raw === "PAID" || raw === "APPROVED") return "APPROVED";
  if (["CANCELLED", "CANCELED", "REFUNDED", "REJECTED", "FAILED", "DECLINED", "ERROR"].includes(raw)) {
    return "CANCELLED";
  }
  if (["FINISHED", "FINALIZED"].includes(raw)) return "FINISHED";
  return "PENDING";
};

exports.handler = async (event) => {
  console.log("getOrderList - Event received:", JSON.stringify(event, null, 2));

  try {
    const { userId } = event.pathParameters;
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    console.log("getOrderList - Processing for userId:", userId);

    // 1. Get ALL orders for user (sin filtro de estatus)
    const orderParams = {
      TableName: ORD_TABLE,
      IndexName: "user_id-created_at-index",
      KeyConditionExpression: "user_id = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    };

    console.log("getOrderList - Querying orders with params:", orderParams);

    let orders;
    try {
      const orderData = await dynamoDb.query(orderParams).promise();
      orders = orderData.Items;
      console.log("getOrderList - Found orders:", orders?.length || 0);
    } catch (err) {
      console.error("getOrderList - Error fetching orders:", err);
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          error: "Error fetching orders",
          details: err.message,
        }),
      };
    }

    if (!orders || orders.length === 0) {
      console.log("getOrderList - No orders found for user");
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({
          APPROVED: [],
          CANCELLED: [],
          PENDING: [],
          FINISHED: [],
        }),
      };
    }

    // 2. Group orders by status and then by event_id
    const ordersByStatus = {
      APPROVED: {},
      CANCELLED: {},
      PENDING: {},
      FINISHED: {},
    };

    orders.forEach((order) => {
      const status = resolveOrderBucket(order);
      const eventId = resolveOrderEventId(order);

      if (!ordersByStatus[status][eventId]) {
        ordersByStatus[status][eventId] = [];
      }
      ordersByStatus[status][eventId].push(order);
    });

    console.log("getOrderList - Grouped orders by status and event");

    // 3. Function to get event info and image
    const getEventDetails = async (eventId) => {
      let eventInfo = {};
      try {
        console.log(
          `getOrderList - Fetching event info for eventId: ${eventId}`,
        );
        const eventRes = await dynamoDb
          .get({
            TableName: EVENT_TABLE,
            Key: { id: eventId },
          })
          .promise();
        if (eventRes.Item) {
          eventInfo.name = eventRes.Item.nombre;
          eventInfo.horaIni = eventRes.Item.horaIni || "";
          eventInfo.status = resolveEventStatus(eventRes.Item);
          eventInfo.finalized = isEventFinalized(eventRes.Item);
          const fechaIni = eventRes.Item.fechaIni;
          if (fechaIni && fechaIni.length >= 8) {
            let FechaIni = "";
            FechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
              4,
              6,
            )}/${fechaIni.substring(0, 4)}`;
            eventInfo.fechaIni = FechaIni;
          }
        }
      } catch (err) {
        console.error(
          `getOrderList - Error fetching event info for ${eventId}:`,
          err,
        );
      }

      // Get event image
      const consultaImagen = async (event) => {
        let imagen = "";
        console.log(`getOrderList - Fetching image for event: ${event}`);
        const paramsImage = {
          TableName: IMAGE_TABLE,
          IndexName: "eventIdIndex",
          KeyConditionExpression: "id_evento = :id_evento",
          ExpressionAttributeValues: {
            ":id_evento": event,
          },
        };

        try {
          const result = await dynamoDb.query(paramsImage).promise();

          if (!result.Items || result.Items.length === 0) {
            console.log(`getOrderList - No images found for event: ${event}`);
            return imagen;
          }
          const Imagenes = result.Items[0].imagenesCargadas;
          if (!Imagenes || Imagenes.length === 0) {
            console.log(
              `getOrderList - No images in array for event: ${event}`,
            );
            return imagen;
          }
          imagen = Imagenes[0];

          const getImageUrl = (bucketName, key) =>
            `https://${bucketName}.s3.amazonaws.com/${key}`;

          let key;
          const posicionInicial = imagen.indexOf(".com/");
          if (posicionInicial === -1) {
            key = imagen;
          } else {
            key = imagen.substring(imagen.indexOf(".com/") + 5);
          }
          imagen = getImageUrl(S3_BUCKET, key);
          console.log(
            `getOrderList - Generated signed URL for event: ${event}`,
          );
        } catch (err) {
          console.error(
            `getOrderList - Error fetching image for event ${event}:`,
            err,
          );
        }
        return imagen;
      };

      const eventImage = await consultaImagen(eventId);

      return {
        event_id: eventId,
        event_name: eventInfo.name || "",
        event_fechaIni: eventInfo.fechaIni || "",
        event_horaIni: eventInfo.horaIni || "",
        event_status: eventInfo.status || "",
        event_finalized: Boolean(eventInfo.finalized),
        event_imagen: eventImage,
      };
    };

    // 4. Process each status
    const result = {
      APPROVED: [],
      CANCELLED: [],
      PENDING: [],
      FINISHED: [],
    };
    const finishedEventsMap = {};

    const appendToFinished = async (eventDetails, eventOrders, sourceStatus) => {
      const key = eventDetails.event_id;
      if (!finishedEventsMap[key]) {
        finishedEventsMap[key] = {
          ...eventDetails,
          orders: [],
        };
      }

      const existingIds = new Set(
        finishedEventsMap[key].orders.map((order) => order.order_id),
      );

      for (const order of eventOrders) {
        if (!existingIds.has(order.order_id)) {
          finishedEventsMap[key].orders.push(
            await sanitizeOrderForResponse(order, {
              disableQr: true,
              sourceStatus,
            }),
          );
          existingIds.add(order.order_id);
        }
      }
    };

    for (const status of Object.keys(ordersByStatus)) {
      const eventsForStatus = ordersByStatus[status];

      if (Object.keys(eventsForStatus).length === 0) {
        continue;
      }

      const enrichedEvents = await Promise.all(
        Object.keys(eventsForStatus).map(async (eventId) => {
          const eventDetails = await getEventDetails(eventId);
          const eventOrders = eventsForStatus[eventId] || [];

          if (eventDetails.event_finalized || status === "FINISHED") {
            await appendToFinished(eventDetails, eventOrders, status);
            return null;
          }

          return {
            ...eventDetails,
            orders: await Promise.all(
              eventOrders.map((order) =>
                sanitizeOrderForResponse(order, {
                  disableQr: false,
                }),
              ),
            ),
          };
        }),
      );

      result[status] = enrichedEvents.filter(Boolean);
    }

    result.FINISHED = Object.values(finishedEventsMap);

    console.log("getOrderList - Successfully processed orders by status");

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("getOrderList - Unexpected error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
