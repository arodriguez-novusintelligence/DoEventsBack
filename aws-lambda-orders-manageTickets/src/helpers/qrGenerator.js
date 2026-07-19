const AWS = require("aws-sdk");
const QR = require("qrcode");

const s3 = new AWS.S3({ signatureVersion: "v4" });
const doc = new AWS.DynamoDB.DocumentClient();

const IMAGE_BUCKET = process.env.IMAGE_BUCKET;
const CLIENT_TABLE =
  process.env.CLIENT_TABLE ||
  process.env.DYNAMODB_CLIENT_TABLE ||
  "Client";

const resolveTicketId = (ticket = {}) =>
  ticket.ticket_id || ticket.ticketInstanceId || ticket.id || null;

const resolveQrKey = (ticket = {}, userId = null) => {
  const ticketId = resolveTicketId(ticket);
  if (!ticketId) return null;
  if (userId) return `${ticketId}-${userId}`;
  return ticket.qrCodeKey || ticket.qr_key || ticketId;
};

const buildQrPayload = ({
  order = {},
  ticket = {},
  userId = null,
  userDocument = null,
  paymentStatus = "PENDING",
}) => {
  const ticketId = resolveTicketId(ticket);
  const orderId = order.order_id || ticket.order_id || null;
  const eventId = order.event_id || ticket.event_id || null;
  const seat = ticket.seat || ticket.location || null;

  return {
    qrCodeKey: resolveQrKey(ticket, userId),
    ticketInstanceId: ticketId,
    ticket_id: ticketId,
    orderId,
    order_id: orderId,
    eventId,
    event_id: eventId,
    category: ticket.category || null,
    seat,
    seatLabel:
      ticket.seatLabel ||
      seat?.seatLabel ||
      seat?.seatCode ||
      null,
    seatId: ticket.seatId || seat?.seatId || null,
    gate_id: ticket.gate_id || ticket.gateId || null,
    gate_name: ticket.gate_name || ticket.gateName || null,
    user_id: userId || ticket.user_id || order.user_id || null,
    user_document: userDocument || ticket.user_document || null,
    payment_status: paymentStatus,
    reservation_status:
      paymentStatus === "APPROVED" || paymentStatus === "approved"
        ? "CONFIRMED"
        : "RESERVED",
  };
};

const generateSignedQR = async (qrData, qrKey, expiresSeconds = 6 * 60 * 60) => {
  if (!IMAGE_BUCKET || !qrKey) {
    throw new Error("No se pudo generar QR: bucket o clave inválidos");
  }

  const key = `qrs/${qrKey}.png`;
  const buffer = await QR.toBuffer(JSON.stringify(qrData));
  await s3
    .putObject({
      Bucket: IMAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "image/png",
    })
    .promise();

  return s3.getSignedUrl("getObject", {
    Bucket: IMAGE_BUCKET,
    Key: key,
    Expires: expiresSeconds,
  });
};

const deleteQrImage = async (qrKey) => {
  if (!IMAGE_BUCKET || !qrKey) return;
  try {
    await s3
      .deleteObject({
        Bucket: IMAGE_BUCKET,
        Key: `qrs/${qrKey}.png`,
      })
      .promise();
  } catch (error) {
    console.log(`[qrGenerator] No se pudo eliminar QR ${qrKey}: ${error.message}`);
  }
};

const fetchUserDocument = async (userId) => {
  if (!userId) return null;
  try {
    const result = await doc
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
      })
      .promise();
    return result.Item?.documento || result.Item?.document || null;
  } catch (error) {
    console.log(`[qrGenerator] No se pudo leer documento de ${userId}: ${error.message}`);
    return null;
  }
};

const generateTicketQr = async ({
  order = {},
  ticket = {},
  userId = null,
  userDocument = null,
  paymentStatus = "PENDING",
  expiresSeconds = 6 * 60 * 60,
  regenerate = false,
}) => {
  const ownerId = userId || ticket.user_id || order.user_id || null;
  const document =
    userDocument !== null && userDocument !== undefined
      ? userDocument
      : await fetchUserDocument(ownerId);
  const qrKey = resolveQrKey(ticket, ownerId);
  if (!qrKey) return null;

  if (regenerate) {
    await deleteQrImage(ticket.qrCodeKey || resolveTicketId(ticket));
  }

  const payload = buildQrPayload({
    order,
    ticket,
    userId: ownerId,
    userDocument: document,
    paymentStatus,
  });
  const qrUrl = await generateSignedQR(payload, qrKey, expiresSeconds);

  return {
    qr_url: qrUrl,
    qrCodeKey: qrKey,
    user_document: document,
    qr_payload: payload,
  };
};

const resolveRecipientUser = async ({
  newUserID,
  targetEmail,
  targetUsername,
  recipientEmail,
  recipientUser,
}) => {
  if (newUserID) {
    const candidates = [String(newUserID).trim()];
    if (candidates[0].length === 36 && candidates[0].includes("-")) {
      const shortId = candidates[0].substring(0, 10);
      if (shortId !== candidates[0]) candidates.push(shortId);
    }
    for (const key of candidates) {
      const result = await doc
        .get({
          TableName: CLIENT_TABLE,
          Key: { id: key },
        })
        .promise();
      if (result.Item) return result.Item;
    }
  }

  const email = (targetEmail || recipientEmail || "").trim().toLowerCase();
  const username = (targetUsername || recipientUser || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

  const normalizeHandle = (value) =>
    String(value || "").toLowerCase().replace(/[\s@._-]+/g, "");

  const scanForMatch = async (predicate) => {
    let lastEvaluatedKey;
    do {
      const page = await doc
        .scan({
          TableName: CLIENT_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
        })
        .promise();
      const match = (page.Items || []).find(predicate);
      if (match) return match;
      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return null;
  };

  if (email) {
    const byEmail = await scanForMatch(
      (item) => String(item.email || "").trim().toLowerCase() === email,
    );
    if (byEmail) return byEmail;
  }

  if (username) {
    const normalizedTarget = normalizeHandle(username);
    const byUser = await scanForMatch((item) => {
      const storedUser = String(item.user || item.username || "").trim();
      if (!storedUser) return false;
      if (storedUser.toLowerCase() === username) return true;
      return normalizeHandle(storedUser) === normalizedTarget;
    });
    if (byUser) return byUser;
  }

  return null;
};

module.exports = {
  buildQrPayload,
  generateSignedQR,
  deleteQrImage,
  fetchUserDocument,
  generateTicketQr,
  resolveQrKey,
  resolveRecipientUser,
  resolveTicketId,
};
