const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    const { 
        repost_id, 
        post_id, 
        client_id 
    } = JSON.parse(event.body);

    if (
        !repost_id || 
        !post_id || 
        !client_id
    ) {
        return {
            statusCode: 400, 
            body: JSON.stringify({ message: "Missing parameters" }) 
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_REPOSTS_TABLE,
        Item: {
            repost_id: repost_id,
            post_id: post_id,
            client_id: client_id,
            timestamp: new Date().toISOString(),
        },
    }

    try {
    await dynamodb.put(params).promise();

    return {
        statusCode: 200,
        body: JSON.stringify({ message: "Repost successful" }),
    };
  } catch (error) {
    return { 
        statusCode: 500, 
        body: JSON.stringify({ error: "Error interno" }) 
    };
  }
};