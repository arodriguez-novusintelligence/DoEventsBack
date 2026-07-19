const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const JWT_SECRET = process.env.JWT_SECRET;


/*Tipología errores 
Exitoso = 0,
Credenciales erradas = 1,
OTP no validada = 2,
Gustos no registrados = 3,

*/
exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "Email y contraseña son obligatorios",
                    data: {codigoRespuesta:1}
                }),
            };
        }

        const clientParams = {
            TableName: 'Client',
            IndexName: 'EmailIndex', 
            KeyConditionExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': email,
            },
        };

        const clientResult = await dynamodb.query(clientParams).promise();

        if (clientResult.Items.length === 0) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    success: false,
                    message: "Credenciales inválidas",
                    data: {codigoRespuesta:1}
                }),
            };
        }

        const user = clientResult.Items[0];

        // Validar la contraseña
        if (user.password !== password) {
            return {
                statusCode: 401,
                body: JSON.stringify({
                    success: false,
                    message: "Contraseña incorrecta",
                    data: {codigoRespuesta:1}
                }),
            };
        }

        if (user.userStatus !== 'active') {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "Usuario inactivo y OTP no validada",
                    data: {codigoRespuesta:2, userId: user.id, phone:user.phone, email:user.email}
                }),
            };
        }

        const preferencesParams = {
            TableName: 'UserPreferences', 
            KeyConditionExpression: 'UserId = :UserId',
            ExpressionAttributeValues: {
                ':UserId': user.id,
            },
        };

        const preferencesResult = await dynamodb.query(preferencesParams).promise();

        if (preferencesResult.Items.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    message: "El usuario no tiene preferencias guardadas, debe seleccionar una preferencia para iniciar sesión",
                    data: {codigoRespuesta:3,userId: user.id}
                }),
            };
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
            expiresIn: '1h',
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: "Inicio de sesión exitoso",
                
                data: {
                    token,
                    user: {
                        userId: user.id,
                        email: user.email,
                        userStatus: user.userStatus
                    },
                    codigoRespuesta:0
                }
            }),
        };

    } catch (error) {
        console.error('Error en la función de inicio de sesión:', error);

        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                message: 'Error interno del servidor',
                data: [],
                error: error.message
            }),
        };
    }
};
