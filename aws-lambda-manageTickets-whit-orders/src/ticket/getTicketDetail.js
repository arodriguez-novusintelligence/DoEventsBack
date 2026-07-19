const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const ticketId = event.pathParameters.ticketId;
    if (!ticketId) {
      return buildResponse(400, { message: 'ticketId es requerido' });
    }
    const { Item } = await doc.get({
      TableName: process.env.TICKETS_TABLE,
      Key: { ticket_id: ticketId }
    }).promise();
    if (!Item) {
      return buildResponse(404, { message: 'Ticket no encontrado' });
    }
    return buildResponse(200, Item);
  } catch (error) {
    console.error('getTicketDetail error:', error);
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