const AWS = require("aws-sdk");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { buildSuccess, buildError } = require("../helpers/responses");
const { isAccessControlEnabled } = require("../lib/eventAccessGuard");
const {
  deleteQrImage,
  fetchUserDocument,
  generateTicketQr,
  resolveQrKey,
} = require("../helpers/qrGenerator");
const {
  nextDisplayOrderId,
  generateDisplayTicketId,
} = require("../helpers/displayIdHelper");
const { joinUserToEventChat } = require("../helpers/eventChatJoin");

AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: "v4" });
const events = new AWS.EventBridge(); // Para programar liberación
const lambda = new AWS.Lambda();

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const IMAGE_BUCKET = process.env.IMAGE_BUCKET;
const NOTIFICATIONS_API =
  process.env.NOTIFICATIONS_API ||
  (process.env.STAGE === "qa"
    ? "https://api-qa.doeventsapp.com/notifications/trigger-notification"
    : "https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/trigger-notification");
const APP_WEB_URL = String(process.env.WEB_APP_BASE_URL || process.env.APP_WEB_URL || "https://dev.doeventsapp.com").replace(/\/$/, "");
const EVENT_RULE_NAME = "release-expired-orders"; // EventBridge rule
const VENUE_BOOKINGS_TABLE =
  process.env.VENUE_BOOKINGS_TABLE ||
  (process.env.STAGE === "qa" ? "VenueBookings-qa" : "VenueBookings");
const CLIENT_TABLE =
  process.env.CLIENT_TABLE ||
  (process.env.STAGE === "qa" ? "Client-qa" : "Client");
const VENUE_TABLE =
  process.env.VENUE_TABLE ||
  (process.env.STAGE === "qa" ? "Venues-qa" : "Venues-dev");
const SERVICES_TABLE =
  process.env.SERVICES_TABLE ||
  (process.env.STAGE === "qa" ? "ServiceProviders-qa" : "ServiceProviders-dev");

const isVenueRentalOrder = (order = {}) =>
  order.order_type === "VENUE_RENTAL" ||
  order.metadata?.orderType === "VENUE_RENTAL";

const updateVenueBookingStatusByOrderId = async (orderId, status) => {
  if (!VENUE_BOOKINGS_TABLE || !orderId) return null;
  const scan = await doc
    .scan({
      TableName: VENUE_BOOKINGS_TABLE,
      FilterExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
    })
    .promise();
  const booking = (scan.Items || [])[0];
  if (!booking) return null;
  const now = new Date().toISOString();
  await doc
    .update({
      TableName: VENUE_BOOKINGS_TABLE,
      Key: { venueId: booking.venueId, bookingId: booking.bookingId },
      UpdateExpression:
        "SET #status = :status, updatedAt = :ts REMOVE #ttl",
      ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: { ":status": status, ":ts": now },
    })
    .promise();
  return { ...booking, status };
};

