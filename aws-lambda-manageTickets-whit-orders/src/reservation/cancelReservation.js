// src/reservation/cancelReservation.js
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const RES_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
  const build = (c,b) => ({ statusCode:c, headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });
  try {
    const { reservationId } = JSON.parse(event.body || '{}');
    if (!reservationId) return build(400, { error:'MissingParameter', message:'reservationId requerido' });
    await doc.update({
      TableName: RES_TABLE,
      Key: { reservation_id: reservationId },
      UpdateExpression: 'SET #st = :c',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':c': 'CANCELLED' }
    }).promise();
    return build(200, { message:'Reserva cancelada' });
  } catch (err) {
    console.error('cancelReservation error:', err);
    return build(500, { error:'InternalError', detail:err.message });
  }
};
