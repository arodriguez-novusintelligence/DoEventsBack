const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const s3 = new AWS.S3({ signatureVersion: 'v4' });

exports.handler = async (event) => {
  try {
    const ticketId = event.pathParameters.ticketId;
    if (!ticketId) {
      return buildResponse(400, { message: 'ticketId es requerido' });
    }
    const key = `qr/${ticketId}.png`;
    const url = s3.getSignedUrl('getObject', {
      Bucket: process.env.IMAGE_BUCKET,
      Key: key,
      Expires: 60 * 5
    });
    return buildResponse(200, { url });
  } catch (error) {
    console.error('getQrImage error:', error);
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