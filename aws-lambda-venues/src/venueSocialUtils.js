const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
};

function tableName(envKey, fallback) {
  return process.env[envKey] || fallback;
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(200, "");
  }
  return null;
}

module.exports = {
  CORS_HEADERS,
  tableName,
  respond,
  handleOptions,
};
