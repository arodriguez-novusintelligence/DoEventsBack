// src/seats/getSeatDetail.js
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
    const seatId = event.pathParameters.seatId;
    if (!seatId) {
      return build(400, { error: 'MissingParameter', message: 'seatId requerido' });
    }
    // Dado que no hay GSI por seat_id, hacemos un scan con filter (peor rendimiento, solo testing)
    const res = await doc.scan({
      TableName: SEATS_TABLE,
      FilterExpression: 'seat_id = :s',
      ExpressionAttributeValues: { ':s': seatId },
      Limit: 1
    }).promise();
    if (!res.Items.length) {
      return build(404, { error: 'NotFound', message: 'Silla no encontrada' });
    }
    return build(200, res.Items[0]);
  } catch (err) {
    console.error('getSeatDetail error:', err);
    return build(500, { error: 'InternalError', detail: err.message });
  }
};
