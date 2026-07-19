const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost'];

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || [
  'http://localhost:5173',
  'http://localhost:5001',
  ...CAPACITOR_ORIGINS,
  'https://qa.doeventsapp.com',
  'https://doeventsapp.com',
  'https://www.doeventsapp.com',
].join(',')).split(',').map((o) => o.trim());

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };
}

function withCors(event, response) {
  const headers = { ...getCorsHeaders(event), ...(response.headers || {}) };
  return { ...response, headers };
}

function handlePreflight(event) {
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(event),
      body: '',
    };
  }
  return null;
}

module.exports = { getCorsHeaders, withCors, handlePreflight, ALLOWED_ORIGINS };
