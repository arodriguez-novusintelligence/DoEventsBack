/**
 *  createOrder
 * ------------
 *  • Procesa el callback “APPROVED” de la pasarela de pagos.
 *  • Extrae eventId, userID y qty **explícitos** desde pay.metadata
 *    (o desde campos planos pay.eventId / pay.userID / pay.qty).
 *  • Crea la orden en DynamoDB y genera N tickets con un QR PNG cada uno.
 *  • Almacena la trama de pago completa como `payment_data`
 *    pero **NO** la devuelve al front-end.
 */
const AWS   = require('aws-sdk');
const QR    = require('qrcode');           
const { v4: uuidv4 } = require('uuid');

AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();
const s3  = new AWS.S3({ signatureVersion: 'v4' });

/* ---------- Recursos ---------- */
const ORD_TABLE = process.env.ORDERS_TABLE;    
const EV_TABLE  = process.env.EVENTS_TABLE;    
const IMAGE_BUCKET = process.env.IMAGE_BUCKET;    

/* ---------- Helpers ---------- */
const build = (c, b) => ({
  statusCode: c,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(b)
});

/** Carga PNG en S3 y devuelve URL prefirmada 24 h */
async function uploadQrPng(buffer, key) {
  await s3.putObject({
    Bucket: IMAGE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png'
  }).promise();

  return s3.getSignedUrl('getObject', {
    Bucket: IMAGE_BUCKET,
    Key: key,
    Expires: 60 * 60 * 24                
  });
}

exports.handler = async (event) => {
  try {
    /* 1️⃣ Parsear la trama de la pasarela */
    const pay = JSON.parse(event.body || '{}');
    const validStatuses = ['APPROVED', 'DECLINED', 'ERROR', 'PENDING'];
    
    if (!validStatuses.includes(pay.status)) {
      return build(400, { error: 'InvalidStatus', message: 'Estado de pago desconocido' });
    }

    /* 2️⃣ Extraer eventId, userID, qty */
    let { eventId, userID, qty } = pay.metadata || {};
    if (!eventId || !userID) {
      eventId = pay.eventId;
      userID  = pay.userID;
      qty     = pay.qty;
    }
    if (!eventId || !userID) {
      return build(400, { error: 'MissingIds', detail: 'La trama debe incluir eventId y userID' });
    }
    const quantity = parseInt(qty || '1', 10) || 1;

    /* 3️⃣ Consultar el evento */
    const { Item: evento } = await doc.get({
      TableName: EV_TABLE,
      Key: { id: eventId }
    }).promise();
    if (!evento) {
      return build(404, { error: 'NotFound', message: 'Evento no encontrado' });
    }

    const validUntil = evento.end_date || evento.fechaFin || evento.fecha_fin || null;

    /* 4️⃣ Construir la orden con estado de transacción */
    const orderId = uuidv4();
    const now     = new Date().toISOString();

    const orderItem = {
      order_id          : orderId,
      user_id           : userID,
      event_id          : eventId,
      quantity,
      amount_cents      : pay.amount_in_cents,
      currency          : pay.currency,
      transaction_status: pay.status,  // Estado de la transacción
      created_at        : now,
      tickets           : []
    };

    /* 4.1 Generar tickets solo si la transacción fue aprobada */
    if (pay.status === 'APPROVED') {
      for (let i = 0; i < quantity; i++) {
        const ticketId = uuidv4();
        const qrPayload = { eventId, orderId, ticketId, userID, validUntil };

        const pngBuffer = await QR.toBuffer(JSON.stringify(qrPayload), {
          type: 'png',
          width: 400
        });

        const key = `tickets/${orderId}/${ticketId}.png`;
        const url = await uploadQrPng(pngBuffer, key);

        orderItem.tickets.push({
          ticket_id  : ticketId,
          qr_key     : key,
          qr_url     : url,
          valid_until: validUntil
        });
      }
    }

    /* 5️⃣ Guardar la orden en DynamoDB */
    await doc.put({ TableName: ORD_TABLE, Item: orderItem }).promise();

    /* 6️⃣ Respuesta pública sin datos de pago */
    return build(201, orderItem);

  } catch (err) {
    console.error('createOrder error:', err);
    return build(500, { error: 'InternalError', detail: err.message });
  }
};