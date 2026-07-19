// Consulta los usuarios que sigo
exports.handler = async (event) => {
  // ...implementación para consultar seguidos
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "List of following users" }),
  };
};
