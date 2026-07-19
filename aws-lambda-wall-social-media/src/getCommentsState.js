const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
    const { comment_id } = event.pathParameters || {};

    if (!comment_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Parámetro comment_id es requerido" }),
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_COMMENTS_TABLE,
        Key: { comment_id }
    };

    try {
        const result = await dynamodb.get(params).promise();
        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Comentario no encontrado" }),
            };
        }
        return {
            statusCode: 200,
            body: JSON.stringify(result.Item),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error interno al recuperar el comentario" }),
        };
    }
};