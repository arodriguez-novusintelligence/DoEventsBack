const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { ticketID } = JSON.parse(event.body || '{}');
    if (!ticketID) {
      return buildResponse(400, { message: 'ticketID es requerido' });
    }
    const res = await doc.query({
      TableName: process.env.ACCESS_LOGS_TABLE,
      IndexName: 'ticket_id-index',
      KeyConditionExpression: 'ticket_id = :t',
      ExpressionAttributeValues: { ':t': ticketID }
    }).promise();
    return buildResponse(200, res.Items);
  } catch (error) {
    console.error('getAccessLogs error:', error);
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