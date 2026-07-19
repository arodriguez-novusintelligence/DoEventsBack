const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    const { follow_id } = event.pathParameters || {};

    if (!follow_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Parámetro follow_id es requerido" }),
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id },
    };

    try {
        const result = await dynamodb.get(params).promise();

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Seguimiento no encontrado" }),
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
            body: JSON.stringify({ error: "Error interno al recuperar el seguimiento" }),
        };
    }
};