const formatDateList = (dates = []) => {
  const list = Array.isArray(dates) ? dates.filter(Boolean) : [];
  if (!list.length) return "";
  const formatted = list.map((date) => {
    const raw = String(date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-");
      return `${d}/${m}/${y}`;
    }
    return raw;
  });
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} - ${formatted[1]}`;
  return `${formatted[0]} - ${formatted[formatted.length - 1]} (${formatted.length} días)`;
};

const fetchVenueRecord = async (venueId) => {
  if (!venueId || !VENUE_TABLE) return null;
  try {
    const result = await doc
      .get({ TableName: VENUE_TABLE, Key: { venue_id: venueId } })
      .promise();
    return result.Item || null;
  } catch (err) {
    console.warn(`[NOTIFY] fetchVenueRecord ${venueId}:`, err.message);
    return null;
  }
};

const fetchServiceRecord = async (serviceId) => {
  if (!serviceId || !SERVICES_TABLE) return null;
  try {
    const result = await doc
      .get({ TableName: SERVICES_TABLE, Key: { serviceId } })
      .promise();
    return result.Item || null;
  } catch (err) {
    console.warn(`[NOTIFY] fetchServiceRecord ${serviceId}:`, err.message);
    return null;
  }
};

const extractEntityImage = (record = {}) => {
  const candidates = [
    record.mainImage,
    record.main_image,
    record.imageUrl,
    record.coverImage,
    record.gallery?.[0],
    ...(String(record.images || "").split(",").filter(Boolean)),
    ...(Array.isArray(record.imageUrls) ? record.imageUrls : []),
  ];
  const first = candidates.find((value) => String(value || "").trim());
  return first ? normalizeImageUrl(first) : "";
};

const normalizeRentalOrderBreakdown = (order = {}, booking = {}, purchaseKind = "venue") => {
  const pricing = booking?.pricing || order.metadata?.pricing || {};
  const meta = order.metadata || {};
  const selectedDates = booking?.selectedDates || meta.selectedDates || [];
  const numDays = Math.max(
    1,
    toNumber(pricing.numDays, 0) || selectedDates.length || 1,
  );
  const items = [];
  let subtotal = 0;

  const reservationValue = toNumber(pricing.reservationValue, 0);
  if (reservationValue > 0) {
    const quantity = purchaseKind === "service" ? 1 : numDays;
    const unitPrice = purchaseKind === "service"
      ? reservationValue
      : Math.round(reservationValue / numDays);
    items.push({
      category: purchaseKind === "service" ? "Reserva del servicio" : "Alquiler del lugar",
      quantity,
      unitPrice,
      subtotal: reservationValue,
      unitPriceFormatted: formatCOP(unitPrice),
      subtotalFormatted: formatCOP(reservationValue),
    });
    subtotal += reservationValue;
  }

  const extraServices = booking?.services
    || booking?.additionalServices
    || meta.services
    || meta.additionalServices
    || [];
  for (const service of extraServices) {
    const unitPrice = toNumber(service.price, 0);
    const quantity = Math.max(1, Number(service.quantity) || 1);
    const lineSubtotal = unitPrice * quantity;
    if (!lineSubtotal) continue;
    items.push({
      category: service.name || "Servicio adicional",
      quantity,
      unitPrice,
      subtotal: lineSubtotal,
      unitPriceFormatted: formatCOP(unitPrice),
      subtotalFormatted: formatCOP(lineSubtotal),
    });
    subtotal += lineSubtotal;
  }

  const serviceFee =
    toNumber(pricing.commission, 0) + toNumber(pricing.commissionIva, 0);
  const total = toNumber(order.total_amount ?? order.amount, subtotal + serviceFee);
  const ticketCount = purchaseKind === "service" ? 1 : numDays;

  return {
    items,
    subtotal,
    serviceFee,
    total,
    subtotalFormatted: formatCOP(subtotal),
    serviceFeeFormatted: formatCOP(serviceFee),
    totalFormatted: formatCOP(total),
    totalTickets: ticketCount,
    ticketCount,
  };
};

const PURCHASE_RECEIPT_COPY = {
  event: {
    entityPanelTitle: "Evento",
    itemLabel: "boletas",
    buyerCtaLabel: "Ver detalle del evento",
    sellerIntro: null,
    purchaseAdvice: [
      "Define un publico objetivo claro y personaliza tu mensaje.",
      "Usa un llamado a la accion irresistible con urgencia.",
      "Aprovecha el poder de las redes sociales para crear expectativa.",
      "Ofrece promociones o descuentos exclusivos por tiempo limitado.",
    ],
  },
  venue: {
    entityPanelTitle: "Lugar",
    itemLabel: "días reservados",
    buyerCtaLabel: "Ver detalle del lugar",
    sellerIntro: null,
    purchaseAdvice: [
      "Mantén actualizado el calendario y precios del lugar.",
      "Responde rápido a nuevas solicitudes de reserva.",
      "Destaca servicios adicionales que agregan valor.",
      "Publica fotos reales y actualizadas del espacio.",
    ],
  },
  service: {
    entityPanelTitle: "Servicio",
    itemLabel: "reservas",
    buyerCtaLabel: "Ver detalle del servicio",
    sellerIntro: null,
    purchaseAdvice: [
      "Confirma disponibilidad y condiciones antes de cada reserva.",
      "Muestra portafolio y reseñas para generar confianza.",
      "Ofrece paquetes claros con precios transparentes.",
      "Responde consultas en menos de 24 horas.",
    ],
  },
};

const sendPurchaseReceiptNotifications = async (
  order = {},
  callbackBody = {},
  {
    purchaseKind = "event",
    booking = {},
    eventData = null,
    orderSummary = null,
    salesSummary = null,
  } = {},
) => {
  const orderId = order.order_id;
  const buyerId = order.user_id;
  if (!orderId || !buyerId) {
    console.log("[NOTIFY] Faltan datos mínimos para comprobante de compra", {
      orderId,
      buyerId,
      purchaseKind,
    });
    return;
  }

  try {
    const buyerRes = await doc.get({ TableName: CLIENT_TABLE, Key: { id: buyerId } }).promise();
    const buyer = buyerRes.Item || {};
    const buyerName =
      [buyer.nombre, buyer.apellido].filter(Boolean).join(" ").trim()
      || buyer.name
      || buyer.username
      || buyer.fullName
      || "Usuario";
    const buyerEmail = extractBuyerEmail(buyer, callbackBody, order);

    let ownerId = null;
    let entityId = "";
    let entityName = "Compra";
    let entityDate = "";
    let entityTime = "";
    let entityLocation = "Ubicación no disponible";
    let entityImage = "";
    let detailLink = APP_WEB_URL;
    let copy = PURCHASE_RECEIPT_COPY[purchaseKind] || PURCHASE_RECEIPT_COPY.event;
    let summary = orderSummary;
    let sales = salesSummary;

    if (purchaseKind === "event") {
      const eventId = order.event_id;
      if (!eventId) {
        console.log("[NOTIFY] Orden de evento sin event_id", { orderId });
        return;
      }
      const eventItem = eventData
        || (eventId
          ? (await doc.get({ TableName: EVENTS_TABLE, Key: { id: eventId } }).promise()).Item
          : null)
        || {};
      ownerId =
        eventItem.userId
        || eventItem.user_id
        || eventItem.createdBy
        || eventItem.ownerId
        || eventItem.organizerId
        || order.metadata?.ownerId
        || order.metadata?.organizerId
        || null;
      entityId = eventId;
      entityName = eventItem.name || eventItem.nombre || eventItem.eventName || "Evento";
      entityDate = formatEmailEventDate(
        eventItem.fechaIni || eventItem.date || eventItem.eventDate || "",
      );
      entityTime = formatEmailEventTime(
        eventItem.horaIni || eventItem.hour || eventItem.eventTime || "",
      );
      entityLocation =
        eventItem.place
        || eventItem.lugar
        || eventItem.address
        || eventItem.location
        || "Ubicación del evento";
      entityImage = normalizeImageUrl(
        eventItem.main_image || eventItem.imagenPrincipal || eventItem.idImagen,
      );
      detailLink = `${APP_WEB_URL}/events/${eventId}`;
      if (!summary) summary = normalizeOrderBreakdown(order);
      if (!sales && eventId) sales = await getEventSalesSummary(eventId);
    } else if (purchaseKind === "venue") {
      const venueId = booking.venueId || order.metadata?.venueId;
      const venue = await fetchVenueRecord(venueId);
      ownerId = booking.ownerUserId || venue?.ownerUserId || venue?.owner_user_id || null;
      entityId = venueId;
      entityName = booking.venueName || order.metadata?.venueName || venue?.name || "Lugar";
      entityDate = formatDateList(booking.selectedDates || order.metadata?.selectedDates || []);
      entityLocation = [venue?.address, venue?.city, venue?.department]
        .filter(Boolean)
        .join(", ")
        || "Ubicación del lugar";
      entityImage = extractEntityImage(venue || {});
      detailLink = `${APP_WEB_URL}/places/${venueId}`;
      summary = normalizeRentalOrderBreakdown(order, booking, "venue");
      sales = {
        soldTickets: summary.ticketCount,
        soldTicketsFormatted: String(summary.ticketCount),
        totalRevenue: summary.total,
        totalRevenueFormatted: summary.totalFormatted,
      };
      copy = {
        ...copy,
        sellerIntro: `${buyerName} reservó tu lugar por ${summary.ticketCount} día(s).`,
      };
    } else if (purchaseKind === "service") {
      const serviceId = booking.serviceId || order.metadata?.serviceId;
      const service = await fetchServiceRecord(serviceId);
      ownerId = booking.providerUserId || service?.userId || null;
      entityId = serviceId;
      entityName = booking.serviceName || order.metadata?.serviceName || service?.name || "Servicio";
      const startDate = booking.startDate || order.metadata?.startDate || "";
      const endDate = booking.endDate || order.metadata?.endDate || "";
      entityDate = formatDateList(
        booking.selectedDates
        || order.metadata?.selectedDates
        || [startDate, endDate].filter(Boolean),
      );
      entityLocation = [service?.city, service?.address, service?.department]
        .filter(Boolean)
        .join(", ")
        || "Ubicación del servicio";
      entityImage = extractEntityImage(service || {});
      detailLink = `${APP_WEB_URL}/services/${serviceId}`;
      summary = normalizeRentalOrderBreakdown(order, booking, "service");
      sales = {
        soldTickets: 1,
        soldTicketsFormatted: "1",
        totalRevenue: summary.total,
        totalRevenueFormatted: summary.totalFormatted,
      };
      copy = {
        ...copy,
        sellerIntro: `${buyerName} reservó tu servicio.`,
      };
    }

    const ownerRes = ownerId
      ? await doc.get({ TableName: CLIENT_TABLE, Key: { id: ownerId } }).promise()
      : { Item: null };
    const owner = ownerRes.Item || {};
    const organizerName =
      [owner.nombre, owner.apellido].filter(Boolean).join(" ").trim()
      || owner.name
      || owner.username
      || owner.fullName
      || "Organizador";
    const organizerEmail = (owner.email || owner.correo || "").trim().toLowerCase();

    let orderReference = order.sale_id || generateSaleId(12);
    if (!order.sale_id) {
      order.sale_id = orderReference;
      try {
        await doc
          .update({
            TableName: ORDERS_TABLE,
            Key: { order_id: orderId },
            UpdateExpression: "SET sale_id = :saleId",
            ExpressionAttributeValues: { ":saleId": orderReference },
          })
          .promise();
      } catch (updateErr) {
        console.log(`[NOTIFY] No se pudo persistir sale_id para ${orderId}: ${updateErr.message}`);
      }
    }

    const gatewayReference = extractGatewayReference(callbackBody, order);
    const sharedMetadata = {
      orderId,
      orderReference,
      gatewayReference,
      purchaseKind,
      entityPanelTitle: copy.entityPanelTitle,
      itemCountLabel: copy.itemLabel,
      detailLink,
      detailCtaLabel: copy.buyerCtaLabel,
      saleIntroText:
        copy.sellerIntro
        || `El usuario ${buyerName} compro ${summary.totalTickets} ${copy.itemLabel} para tu ${copy.entityPanelTitle.toLowerCase()}.`,
      userName: buyerName,
      buyerName,
      buyerEmail,
      buyerUserId: buyerId,
      buyerUsername: buyer.username || buyer.user || "",
      buyerProfileImage: normalizeImageUrl(buyer.fotoPerfilUrl || buyer.profileImageUrl),
      ownerId,
      organizerId: ownerId,
      organizerName,
      organizerEmail,
      organizerUsername: owner.username || owner.user || "",
      eventId: entityId,
      eventName: entityName,
      eventDate: entityDate,
      eventTime: entityTime,
      eventLocation: entityLocation,
      eventImage: entityImage,
      eventLink: detailLink,
      purchasesLink: `${APP_WEB_URL}/purchases`,
      ownerStatsLink:
        purchaseKind === "event" && entityId
          ? `${APP_WEB_URL}/profile/stats?event=${encodeURIComponent(entityId)}&view=ventas`
          : `${APP_WEB_URL}/profile/stats`,
      salesLink: `${APP_WEB_URL}/profile/stats`,
      categoryItems: summary.items,
      subtotal: summary.subtotal,
      subtotalFormatted: summary.subtotalFormatted,
      serviceFee: summary.serviceFee,
      serviceFeeFormatted: summary.serviceFeeFormatted,
      total: summary.total,
      totalFormatted: summary.totalFormatted,
      ticketCount: summary.totalTickets,
      soldTickets: sales?.soldTickets || summary.totalTickets,
      soldTicketsFormatted: sales?.soldTicketsFormatted || String(summary.totalTickets),
      totalRevenue: sales?.totalRevenue || summary.total,
      totalRevenueFormatted: sales?.totalRevenueFormatted || summary.totalFormatted,
      paymentDate: order.finalized_at || new Date().toISOString(),
      purchaseAdvice: copy.purchaseAdvice,
    };

    await postOrderNotification({
      triggerId: "ORDER_PAYMENT_APPROVED_BUYER",
      userId: buyerId,
      channels: ["email", "push", "inApp"],
      metadata: {
        ...sharedMetadata,
        userId: buyerId,
        ...(buyerEmail ? { to: buyerEmail, emails: [buyerEmail] } : {}),
      },
    });

    if (ownerId && ownerId !== buyerId) {
      await postOrderNotification({
        triggerId: "ORDER_NEW_SALE_OWNER",
        userId: ownerId,
        channels: ["email", "push", "inApp"],
        metadata: {
          ...sharedMetadata,
          userId: ownerId,
          ownerId,
          ...(organizerEmail ? { to: organizerEmail, emails: [organizerEmail] } : {}),
        },
      });
    } else if (!ownerId) {
      console.warn(
        `[NOTIFY] Orden ${orderId} (${purchaseKind}) sin ownerId; no se envió comprobante al vendedor`,
      );
    }

    console.log(
      `[NOTIFY] Comprobantes ${purchaseKind} enviados para orden ${orderId}. ownerId=${ownerId || "N/A"}`,
    );
  } catch (error) {
    console.error(
      `[NOTIFY] Error enviando comprobantes ${purchaseKind} para orden ${order.order_id}:`,
      error.message,
    );
  }
};

const sendVenueBookingApprovedNotifications = async (order = {}, booking = {}, callbackBody = {}) => {
  await sendPurchaseReceiptNotifications(order, callbackBody, {
    purchaseKind: "venue",
    booking,
  });
};

const SERVICE_BOOKINGS_TABLE =
  process.env.SERVICE_BOOKINGS_TABLE ||
  (process.env.STAGE === "qa" ? "ServiceBookings-qa" : "ServiceBookings");

const isServiceRentalOrder = (order = {}) =>
  order.order_type === "SERVICE_RENTAL" ||
  order.metadata?.orderType === "SERVICE_RENTAL";

const updateServiceBookingStatusByOrderId = async (orderId, status) => {
  if (!SERVICE_BOOKINGS_TABLE || !orderId) return null;
  const scan = await doc
    .scan({
      TableName: SERVICE_BOOKINGS_TABLE,
      FilterExpression: "orderId = :orderId",
      ExpressionAttributeValues: { ":orderId": orderId },
    })
    .promise();
  const booking = (scan.Items || [])[0];
  if (!booking) return null;
  const now = new Date().toISOString();
  await doc
    .update({
      TableName: SERVICE_BOOKINGS_TABLE,
      Key: { serviceId: booking.serviceId, bookingId: booking.bookingId },
      UpdateExpression: "SET #status = :status, updatedAt = :ts REMOVE #ttl",
      ExpressionAttributeNames: { "#status": "status", "#ttl": "ttl" },
      ExpressionAttributeValues: { ":status": status, ":ts": now },
    })
    .promise();
  return { ...booking, status };
};

const sendServiceBookingApprovedNotifications = async (order = {}, booking = {}, callbackBody = {}) => {
  await sendPurchaseReceiptNotifications(order, callbackBody, {
    purchaseKind: "service",
    booking,
  });
};

const resolveClientDisplayName = async (userId) => {
  if (!userId || !CLIENT_TABLE) return "Un usuario";
  try {
    const result = await doc.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
    const client = result.Item;
    if (!client) return "Un usuario";
    return (
      [client.nombre, client.apellido].filter(Boolean).join(" ").trim()
      || client.name
      || client.user
      || "Un usuario"
    );
  } catch (err) {
    console.warn("[NOTIFY] resolveClientDisplayName failed:", err.message);
    return "Un usuario";
  }
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const formatCOP = (value) => {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(toNumber(value, 0));
  } catch (_) {
    return `$${toNumber(value, 0)}`;
  }
};

const formatEmailEventDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) {
    const y = raw.substring(0, 4);
    const m = raw.substring(4, 6);
    const d = raw.substring(6, 8);
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return raw;
};

const formatEmailEventTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{3,4}$/.test(compact)) {
    const padded = compact.padStart(4, "0");
    const hours = Number(padded.substring(0, 2));
    const minutes = padded.substring(2, 4);
    const suffix = hours >= 12 ? "P. M." : "A. M.";
    const hour12 = hours % 12 || 12;
    return `${String(hour12).padStart(2, "0")}:${minutes} ${suffix}`;
  }
  return raw;
};

const extractBuyerEmail = (buyer = {}, callbackBody = {}, order = {}) => {
  const paymentData = callbackBody.payment_data || order.payment_data || {};
  const paymentMethod = callbackBody.payment_method || order.payment_method || {};
  return (
    buyer.email
    || buyer.correo
    || paymentData.customer_email
    || paymentData.email
    || paymentMethod.email
    || callbackBody.customer_email
    || callbackBody.email
    || ""
  )
    .toString()
    .trim()
    .toLowerCase();
};

const postOrderNotification = async (payload) => {
  const response = await axios.post(NOTIFICATIONS_API, payload, {
    timeout: 15000,
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(response.data || response.statusText)}`,
    );
  }
  return response.data;
};

