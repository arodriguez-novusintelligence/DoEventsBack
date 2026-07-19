const AWS = require("aws-sdk");
const QR = require("qrcode");
const https = require("https");

AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: "v4" });

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const IMAGE_BUCKET = process.env.IMAGE_BUCKET;

const ONE_DAY_SECONDS = 24 * 60 * 60;
const ONE_DAY_MS = ONE_DAY_SECONDS * 1000;
const MAX_SIGN_SECONDS = 7 * ONE_DAY_SECONDS;
const APPROVED_STATUSES = new Set(["APPROVED", "approved"]);
const TEST_ORDER_ID_REGEX = /^test[-_]/i;

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

const resolveEventEndDate = (eventItem = {}) => {
  const rawCandidates = [eventItem.endDate, eventItem.end_date, eventItem.end_time].filter(Boolean);

  for (const candidate of rawCandidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const parsedFromFechaFin = parseEventDateTime(
    eventItem.fechaFin || eventItem.fecha_fin,
    eventItem.horaFin || eventItem.hora_fin,
  );
  if (parsedFromFechaFin) return parsedFromFechaFin;

  const parsedFromFechaIni = parseEventDateTime(
    eventItem.fechaIni || eventItem.fecha_ini,
    eventItem.horaIni || eventItem.hora_ini,
  );
  return parsedFromFechaIni;
};

const getEventQrValidityLimit = (eventItem) => {
  const endDate = resolveEventEndDate(eventItem);
  if (!endDate) return null;
  return new Date(endDate.getTime() + ONE_DAY_MS);
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const parseUrlExpiryMs = (url) => {
  if (!url || typeof url !== "string") return 0;
  try {
    const parsed = new URL(url);
    const amzDate = parsed.searchParams.get("X-Amz-Date");
    const amzExpires = parsed.searchParams.get("X-Amz-Expires");

    if (amzDate && amzExpires) {
      const match = amzDate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      if (!match) return 0;
      const [, year, month, day, hour, minute, second] = match;
      const signedAt = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      );
      return signedAt + Number(amzExpires) * 1000;
    }

    const v2Expires = parsed.searchParams.get("Expires");
    if (v2Expires) {
      return Number(v2Expires) * 1000;
    }

    return 0;
  } catch (err) {
    return 0;
  }
};

const isQrUrlExpired = (url, graceMs = 5 * 60 * 1000) => {
  const expiryMs = parseUrlExpiryMs(url);
  if (!expiryMs) return true;
  return expiryMs <= Date.now() + graceMs;
};

const resolveQrObjectKey = (ticket) => {
  const candidate = ticket.qrCodeKey || ticket.qr_key || null;

  if (candidate) {
    const normalized = String(candidate).trim();
    if (!normalized) return null;

    if (normalized.includes("/")) {
      return normalized.endsWith(".png") ? normalized : `${normalized}.png`;
    }

    return `qrs/${normalized}.png`;
  }

  if (ticket.qr_url) {
    try {
      const parsed = new URL(ticket.qr_url);
      const keyFromPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
      if (keyFromPath) return keyFromPath;
    } catch (err) {
      // noop
    }
  }

  const fallbackId = ticket.ticket_id || ticket.ticketInstanceId;
  if (!fallbackId) return null;
  return `qrs/${fallbackId}.png`;
};

const signQrUrl = (key, expiresSeconds) =>
  s3.getSignedUrl("getObject", {
    Bucket: IMAGE_BUCKET,
    Key: key,
    Expires: expiresSeconds,
  });

const isSignedQrUrlAccessible = (url) =>
  new Promise((resolve) => {
    if (!url || typeof url !== "string") {
      resolve(false);
      return;
    }

    const request = https.request(
      url,
      {
        method: "GET",
        timeout: 5000,
        headers: {
          Range: "bytes=0-0",
        },
      },
      (response) => {
        resolve(
          (response.statusCode >= 200 && response.statusCode < 300) ||
            response.statusCode === 206,
        );
        response.resume();
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("QR_URL_TIMEOUT"));
    });
    request.on("error", () => resolve(false));
    request.end();
  });

