// src/seats/updateSeatStatus.js
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const SEATS_TABLE = process.env.SEATS_TABLE;

exports.handler = async (event) => {
  const build = (code, body) => ({
    statusCode: code,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  try {
    const { eventID, seatID, newStatus } = JSON.parse(event.body || '{}');
    if (!eventID || !seatID || !newStatus) {
      return build(400, { error: 'MissingParameter', message: 'eventID, seatID y newStatus requeridos' });
    }
    await doc.update({
      TableName: SEATS_TABLE,
      Key: { event_id: eventID, seat_id: seatID },
      UpdateExpression: 'SET #st = :s',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':s': newStatus }
    }).promise();
    return build(200, { message: 'Estado de silla actualizado' });
  } catch (err) {
    console.error('updateSeatStatus error:', err);
    return build(500, { error: 'InternalError', detail: err.message });
  }
};
