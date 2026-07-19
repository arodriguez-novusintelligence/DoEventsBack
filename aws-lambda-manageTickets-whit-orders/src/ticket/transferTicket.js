const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { ticketID, newUserID } = JSON.parse(event.body || '{}');
    if (!ticketID || !newUserID) {
      return buildResponse(400, { message: 'ticketID y newUserID son requeridos' });
    }
    await doc.update({
      TableName: process.env.TICKETS_TABLE,
      Key: { ticket_id: ticketID },
      UpdateExpression: 'SET user_id = :u',
      ExpressionAttributeValues: { ':u': newUserID }
    }).promise();
    return buildResponse(200, { message: 'Ticket transferido' });
  } catch (error) {
    console.error('transferTicket error:', error);
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