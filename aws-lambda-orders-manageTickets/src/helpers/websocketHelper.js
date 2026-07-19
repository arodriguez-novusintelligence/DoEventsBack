const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const apiGateway = new AWS.ApiGatewayManagementApi({
  endpoint: process.env.WEBSOCKET_ENDPOINT || 'https://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev'
});

/**
 * Obtener el connectionId de un usuario desde DynamoDB
 * @param {string} userId - ID del usuario
 * @returns {Promise<string|null>} - ConnectionId o null si no está conectado
 */
async function getUserConnectionId(userId) {
  try {
    const result = await dynamodb.get({
      TableName: 'UserChannels',
      Key: { user_id: userId }
    }).promise();

    if (result.Item && result.Item.connectionId) {
      return result.Item.connectionId;
    }

    console.log(`⚠️ Usuario ${userId} no tiene conexión WebSocket activa`);
    return null;
  } catch (error) {
    console.error(`Error obteniendo connectionId para usuario ${userId}:`, error);
    return null;
  }
}

/**
 * Enviar mensaje WebSocket a un usuario específico
 * @param {string} userId - ID del usuario destinatario
 * @param {object} message - Mensaje a enviar
 * @returns {Promise<boolean>} - true si se envió exitosamente, false si no
 */
async function sendWebSocketMessage(userId, message) {
  try {
    const connectionId = await getUserConnectionId(userId);
    
    if (!connectionId) {
      console.log(`❌ No se puede enviar WebSocket a ${userId}: sin conexión activa`);
      return false;
    }

    await apiGateway.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify(message)
    }).promise();

    console.log(`✅ WebSocket enviado exitosamente a usuario ${userId} (${connectionId})`);
    return true;

  } catch (error) {
    if (error.statusCode === 410) {
      // Conexión obsoleta/cerrada, limpiar de DynamoDB
      console.log(`🗑️ Eliminando conexión obsoleta para usuario ${userId}`);
      try {
        await dynamodb.delete({
          TableName: 'UserChannels',
          Key: { user_id: userId }
        }).promise();
      } catch (deleteError) {
        console.error(`Error eliminando conexión obsoleta:`, deleteError);
      }
    } else {
      console.error(`❌ Error enviando WebSocket a ${userId}:`, error);
    }
    return false;
  }
}

/**
 * Construir mensaje de transferencia aceptada
 * @param {object} params - Parámetros del mensaje
 * @returns {object} - Mensaje formateado
 */
function buildTransferAcceptedMessage({
  recipientId,
  recipientName,
  recipientUsername,
  recipientAvatar,
  ticketCount,
  eventName,
  eventImage,
  eventDate,
  transferId,
  ticketId
}) {
  return {
    channel: 'notification',
    action: 'transfer-accepted',
    type: 'TICKET_TRANSFER_ACCEPTED',
    status: 'transfer-accepted',
    recipientId,
    recipientName,
    recipientUsername: recipientUsername || '',
    recipientAvatar: recipientAvatar || '',
    ticketCount: ticketCount || 1,
    eventName,
    eventImage: eventImage || '',
    eventDate: eventDate || '',
    transferId: transferId || ticketId,
    ticketId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Construir mensaje de transferencia rechazada
 * @param {object} params - Parámetros del mensaje
 * @returns {object} - Mensaje formateado
 */
function buildTransferRejectedMessage({
  recipientId,
  recipientName,
  recipientUsername,
  recipientAvatar,
  ticketCount,
  eventName,
  eventImage,
  eventDate,
  transferId,
  ticketId
}) {
  return {
    channel: 'notification',
    action: 'transfer-rejected',
    type: 'TICKET_TRANSFER_REJECTED',
    status: 'transfer-rejected',
    recipientId,
    recipientName,
    recipientUsername: recipientUsername || '',
    recipientAvatar: recipientAvatar || '',
    ticketCount: ticketCount || 1,
    eventName,
    eventImage: eventImage || '',
    eventDate: eventDate || '',
    transferId: transferId || ticketId,
    ticketId,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  sendWebSocketMessage,
  getUserConnectionId,
  buildTransferAcceptedMessage,
  buildTransferRejectedMessage
};
