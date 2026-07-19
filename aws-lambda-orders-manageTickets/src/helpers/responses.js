const { v4: uuidv4 } = require('uuid');

/**
 * Respuesta para éxito
 * @param {string} functionName - nombre de la función/lambda
 * @param {Object} data - contenido a retornar
 */
const buildSuccess = (functionName, data) => ({
  statusCode: 200,
  headers: { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true
  },
  body: JSON.stringify({ [functionName]: data }, null, 2)
});

/**
 * Respuesta para error
 * @param {string} message - mensaje principal
 * @param {string} code - código de error técnico
 * @param {Object} details - información adicional (opcional)
 */
const buildError = (message, code = 'INTERNAL_ERROR', details = {}) => {
  const request_id = uuidv4(); // o usa X-RqUID si lo pasas como header
  return {
    statusCode: code.startsWith('4') ? 400 : 500,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify({
      message,
      request_id,
      details,
      code
    }, null, 2)
  };
};

module.exports = { buildSuccess, buildError };
