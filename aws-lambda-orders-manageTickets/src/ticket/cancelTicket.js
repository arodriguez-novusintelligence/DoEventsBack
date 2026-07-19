const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { ticketID } = JSON.parse(event.body || '{}');
    if (!ticketID) {
      return buildResponse(400, { message: 'ticketID es requerido' });
    }
    await doc.update({
    TableName: process.env.TICKETS_TABLE,
    Key: { ticket_id: ticketID },
    UpdateExpression: 'SET #st = :c',
    ExpressionAttributeNames:  { '#st': 'status' },
    ExpressionAttributeValues: { ':c': 'CANCELLED' }
  }).promise();
    return buildResponse(200, { message: 'Ticket cancelado' });
  } catch (error) {
    console.error('cancelTicket error:', error);
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