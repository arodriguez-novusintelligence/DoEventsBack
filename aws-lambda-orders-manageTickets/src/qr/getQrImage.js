const { resolveQrUrlByTicketId } = require('../helpers/qrResolver');

exports.handler = async (event) => {
  try {
    const ticketId = event.pathParameters?.ticketId;
    if (!ticketId) {
      return buildResponse(400, { message: 'ticketId es requerido' });
    }

    const qrKey = event.queryStringParameters?.qrKey
      || event.queryStringParameters?.qr_key
      || event.queryStringParameters?.qrCodeKey;

    const url = await resolveQrUrlByTicketId(ticketId, [qrKey].filter(Boolean));
    if (!url) {
      return buildResponse(404, { message: 'QR no encontrado para este ticket' });
    }

    return buildResponse(200, { url, qr_url: url });
  } catch (error) {
    console.error('getQrImage error:', error);
    return buildResponse(500, { message: 'Error interno', detail: error.message });
  }
};

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
