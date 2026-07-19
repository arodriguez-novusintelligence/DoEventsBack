const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { qrCode, eventID } = JSON.parse(event.body || '{}');
    if (!qrCode || !eventID) {
      return buildResponse(400, { message: 'qrCode y eventID son requeridos' });
    }
    const res = await doc.query({
      TableName: process.env.TICKETS_TABLE,
      IndexName: 'qr_code-index',
      KeyConditionExpression: 'qr_code = :q',
      ExpressionAttributeValues: { ':q': qrCode }
    }).promise();
    const ticket = res.Items[0];
    if (!ticket || ticket.event_id !== eventID || ticket.status !== 'ACTIVE') {
      return buildResponse(403, { message: 'QR inválido o ticket no activo' });
    }
    return buildResponse(200, { valid: true });
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