const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  const {
    report_id,
    post_id,
    client_id, 
    reason
  } = JSON.parse(event.body);

  if (
    !report_id ||
    !post_id ||
    !client_id ||
    !reason
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Parametros faltantes"})
    };
  }

  const params = {
    TableName: process.env.DYNAMODB_REPORTS_TABLE,
    Item: {
      report_id: report_id,
      post_id: post_id,
      client_id: client_id,
      reason: reason,
      timestamp: new Date().toISOString(),
    },
  }

  try {
    await dynamodb.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "ok" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno" }) };
  }
};