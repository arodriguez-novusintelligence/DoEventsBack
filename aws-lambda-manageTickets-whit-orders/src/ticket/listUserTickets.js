const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const userId = event.pathParameters.userId;
    if (!userId) {
      return buildResponse(400, { message: 'userId es requerido' });
    }
    const res = await doc.query({
      TableName: process.env.TICKETS_TABLE,
      IndexName: 'user_id-created_at-index',
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId }
    }).promise();
    return buildResponse(200, res.Items);
  } catch (error) {
    console.error('listUserTickets error:', error);
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