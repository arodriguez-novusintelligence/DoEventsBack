const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  const { 
      like_id,
      post_id,
      client_id
  } = JSON.parse(event.body);

  if (
    !like_id || 
    !post_id || 
    !client_id
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Parametros faltantes" })
    };
  }

  const params = {
    TableName: process.env.DYNAMODB_LIKES_TABLE,
    Item: {
      like_id: like_id,
      post_id: post_id,
      client_id: client_id,
      timestamp: new Date().toISOString()
    }    
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
      body: JSON.stringify({ error: "Error interno" })
    };
  }
};