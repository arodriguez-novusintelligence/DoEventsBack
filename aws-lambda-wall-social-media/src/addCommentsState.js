const AWS = require('aws-sdk'); 
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
    const {
        comment_id,
        post_id,
        client_id,
        content
    } = JSON.parse(event.body);

    if (!comment_id || !post_id || !client_id || !content) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ message: "Parámetros faltantes" }) 
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_COMMENTS_TABLE,
        Item: {
            comment_id,
            post_id,
            client_id,
            content,
            timestamp: new Date().toISOString(),
        },
    };

    try {
        await dynamodb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ mensaje: "ok" }),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error interno" }),
        };
    }
};