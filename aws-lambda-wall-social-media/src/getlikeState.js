const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
    const { like_id } = event.pathParameters || {};

    if (!like_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "El parámetro like_id es requerido" })
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_LIKES_TABLE,
        Key: { like_id }
    };

    try {
        const result = await dynamodb.get(params).promise();

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Like no encontrado" })
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
            body: JSON.stringify({ error: "Error interno al recuperar el like" })
        };
    }
};