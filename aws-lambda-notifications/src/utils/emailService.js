const AWS = require("aws-sdk");
const { SES_REGION } = require("./awsRegion");

const ses = new AWS.SES({ region: SES_REGION });

/**
 * Enviar email usando AWS SES
 */
async function sendEmailNotification(userId, eventId, templateKey, eventData) {
  try {
    console.log(`📧 Enviando email real a usuario ${userId}`);
    
    // Obtener información del usuario (email)
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const userParams = {
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: { id: userId }
    };
    
    const userResult = await dynamodb.get(userParams).promise();
    if (!userResult.Item || !userResult.Item.email) {
      console.log(`⚠️ Usuario ${userId} no tiene email`);
      return {
        success: false,
        message: "Usuario no tiene email registrado"
      };
    }

    const userEmail = userResult.Item.email;
    const userName = userResult.Item.name || userResult.Item.nombre || "Usuario";

    // Generar contenido del email basado en el template
    const emailContent = generateEmailContent(templateKey, eventData, userName);
    
    const emailParams = {
      Source: "notificaciones.doevents@doeventsapp.com",
      Destination: {
        ToAddresses: [userEmail]
      },
      ConfigurationSetName: "doevents-no-tracking",
      Message: {
        Subject: {
          Data: emailContent.subject,
          Charset: "UTF-8"
        },
        Body: {
          Html: {
            Data: emailContent.htmlBody,
            Charset: "UTF-8"
          },
          Text: {
            Data: emailContent.textBody,
            Charset: "UTF-8"
          }
        }
      }
    };

    console.log(`📤 Enviando email a ${userEmail} con asunto: ${emailContent.subject}`);
    
    const result = await ses.sendEmail(emailParams).promise();
    
    console.log(`✅ Email enviado exitosamente. MessageId: ${result.MessageId}`);
    
    return {
      success: true,
      message: `Email enviado exitosamente a ${userEmail}`,
      messageId: result.MessageId,
      details: {
        to: userEmail,
        template: templateKey,
        eventData: eventData
      }
    };
  } catch (error) {
    console.error(`❌ Error enviando email a ${userId}:`, error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Generar contenido del email basado en el template
 */
function generateEmailContent(templateKey, eventData, userName) {
  const eventName = eventData?.eventName || "tu evento";
  const venue = eventData?.venue || "el lugar del evento";
  const reason = eventData?.reason || "";

  switch (templateKey) {
    case "EVENT_RESCHEDULED":
      return {
        subject: `🔄 ${eventName} - Evento Reprogramado`,
        htmlBody: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h2 style="color: #007bff;">🔄 Evento Reprogramado</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                
                <p>Te informamos que el evento <strong>"${eventName}"</strong> ha sido reprogramado.</p>
                
                <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <h3>📅 Nuevas Fechas:</h3>
                  <p><strong>Fecha de inicio:</strong> ${formatDate(eventData?.newStartDate)}</p>
                  <p><strong>Fecha de fin:</strong> ${formatDate(eventData?.newEndDate)}</p>
                  <p><strong>Lugar:</strong> ${venue}</p>
                </div>
                
                ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
                
                <p>Tus boletos siguen siendo válidos para las nuevas fechas. Si tienes alguna pregunta, no dudes en contactarnos.</p>
                
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                <p style="font-size: 12px; color: #666;">
                  Este es un mensaje automático de DoEvents. Por favor no respondas a este email.
                </p>
              </div>
            </body>
          </html>
        `,
        textBody: `
Hola ${userName},

Te informamos que el evento "${eventName}" ha sido reprogramado.

Nuevas Fechas:
- Fecha de inicio: ${formatDate(eventData?.newStartDate)}
- Fecha de fin: ${formatDate(eventData?.newEndDate)}
- Lugar: ${venue}

${reason ? `Motivo: ${reason}` : ''}

Tus boletos siguen siendo válidos para las nuevas fechas.

---
Este es un mensaje automático de DoEvents.
        `
      };

    case "EVENT_CANCELLED":
      return {
        subject: `❌ ${eventName} - Evento Cancelado`,
        htmlBody: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h2 style="color: #dc3545;">❌ Evento Cancelado</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                
                <p>Lamentamos informarte que el evento <strong>"${eventName}"</strong> ha sido cancelado.</p>
                
                <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <h3>📋 Detalles del evento cancelado:</h3>
                  <p><strong>Evento:</strong> ${eventName}</p>
                  <p><strong>Lugar:</strong> ${venue}</p>
                  <p><strong>Fecha original:</strong> ${formatDate(eventData?.originalStartDate)}</p>
                </div>
                
                ${reason ? `<p><strong>Motivo de cancelación:</strong> ${reason}</p>` : ''}
                
                <p>Nos pondremos en contacto contigo pronto para procesar el reembolso de tus boletos.</p>
                
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                <p style="font-size: 12px; color: #666;">
                  Este es un mensaje automático de DoEvents. Por favor no respondas a este email.
                </p>
              </div>
            </body>
          </html>
        `,
        textBody: `
Hola ${userName},

Lamentamos informarte que el evento "${eventName}" ha sido cancelado.

Detalles del evento cancelado:
- Evento: ${eventName}
- Lugar: ${venue}
- Fecha original: ${formatDate(eventData?.originalStartDate)}

${reason ? `Motivo de cancelación: ${reason}` : ''}

Nos pondremos en contacto contigo pronto para procesar el reembolso.

---
Este es un mensaje automático de DoEvents.
        `
      };

    default:
      return {
        subject: `📢 ${eventName} - Actualización de Evento`,
        htmlBody: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h2 style="color: #28a745;">📢 Actualización de Evento</h2>
                <p>Hola <strong>${userName}</strong>,</p>
                <p>Hay una actualización importante sobre tu evento "${eventName}".</p>
                <p>Por favor revisa los detalles en tu cuenta de DoEvents.</p>
              </div>
            </body>
          </html>
        `,
        textBody: `
Hola ${userName},

Hay una actualización importante sobre tu evento "${eventName}".
Por favor revisa los detalles en tu cuenta de DoEvents.

---
Este es un mensaje automático de DoEvents.
        `
      };
  }
}

/**
 * Formatear fecha desde YYYYMMDD a formato legible
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr || "Fecha no disponible";
  
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  
  return `${day} de ${monthNames[parseInt(month) - 1]} de ${year}`;
}

module.exports = { sendEmailNotification };