const normalizeImageUrl = (imageValue) => {
  const raw = String(imageValue || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${IMAGE_BUCKET}.s3.amazonaws.com/${encodeURIComponent(raw)}`;
};

const extractGatewayReference = (callbackBody = {}, order = {}) => {
  const paymentData = callbackBody.payment_data || order.payment_data || {};
  const paymentMethod = callbackBody.payment_method || order.payment_method || {};
  const methodExtra = paymentMethod.extra || {};

  return (
    callbackBody.transactionId ||
    callbackBody.transaction_id ||
    callbackBody.paymentId ||
    callbackBody.payment_id ||
    callbackBody.id ||
    paymentData.external_identifier ||
    paymentData.reference ||
    paymentData.id ||
    methodExtra.external_identifier ||
    order.sale_id ||
    order.reference ||
    order.order_id
  );
};

const normalizeOrderBreakdown = (order = {}) => {
  const tickets = Array.isArray(order.tickets) ? order.tickets : [];
  const grouped = new Map();
  let subtotal = 0;
  let serviceFee = 0;

  for (const ticket of tickets) {
    const category =
      ticket.category || ticket.categoryName || ticket.category_id || "Boleta";
    const unitPrice = toNumber(ticket.price ?? ticket.purchasePrice ?? ticket.ticket_amount, 0);
    const ticketAdditional = sumAdditional(
      ticket.additional_charges || ticket.additionalCharges,
    );

    subtotal += unitPrice;
    serviceFee += ticketAdditional;

    const existing = grouped.get(category) || {
      category,
      quantity: 0,
      unitPrice,
      subtotal: 0,
    };

    existing.quantity += 1;
    existing.unitPrice = unitPrice;
    existing.subtotal += unitPrice;
    grouped.set(category, existing);
  }

  const items = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    unitPriceFormatted: formatCOP(entry.unitPrice),
    subtotalFormatted: formatCOP(entry.subtotal),
  }));

  const total = toNumber(
    order.total_amount ?? order.amount,
    subtotal + serviceFee,
  );

  return {
    items,
    subtotal,
    serviceFee,
    total,
    subtotalFormatted: formatCOP(subtotal),
    serviceFeeFormatted: formatCOP(serviceFee),
    totalFormatted: formatCOP(total),
    totalTickets: tickets.length,
  };
};

const getEventSalesSummary = async (eventId) => {
  const approvedOrders = [];

  try {
    let lastKey;
    do {
      const result = await doc
        .query({
          TableName: ORDERS_TABLE,
          IndexName: "eventIdIndex",
          KeyConditionExpression: "event_id = :eventId",
          FilterExpression: "#paymentStatus = :approved OR #paymentStatus = :approvedLower",
          ExpressionAttributeNames: {
            "#paymentStatus": "payment_status",
          },
          ExpressionAttributeValues: {
            ":eventId": eventId,
            ":approved": "APPROVED",
            ":approvedLower": "approved",
          },
          ExclusiveStartKey: lastKey,
        })
        .promise();

      approvedOrders.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.log(
      `[NOTIFY] eventIdIndex no disponible para resumen de ventas, usando scan fallback: ${error.message}`,
    );

    let lastKey;
    do {
      const result = await doc
        .scan({
          TableName: ORDERS_TABLE,
          FilterExpression:
            "event_id = :eventId AND (#paymentStatus = :approved OR #paymentStatus = :approvedLower)",
          ExpressionAttributeNames: {
            "#paymentStatus": "payment_status",
          },
          ExpressionAttributeValues: {
            ":eventId": eventId,
            ":approved": "APPROVED",
            ":approvedLower": "approved",
          },
          ExclusiveStartKey: lastKey,
        })
        .promise();

      approvedOrders.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  }

  let soldTickets = 0;
  let totalRevenue = 0;
  for (const order of approvedOrders) {
    soldTickets += Array.isArray(order.tickets) ? order.tickets.length : 0;
    totalRevenue += toNumber(order.total_amount ?? order.amount, 0);
  }

  return {
    soldTickets,
    totalRevenue,
    soldTicketsFormatted: String(soldTickets),
    totalRevenueFormatted: formatCOP(totalRevenue),
  };
};

const sendApprovedOrderNotifications = async (updatedOrder = {}, callbackBody = {}) => {
  await sendPurchaseReceiptNotifications(updatedOrder, callbackBody, {
    purchaseKind: "event",
  });
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

// Obtiene la fecha fin del evento (si existe) para calcular expiración del QR
const getEventEndDate = async (eventId) => {
  if (!eventId) return null;
  try {
    const res = await doc
      .get({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
      })
      .promise();
    const evt = res.Item || {};

    if (evt.endDate || evt.end_date || evt.end_time) {
      const rawEnd = evt.endDate || evt.end_date || evt.end_time;
      const parsedEnd = new Date(rawEnd);
      if (!Number.isNaN(parsedEnd.getTime())) {
        return parsedEnd.toISOString();
      }
    }

    const parsedFromFechaFin = parseEventDateTime(
      evt.fechaFin || evt.fecha_fin,
      evt.horaFin || evt.hora_fin,
    );
    if (parsedFromFechaFin) {
      return parsedFromFechaFin.toISOString();
    }

    return null;
  } catch (err) {
    console.error("Error obteniendo evento para expiración QR:", err);
    return null;
  }
};

const calcQrExpirySeconds = (eventEndDate) => {
  // Default: 24h si no hay fecha fin
  const ONE_DAY = 24 * 60 * 60;
  const MAX_EXPIRES = 7 * ONE_DAY; // safety cap
  if (!eventEndDate) return ONE_DAY;
  try {
    const endMs = new Date(eventEndDate).getTime();
    if (Number.isNaN(endMs)) return ONE_DAY;
    const targetMs = endMs + ONE_DAY * 1000;
    const diffSeconds = Math.floor((targetMs - Date.now()) / 1000);
    if (diffSeconds <= 0) return ONE_DAY;
    return Math.min(diffSeconds, MAX_EXPIRES);
  } catch (e) {
    return ONE_DAY;
  }
};

const sumAdditional = (arr) => {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, a) => s + (Number(a.amount ?? a) || 0), 0);
};

const generateSaleId = (length = 12) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let value = "";
  for (let i = 0; i < length; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
};

// Programa la liberación de una orden específica con EventBridge Scheduler
const scheduleOrderRelease = async (orderId, ttlSeconds) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const delaySeconds = ttlSeconds - now;
    if (delaySeconds <= 0) {
      console.warn(`⚠️ TTL ya expiró para orden ${orderId}, no se agenda`);
      return;
    }

    // IMPORTANTE: Validar que el TTL sea exactamente 15 minutos (900 segundos)
    const expectedDelay = 15 * 60; // 900 segundos = 15 minutos
    if (Math.abs(delaySeconds - expectedDelay) > 60) {
      console.warn(
        `⚠️ TTL de orden ${orderId} no es 15 minutos: ${delaySeconds}s (esperado: ${expectedDelay}s)`,
      );
    }

    const fireTime = new Date(ttlSeconds * 1000);
    // EventBridge Scheduler requiere at(yyyy-MM-ddTHH:mm:ss) SIN milisegundos ni zona
    const isoAt = fireTime.toISOString().split('.')[0];
    console.log(
      `📅 Agendando liberación para orden ${orderId} en ${isoAt} (en ${delaySeconds}s = ${Math.round(delaySeconds / 60)}min)`,
    );

    // Usar EventBridge Scheduler para un schedule de una sola vez
    const scheduler = new AWS.Scheduler({ region: process.env.AWS_REGION });
    const scheduleName = `release-order-${orderId}`;
    const accountId = "519010577666"; // mismo de las ARNs presentes en serverless.yml
    const region = process.env.AWS_REGION || "us-east-1";
    const stage = process.env.STAGE || "dev";
    const targetLambdaArn = `arn:aws:lambda:${region}:${accountId}:function:aws-lambda-orders-manageTickets-${stage}-releaseExpiredOrder`;
    const roleArn = `arn:aws:iam::${accountId}:role/SchedulerInvokeReleaseOrderRole`;

    const inputPayload = JSON.stringify({ orderId, reason: "ttl_expired" });

    try {
      // Intentar actualizar si existe
      await scheduler
        .updateSchedule({
          Name: scheduleName,
          FlexibleTimeWindow: { Mode: "OFF" },
          ScheduleExpression: `at(${isoAt})`,
          Target: {
            Arn: targetLambdaArn,
            RoleArn: roleArn,
            Input: inputPayload,
          },
        })
        .promise();
      console.log(`🔁 Schedule actualizado: ${scheduleName}`);
    } catch (e) {
      if (
        e.code === "ResourceNotFoundException" ||
        e.code === "ValidationException"
      ) {
        await scheduler
          .createSchedule({
            Name: scheduleName,
            FlexibleTimeWindow: { Mode: "OFF" },
            ScheduleExpression: `at(${isoAt})`,
            Target: {
              Arn: targetLambdaArn,
              RoleArn: roleArn,
              Input: inputPayload,
            },
          })
          .promise();
        console.log(`[OK] Schedule creado: ${scheduleName}`);
      } else {
        throw e;
      }
    }

    console.log(
      `[OK] Orden ${orderId} programada para liberación automática en TTL`,
    );
  } catch (err) {
    console.error("Error agendando liberación en EventBridge:", err.message);
    // No fallar la orden si hay error en el agendamiento
  }
};

// ====================================
// Lambda: createOrder
// Descripcion: Genera una orden de compra de tickets a partir de una reserva de uno o más boletos para un evento. Es la que asegura que:
//Los boletos existan y estén disponibles.
//Cambia su estado a "reservado" para ese usuario.
//Genera un registro de orden de compra.
//Genera y sube los QR si aplica.
//Deja todo listo para proceder con el pago.
// ====================================

exports.createOrder = async (event) => {
  try {
    // 1. Parsear y validar entrada
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event;
    const metadata = body.metadata || {};

    // Soportar ambos formatos: raíz y metadata
    const eventId =
      body.eventId || body.event_id || metadata.eventId || metadata.event_id;
    const userID =
      body.userID ||
      body.userId ||
      body.user_id ||
      metadata.userID ||
      metadata.userId ||
      metadata.user_id;
    const tickets = body.tickets || metadata.tickets || [];

    const orderID =
      body.reference &&
      typeof body.reference === "string" &&
      body.reference.trim()
        ? body.reference.trim()
        : uuidv4();

    const displayOrderId = await nextDisplayOrderId(doc, ORDERS_TABLE);

    if (
      !eventId ||
      !userID ||
      !Array.isArray(tickets) ||
      tickets.length === 0
    ) {
      console.error("❌ MISSING_PARAMS:", {
        eventId: !!eventId,
        userID: !!userID,
        tickets_array: Array.isArray(tickets),
        tickets_length: tickets.length,
        body_keys: Object.keys(body),
        metadata_keys: Object.keys(metadata),
      });
      return buildError(
        "Faltan parámetros: eventId, userID o tickets.",
        "MISSING_PARAMS",
      );
    }

    const createdAt = new Date().toISOString();
    const reservedTickets = [];
    const contadoresPorCategoria = {};
    const createdAtTs = Math.floor(Date.now() / 1000); // Timestamp de creación en segundos
    const ttl = createdAtTs + 15 * 60; // Expiración: creación + 15 minutos
    let totalTicketAmount = 0;
    let totalAdditionalCharges = 0;

    // Obtener fecha fin para expiración de QR
    const eventEndDate = await getEventEndDate(eventId);
    const qrExpiresSeconds = calcQrExpirySeconds(eventEndDate);
    const holderDocument = await fetchUserDocument(userID);

    const isFlatTickets = tickets.some(
      (t) => t.ticket_id || t.ticketId || t.ticketInstanceId,
    );

    if (isFlatTickets) {
      console.log(
        `\n🎫 Procesando ${tickets.length} ticket(s) individuales...`,
      );

      for (const ticketReq of tickets) {
        const ticketInstanceId =
          ticketReq.ticket_id ||
          ticketReq.ticketId ||
          ticketReq.ticketInstanceId;
        const ticketsDistId =
          ticketReq.ticketsDistId || ticketReq.distributionId;
        const createDate =
          ticketReq.distributionCreateDate ||
          ticketReq.createDate ||
          ticketReq.create_date;
        const category = ticketReq.category;
        const seats = ticketReq.seats || [];

        if (!ticketInstanceId || !ticketsDistId || !createDate) {
          return buildError(
            "Faltan parámetros para el ticket: ticket_id, ticketsDistId, distributionCreateDate",
            "INVALID_TICKET_PARAMS",
          );
        }

        // Leer distribución
        const distRes = await doc
          .get({
            TableName: TICKETS_DIST_TABLE,
            Key: { id: String(ticketsDistId), createDate: String(createDate) },
          })
          .promise();
        const distItem = distRes.Item;
        if (!distItem || !Array.isArray(distItem.tickets)) {
          return buildError(
            `No se encontró TicketsDistribution para id: ${ticketsDistId}`,
            "DIST_NOT_FOUND",
          );
        }

        // Buscar el ticket específico
        const idx = distItem.tickets.findIndex(
          (t) => String(t.ticketInstanceId) === String(ticketInstanceId),
        );
        if (idx === -1) {
          return buildError(
            `El ticket ${ticketInstanceId} no existe en la distribución`,
            "TICKET_NOT_FOUND",
          );
        }
        let t = distItem.tickets[idx];
        const nowSec = Math.floor(Date.now() / 1000);
        const reservationExpiry = Number(t.reservationExpiry || 0);
        const isExpiredReserved =
          t.ticketStatus === "RESERVED" &&
          reservationExpiry > 0 &&
          reservationExpiry <= nowSec;

        if (t.ticketStatus !== "AVAILABLE" && !isExpiredReserved) {
          if (
            t.ticketStatus === "RESERVED" &&
            String(t.ownerId || "") === String(userID) &&
            t.orderId
          ) {
            return buildError(
              `Ya tienes una reserva activa para este ticket. Continúa el pago de la orden ${t.orderId} o espera a que expire.`,
              "TICKET_ALREADY_RESERVED_BY_USER",
            );
          }
          return buildError(
            `El ticket ${ticketInstanceId} no está disponible (status=${t.ticketStatus})`,
            "TICKET_NOT_AVAILABLE",
          );
        }

        if (isExpiredReserved) {
          t = {
            ...t,
            ticketStatus: "AVAILABLE",
            orderId: undefined,
            ownerId: undefined,
            reservationExpiry: undefined,
            qrUrl: undefined,
          };
        }

        // "Sin categoría" es fallback de UI cuando categoryName viene vacío.
        // Comparar literal contra ticket.category (a menudo vacío/null) rompe el checkout.
        if (category) {
          const normalizeCat = (value) => {
            const raw = String(value || "").trim().toLowerCase();
            if (!raw || raw === "sin categoría" || raw === "sin categoria") return "";
            return raw;
          };
          const requested = normalizeCat(category);
          const actual = normalizeCat(t.category || t.categoryName);
          if (requested && actual && requested !== actual) {
            return buildError(
              `El ticket ${ticketInstanceId} no pertenece a la categoría solicitada`,
              "CATEGORY_MISMATCH",
            );
          }
        }

        if (seats && seats.length > 0) {
          const seatLabel = t.location?.seatLabel || "";
          if (!seats.includes(seatLabel)) {
            return buildError(
              `El asiento ${seatLabel} no está en la lista solicitada`,
              "SEAT_NOT_AVAILABLE",
            );
          }
        }

        // Precios
        const price = Number(
          ticketReq.purchasePrice ?? ticketReq.price ?? t.purchasePrice ?? 0,
        );
        const additionalChargesArr = Array.isArray(ticketReq.additionalCharges)
          ? ticketReq.additionalCharges
          : [];
        const additionalAmount = sumAdditional(additionalChargesArr);
        const ticketTotal = price + additionalAmount;

        totalTicketAmount += price;
        totalAdditionalCharges += additionalAmount;

        const qrResult = await generateTicketQr({
          order: { order_id: orderID, event_id: eventId, user_id: userID },
          ticket: {
            ...t,
            ticket_id: ticketInstanceId,
            ticketInstanceId,
            category: t.category,
            seat: t.location || null,
            seatLabel: t.location?.seatLabel || null,
            seatId: t.location?.seatId || null,
          },
          userId: userID,
          userDocument: holderDocument,
          paymentStatus: "PENDING",
          expiresSeconds: qrExpiresSeconds,
        });
        const qrUrl = qrResult?.qr_url || null;
        const qrCodeKey = qrResult?.qrCodeKey || t.qrCodeKey || ticketInstanceId;

        // Actualizar ticket en distribución
        const updatedTicket = {
          ...t,
          ticketStatus: "RESERVED",
          orderId: orderID,
          reservationExpiry: ttl,
          ownerId: userID,
          qrUrl: qrUrl,
          purchasePrice: price,
        };
        const updatedTicketsArray = [...distItem.tickets];
        updatedTicketsArray[idx] = updatedTicket;

        await doc
          .put({
            TableName: TICKETS_DIST_TABLE,
            Item: {
              ...distItem,
              tickets: updatedTicketsArray,
              id: String(distItem.id),
              createDate: String(distItem.createDate),
            },
          })
          .promise();

        // Agregar a resumen
        reservedTickets.push({
          event_id: eventId,
          ticket_id: ticketInstanceId,
          display_ticket_id: generateDisplayTicketId(),
          category: t.category,
          categoryId: t.categoryId || null,
          category_color:
            ticketReq.categoryColor ||
            ticketReq.category_color ||
            t.categoryColor ||
            t.category_color ||
            null,
          gate_id:
            ticketReq.gateId ||
            ticketReq.gate_id ||
            t.gateId ||
            t.gate_id ||
            null,
          gate_name:
            ticketReq.gateName ||
            ticketReq.gate_name ||
            t.gateName ||
            t.gate_name ||
            null,
          seat: t.location || null,
          seatId: t.location?.seatId || null,
          seatLabel: t.location?.seatLabel || null,
          qr_url: qrUrl,
          qrCodeKey,
          user_id: userID,
          user_document: holderDocument || null,
          distributionId: ticketsDistId,
          distributionCreateDate: createDate,
          price: price,
          additional_charges: additionalChargesArr,
          total_amount: ticketTotal,
        });

        contadoresPorCategoria[t.category] =
          (contadoresPorCategoria[t.category] || 0) + 1;
      }
    } else {
      // Flujo legacy agrupado por categoría
      console.log(
        `\n🎫 Procesando ${tickets.length} categoría(s) de tickets...`,
      );
      for (const ticketReq of tickets) {
        const {
          category,
          categoryId,
          quantity,
          seats = [],
          ticketsDistId,
          createDate,
        } = ticketReq;

        if (
          !category ||
          !quantity ||
          quantity < 1 ||
          !ticketsDistId ||
          !createDate
        ) {
          return buildError(
            `Parámetros inválidos en categoría ${category}`,
            "INVALID_CATEGORY_PARAMS",
          );
        }

        const ticketsDistGet = await doc
          .get({
            TableName: TICKETS_DIST_TABLE,
            Key: { id: String(ticketsDistId), createDate: String(createDate) },
          })
          .promise();
        const ticketsDistItem = ticketsDistGet.Item;

        if (!ticketsDistItem || !Array.isArray(ticketsDistItem.tickets)) {
          return buildError(
            `No se encontró TicketsDistribution para id: ${ticketsDistId}`,
            "DIST_NOT_FOUND",
          );
        }

        let disponibles = ticketsDistItem.tickets.filter((ticket) => {
          if (
            ticket.category !== category ||
            ticket.ticketStatus !== "AVAILABLE"
          )
            return false;
          if (!seats || seats.length === 0) return true;
          const seatLabel = ticket.location?.seatLabel || "";
          return seats.includes(seatLabel);
        });

        if (disponibles.length < quantity) {
          return buildError(
            `No hay suficientes boletos disponibles para la categoría ${category}. Solicitados: ${quantity}, Disponibles: ${disponibles.length}`,
            "NOT_ENOUGH_TICKETS",
          );
        }

        if (seats && seats.length > 0 && seats.length !== disponibles.length) {
          const seatsEncontrados = disponibles
            .map((t) => t.location?.seatLabel || "")
            .filter((s) => s);
          const seatsFaltantes = seats.filter(
            (s) => !seatsEncontrados.includes(s),
          );
          return buildError(
            `Algunos asientos solicitados no están disponibles: ${seatsFaltantes.join(", ")}`,
            "SEATS_NOT_AVAILABLE",
          );
        }

        const toReserve = disponibles
          .slice(0, quantity)
          .map((t) => t.ticketInstanceId);

        const updatedTicketsArray = await Promise.all(
          ticketsDistItem.tickets.map(async (ticket) => {
            if (toReserve.includes(ticket.ticketInstanceId)) {
              const qrResult = await generateTicketQr({
                order: { order_id: orderID, event_id: eventId, user_id: userID },
                ticket: {
                  ...ticket,
                  ticket_id: ticket.ticketInstanceId,
                  category: ticket.category,
                  seat: ticket.location || null,
                  seatLabel: ticket.location?.seatLabel || null,
                  seatId: ticket.location?.seatId || null,
                },
                userId: userID,
                userDocument: holderDocument,
                paymentStatus: "PENDING",
                expiresSeconds: qrExpiresSeconds,
              });
              const qrUrl = qrResult?.qr_url || null;
              const qrCodeKey =
                qrResult?.qrCodeKey || ticket.qrCodeKey || ticket.ticketInstanceId;

              const price = Number(ticket.purchasePrice || 0);
              const ticketTotal = price; // sin cargos en modo legacy
              totalTicketAmount += price;

              reservedTickets.push({
                event_id: eventId,
                ticket_id: ticket.ticketInstanceId,
                display_ticket_id: generateDisplayTicketId(),
                category: ticket.category,
                categoryId: ticket.categoryId || categoryId || null,
                seat: ticket.location || null,
                seatId: ticket.location?.seatId || null,
                seatLabel: ticket.location?.seatLabel || null,
                qr_url: qrUrl,
                qrCodeKey,
                user_id: userID,
                user_document: holderDocument || null,
                distributionId: ticketsDistId,
                distributionCreateDate: createDate,
                price: price,
                total_amount: ticketTotal,
              });

              contadoresPorCategoria[category] =
                (contadoresPorCategoria[category] || 0) + 1;

              return {
                ...ticket,
                ticketStatus: "RESERVED",
                orderId: orderID,
                reservationExpiry: ttl,
                ownerId: userID,
                qrUrl: qrUrl,
              };
            }
            return ticket;
          }),
        );

        await doc
          .put({
            TableName: TICKETS_DIST_TABLE,
            Item: {
              ...ticketsDistItem,
              tickets: updatedTicketsArray,
              id: String(ticketsDistItem.id),
              createDate: String(ticketsDistItem.createDate),
            },
          })
          .promise();
      }
    }

    console.log(
      `\n[OK] Total de tickets reservados: ${reservedTickets.length}`,
    );

    // 3. Actualizar la tabla Tickets (contadores)
    const ticketsRes = await doc
      .query({
        TableName: TICKETS_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
      })
      .promise();

    if (!ticketsRes.Items || ticketsRes.Items.length === 0) {
      return buildError(
        "Evento de boletería no encontrado.",
        "TICKETS_EVENT_NOT_FOUND",
      );
    }
    const ticketRow = ticketsRes.Items[0];

    // Usar boletas (campo canónico)
    const rawBoleta = Array.isArray(ticketRow.boletas)
      ? ticketRow.boletas
      : Array.isArray(ticketRow.boleta)
        ? ticketRow.boleta
        : [];

    let boletaActualizada = [...rawBoleta];
    for (const [categoria, cantReservada] of Object.entries(
      contadoresPorCategoria,
    )) {
      const idx = boletaActualizada.findIndex((b) => b.categoria === categoria);
      if (idx !== -1) {
        boletaActualizada[idx].avaliableCapacity = (
          parseInt(boletaActualizada[idx].avaliableCapacity, 10) - cantReservada
        ).toString();
        boletaActualizada[idx].reservedTickets =
          parseInt(boletaActualizada[idx].reservedTickets, 10) + cantReservada;
      }
    }
    await doc
      .update({
        TableName: TICKETS_TABLE,
        Key: { id: ticketRow.id },
        UpdateExpression: "SET boletas = :newBoleta",
        ExpressionAttributeValues: {
          ":newBoleta": boletaActualizada,
        },
      })
      .promise();

    // 4. Crear la orden con el desglose
    const orderItem = {
      order_id: orderID,
      display_order_id: displayOrderId,
      amount:
        body.amount_in_cents ||
        body.amount ||
        totalTicketAmount + totalAdditionalCharges,
      currency: body.currency || "COP",
      created_at: createdAt,
      created_at_ts: createdAtTs, // Unix timestamp de creación en segundos
      expired_at_ts: ttl, // Unix timestamp de expiración en segundos
      finalized_at: null,
      event_id: eventId,
      user_id: userID,
      reference: body.reference,
      metadata,
      payment_status: body.payment_status || "PENDING",
      tickets: reservedTickets,
      total_ticket_amount: totalTicketAmount,
      total_additional_charges: totalAdditionalCharges,
      total_amount: totalTicketAmount + totalAdditionalCharges,
      order_ttl: ttl,
    };

    if (
      !orderItem.order_id ||
      typeof orderItem.order_id !== "string" ||
      !orderItem.order_id.trim()
    ) {
      throw new Error("Falta order_id válido para la clave primaria");
    }

    await doc
      .put({
        TableName: ORDERS_TABLE,
        Item: orderItem,
      })
      .promise();

    console.log(`\n🎉 Orden creada exitosamente: ${orderID}`);
    console.log(`   - Tickets reservados: ${reservedTickets.length}`);
    console.log(
      `   - Categorías afectadas: ${Object.keys(contadoresPorCategoria).join(", ")}`,
    );
    console.log(`   - TTL: ${ttl} (${new Date(ttl * 1000).toISOString()})`);

    // Programar liberación automática en 15 minutos
    await scheduleOrderRelease(orderID, ttl);

    // Notificar al comprador (campana + correo) sobre la reserva de 15 minutos
    try {
      const [buyerRes, eventRes] = await Promise.all([
        doc.get({ TableName: CLIENT_TABLE, Key: { id: userID } }).promise(),
        doc.get({ TableName: EVENTS_TABLE, Key: { id: eventId } }).promise(),
      ]);
      const buyer = buyerRes.Item || {};
      const eventData = eventRes.Item || {};
      const eventName =
        eventData.name || eventData.nombre || eventData.eventName || "Evento";
      const paymentLink = `${APP_WEB_URL}/orders/${encodeURIComponent(orderID)}/confirm`;
      const seatLabels = reservedTickets
        .map((t) => t.seatLabel)
        .filter(Boolean)
        .join(", ");

      await axios.post(NOTIFICATIONS_API, {
        triggerId: "ORDER_TICKET_RESERVED_BUYER",
        userId: userID,
        channels: ["email", "push", "inApp"],
        metadata: {
          userId: userID,
          orderId: orderID,
          orderReference: orderID,
          eventId,
          eventName,
          seatLabels,
          ticketCount: reservedTickets.length,
          totalFormatted: formatCOP(totalTicketAmount + totalAdditionalCharges),
          expiresAt: new Date(ttl * 1000).toISOString(),
          paymentLink,
          deepLink: paymentLink,
          buyerName: buyer.name || buyer.username || "Usuario",
        },
      });
    } catch (notifyErr) {
      console.log(`[NOTIFY] Reserva creada sin notificación: ${notifyErr.message}`);
    }

    // Respuesta con estructura esperada por el frontend para timer de 15 minutos
    const expiresAtDate = new Date(ttl * 1000);
    const response = {
      message: "Orden creada y tickets reservados.",
      order_id: orderID,
      reference: orderID,
      created_at: createdAt,
      created_at_ts: createdAtTs, // Unix timestamp de creación en segundos
      expires_at: expiresAtDate.toISOString(), // ISO string de expiración (created_at + 15 min)
      expires_at_ts: ttl, // Unix timestamp de expiración en segundos
      finalized_at: null,
      payment_status: "PENDING",
      currency: body.currency || "COP",
      amount: body.amount || totalTicketAmount + totalAdditionalCharges,
      total_ticket_amount: totalTicketAmount,
      total_additional_charges: totalAdditionalCharges,
      total_amount: totalTicketAmount + totalAdditionalCharges,
      tickets: reservedTickets.map((t) => ({
        ticket_id: t.ticket_id,
        category: t.category,
        categoryId: t.categoryId,
        seat: t.seat,
        seatLabel: t.seatLabel,
        qr_url: t.qr_url,
        price: t.price,
        additional_charges: t.additional_charges || [],
        total_amount:
          t.total_amount ||
          t.price +
            (Array.isArray(t.additional_charges)
              ? t.additional_charges.reduce((s, a) => s + (a.amount || 0), 0)
              : 0),
      })),
      summary: {
        totalTickets: reservedTickets.length,
        categories: Object.keys(contadoresPorCategoria).map((cat) => ({
          category: cat,
          quantity: contadoresPorCategoria[cat],
        })),
      },
    };

    return buildSuccess("createOrder", response);
  } catch (err) {
    console.error("Error en createOrder:", err);
    return buildError("Error al crear la orden.", "CREATE_ORDER_FAILED", {
      error: err.message,
    });
  }
};

// ====================================
// Lambda: processPaymentCallback
//Lambda encargada de recibir la notificación (callback) de pago exitoso o fallido de una orden, y realizar estas tareas:
//Recibe la notificación de pago
//Valida que exista la orden
//Extrae el reference (el ID de la orden) del payload recibido.
//Busca la orden en DynamoDB. Si no existe, devuelve error.
//Actualiza la información de la orden
//Marca el estado de pago (payment_status) en la orden (ej: APPROVED, REJECTED, PENDING).
//Guarda datos adicionales del pago (ej: método usado, respuesta del gateway).
//Marca la fecha/hora en que se finalizó la orden.
//Confirma los tickets asociados (opcional pero recomendado)
//Busca los tickets que tienen ese orderId y están en estado RESERVED.
//Cambia su estado a CONFIRMED, ya que el pago fue exitoso.
//Devuelve respuesta estándar
//Si todo salió bien: mensaje de éxito, el estado de pago, y cuántos tickets fueron confirmados.
//Si falla algo: devuelve mensaje de error.
// ====================================
exports.processPaymentCallback = async (event) => {
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event;
    const reference = body.reference;
    const paymentStatus = body.status || "UNKNOWN";
    const normalizedPaymentStatus = String(paymentStatus).toUpperCase();

    if (!reference)
      return buildError("Referencia de orden faltante.", "MISSING_REFERENCE");

    console.log(
      `[CALLBACK] Procesando callback de pago para orden ${reference}, status: ${paymentStatus}`,
    );

    // 💡 Usamos order_id como clave primaria, igual que en createOrder
    const result = await doc
      .get({
        TableName: ORDERS_TABLE,
        Key: { order_id: reference },
      })
      .promise();

    if (!result.Item)
      return buildError("Orden no encontrada.", "ORDER_NOT_FOUND");

    const parseBooleanLike = (value) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1;
      const normalized = String(value || "").trim().toLowerCase();
      if (["true", "1", "yes", "si", "sí"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no"].includes(normalized)) {
        return false;
      }
      return undefined;
    };

    const resolvedIsReferred = [
      body.isReferred,
      body.is_referred,
      body.referred,
      body.payment_data?.isReferred,
      body.payment_data?.is_referred,
      body.payment_data?.referred,
      result.Item.isReferred,
    ]
      .map(parseBooleanLike)
      .find((value) => value !== undefined);

    const updatedOrder = {
      ...result.Item,
      payment_status: paymentStatus,
      payment_data: {
        ...(result.Item.payment_data || {}),
        ...(body.payment_data || {}),
      },
      payment_method: {
        ...(result.Item.payment_method || {}),
        ...(body.payment_method || {}),
      },
      finalized_at: new Date().toISOString(),
      ...(body.transactionId ||
      body.transaction_id ||
      body.payment_data?.transactionId ||
      body.payment_data?.transaction_id
        ? {
            transaction_id:
              body.transactionId ||
              body.transaction_id ||
              body.payment_data?.transactionId ||
              body.payment_data?.transaction_id,
          }
        : {}),
      ...(resolvedIsReferred !== undefined
        ? {
            isReferred: resolvedIsReferred,
          }
        : {}),
      ...(normalizedPaymentStatus === "APPROVED"
        ? {
            sale_id: result.Item.sale_id || generateSaleId(12),
          }
        : {}),
    };

    await doc
      .put({
        TableName: ORDERS_TABLE,
        Item: updatedOrder,
      })
      .promise();

    // CRITICO: Si el pago FALLO, liberar las boletas inmediatamente
    const failedStatuses = [
      "REJECTED",
      "FAILED",
      "DECLINED",
      "ERROR",
      "CANCELLED",
    ];
    if (failedStatuses.includes(normalizedPaymentStatus)) {
      console.log(
        `[PAGO FALLIDO] Status: ${paymentStatus}, liberando boletas de orden: ${reference}`,
      );

      if (isVenueRentalOrder(updatedOrder)) {
        await updateVenueBookingStatusByOrderId(reference, "CANCELLED");
        return buildSuccess("processPaymentCallback", {
          message: "Orden de lugar actualizada, reserva cancelada por pago fallido",
          order_id: reference,
          status: updatedOrder.payment_status,
        });
      }

      if (isServiceRentalOrder(updatedOrder)) {
        await updateServiceBookingStatusByOrderId(reference, "CANCELLED");
        return buildSuccess("processPaymentCallback", {
          message: "Orden de servicio actualizada, reserva cancelada por pago fallido",
          order_id: reference,
          status: updatedOrder.payment_status,
        });
      }

      let ticketsLiberados = 0;
      const contadores = {}; // eventId#category -> count

      // Estrategia mejorada: Usar la información de tickets almacenada EN LA ORDEN
      // En vez de scanear miles de distribuciones, accedemos directamente a cada una
      if (!updatedOrder.tickets || updatedOrder.tickets.length === 0) {
        console.log(
          `[WARNING] Orden ${reference} no tiene tickets almacenados`,
        );
      } else {
        console.log(
          `[RELEASE] Liberando ${updatedOrder.tickets.length} tickets de la orden`,
        );

        // Agrupar tickets por distribución para minimizar operaciones DynamoDB
        const ticketsPorDistribucion = {};
        for (const ticket of updatedOrder.tickets) {
          const distKey = `${ticket.distributionId}#${ticket.distributionCreateDate}`;
          if (!ticketsPorDistribucion[distKey]) {
            ticketsPorDistribucion[distKey] = {
              distributionId: ticket.distributionId,
              distributionCreateDate: ticket.distributionCreateDate,
              tickets: [],
            };
          }
          ticketsPorDistribucion[distKey].tickets.push(ticket.ticket_id);
        }

        console.log(
          `[RELEASE] Procesando ${Object.keys(ticketsPorDistribucion).length} distribuciones`,
        );

        // Liberar tickets en cada distribución
        for (const distKey of Object.keys(ticketsPorDistribucion)) {
          const {
            distributionId,
            distributionCreateDate,
            tickets: ticketIds,
          } = ticketsPorDistribucion[distKey];

          try {
            // Obtener la distribución específica (no scan!)
            const distGet = await doc
              .get({
                TableName: TICKETS_DIST_TABLE,
                Key: {
                  id: String(distributionId),
                  createDate: String(distributionCreateDate),
                },
                ConsistentRead: true,
              })
              .promise();

            if (!distGet.Item) {
              console.log(
                `[ERROR] Distribución ${distributionId} no encontrada`,
              );
              continue;
            }

            const dist = distGet.Item;
            console.log(
              `[DIST] Distribución ${distributionId}: ${dist.tickets?.length || 0} tickets totales`,
            );

            // Actualizar tickets de esta distribución
            let liberadosEnDist = 0;
            const updatedTickets = dist.tickets.map((t) => {
              if (
                ticketIds.includes(t.ticketInstanceId) &&
                t.ticketStatus === "RESERVED" &&
                t.orderId === reference
              ) {
                console.log(
                  `[LIBERANDO] ${t.ticketInstanceId} (${t.category || t.categoryName})`,
                );
                liberadosEnDist++;
                ticketsLiberados++;

                const key = `${dist.eventId}#${t.category || t.categoryName}`;
                contadores[key] = (contadores[key] || 0) + 1;

                const qrKey = resolveQrKey(t, t.ownerId || updatedOrder.user_id);
                if (qrKey) {
                  deleteQrImage(qrKey).catch(() => {});
                }
                if (t.qrCodeKey && t.qrCodeKey !== qrKey) {
                  deleteQrImage(t.qrCodeKey).catch(() => {});
                }

                return {
                  ...t,
                  ticketStatus: "AVAILABLE",
                  orderId: null,
                  ownerId: null,
                  reservationExpiry: null,
                  qrUrl: null,
                };
              }
              return t;
            });

            // Guardar solo si hubo cambios
            if (liberadosEnDist > 0) {
              await doc
                .put({
                  TableName: TICKETS_DIST_TABLE,
                  Item: {
                    ...dist,
                    tickets: updatedTickets,
                    id: String(dist.id),
                    createDate: String(dist.createDate),
                  },
                })
                .promise();
              console.log(
                `[OK] ${liberadosEnDist} tickets liberados en distribución ${distributionId}`,
              );
            }
          } catch (err) {
            console.log(
              `[ERROR] Fallo al liberar tickets en distribución ${distributionId}:`,
              err.message,
            );
          }
        }
      }

      // Actualizar contadores en Tickets
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
          const rawBoleta = Array.isArray(ticketRow.boletas)
            ? ticketRow.boletas
            : Array.isArray(ticketRow.boleta)
              ? ticketRow.boleta
              : [];
          let boleta = [...rawBoleta];
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
      }

      console.log(
        `[OK] Pago fallido: ${ticketsLiberados} boletas liberadas para orden ${reference}`,
      );

      return buildSuccess("processPaymentCallback", {
        message: "Orden actualizada, boletas liberadas debido a pago fallido",
        order_id: reference,
        status: updatedOrder.payment_status,
        tickets_released: ticketsLiberados,
      });
    }

    // CRITICO: Si el pago fue APPROVED, actualizar tickets de RESERVED a SOLD
    if (normalizedPaymentStatus === "APPROVED") {
      console.log(
        `[PAGO APROBADO] Status: ${paymentStatus}, confirmando boletas de orden: ${reference}`,
      );

      if (isVenueRentalOrder(updatedOrder)) {
        const booking = await updateVenueBookingStatusByOrderId(reference, "CONFIRMED");
        await sendVenueBookingApprovedNotifications(updatedOrder, booking || {}, body);
        return buildSuccess("processPaymentCallback", {
          message: "Reserva de lugar confirmada",
          order_id: reference,
          status: updatedOrder.payment_status,
          sale_id: updatedOrder.sale_id,
          booking_confirmed: Boolean(booking),
        });
      }

      if (isServiceRentalOrder(updatedOrder)) {
        const booking = await updateServiceBookingStatusByOrderId(reference, "CONFIRMED");
        await sendServiceBookingApprovedNotifications(updatedOrder, booking || {}, body);
        return buildSuccess("processPaymentCallback", {
          message: "Reserva de servicio confirmada",
          order_id: reference,
          status: updatedOrder.payment_status,
          sale_id: updatedOrder.sale_id,
          booking_confirmed: Boolean(booking),
        });
      }

      let ticketsConfirmados = 0;

      if (!updatedOrder.tickets || updatedOrder.tickets.length === 0) {
        console.log(
          `[WARNING] Orden ${reference} no tiene tickets almacenados`,
        );
      } else {
        console.log(
          `[CONFIRM] Confirmando ${updatedOrder.tickets.length} tickets de la orden`,
        );

        // Agrupar tickets por distribución
        const ticketsPorDistribucion = {};
        for (const ticket of updatedOrder.tickets) {
          const distKey = `${ticket.distributionId}#${ticket.distributionCreateDate}`;
          if (!ticketsPorDistribucion[distKey]) {
            ticketsPorDistribucion[distKey] = {
              distributionId: ticket.distributionId,
              distributionCreateDate: ticket.distributionCreateDate,
              tickets: [],
            };
          }
          ticketsPorDistribucion[distKey].tickets.push(ticket.ticket_id);
        }

        console.log(
          `[CONFIRM] Procesando ${Object.keys(ticketsPorDistribucion).length} distribuciones`,
        );

        // Confirmar tickets en cada distribución
        for (const distKey of Object.keys(ticketsPorDistribucion)) {
          const {
            distributionId,
            distributionCreateDate,
            tickets: ticketIds,
          } = ticketsPorDistribucion[distKey];

          try {
            // Obtener la distribución específica
            const distGet = await doc
              .get({
                TableName: TICKETS_DIST_TABLE,
                Key: {
                  id: String(distributionId),
                  createDate: String(distributionCreateDate),
                },
                ConsistentRead: true,
              })
              .promise();

            if (!distGet.Item) {
              console.log(
                `[ERROR] Distribución ${distributionId} no encontrada`,
              );
              continue;
            }

            const dist = distGet.Item;
            console.log(
              `[DIST] Distribución ${distributionId}: ${dist.tickets?.length || 0} tickets totales`,
            );

            // Actualizar tickets de RESERVED a SOLD
            let confirmadosEnDist = 0;
            const updatedTickets = dist.tickets.map((t) => {
              if (
                ticketIds.includes(t.ticketInstanceId) &&
                t.ticketStatus === "RESERVED" &&
                t.orderId === reference
              ) {
                console.log(
                  `[CONFIRMANDO] ${t.ticketInstanceId} (${t.category || t.categoryName}) -> SOLD`,
                );
                confirmadosEnDist++;
                ticketsConfirmados++;

                return {
                  ...t,
                  ticketStatus: "SOLD",
                };
              }
              return t;
            });

            // Guardar solo si hubo cambios
            if (confirmadosEnDist > 0) {
              await doc
                .put({
                  TableName: TICKETS_DIST_TABLE,
                  Item: {
                    ...dist,
                    tickets: updatedTickets,
                    id: String(dist.id),
                    createDate: String(dist.createDate),
                  },
                })
                .promise();
              console.log(
                `[OK] ${confirmadosEnDist} tickets confirmados en distribución ${distributionId}`,
              );
            }
          } catch (err) {
            console.log(
              `[ERROR] Fallo al confirmar tickets en distribución ${distributionId}:`,
              err.message,
            );
          }
        }
      }

      console.log(
        `[OK] Pago aprobado: ${ticketsConfirmados} boletas confirmadas para orden ${reference}`,
      );

      const holderDocument = await fetchUserDocument(updatedOrder.user_id);
      const refreshedTickets = await Promise.all(
        (updatedOrder.tickets || []).map(async (ticket) => {
          try {
            const qrResult = await generateTicketQr({
              order: updatedOrder,
              ticket,
              userId: updatedOrder.user_id,
              userDocument: ticket.user_document || holderDocument,
              paymentStatus: "APPROVED",
              regenerate: true,
            });
            if (!qrResult) return ticket;
            return {
              ...ticket,
              qr_url: qrResult.qr_url,
              qrCodeKey: qrResult.qrCodeKey,
              user_document: qrResult.user_document,
              payment_status: "APPROVED",
            };
          } catch (qrErr) {
            console.log(
              `[QR] No se pudo regenerar QR para ${ticket.ticket_id}: ${qrErr.message}`,
            );
            return ticket;
          }
        }),
      );

      if (refreshedTickets.length > 0) {
        updatedOrder.tickets = refreshedTickets;
        await doc
          .put({
            TableName: ORDERS_TABLE,
            Item: updatedOrder,
          })
          .promise();
      }

      // Unir al usuario al chat del evento automáticamente
      const chatJoinResult = await joinUserToEventChat(
        updatedOrder.event_id,
        updatedOrder.user_id
      );

      console.log(`[CHAT] Resultado de unión al chat:`, chatJoinResult);

      await sendApprovedOrderNotifications(updatedOrder, body);

      return buildSuccess("processPaymentCallback", {
        message: "Orden actualizada y tickets confirmados",
        order_id: reference,
        status: updatedOrder.payment_status,
        sale_id: updatedOrder.sale_id,
        tickets_confirmed: ticketsConfirmados,
        chat_joined: chatJoinResult.success,
      });
    }

    return buildSuccess("processPaymentCallback", {
      message: "Orden actualizada con información del pago",
      order_id: reference,
      status: updatedOrder.payment_status,
    });
  } catch (err) {
    console.error("Error en processPaymentCallback:", err);
    return buildError("Error al procesar el pago.", "PROCESS_PAYMENT_FAILED", {
      error: err.message,
    });
  }
};

