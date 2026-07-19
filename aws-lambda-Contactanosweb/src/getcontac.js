const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getContacts = async (event) => {
    let response;

    try {
        const params = {
            TableName: "Contactanosweb"
        };

        const data = await dynamodb.scan(params).promise();
        response = {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                success: true,
                message: "Contactos obtenidos exitosamente",
                data: data.Items
            }),
        };
    } catch (error) {
        console.error("Error al obtener los mensajes:", error);
        response = {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                success: false,
                message: "Error al obtener los mensajes",
                error: error.message
            }),
        };
    }
    return response;
};