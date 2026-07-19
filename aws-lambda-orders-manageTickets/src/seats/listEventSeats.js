// src/seats/listEventSeats.js
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
    const eventId = event.pathParameters.eventId;
    if (!eventId) {
      return build(400, { error: 'MissingParameter', message: 'eventId requerido' });
    }
    const res = await doc.query({
      TableName: SEATS_TABLE,
      KeyConditionExpression: 'event_id = :e',
      ExpressionAttributeValues: { ':e': eventId }
    }).promise();
    return build(200, res.Items);
  } catch (err) {
    console.error('listEventSeats error:', err);
    return build(500, { error: 'InternalError', detail: err.message });
  }
};