// ====================================
// Lambda: scanTicket
// ====================================
exports.scanTicket = async (event) => {
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event;
    const ticketID = body.ticket_id;

    if (!ticketID)
      return buildError("ticket_id es requerido", "MISSING_TICKET_ID");

    const result = await doc
      .get({
        TableName: TICKETS_TABLE,
        Key: { ticket_id: ticketID },
      })
      .promise();

    const ticket = result.Item;

    if (!ticket || ticket.status !== "CONFIRMED") {
      return buildError("Acceso denegado", "INVALID_TICKET", {
        ticket_id: ticketID,
        status: ticket?.status || "NOT_FOUND",
      });
    }

    if (ticket.event_id && EVENTS_TABLE) {
      const eventResp = await doc
        .get({ TableName: EVENTS_TABLE, Key: { id: ticket.event_id } })
        .promise();
      if (!eventResp.Item || !isAccessControlEnabled(eventResp.Item)) {
        return buildError(
          "El control de acceso no está disponible para este evento",
          "ACCESS_CONTROL_DISABLED",
          { event_id: ticket.event_id },
        );
      }
    }

    // Validar silla si aplica
    if (ticket.seat_code) {
      const seatResp = await doc
        .get({
          TableName: SEATS_TABLE,
          Key: {
            event_id: ticket.event_id,
            seat_code: ticket.seat_code,
          },
        })
        .promise();

      const seat = seatResp.Item;

      if (!seat || seat.assigned_to !== ticketID) {
        return buildError(
          "La silla asignada no coincide con el ticket.",
          "SEAT_MISMATCH",
          {
            seat_code: ticket.seat_code,
            assigned_to: seat?.assigned_to || null,
          },
        );
      }
    }

    // Actualizar ticket como usado
    await doc
      .update({
        TableName: TICKETS_TABLE,
        Key: { ticket_id: ticketID },
        UpdateExpression: "SET #s = :used",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":used": "USED" },
      })
      .promise();

    return buildSuccess("scanTicket", {
      message: "Acceso permitido",
      status: "VALID",
      ticket_id: ticketID,
      seat_code: ticket?.seat_code || null,
      access_log_id: `log-${uuidv4()}`,
    });
  } catch (err) {
    console.error("Error en scanTicket:", err);
    return buildError("Error al validar el ticket.", "SCAN_TICKET_FAILED", {
      error: err.message,
    });
  }
};

