const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async () => {
  try {
    const res = await doc.scan({ TableName: process.env.ACCESS_LOGS_TABLE }).promise();
    const total = res.Items.length;
    return buildResponse(200, { totalAccesses: total });
  } catch (error) {
    console.error('getAccessStats error:', error);
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