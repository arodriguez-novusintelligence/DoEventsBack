// src/reservation/extendReservation.js
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const RES_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
  const build = (c,b) => ({ statusCode:c, headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });
  try {
    const { reservationId, extraMinutes } = JSON.parse(event.body||'{}');
    if (!reservationId || !extraMinutes) {
      return build(400, { error:'MissingParameter', message:'reservationId y extraMinutes requeridos' });
    }
    const now = new Date().toISOString();
    await doc.update({
      TableName: RES_TABLE,
      Key: { reservation_id: reservationId },
      UpdateExpression: 'SET extended_at = :e',
      ExpressionAttributeValues: { ':e': now }
    }).promise();
    return build(200, { message:'Reserva extendida', extended_at: now });
  } catch (err) {
    console.error('extendReservation error:', err);
    return build(500, { error:'InternalError', detail:err.message });
  }
};
