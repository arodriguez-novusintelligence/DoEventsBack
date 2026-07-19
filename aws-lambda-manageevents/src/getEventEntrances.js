const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

// NOTA: Este endpoint está DEPRECADO
// Las entradas ahora se manejan en una lambda y tabla independiente
// Este handler retorna un error 410 Gone indicando que el recurso ya no existe
exports.getEventById = async (event) => {
  return {
    statusCode: 410,
    body: JSON.stringify({
      success: false,
      error:
        "Este endpoint está deprecado. Las entradas del evento ahora se manejan en una lambda independiente.",
      message: "Endpoint deprecado - usar nueva lambda de entradas",
    }),
  };
};