// ====================================
// Lambda: releaseExpiredTickets
//automatiza la liberación de boletos que fueron reservados pero no pagados a tiempo (es decir, cuya reserva ha expirado). Así, esos boletos vuelven a estar disponibles para que otros usuarios puedan comprarlos o reservarlos. También actualiza los contadores de disponibilidad en la tabla principal de tickets del evento.
// ====================================
// Devuelve UNIX timestamp actual (segundos)
const nowUnix = () => Math.floor(Date.now() / 1000);
exports.releaseExpiredTickets = async (event) => {
  try {
    const now = nowUnix();

    // 1. Scan global con paginación completa (DynamoDB devuelve máx 1MB por llamada)
    let allItems = [];
    let lastKey = undefined;
    do {
      const scanResult = await doc
        .scan({
          TableName: TICKETS_DIST_TABLE,
          ExclusiveStartKey: lastKey,
        })
        .promise();
      allItems = allItems.concat(scanResult.Items || []);
      lastKey = scanResult.LastEvaluatedKey;
    } while (lastKey);

    console.log(
      `[releaseExpiredTickets] Total distribuciones escaneadas: ${allItems.length}`,
    );

    let totalLiberados = 0;
    const contadores = {};
    const ordenesACancelar = new Set();

    for (const item of allItems) {
      if (!item.tickets) continue;

      // 2. Busca todos los tickets RESERVADOS Y EXPIRADOS
      for (let i = 0; i < item.tickets.length; i++) {
        const t = item.tickets[i];
        if (
          t.ticketStatus === "RESERVED" &&
          t.reservationExpiry &&
          t.reservationExpiry < now
        ) {
          // 3. Libera el ticket en la posición i (usando update de elemento array)
          const updateExp = [`tickets[${i}].ticketStatus = :available`];
          const removeExp = [];
          if ("orderId" in t) {
            removeExp.push(`tickets[${i}].orderId`);
            // Guardar order_id para cancelar después
            if (t.orderId) ordenesACancelar.add(t.orderId);
          }
          if ("reservationExpiry" in t)
            removeExp.push(`tickets[${i}].reservationExpiry`);
          if ("ownerId" in t) removeExp.push(`tickets[${i}].ownerId`);
          if ("qrUrl" in t) removeExp.push(`tickets[${i}].qrUrl`);

          await doc
            .update({
              TableName: TICKETS_DIST_TABLE,
              Key: { id: item.id, createDate: item.createDate },
              UpdateExpression: `SET ${updateExp.join(", ")}${removeExp.length ? " REMOVE " + removeExp.join(", ") : ""}`,
              ConditionExpression: `tickets[${i}].ticketStatus = :reserved`,
              ExpressionAttributeValues: {
                ":available": "AVAILABLE",
                ":reserved": "RESERVED",
              },
            })
            .promise();

          // Contador por evento/categoría
          const clave = `${item.eventId}#${t.category}`;
          contadores[clave] = (contadores[clave] || 0) + 1;
          totalLiberados++;

          console.log(
            `[Ticket liberado] dist_id=${item.id} evento=${item.eventId} cat=${t.category} order=${t.orderId}`,
          );
        }
      }
    }

    // 4. Actualiza la tabla agregadora de Tickets para cada evento/categoría
    for (const clave in contadores) {
      const [eventId, category] = clave.split("#");

      // Busca la fila del evento
      const ticketsRes = await doc
        .query({
          TableName: TICKETS_TABLE,
          IndexName: "eventIdIndex", // Cambia esto si tu índice es diferente
          KeyConditionExpression: "eventId = :eventId",
          ExpressionAttributeValues: { ":eventId": eventId },
        })
        .promise();

      if (ticketsRes.Items && ticketsRes.Items.length > 0) {
        const ticketRow = ticketsRes.Items[0];
        const rawBoletaR = Array.isArray(ticketRow.boletas)
          ? ticketRow.boletas
          : Array.isArray(ticketRow.boleta)
            ? ticketRow.boleta
            : null;
        if (!rawBoletaR) {
          console.warn(
            `[Contador] Tickets para evento=${eventId} no tiene boletas en formato array, omitiendo.`,
          );
          continue;
        }
        let boletaActualizada = [...rawBoletaR];
        const idx = boletaActualizada.findIndex(
          (b) => b.categoria === category,
        );
        if (idx !== -1) {
          // Devuelve al pool de disponibles
          boletaActualizada[idx].avaliableCapacity = (
            parseInt(boletaActualizada[idx].avaliableCapacity, 10) +
            contadores[clave]
          ).toString();
          boletaActualizada[idx].reservedTickets = Math.max(
            parseInt(boletaActualizada[idx].reservedTickets, 10) -
              contadores[clave],
            0,
          ).toString();
        }
        await doc
          .update({
            TableName: TICKETS_TABLE,
            Key: { id: ticketRow.id },
            UpdateExpression: "SET boletas = :newBoleta",
            ExpressionAttributeValues: {
              ":newBoleta": boletaActualizada,
            },
          })
          .promise();
        console.log(
          `[Contador actualizado] evento=${eventId} cat=${category} devueltos=${contadores[clave]}`,
        );
      }
    }

    // 5. Cancelar órdenes expiradas
    let ordenesCancel = 0;
    for (const orderId of ordenesACancelar) {
      try {
        const orderRes = await doc
          .get({
            TableName: ORDERS_TABLE,
            Key: { order_id: orderId },
          })
          .promise();

        if (orderRes.Item && orderRes.Item.payment_status === "PENDING") {
          // Actualizar orden a CANCELLED
          await doc
            .update({
              TableName: ORDERS_TABLE,
              Key: { order_id: orderId },
              UpdateExpression:
                "SET payment_status = :cancelled, finalized_at = :now",
              ExpressionAttributeValues: {
                ":cancelled": "CANCELLED",
                ":now": new Date().toISOString(),
              },
            })
            .promise();

          console.log(
            `[Orden cancelada] order_id=${orderId} por expiración de TTL`,
          );
          ordenesCancel++;
        }
      } catch (err) {
        console.error(`Error cancelando orden ${orderId}:`, err.message);
      }
    }

    return {
      message: `Liberados ${totalLiberados} tickets, actualizados contadores y canceladas ${ordenesCancel} órdenes expiradas.`,
      liberados: totalLiberados,
      ordenesCanceladas: ordenesCancel,
    };
  } catch (err) {
    console.error("Error en releaseExpiredTickets:", err);
    return {
      error: true,
      message: "Error al liberar tickets expirados.",
      detail: err.message,
    };
  }
};
