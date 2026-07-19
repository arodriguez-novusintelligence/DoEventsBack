const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  const { 
    post_id,
    client_id,
    content, 
  } = JSON.parse(event.body);

  if (
    !post_id ||
    !client_id ||
    !content
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Parametros faltantes"}) 
    };
  }

  const params = {
    TableName: process.env.DYNAMODB_POSTS_TABLE,
    Item: {
      post_id: post_id,
      client_id: client_id,
      content: content,
      timestamp: new Date().toISOString(),
    },
  }
  
  try {
    await dynamodb.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Ok" }),
    };
  } catch (error) {
    return { 
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno"})
    };
  }
};