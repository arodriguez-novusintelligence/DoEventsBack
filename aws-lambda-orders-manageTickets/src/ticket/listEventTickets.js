const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const eventId = event.pathParameters.eventId;
    if (!eventId) {
      return buildResponse(400, { message: 'eventId es requerido' });
    }
    const res = await doc.query({
      TableName: process.env.TICKETS_TABLE,
      IndexName: 'event_id-status-index',
      KeyConditionExpression: 'event_id = :e',
      ExpressionAttributeValues: { ':e': eventId }
    }).promise();
    return buildResponse(200, res.Items);
  } catch (error) {
    console.error('listEventTickets error:', error);
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