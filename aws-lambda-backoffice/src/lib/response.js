function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-User-Id,x-user-id',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,PATCH,DELETE',
  };
}
function ok(body) {
  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(body) };
}

function errorResponse(error, fallbackCode = 500) {
  const code = error.message === 'FORBIDDEN' ? 403
    : error.message === 'UNAUTHORIZED' ? 401
      : error.message === 'NOT_FOUND' ? 404
        : fallbackCode;
  return { statusCode: code, headers: corsHeaders(), body: JSON.stringify({ message: error.message }) };
}

module.exports = { corsHeaders, ok, errorResponse };
