const AWS = require('aws-sdk'); 
const dynamodb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
    const {
        id_usuario_bloqueado,
        id_cliente,
        estado
    } = JSON.parse(event.body);

    if (
        !id_usuario_bloqueado || 
        !id_cliente || 
        !estado
    ) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ mensaje: "Parámetros faltantes" }) 
        };
    }

    const params = {
        TableName: process.env.DYNAMODB_BLOCK_TABLE,
        Item: {
            id_usuario_bloqueado,
            id_cliente,
            estado,  // "bloqueado" o "desbloqueado"
            fecha_bloqueo: new Date().toISOString(),
        },
    };

    try {
        await dynamodb.put(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify({ mensaje: "Estado actualizado correctamente" }),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Error interno al actualizar el estado" }),
        };
    }
};