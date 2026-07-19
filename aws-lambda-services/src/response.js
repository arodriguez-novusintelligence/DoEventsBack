const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || [
  'https://qa.doeventsapp.com',
  'http://localhost:5173',
  'https://localhost',
  'capacitor://localhost',
].join(',')).split(',').map((o) => o.trim());

function corsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(event, statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(event),
    body: JSON.stringify(body),
  };
}

function handleOptions(event) {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(event), body: '' };
  }
  return null;
}

module.exports = { jsonResponse, handleOptions };
