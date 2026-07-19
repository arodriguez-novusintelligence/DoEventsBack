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
  const baseOrder = {
    ...order,
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

      if (disableQr) {
        return {
          ...ticket,
          qr_url: "",
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

exports.handler = async (event) => {
  console.log("getOrderList - Event received:", JSON.stringify(event, null, 2));

  try {
    const { userId } = event.pathParameters;
    if (!userId) {
      return {
        statusCode: 400,
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
      const rawStatus = String(order.payment_status || "PENDING").toUpperCase();
      const status = rawStatus === "SOLD" ? "APPROVED" : rawStatus;

      // Solo procesar si el status está en nuestros estados válidos
      if (ordersByStatus[status] !== undefined) {
        if (!ordersByStatus[status][order.event_id]) {
          ordersByStatus[status][order.event_id] = [];
        }
        ordersByStatus[status][order.event_id].push(order);
      }
    });

    console.log("getOrderList - Grouped orders by status and event");

    // 3. Function to get event info and image
    const getEventDetails = async (eventId) => {
      let eventInfo = {};
      try {
        console.log(
          `getOrderList - Fetching event info for eventId: ${eventId}`
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
              6
            )}/${fechaIni.substring(0, 4)}`;
            eventInfo.fechaIni = FechaIni;
          }
        }
      } catch (err) {
        console.error(
          `getOrderList - Error fetching event info for ${eventId}:`,
          err
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
              `getOrderList - No images in array for event: ${event}`
            );
            return imagen;
          }
          imagen = Imagenes[0];

          const getImageUrl = (bucketName, key) => {
            const params = {
              Bucket: bucketName,
              Key: key,
            };
            return s3.getSignedUrl("getObject", params);
          };

          let key;
          const posicionInicial = imagen.indexOf(".com/");
          if (posicionInicial === -1) {
            key = imagen;
          } else {
            key = imagen.substring(imagen.indexOf(".com/") + 5);
          }
          imagen = getImageUrl(S3_BUCKET, key);
          console.log(
            `getOrderList - Generated signed URL for event: ${event}`
          );
        } catch (err) {
          console.error(
            `getOrderList - Error fetching image for event ${event}:`,
            err
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

          // Para PENDING, solo mostrar una orden como objeto, no como array
          if (status === "PENDING") {
            return {
              ...eventDetails,
              order: await sanitizeOrderForResponse(eventOrders[0], {
                disableQr: false,
              }), // Solo tomar la primera orden
            };
          } else {
            return {
              ...eventDetails,
              orders: await Promise.all(
                eventOrders.map((order) =>
                  sanitizeOrderForResponse(order, {
                    disableQr: status !== "APPROVED",
                  }),
                ),
              ),
            };
          }
        })
      );

      result[status] = enrichedEvents.filter(Boolean);
    }

    result.FINISHED = Object.values(finishedEventsMap);

    console.log("getOrderList - Successfully processed orders by status");

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("getOrderList - Unexpected error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};
