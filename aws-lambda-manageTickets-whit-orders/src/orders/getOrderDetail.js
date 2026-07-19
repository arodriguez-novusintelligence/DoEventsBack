/** 
 *  getOrderDetail
 * ---------------
 *  • Busca la orden por order_id.
 *  • Regenera la URL firmada de cada QR (por si la anterior expiró).
 *  • Excluye el campo confidencial payment_data antes de responder.
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();
const s3  = new AWS.S3({ signatureVersion: 'v4' });

const ORD_TABLE    = process.env.ORDERS_TABLE;
const QR_BUCKET    = process.env.IMAGE_BUCKET;
const TICKET_TABLE = process.env.TICKETS_TABLE;

const build = (c, b) => ({
  statusCode: c,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(b)
});

/** Firma de nuevo cada QR (válido 24 h) */
const signQr = (qrKey) => {
  const params = {
    Bucket: QR_BUCKET,
    Key: qrKey,
    Expires: 60 * 60 * 24 // 24 horas
  };
  return s3.getSignedUrl('getObject', params);
};

/** Trae toda la info del ticket desde la tabla */
const getTicketDetail = async (ticket_id) => {
  const result = await doc.get({
    TableName: TICKET_TABLE,
    Key: { ticket_id: ticket_id }
  }).promise();
  return result.Item;
};

exports.handler = async (event) => {
  try {
    const orderId = event.pathParameters?.orderId;
    if (!orderId) {
      return build(400, { error: 'MissingParameter', message: 'orderId requerido' });
    }

    // 1️⃣ Leer la orden
    const { Item } = await doc.get({
      TableName: ORD_TABLE,
      Key: { order_id: orderId }
    }).promise();

    if (!Item) {
      return build(404, { error: 'NotFound', message: 'Orden no encontrada' });
    }

    // 2️⃣ Limpiar payment_data y reemplazar cada ticket con su info completa
    const { payment_data, ...safe } = Item;

    if (Array.isArray(Item.tickets)) {
      safe.tickets = await Promise.all(Item.tickets.map(async ({ ticket_id }) => {
        const fullTicket = await getTicketDetail(ticket_id);
        return {
          ...fullTicket,
          qr_url: fullTicket?.qr_url ? signQr(fullTicket.qr_url) : null
        };
      }));
    }

    return build(200, safe);

  } catch (err) {
    console.error('getOrderDetail error:', err);
    return build(500, { error: 'InternalError', detail: err.message });
  }
};