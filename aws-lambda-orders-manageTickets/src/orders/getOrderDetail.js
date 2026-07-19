const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: 'v4' });

const TICKETS_TABLE = process.env.TICKETS_TABLE;
const QR_BUCKET = process.env.IMAGE_BUCKET;

const build = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body, null, 2)
});

function signQr(key) {
  return s3.getSignedUrl('getObject', {
    Bucket: QR_BUCKET,
    Key: key,
    Expires: 60 * 60 * 24 // 24h
  });
}

exports.handler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return build(400, { error: 'MissingParameter', message: 'eventId requerido' });
    }

    const result = await doc.query({
      TableName: TICKETS_TABLE,
      IndexName: 'event_id-status-index',
      KeyConditionExpression: 'event_id = :e AND #status = :s',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':e': eventId,
        ':s': 'CONFIRMED'
      }
    }).promise();

    const tickets = (result.Items || []).map(ticket => {
      const qrKey = ticket.qr_key || `tickets/${ticket.ticket_id}.png`;
      return {
        ...ticket,
        qr_url: signQr(qrKey)
      };
    });

    return build(200, {
      event_id: eventId,
      count: tickets.length,
      tickets
    });

  } catch (err) {
    console.error('getTicketsByEvent error:', err);
    return build(500, {
      error: 'InternalError',
      detail: err.message
    });
  }
};