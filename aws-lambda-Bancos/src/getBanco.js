const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.getBanco = async (event) => {
  try {
    const { id_country } = event.pathParameters;
    if (!id_country) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "El id del país es requerido",
        }),
      };
    }
    const params = {
      TableName: process.env.BANCOS_TABLE || "Bancos",
      IndexName: "id_country-index",
      KeyConditionExpression: "id_country = :id_country",
      ExpressionAttributeValues: {
        ":id_country": id_country,
      },
    };
    const result = await dynamoDb.query(params).promise();
    console.log(result.Items);
    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }
};
