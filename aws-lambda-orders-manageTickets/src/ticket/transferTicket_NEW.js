const AWS = require('aws-sdk');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { sendWebSocketMessage } = require('../helpers/websocketHelper');

AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;
const NOTIFICATIONS_API = process.env.NOTIFICATIONS_API || 'https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/trigger-notification';

exports.handler = async (event) => {
  try {
    let { ticketIDs, ticketID, newUserID, currentUserID, orderID } = JSON.parse(event.body || '{}');
    
    // Normalizar ticketIDs
    if (!ticketIDs && ticketID) {
      ticketIDs = [ticketID];
    } else if (typeof ticketIDs === 'string') {
      ticketIDs = [ticketIDs];
    }
    
    if (!ticketIDs || !Array.isArray(ticketIDs) || ticketIDs.length === 0) {
      return buildResponse(400, { message: 'ticketIDs debe ser un array con al menos un ticket' });
    }
    if (!newUserID || !currentUserID) {
      return buildResponse(400, { message: 'newUserID y currentUserID son requeridos' });
    }

    console.log(`🎫 Iniciando transferencia de ${ticketIDs.length} ticket(s)`);
    console.log(`   De: ${currentUserID}`);
    console.log(`   Para: ${newUserID}`);
    console.log(`   Tickets: ${ticketIDs.join(', ')}`);

    const timestamp = new Date().toISOString();

    // 1. OBTENER LA ORDEN
    // Si no se proporciona orderID, buscamos la orden que contiene el primer ticket
    if (!orderID) {
      console.log('🔍 Buscando orden que contiene el ticket...');
      const ordersResult = await doc.query({
        TableName: ORDERS_TABLE,
        IndexName: 'user_id-created_at-index',
        KeyConditionExpression: 'user_id = :uid',
        ExpressionAttributeValues: { ':uid': currentUserID }
      }).promise();

      const orderWithTicket = ordersResult.Items.find(order => 
        order.tickets && order.tickets.some(t => ticketIDs.includes(t.ticket_id))
      );

      if (!orderWithTicket) {
        return buildResponse(404, { 
          message: `No se encontró ninguna orden con el ticket ${ticketIDs[0]}` 
        });
      }
      orderID = orderWithTicket.order_id;
      console.log(`   ✅ Orden encontrada: ${orderID}`);
    }

    // 2. OBTENER LA ORDEN COMPLETA
    const orderResult = await doc.get({
      TableName: ORDERS_TABLE,
      Key: { order_id: orderID }
    }).promise();

    const originalOrder = orderResult.Item;
    if (!originalOrder) {
      return buildResponse(404, { message: 'Orden no encontrada' });
    }

    // Validaciones de la orden
    if (originalOrder.user_id !== currentUserID) {
      return buildResponse(403, { message: 'No tienes permiso para transferir esta orden' });
    }

    // Validar estado de pago (debe estar APPROVED)
    const paymentStatus = originalOrder.payment_status || originalOrder.status;
    if (paymentStatus !== 'APPROVED' && paymentStatus !== 'approved') {
      return buildResponse(400, { 
        message: `No se pueden transferir tickets de una orden no aprobada. Estado: ${paymentStatus}` 
      });
    }

    // 3. IDENTIFICAR LOS TICKETS A TRANSFERIR
    const ticketsToTransfer = [];
    const ticketsInOrder = originalOrder.tickets || [];

    for (const ticketID of ticketIDs) {
      const ticket = ticketsInOrder.find(t => t.ticket_id === ticketID);
      if (!ticket) {
        return buildResponse(404, { 
          message: `Ticket ${ticketID} no encontrado en la orden ${orderID}` 
        });
      }
      if (ticket.user_id !== currentUserID) {
        return buildResponse(403, { 
          message: `No tienes permiso para transferir el ticket ${ticketID}` 
        });
      }
      ticketsToTransfer.push(ticket);
    }

    console.log(`✅ ${ticketsToTransfer.length} ticket(s) válidos para transferir`);

    // 4. OBTENER INFORMACIÓN DEL EVENTO
    const eventResult = await doc.get({
      TableName: EVENTS_TABLE,
      Key: { id: originalOrder.event_id }
    }).promise();
    const eventData = eventResult.Item;

    // 5. OBTENER INFORMACIÓN DE USUARIOS
    const [senderResult, receiverResult] = await Promise.all([
      doc.get({ TableName: 'Client', Key: { id: currentUserID } }).promise(),
      doc.get({ TableName: 'Client', Key: { id: newUserID } }).promise()
    ]);

    const senderName = senderResult.Item?.name || senderResult.Item?.username || 'Usuario';
    const receiverName = receiverResult.Item?.name || receiverResult.Item?.username || 'Usuario';

    if (!receiverResult.Item) {
      return buildResponse(404, { 
        message: `El usuario receptor con ID ${newUserID} no existe` 
      });
    }

    // 6. CREAR NUEVA ORDEN PARA EL RECEPTOR
    const newOrderID = uuidv4();
    
    // Calcular totales proporcionales
    const totalAmount = originalOrder.total_amount || originalOrder.amount || 0;
    const originalTicketCount = ticketsInOrder.length;
    const transferredCount = ticketsToTransfer.length;
    const proportionalAmount = Math.round((totalAmount / originalTicketCount) * transferredCount);

    // Actualizar tickets con nuevo propietario
    const transferredTicketsForNewOrder = ticketsToTransfer.map(ticket => ({
      ...ticket,
      user_id: newUserID,
      order_id: newOrderID,
      transferred_from: {
        user_id: currentUserID,
        user_name: senderName,
        original_order_id: orderID,
        transferred_at: timestamp
      }
    }));

    const newOrder = {
      order_id: newOrderID,
      user_id: newUserID,
      event_id: originalOrder.event_id,
      created_at: timestamp,
      finalized_at: timestamp,
      payment_status: 'APPROVED',
      status: 'approved',
      amount: proportionalAmount,
      currency: originalOrder.currency || 'COP',
      tickets: transferredTicketsForNewOrder,
      transferred_from: {
        user_id: currentUserID,
        user_name: senderName,
        original_order_id: orderID,
        transferred_at: timestamp
      },
      metadata: {
        ...originalOrder.metadata,
        transferredFrom: orderID,
        originalOwner: currentUserID
      }
    };

    await doc.put({
      TableName: ORDERS_TABLE,
      Item: newOrder
    }).promise();

    console.log(`✅ Nueva orden creada: ${newOrderID}`);

    // 7. ACTUALIZAR ORDEN ORIGINAL
    const remainingTickets = ticketsInOrder.filter(t => !ticketIDs.includes(t.ticket_id));
    
    const transferEntry = {
      to_user_id: newUserID,
      to_user_name: receiverName,
      new_order_id: newOrderID,
      ticket_count: transferredCount,
      ticket_ids: ticketIDs,
      transferred_at: timestamp
    };

    if (remainingTickets.length === 0) {
      // Todos los tickets transferidos
      await doc.update({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderID },
        UpdateExpression: `
          SET payment_status = :status,
              #st = :status,
              tickets = :empty,
              transfer_status = :tstatus,
              transferred_to = :transferred,
              modified_at = :timestamp
        `,
        ExpressionAttributeNames: {
          '#st': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'TRANSFERRED',
          ':tstatus': 'FULLY_TRANSFERRED',
          ':empty': [],
          ':transferred': {
            user_id: newUserID,
            user_name: receiverName,
            new_order_id: newOrderID,
            ticket_count: transferredCount,
            transferred_at: timestamp
          },
          ':timestamp': timestamp
        }
      }).promise();
    } else {
      // Transferencia parcial
      await doc.update({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderID },
        UpdateExpression: `
          SET tickets = :remaining,
              transfer_status = :tstatus,
              modified_at = :timestamp,
              transfer_history = list_append(
                if_not_exists(transfer_history, :empty),
                :history
              )
        `,
        ExpressionAttributeValues: {
          ':remaining': remainingTickets,
          ':tstatus': 'PARTIALLY_TRANSFERRED',
          ':timestamp': timestamp,
          ':empty': [],
          ':history': [transferEntry]
        }
      }).promise();
    }

    console.log(`✅ Orden original actualizada`);

    // 8. ACTUALIZAR TICKETSDISTRIBUTION SI APLICA
    // Si los tickets tienen distributionId, actualizar el ownerId en TicketsDistribution
    for (const ticket of ticketsToTransfer) {
      if (ticket.distributionId && ticket.distributionCreateDate) {
        try {
          console.log(`🔄 Actualizando TicketsDistribution: ${ticket.distributionId}`);
          
          const distResult = await doc.get({
            TableName: TICKETS_DIST_TABLE,
            Key: { 
              id: ticket.distributionId, 
              createDate: ticket.distributionCreateDate 
            }
          }).promise();

          if (distResult.Item) {
            const updatedTickets = distResult.Item.tickets.map(t => {
              if (t.ticketInstanceId === ticket.ticket_id) {
                return {
                  ...t,
                  ownerId: newUserID,
                  orderId: newOrderID,
                  ticketStatus: 'SOLD'
                };
              }
              return t;
            });

            await doc.put({
              TableName: TICKETS_DIST_TABLE,
              Item: {
                ...distResult.Item,
                tickets: updatedTickets
              }
            }).promise();

            console.log(`   ✅ TicketsDistribution actualizado`);
          }
        } catch (distError) {
          console.error(`⚠️ Error actualizando TicketsDistribution:`, distError);
          // No falla la transferencia por esto
        }
      }
    }

    // 9. ENVIAR NOTIFICACIONES
    try {
      // Al RECEPTOR
      await axios.post(NOTIFICATIONS_API, {
        triggerId: 'TICKET_TRANSFERRED_RECEIVED',
        userId: newUserID,
        channels: ['inApp', 'push', 'email', 'whatsapp'],
        metadata: {
          senderName,
          receiverName,
          userName: receiverName,
          senderUserId: currentUserID,
          ticketCount: transferredCount,
          eventName: eventData?.name || 'un evento',
          eventId: originalOrder.event_id,
          eventImage: eventData?.main_image || eventData?.imagenPrincipal || '',
          orderID: newOrderID,
          eventDate: eventData?.date || eventData?.fechaIni,
          eventLocation: eventData?.location || eventData?.lugar
        }
      });

      // Al REMITENTE
      await axios.post(NOTIFICATIONS_API, {
        triggerId: 'TICKET_TRANSFERRED_SENT',
        userId: currentUserID,
        channels: ['inApp', 'push', 'email', 'whatsapp'],
        metadata: {
          senderName,
          receiverName,
          userName: senderName,
          receiverUserId: newUserID,
          ticketCount: transferredCount,
          eventName: eventData?.name || 'un evento',
          eventId: originalOrder.event_id,
          eventImage: eventData?.main_image || eventData?.imagenPrincipal || '',
          orderID: orderID,
          eventDate: eventData?.date || eventData?.fechaIni,
          eventLocation: eventData?.location || eventData?.lugar
        }
      });

      // WebSocket al receptor
      await sendWebSocketMessage(newUserID, {
        channel: 'notification',
        action: 'tickets-received',
        type: 'TICKET_TRANSFERRED_RECEIVED',
        senderName,
        ticketCount: transferredCount,
        eventName: eventData?.name || 'un evento',
        orderID: newOrderID,
        timestamp
      });

      // WebSocket al remitente
      await sendWebSocketMessage(currentUserID, {
        channel: 'notification',
        action: 'tickets-sent',
        type: 'TICKET_TRANSFERRED_SENT',
        receiverName,
        ticketCount: transferredCount,
        eventName: eventData?.name || 'un evento',
        orderID: orderID,
        timestamp
      });

      console.log('✅ Notificaciones enviadas');
    } catch (notifError) {
      console.error('⚠️ Error al enviar notificaciones:', notifError.message);
    }

    return buildResponse(200, { 
      message: 'Tickets transferidos exitosamente',
      transferredTickets: transferredCount,
      originalOrderID: orderID,
      newOrderID,
      recipient: {
        userId: newUserID,
        name: receiverName
      },
      remainingTickets: remainingTickets.length
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
