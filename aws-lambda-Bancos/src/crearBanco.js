const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const { v4 } = require("uuid");

exports.crearBanco = async (event) => {
  const requid = v4();
  //const id= requid.substring(0,10);
  const { id_country, nombre, codigo_swift } = JSON.parse(event.body);

  const params = {
    TableName: process.env.BANCOS_TABLE || "Bancos",
    Item: {
      id: codigo_swift,
      id_country,
      nombre,
      codigo_swift,
    },
  };

  try {
    await dynamoDb.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Banco creado exitosamente" }),
    };
  } catch (error) {
    console.error("Error al insertar en DynamoDB:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error al crear el banco",
        details: error.message,
      }),
    };
  }
};
