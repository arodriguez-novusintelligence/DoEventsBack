const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

// Tabla para almacenar estados de mensajes
const WEBHOOK_LOGS_TABLE = "WhatsAppWebhookLogs";

module.exports.handler = async (event) => {
  console.log("📨 WhatsApp Webhook recibido:", JSON.stringify(event, null, 2));

  // Verificación del webhook (GET request)
  if (event.httpMethod === "GET") {
    const queryParams = event.queryStringParameters || {};
    const mode = queryParams["hub.mode"];
    const token = queryParams["hub.verify_token"];
    const challenge = queryParams["hub.challenge"];

    // Token de verificación (debe coincidir con el configurado en Meta)
    const VERIFY_TOKEN =
      process.env.WHATSAPP_VERIFY_TOKEN || "doevents_webhook_2026";

    console.log("🔐 Verificación de webhook:", { mode, token, challenge });

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verificado correctamente");
      return {
        statusCode: 200,
        body: challenge,
      };
    } else {
      console.log("❌ Token de verificación incorrecto");
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Verification failed" }),
      };
    }
  }

  // Procesamiento de eventos (POST request)
  if (event.httpMethod === "POST") {
    try {
      const body =
        typeof event.body === "string" ? JSON.parse(event.body) : event.body;

      console.log("📦 Evento de WhatsApp:", JSON.stringify(body, null, 2));

      // Procesar cada entrada
      if (body.entry) {
        for (const entry of body.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.value && change.value.statuses) {
                // Estados de mensajes (sent, delivered, read, failed)
                for (const status of change.value.statuses) {
                  await processMessageStatus(status, entry);
                }
              }

              if (change.value && change.value.messages) {
                // Mensajes recibidos (respuestas de usuarios)
                for (const message of change.value.messages) {
                  await processIncomingMessage(message, entry);
                }
              }
            }
          }
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    } catch (error) {
      console.error("❌ Error procesando webhook:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};

async function processMessageStatus(status, entry) {
  console.log("📊 Estado de mensaje:", {
    messageId: status.id,
    status: status.status,
    timestamp: status.timestamp,
    recipientId: status.recipient_id,
  });

  // Guardar estado en DynamoDB
  try {
    await dynamoDb
      .put({
        TableName: WEBHOOK_LOGS_TABLE,
        Item: {
          messageId: status.id,
          timestamp: new Date(status.timestamp * 1000).toISOString(),
          status: status.status,
          recipientId: status.recipient_id,
          entryId: entry.id,
          rawData: status,
          type: "status",
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    console.log("✅ Estado guardado en DynamoDB");

    // Log detallado según el estado
    switch (status.status) {
      case "sent":
        console.log("📤 Mensaje ENVIADO a WhatsApp");
        break;
      case "delivered":
        console.log("✅ Mensaje ENTREGADO al destinatario");
        break;
      case "read":
        console.log("👁️ Mensaje LEÍDO por el destinatario");
        break;
      case "failed":
        console.log("❌ Mensaje FALLIDO:", status.errors || "Sin detalles");
        if (status.errors) {
          console.error(
            "Detalles del error:",
            JSON.stringify(status.errors, null, 2),
          );
        }
        break;
      default:
        console.log("ℹ️ Estado desconocido:", status.status);
    }
  } catch (error) {
    console.error("❌ Error guardando estado:", error);
  }
}

async function processIncomingMessage(message, entry) {
  console.log("💬 Mensaje recibido:", {
    from: message.from,
    type: message.type,
    timestamp: message.timestamp,
  });

  // Guardar mensaje en DynamoDB
  try {
    await dynamoDb
      .put({
        TableName: WEBHOOK_LOGS_TABLE,
        Item: {
          messageId: message.id,
          timestamp: new Date(message.timestamp * 1000).toISOString(),
          from: message.from,
          type: message.type,
          text: message.text?.body || null,
          entryId: entry.id,
          rawData: message,
          type: "message",
          createdAt: new Date().toISOString(),
        },
      })
      .promise();

    console.log("✅ Mensaje guardado en DynamoDB");
  } catch (error) {
    console.error("❌ Error guardando mensaje:", error);
  }
}