const qrObjectExists = async (key) => {
  if (!key) return false;

  try {
    await s3
      .headObject({
        Bucket: IMAGE_BUCKET,
        Key: key,
      })
      .promise();
    return true;
  } catch (error) {
    if (
      error?.code === "NotFound" ||
      error?.statusCode === 404 ||
      error?.code === "NoSuchKey"
    ) {
      return false;
    }

    throw error;
  }
};

const buildQrPayload = (order = {}, ticket = {}) => {
  const ticketId = ticket.ticket_id || ticket.ticketInstanceId || ticket.id || null;
  const orderId = order.order_id || ticket.order_id || null;
  const eventId = order.event_id || ticket.event_id || null;

  if (!ticketId || !orderId || !eventId) {
    return null;
  }

  return {
    ticket_id: ticketId,
    order_id: orderId,
    event_id: eventId,
    price: Number(
      ticket.price ?? ticket.purchasePrice ?? ticket.ticket_amount ?? 0,
    ) || 0,
    additional_amount: Number(
      ticket.additional_amount ?? ticket.additional_charges_amount ?? 0,
    ) || 0,
  };
};

const regenerateQrObject = async (key, qrPayload) => {
  const buffer = await QR.toBuffer(JSON.stringify(qrPayload));

  await s3
    .putObject({
      Bucket: IMAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    })
    .promise();
};

