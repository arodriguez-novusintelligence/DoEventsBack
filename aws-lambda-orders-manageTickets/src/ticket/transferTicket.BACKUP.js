const AWS = require('aws-sdk');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { sendWebSocketMessage } = require('../helpers/websocketHelper');

AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const NOTIFICATIONS_API = process.env.NOTIFICATIONS_API || 'https://q4b7qzgxyi.execute-api.us-east-1.amazonaws.com/dev/notifications/trigger';

exports.handler = async (event) => {
  try {
    let { ticketIDs, ticketID, newUserID, currentUserID, orderID } = JSON.parse(event.body || '{}');
    
    // Normalizar ticketIDs: aceptar tanto array como string singular
    if (!ticketIDs && ticketID) {
      ticketIDs = [ticketID]; // Si viene ticketID singular, convertir a array
    } else if (typeof ticketIDs === 'string') {
      ticketIDs = [ticketIDs]; // Si viene como string, convertir a array
    }
    
    // Validar parámetros básicos
    if (!ticketIDs || !Array.isArray(ticketIDs) || ticketIDs.length === 0) {
      return buildResponse(400, { message: 'ticketIDs debe ser un array con al menos un ticket, o enviar ticketID' });
    }
    if (!newUserID || !currentUserID) {
      return buildResponse(400, { message: 'newUserID y currentUserID son requeridos' });
    }

    const timestamp = new Date().toISOString();
    
    // 1. Obtener el primer ticket para extraer orderID si no fue proporcionado
    const firstTicketResult = await doc.get({
      TableName: TICKETS_TABLE,
      Key: { id: ticketIDs[0] }
    }).promise();

    const firstTicket = firstTicketResult.Item;
    if (!firstTicket) {
      return buildResponse(404, { message: `Ticket ${ticketIDs[0]} no encontrado` });
    }

    // Si no proporcionaron orderID, usar el del primer ticket
    if (!orderID) {
      orderID = firstTicket.order_id;
      console.log(`📋 orderID no proporcionado, usando orderID del ticket: ${orderID}`);
    }

    // Validar que el ticket pertenece al usuario actual
    if (firstTicket.user_id !== currentUserID) {
      return buildResponse(403, { message: `No tienes permiso para transferir el ticket ${ticketIDs[0]}` });
    }

    // 2. Obtener la orden original
    const orderResult = await doc.get({
      TableName: ORDERS_TABLE,
      Key: { order_id: orderID }
    }).promise();

    const originalOrder = orderResult.Item;
    if (!originalOrder) {
      return buildResponse(404, { message: 'Orden no encontrada' });
    }

    // Validar que la orden pertenece al usuario actual
    if (originalOrder.user_id !== currentUserID) {
      return buildResponse(403, { message: 'No tienes permiso para transferir esta orden' });
    }

    // Validar que la orden esté aprobada
    if (originalOrder.status !== 'approved') {
      return buildResponse(400, { 
        message: `No se pueden transferir boletas de una orden no aprobada. Estado actual: ${originalOrder.status}`,
        currentStatus: originalOrder.status
      });
    }

    // 3. Obtener y validar todos los tickets a transferir
    const ticketsToTransfer = [firstTicket]; // Ya tenemos el primero
    
    // Obtener el resto de los tickets (si hay más)
    for (let i = 1; i < ticketIDs.length; i++) {
      const ticketResult = await doc.get({
        TableName: TICKETS_TABLE,
        Key: { id: ticketIDs[i] }
      }).promise();

      const ticket = ticketResult.Item;
      if (!ticket) {
        return buildResponse(404, { message: `Ticket ${ticketIDs[i]} no encontrado` });
      }
      if (ticket.user_id !== currentUserID) {
        return buildResponse(403, { message: `No tienes permiso para transferir el ticket ${ticketIDs[i]}` });
      }
      if (ticket.order_id !== orderID) {
        return buildResponse(400, { message: `El ticket ${ticketIDs[i]} no pertenece a la orden ${orderID}` });
      }
      if (ticket.status !== 'ACTIVE') {
        return buildResponse(400, { message: `El ticket ${ticketIDs[i]} no está activo. Estado: ${ticket.status}` });
      }
      ticketsToTransfer.push(ticket);
    }

    // Validar que el primer ticket también esté activo y pertenezca a la orden
    if (firstTicket.order_id !== orderID) {
      return buildResponse(400, { message: `El ticket ${ticketIDs[0]} no pertenece a la orden ${orderID}` });
    }
    if (firstTicket.status !== 'ACTIVE') {
      return buildResponse(400, { message: `El ticket ${ticketIDs[0]} no está activo. Estado: ${firstTicket.status}` });
    }

    // 4. Obtener información del evento
    const eventResult = await doc.get({
      TableName: EVENTS_TABLE,
      Key: { id: ticketsToTransfer[0].event_id }
    }).promise();
    const eventData = eventResult.Item;

    // 5. Obtener información de usuarios
    const [senderResult, receiverResult] = await Promise.all([
      doc.get({ TableName: 'Client', Key: { id: currentUserID } }).promise(),
      doc.get({ TableName: 'Client', Key: { id: newUserID } }).promise()
    ]);

    const senderName = senderResult.Item?.name || 'Usuario';
    const receiverName = receiverResult.Item?.name || 'Usuario';

    // Validar que el receptor existe
    if (!receiverResult.Item) {
      return buildResponse(404, { 
        message: `El usuario receptor con ID ${newUserID} no existe`,
        receiverUserId: newUserID
      });
    }

    // 6. Crear nueva orden para el receptor
    const newOrderID = uuidv4();
    const newOrder = {
      order_id: newOrderID,
      user_id: newUserID,
      event_id: ticketsToTransfer[0].event_id,
      quantity: ticketsToTransfer.length,
      status: 'approved',
      created_at: timestamp,
      payment_status: 'transferred',
      transferred_from: {
        user_id: currentUserID,
        user_name: senderName,
        original_order_id: orderID,
        transferred_at: timestamp
      },
      // Copiar información relevante de la orden original
      total_amount: originalOrder.total_amount ? Math.round((originalOrder.total_amount / originalOrder.quantity) * ticketsToTransfer.length) : 0,
      currency: originalOrder.currency || 'USD'
    };

    await doc.put({
      TableName: ORDERS_TABLE,
      Item: newOrder
    }).promise();

    console.log(`✅ Nueva orden creada para receptor: ${newOrderID}`);

    // 7. Actualizar cada ticket
    const updatePromises = ticketsToTransfer.map(ticket => 
      doc.update({
        TableName: TICKETS_TABLE,
        Key: { id: ticket.id || ticket.ticket_id },
        UpdateExpression: `
          SET user_id = :newUserId,
              order_id = :newOrderId,
              #status = :status,
              updated_at = :timestamp,
              transfer_history = list_append(
                if_not_exists(transfer_history, :emptyList),
                :historyEntry
              )
        `,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':newUserId': newUserID,
          ':newOrderId': newOrderID,
          ':status': 'ACTIVE',
          ':timestamp': timestamp,
          ':emptyList': [],
          ':historyEntry': [{
            from_user_id: currentUserID,
            from_user_name: senderName,
            to_user_id: newUserID,
            to_user_name: receiverName,
            original_order_id: orderID,
            new_order_id: newOrderID,
            transferred_at: timestamp
          }]
        }
      }).promise()
    );

    await Promise.all(updatePromises);

    // 7. Actualizar orden original con trazabilidad
    const remainingTickets = originalOrder.quantity - ticketsToTransfer.length;
    if (remainingTickets === 0) {
      // Todos los tickets fueron transferidos
      await doc.update({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderID },
        UpdateExpression: `
          SET #status = :status,
              updated_at = :timestamp,
              transferred_to = :transferredTo
        `,
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'transferred',
          ':timestamp': timestamp,
          ':transferredTo': {
            user_id: newUserID,
            user_name: receiverName,
            new_order_id: newOrderID,
            ticket_count: ticketsToTransfer.length,
            transferred_at: timestamp
          }
        }
      }).promise();
    } else {
      // Transferencia parcial
      await doc.update({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderID },
        UpdateExpression: `
          SET quantity = :newQuantity,
              updated_at = :timestamp,
              partial_transfers = list_append(
                if_not_exists(partial_transfers, :emptyList),
                :transferEntry
              )
        `,
        ExpressionAttributeValues: {
          ':newQuantity': remainingTickets,
          ':timestamp': timestamp,
          ':emptyList': [],
          ':transferEntry': [{
            to_user_id: newUserID,
            to_user_name: receiverName,
            new_order_id: newOrderID,
            ticket_count: ticketsToTransfer.length,
            ticket_ids: ticketIDs,
            transferred_at: timestamp
          }]
        }
      }).promise();
    }

    // 8. Enviar notificaciones y WebSocket a ambos usuarios
    try {
      // Notificación al RECEPTOR (User B)
      await axios.post(NOTIFICATIONS_API, {
        triggerId: 'TICKET_TRANSFERRED_RECEIVED',
        userId: newUserID,
        channels: ['inApp', 'push', 'email', 'whatsapp'],
        metadata: {
          senderName,
          receiverName,
          userName: receiverName, // Alias para compatibilidad
          senderUserId: currentUserID,
          ticketCount: ticketsToTransfer.length,
          eventName: eventData?.name || 'un evento',
          eventId: ticketsToTransfer[0].event_id,
          eventImage: eventData?.main_image || '',
          orderID: newOrderID,
          eventDate: eventData?.date,
          eventLocation: eventData?.location
        }
      });

      // Notificación al REMITENTE (User A)
      await axios.post(NOTIFICATIONS_API, {
        triggerId: 'TICKET_TRANSFERRED_SENT',
        userId: currentUserID,
        channels: ['inApp', 'push', 'email', 'whatsapp'],
        metadata: {
          senderName,
          receiverName,
          userName: senderName, // Alias para compatibilidad
          receiverUserId: newUserID,
          ticketCount: ticketsToTransfer.length,
          eventName: eventData?.name || 'un evento',
          eventId: ticketsToTransfer[0].event_id,
          eventImage: eventData?.main_image || '',
          orderID: orderID, // Orden original del remitente
          eventDate: eventData?.date,
          eventLocation: eventData?.location
        }
      });

      // WebSocket en tiempo real al receptor
      await sendWebSocketMessage(newUserID, {
        channel: 'notification',
        action: 'tickets-received',
        type: 'TICKET_TRANSFERRED_RECEIVED',
        senderName,
        ticketCount: ticketsToTransfer.length,
        eventName: eventData?.name || 'un evento',
        orderID: newOrderID,
        timestamp
      });

      // WebSocket en tiempo real al remitente
      await sendWebSocketMessage(currentUserID, {
        channel: 'notification',
        action: 'tickets-sent',
        type: 'TICKET_TRANSFERRED_SENT',
        receiverName,
        ticketCount: ticketsToTransfer.length,
        eventName: eventData?.name || 'un evento',
        orderID: orderID,
        timestamp
      });

      console.log('✅ Notificaciones enviadas al receptor y remitente');
    } catch (notifError) {
      console.error('⚠️ Error al enviar notificaciones:', notifError.message);
    }

    return buildResponse(200, { 
      message: 'Boletas transferidas exitosamente',
      transferredTickets: ticketsToTransfer.length,
      originalOrderID: orderID,
      newOrderID,
      recipient: {
        userId: newUserID,
        name: receiverName
      }
    });

  } catch (error) {
    console.error('❌ Error en transferTicket:', error);
    return buildResponse(500, { 
      message: 'Error interno', 
      detail: error.message 
    });
  }
};

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}