const { SERVICE_CATEGORIES } = require('./categories');
const { jsonResponse, handleOptions } = require('./response');

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  return jsonResponse(event, 200, { categories: SERVICE_CATEGORIES });
};
