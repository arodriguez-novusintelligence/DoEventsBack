const AWS = require("aws-sdk");

const s3 = new AWS.S3({ signatureVersion: "v4" });
const QR_BUCKET = process.env.QR_BUCKET || process.env.IMAGE_BUCKET;
const QR_SIGN_EXPIRES_SECONDS = 6 * 60 * 60;

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
  if (!key || !QR_BUCKET) return "";
  return s3.getSignedUrl("getObject", {
    Bucket: QR_BUCKET,
    Key: key,
    Expires: QR_SIGN_EXPIRES_SECONDS,
  });
};

const qrObjectExists = async (key) => {
  if (!key || !QR_BUCKET) return false;

  try {
    await s3.headObject({ Bucket: QR_BUCKET, Key: key }).promise();
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
      [ticket.user_id, order.user_id]
        .filter(Boolean)
        .forEach((ownerId) => {
          pushCandidate(`qrs/${normalized}-${ownerId}.png`);
        });
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

const resolveFreshQrUrl = async (order = {}, ticket = {}) => {
  const candidates = buildQrKeyCandidates(order, ticket);

  for (const key of candidates) {
    try {
      if (await qrObjectExists(key)) {
        return signQrUrl(key);
      }
    } catch (error) {
      console.error("qrResolver - Error validating QR object:", {
        orderId: order.order_id,
        ticketId: ticket.ticket_id || ticket.ticketInstanceId || ticket.id,
        key,
        error: error.message,
      });
    }
  }

  return "";
};

const resolveQrUrlByTicketId = async (ticketId, extraKeys = []) => {
  const ticket = {
    ticket_id: ticketId,
    ticketInstanceId: ticketId,
    id: ticketId,
  };

  extraKeys
    .filter(Boolean)
    .forEach((key) => {
      ticket.qrCodeKey = ticket.qrCodeKey || key;
      ticket.qr_key = ticket.qr_key || key;
    });

  return resolveFreshQrUrl({}, ticket);
};

const enrichOrderTicketsWithQr = async (order = {}, { disableQr = false } = {}) => {
  if (!Array.isArray(order.tickets) || order.tickets.length === 0) {
    return order;
  }

  const tickets = await Promise.all(
    order.tickets.map(async (ticket) => {
      if (!ticket || typeof ticket !== "object") return ticket;
      if (disableQr) return { ...ticket, qr_url: "" };
      if (isTicketTransferredAway(ticket, order.user_id)) {
        return {
          ...ticket,
          qr_url: "",
          transfer_status: ticket.transfer_status || "TRANSFERRED",
        };
      }

      const existing = String(ticket.qr_url || "").trim();
      if (existing) {
        const key = extractS3KeyFromUrl(existing);
        if (key && (await qrObjectExists(key))) {
          return { ...ticket, qr_url: signQrUrl(key) };
        }
      }

      const qrUrl = await resolveFreshQrUrl(order, ticket);
      return qrUrl ? { ...ticket, qr_url: qrUrl } : ticket;
    }),
  );

  return { ...order, tickets };
};

module.exports = {
  buildQrKeyCandidates,
  isTicketTransferredAway,
  resolveFreshQrUrl,
  resolveQrUrlByTicketId,
  enrichOrderTicketsWithQr,
  signQrUrl,
};
