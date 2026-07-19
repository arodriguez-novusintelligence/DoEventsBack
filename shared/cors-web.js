/**
 * Utilidad CORS compartida para lambdas consumidas por DoEventsWEB.
 * Soporta múltiples orígenes según entorno (dev, qa, prod, Capacitor móvil).
 */

const { DEFAULT_CORS_ORIGINS, parseOrigins } = require('./cors-origins');

const ALLOWED_ORIGINS = parseOrigins(process.env.CORS_ALLOWED_ORIGINS || DEFAULT_CORS_ORIGINS.join(','));

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
