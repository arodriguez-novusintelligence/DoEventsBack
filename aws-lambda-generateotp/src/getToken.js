const { withCors, handlePreflight } = require('./cors-web');

/** Token de servicio QA para operaciones públicas (createUser, updateUser). */
exports.generateToken = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  return withCors(event, {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      token: 'qa-service-token',
      accessToken: 'qa-service-token',
    }),
  });
};
