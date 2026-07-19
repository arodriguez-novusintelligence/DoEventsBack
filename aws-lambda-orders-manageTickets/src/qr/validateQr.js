const AWS = require('aws-sdk');
const { isAccessControlEnabled } = require('../lib/eventAccessGuard');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const EVENTS_TABLE = process.env.EVENTS_TABLE;
const VALID_STATUSES = new Set(['ACTIVE', 'CONFIRMED']);

exports.handler = async (event) => {
  try {
    const { qrCode, eventID } = JSON.parse(event.body || '{}');
    if (!qrCode || !eventID) {
      return buildResponse(400, { message: 'qrCode y eventID son requeridos' });
    }

    const eventResp = EVENTS_TABLE
      ? await doc.get({ TableName: EVENTS_TABLE, Key: { id: eventID } }).promise()
      : { Item: null };
    const eventInfo = eventResp.Item;
    if (!eventInfo || !isAccessControlEnabled(eventInfo)) {
      return buildResponse(403, {
        message: 'El control de acceso no está disponible para este evento',
        code: 'ACCESS_CONTROL_DISABLED',
      });
    }

    const res = await doc.query({
      TableName: process.env.TICKETS_TABLE,
      IndexName: 'qr_code-index',
      KeyConditionExpression: 'qr_code = :q',
      ExpressionAttributeValues: { ':q': qrCode }
    }).promise();
    const ticket = res.Items[0];
    if (!ticket || ticket.event_id !== eventID) {
      return buildResponse(403, { message: 'QR inválido o ticket no pertenece al evento' });
    }
    if (!VALID_STATUSES.has(String(ticket.status || '').toUpperCase())) {
      return buildResponse(403, { message: 'Ticket no activo para ingreso' });
    }
    return buildResponse(200, {
      valid: true,
      ticket_id: ticket.ticket_id || ticket.id,
      category: ticket.category || '',
      seat_code: ticket.seat_code || null,
    });
  } catch (error) {
    console.error('validateQr error:', error);
    return buildResponse(500, { message: 'Error interno', detail: error.message });
  }
};

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}
