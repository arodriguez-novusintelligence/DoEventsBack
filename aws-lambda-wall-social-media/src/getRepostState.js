const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    const { repost_id } = event.pathParameters || {};

    if (!repost_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "El parámetro repost_id es requerido" })
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_REPOSTS_TABLE,
        Key: { repost_id }
    };

    try {
        const result = await dynamodb.get(params).promise();

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Repost no encontrado" })
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(result.Item)
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error interno al recuperar el repost" })
        };
    }
};