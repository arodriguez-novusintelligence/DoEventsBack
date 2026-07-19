const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES({ region: "us-east-1" });
const { v4: uuidv4 } = require("uuid");

const YOUR_EMAIL = "visbalgomez@gmail.com"; // Reemplaza con tu dirección de correo electrónico

async function sendEmail(toEmail, subject, bodyHtml) {
  const params = {
    Source: YOUR_EMAIL,
    Destination: {
      ToAddresses: [toEmail],
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: bodyHtml,
        },
      },
    },
  };
  return ses.sendEmail(params).promise();
}

exports.createContact = async (event) => {
  const id = uuidv4();
  console.log("Evento recibido:", event); // Log adicional

  try {
    if (!event.body) {
      throw new Error("El cuerpo de la solicitud está vacío");
    }

    const { nombre, apellido, email, telefono, mensaje } = JSON.parse(
      event.body
    );

    const params = {
      TableName: "Contactanosweb",
      Item: { id, nombre, apellido, email, telefono, mensaje },
    };

    await dynamodb.put(params).promise();
    console.log("Datos guardados en DynamoDB"); // Log adicional

    // Preparar el correo
    const subject = "Nuevo contacto creado";
    const bodyHtml = `
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Nuevo Contacto</title>
                <style>
                    body { 
                    font-family: Arial, 
                    sans-serif; margin: 0; 
                    padding: 0; 
                    background-color: #f9f9f9; 
                    color: #333; 
                    }
                    .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background-color: #fff; 
                    border-radius: 8px; 
                    overflow: hidden; 
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    }
                    .header { 
                    background-color: #f5f7ff; 
                    padding: 20px; 
                    text-align: center; 
                    border-bottom: 4px solid #e4e8fc; 
                    }
                    .header img { 
                    max-width: 150px; 
                    }
                    .header h1 { 
                    color: #2a2d7d; 
                    font-size: 18px; 
                    margin: 0; 
                    }
                    .content { 
                    padding: 20px; 
                    text-align: center; 
                    }
                    .content h2 { 
                    color: #2a2d7d; 
                    font-size: 24px; 
                    margin-bottom: 10px; 
                    }
                    .content p { 
                    font-size: 16px; 
                    color: #555; 
                    }
                    .footer { 
                    padding: 20px; 
                    text-align: center; 
                    background-color: #f9f9f9; 
                    font-size: 14px; 
                    color: #888; 
                    }
                    .footer a { 
                    color: #7c4dff; 
                    text-decoration: none; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Nuevo Contacto</h1>
                    </div>
                    <div class="content">
                        <h2>Detalles del Contacto</h2>
                        <p><strong>Nombre:</strong> ${nombre} ${apellido}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Teléfono:</strong> ${telefono}</p>
                        <p><strong>Mensaje:</strong> ${mensaje}</p>
                    </div>
                    <div class="footer">
                        <p>Este mail ha sido enviado a ${YOUR_EMAIL}</p>
                    </div>
                </div>
            </body>
            </html>
        `;

    // Enviar el correo
    await sendEmail(YOUR_EMAIL, subject, bodyHtml);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Habilitar CORS
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      },
      body: JSON.stringify({
        success: true,
        message: "contacto guardado",
        data: {},
      }),
    };
  } catch (error) {
    console.error("Error al crear el mensaje y enviar el correo:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Habilitar CORS
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      },
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
