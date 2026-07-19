const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.createPlaceType = async (event) => {
  const tableName = process.env.TABLE_NAME;
  const { id, PlaceType_EN, PlaceType_ES } = JSON.parse(event.body);

  const params = {
    TableName: process.env.PLACE_TYPE_TABLE || "TipoLugar",
    Item: {
      id: id,
      PlaceType_EN: PlaceType_EN,
      PlaceType_ES: PlaceType_ES,
    },
  };

  try {
    await dynamoDb.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Tipo de lugar creado exitosamente!" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error al crear el tipo de lugar: " + error.message,
      }),
    };
  }
};