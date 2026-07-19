const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.updateBanco = async (event) => {
    const { 
        id_contry,
        nombre,
        codigo_swift
    } = JSON.parse(event.body);

    const params = {
        TableName: process.env.BANCOS_TABLE || "Bancos",
        Key: {
            id_contry: id_contry
        },
        UpdateExpression: "set nombre = :nombre, codigo_swift = :codigo_swift",
        ExpressionAttributeValues: {
            ":nombre": nombre,
            ":codigo_swift": codigo_swift
        },
        ReturnValues: "UPDATED_NEW"
    };

    try {
        const result = await dynamoDb.update(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error("Error updating item:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error updating item" }),
        };
    }
}