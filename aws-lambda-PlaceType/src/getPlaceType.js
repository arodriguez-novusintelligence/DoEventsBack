const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.getPlaceType = async (event) => {
  try {
    const params = {
      TableName: process.env.PLACE_TYPE_TABLE || "TipoLugar",
    };
    const data = await dynamoDb.scan(params).promise();

    if (data.Items && data.Items.length > 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "PlaceType fetched successfully!",
          data: data.Items,
        }),
      };
    } else if (data.Items && data.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "No se encontraron tipos de lugar en la base de datos.",
        }),
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          message: "Tipo de lugar no encontrado" 
        }),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error al consultar el tipo de lugar: " + error.message,
      }),
    };
  }
};