const scanApprovedOrders = async () => {
  const orders = [];
  let lastEvaluatedKey;

  do {
    const page = await doc
      .scan({
        TableName: ORDERS_TABLE,
        ProjectionExpression: "order_id, event_id, payment_status, tickets",
        FilterExpression: "payment_status = :approvedUpper OR payment_status = :approvedLower",
        ExpressionAttributeValues: {
          ":approvedUpper": "APPROVED",
          ":approvedLower": "approved",
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    orders.push(...(page.Items || []));
    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return orders;
};

const isSchemaBackfillValidationError = (error) =>
  error &&
  error.code === "ValidationException" &&
  String(error.message || "")
    .toLowerCase()
    .includes("schema violation against backfilling index");

const loadEventsMap = async (eventIds) => {
  const eventMap = new Map();
  const keys = [...new Set(eventIds.filter(Boolean))].map((id) => ({ id }));

  for (const chunk of chunkArray(keys, 100)) {
    const data = await doc
      .batchGet({
        RequestItems: {
          [EVENTS_TABLE]: {
            Keys: chunk,
          },
        },
      })
      .promise();

    const items = data.Responses?.[EVENTS_TABLE] || [];
    items.forEach((eventItem) => eventMap.set(eventItem.id, eventItem));
  }

  return eventMap;
};

exports.handler = async () => {
  const stats = {
    scannedOrders: 0,
    candidateOrders: 0,
    updatedOrders: 0,
    refreshedQrs: 0,
    regeneratedMissingObjects: 0,
    skippedNoEvent: 0,
    skippedOutOfWindow: 0,
    skippedNoTickets: 0,
    skippedNoQrKey: 0,
    skippedNoQrPayload: 0,
    skippedStillValid: 0,
    skippedTestOrders: 0,
    skippedSchemaValidation: 0,
    failedOrders: 0,
  };

  try {
    const orders = await scanApprovedOrders();
    stats.scannedOrders = orders.length;

    stats.skippedTestOrders = orders.filter((order) =>
      TEST_ORDER_ID_REGEX.test(String(order.order_id || "")),
    ).length;

    const candidateOrders = orders.filter(
      (order) =>
        APPROVED_STATUSES.has(order.payment_status) &&
        !TEST_ORDER_ID_REGEX.test(String(order.order_id || "")) &&
        Array.isArray(order.tickets) &&
        order.tickets.length > 0,
    );
    stats.candidateOrders = candidateOrders.length;

    if (candidateOrders.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "No hay órdenes APPROVED con tickets para revisar",
          stats,
        }),
      };
    }

    const eventsMap = await loadEventsMap(candidateOrders.map((order) => order.event_id));
    const nowIso = new Date().toISOString();

    for (const order of candidateOrders) {
      try {
        const eventItem = eventsMap.get(order.event_id);
        if (!eventItem) {
          stats.skippedNoEvent++;
          continue;
        }

        const qrValidityLimit = getEventQrValidityLimit(eventItem);
        if (!qrValidityLimit || Date.now() > qrValidityLimit.getTime()) {
          stats.skippedOutOfWindow++;
          continue;
        }

        if (!Array.isArray(order.tickets) || order.tickets.length === 0) {
          stats.skippedNoTickets++;
          continue;
        }

        const expiresSeconds = Math.max(
          60,
          Math.min(
            MAX_SIGN_SECONDS,
            Math.floor((qrValidityLimit.getTime() - Date.now()) / 1000),
          ),
        );

        let refreshedCountForOrder = 0;
        const refreshedTickets = [];

        for (const ticket of order.tickets) {
          const key = resolveQrObjectKey(ticket);
          if (!key) {
            stats.skippedNoQrKey++;
            refreshedTickets.push(ticket);
            continue;
          }

          const urlExpired = isQrUrlExpired(ticket.qr_url);
          const objectExists = await qrObjectExists(key);
          const urlAccessible =
            !urlExpired && objectExists
              ? await isSignedQrUrlAccessible(ticket.qr_url)
              : false;

          if (!urlExpired && objectExists && urlAccessible) {
            stats.skippedStillValid++;
            refreshedTickets.push(ticket);
            continue;
          }

          if (!objectExists) {
            const qrPayload = buildQrPayload(order, ticket);
            if (!qrPayload) {
              stats.skippedNoQrPayload++;
              console.warn(
                `[QR_REFRESH] QR faltante sin payload suficiente para regenerar. order_id=${order.order_id} ticket_id=${ticket.ticket_id || ticket.ticketInstanceId || ticket.id || "unknown"} key=${key}`,
              );
              refreshedTickets.push(ticket);
              continue;
            }

            await regenerateQrObject(key, qrPayload);
            stats.regeneratedMissingObjects++;
            console.log(
              `[QR_REFRESH] QR regenerado. order_id=${order.order_id} ticket_id=${ticket.ticket_id || ticket.ticketInstanceId || ticket.id || "unknown"} key=${key}`,
            );
          }

          refreshedCountForOrder++;
          refreshedTickets.push({
            ...ticket,
            qr_url: signQrUrl(key, expiresSeconds),
            qr_refreshed_at: nowIso,
          });
        }

        if (refreshedCountForOrder === 0) {
          continue;
        }

        await doc
          .update({
            TableName: ORDERS_TABLE,
            Key: { order_id: order.order_id },
            UpdateExpression:
              "SET tickets = :tickets, modified_at = :modifiedAt, qr_last_refreshed_at = :refreshedAt",
            ExpressionAttributeValues: {
              ":tickets": refreshedTickets,
              ":modifiedAt": nowIso,
              ":refreshedAt": nowIso,
            },
          })
          .promise();

        stats.updatedOrders++;
        stats.refreshedQrs += refreshedCountForOrder;
      } catch (orderError) {
        if (isSchemaBackfillValidationError(orderError)) {
          stats.skippedSchemaValidation++;
          console.warn(
            `[QR_REFRESH] Orden omitida por schema/index (${order.order_id})`,
          );
          continue;
        }

        stats.failedOrders++;
        console.error(
          `[QR_REFRESH] Error procesando orden ${order.order_id}:`,
          orderError,
        );
      }
    }

    console.log("[QR_REFRESH] Stats:", JSON.stringify(stats));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Refirma de QR completada",
        stats,
      }),
    };
  } catch (error) {
    console.error("[QR_REFRESH] Error general:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error al refrescar QR de órdenes activas",
        detail: error.message,
        stats,
      }),
    };
  }
};
