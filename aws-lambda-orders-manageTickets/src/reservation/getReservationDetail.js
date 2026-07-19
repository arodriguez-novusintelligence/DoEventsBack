// src/reservation/getReservationDetail.js
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const RES_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
  const build = (c,b) => ({ statusCode:c, headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });
  try {
    const reservationId = event.pathParameters.reservationId;
    if (!reservationId) return build(400, { error:'MissingParameter', message:'reservationId requerido' });
    const { Item } = await doc.get({ TableName: RES_TABLE, Key:{ reservation_id: reservationId }}).promise();
    if (!Item) return build(404, { error:'NotFound', message:'Reserva no encontrada' });
    return build(200, Item);
  } catch (err) {
    console.error('getReservationDetail error:', err);
    return build(500, { error:'InternalError', detail:err.message });
  }
};
