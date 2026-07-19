const QRCode = require('qrcode');

exports.handler = async (event) => {
  try {
    const { ticketID } = JSON.parse(event.body || '{}');
    if (!ticketID) {
      return buildResponse(400, { message: 'ticketID es requerido' });
    }
    const dataUrl = await QRCode.toDataURL(ticketID);
    return buildResponse(200, { qrCodeUrl: dataUrl });
  } catch (error) {
    console.error('generateQr error:', error);
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