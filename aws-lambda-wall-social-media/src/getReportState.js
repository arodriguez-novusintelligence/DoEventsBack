const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
    const { report_id } = event.pathParameters || {};

    if (!report_id) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "El parámetro report_id es requerido" })
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_REPORTS_TABLE,
        Key: { report_id }
    };

    try {
        const result = await dynamodb.get(params).promise();

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "Reporte no encontrado" })
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
            body: JSON.stringify({ error: "Error interno al recuperar el reporte" })
        };
    }
};