// Consulta los usuarios que me siguen
exports.handler = async (event) => {
  // ...implementación para consultar seguidores
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "List of followers" }),
  };
};
