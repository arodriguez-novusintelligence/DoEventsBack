const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.getCategoryImage = async (event) => {
  const { id } = event.pathParameters;

  const params = {
    TableName: process.env.CATEGORIES_TABLE || "EventosCategorias",
    Key: { id },
    ProjectionExpression: "imagen" // Trae solo el campo "imagen"
  };

  try {
    const result = await dynamoDb.get(params).promise();
    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Categoría no encontrada" })
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ imagen: result.Item.imagen })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al obtener la imagen: " + error.message })
    };
  }
};