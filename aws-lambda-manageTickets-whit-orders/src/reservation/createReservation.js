// src/reservation/createReservation.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const RES_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
  const build = (c, b) => ({ statusCode: c, headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });

  try {
    const { userID, eventID, seatID } = JSON.parse(event.body || '{}');
    if (!userID || !eventID || !seatID) {
      return build(400, { error:'MissingParameter', message:'userID,eventID,seatID requeridos' });
    }
    const now = new Date().toISOString();
    const reservationId = uuidv4();
    const item = { reservation_id: reservationId, user_id: userID, event_id: eventID, seat_id: seatID, status:'PENDING', created_at: now };
    await doc.put({ TableName: RES_TABLE, Item: item }).promise();
    return build(201, item);
  } catch (err) {
    console.error('createReservation error:', err);
    return build(500, { error:'InternalError', detail:err.message });
  }
};
