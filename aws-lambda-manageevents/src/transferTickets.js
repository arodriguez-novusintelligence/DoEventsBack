const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION || "us-east-1",
});

const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders";
const TICKETS_DIST_TABLE =
  process.env.TICKETS_DIST_TABLE || "TicketsDistribution";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";

/**
 * Verifica si un usuario existe y está activo en la tabla Client
 */
async function verifyUserActive(userId) {
  try {
    const result = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
      })
      .promise();

    if (!result.Item) {
      return { valid: false, error: `Usuario ${userId} no encontrado` };
    }

    if (result.Item.userStatus !== "active") {
      return {
        valid: false,
        error: `Usuario ${userId} no está activo (status: ${result.Item.userStatus})`,
      };
    }

    return { valid: true, user: result.Item };
  } catch (error) {
    console.error(`Error verificando usuario ${userId}:`, error);
    return {
      valid: false,
      error: `Error verificando usuario: ${error.message}`,
    };
  }
}

/**
 * Obtiene la orden original y valida que pertenezca al usuario emisor
 */
async function getOrder(orderId, fromUserId) {
  try {
    const result = await dynamodb
      .get({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderId },
      })
      .promise();

    if (!result.Item) {
      return { valid: false, error: `Orden ${orderId} no encontrada` };
    }

    const order = result.Item;

    // Verificar que la orden pertenezca al usuario emisor
    if (order.user_id !== fromUserId) {
      return {
        valid: false,
        error: `La orden ${orderId} no pertenece al usuario ${fromUserId}`,
      };
    }

    // Verificar que la orden esté pagada (APPROVED o SOLD)
    if (
      order.payment_status !== "APPROVED" &&
      order.payment_status !== "SOLD"
    ) {
      return {
        valid: false,
        error: `La orden ${orderId} no está pagada (status: ${order.payment_status})`,
      };
    }

    // Verificar que no esté ya transferida
    if (order.transfer_status === "TRANSFERRED") {
      return {
        valid: false,
        error: `La orden ${orderId} ya fue transferida completamente`,
      };
    }

    return { valid: true, order };
  } catch (error) {
    console.error(`Error obteniendo orden ${orderId}:`, error);
    return { valid: false, error: `Error obteniendo orden: ${error.message}` };
  }
}

/**
 * Transfiere boletas en TicketsDistribution
 */
async function transferTicketsInDistribution(
  ticketInstanceIds,
  toUserId,
  originalOrderId,
  newOrderId,
  order,
) {
  const transferredTickets = [];
  const distributions = new Map(); // Para agrupar tickets por distribution

  try {
    // 1. Agrupar tickets por sus distributions
    for (const ticketInstanceId of ticketInstanceIds) {
      // Buscar el ticket en los tickets de la orden
      const orderTicket = order.tickets.find(
        (t) =>
          t.ticket_id === ticketInstanceId ||
          t.ticketInstanceId === ticketInstanceId,
      );

      if (!orderTicket) {
        console.warn(
          `⚠️ Ticket ${ticketInstanceId} no encontrado en orden ${originalOrderId}`,
        );
        continue;
      }

      // Obtener distributionId y createDate del ticket
      const distributionId = orderTicket.distributionId;
      const createDate =
        orderTicket.distributionCreateDate || orderTicket.createDate;

      if (!distributionId || !createDate) {
        console.warn(
          `⚠️ Ticket ${ticketInstanceId} no tiene distributionId o createDate, omitiendo...`,
        );
        continue;
      }

      if (!distributions.has(distributionId)) {
        distributions.set(distributionId, {
          id: distributionId,
          createDate: createDate,
          ticketIds: [],
        });
      }

      distributions.get(distributionId).ticketIds.push(ticketInstanceId);
    }

    console.log(`📦 Procesando ${distributions.size} distributions...`);

    // 2. Procesar cada distribution
    for (const [distId, distInfo] of distributions) {
      try {
        // Obtener distribution actual
        const distResult = await dynamodb
          .get({
            TableName: TICKETS_DIST_TABLE,
            Key: {
              id: String(distInfo.id),
              createDate: String(distInfo.createDate),
            },
          })
          .promise();

        if (!distResult.Item) {
          console.warn(`⚠️ Distribution ${distId} no encontrada, omitiendo...`);
          continue;
        }

        const distribution = distResult.Item;
        const updatedTickets = distribution.tickets.map((ticket) => {
          if (distInfo.ticketIds.includes(ticket.ticketInstanceId)) {
            // Transferir el ticket
            transferredTickets.push({
              ticketInstanceId: ticket.ticketInstanceId,
              category: ticket.category,
              previousOwner: ticket.ownerId,
              newOwner: toUserId,
              previousOrderId: ticket.orderId,
              newOrderId: newOrderId,
            });

            return {
              ...ticket,
              ownerId: toUserId,
              orderId: newOrderId,
              ticketStatus: "SOLD", // Mantener como vendido
              transferredFrom: ticket.ownerId,
              transferredAt: new Date().toISOString(),
              previousOrderId: originalOrderId,
            };
          }
          return ticket;
        });

        // Actualizar distribution
        await dynamodb
          .put({
            TableName: TICKETS_DIST_TABLE,
            Item: {
              ...distribution,
              tickets: updatedTickets,
              id: String(distribution.id),
              createDate: String(distribution.createDate),
            },
          })
          .promise();

        console.log(
          `✅ Distribution ${distId} actualizada con ${distInfo.ticketIds.length} tickets transferidos`,
        );
      } catch (error) {
        console.error(`❌ Error procesando distribution ${distId}:`, error);
        throw error;
      }
    }

    return { success: true, transferredTickets };
  } catch (error) {
    console.error("Error en transferTicketsInDistribution:", error);
    throw error;
  }
}

/**
 * Crea una nueva orden para el usuario receptor (transferencia total)
 */
async function createNewOrderForRecipient(
  originalOrder,
  toUserId,
  transferredTickets,
  newOrderId,
) {
  const now = new Date().toISOString();

  // Mapear tickets transferidos a formato de orden
  const newOrderTickets = transferredTickets.map((t) => {
    const originalTicket = originalOrder.tickets.find(
      (ot) =>
        ot.ticket_id === t.ticketInstanceId ||
        ot.ticketInstanceId === t.ticketInstanceId,
    );

    return {
      ...originalTicket,
      ticket_id: t.ticketInstanceId,
      ticketInstanceId: t.ticketInstanceId,
      user_id: toUserId,
      order_id: newOrderId,
      orderId: newOrderId,
      qrCodeKey: originalTicket.qrCodeKey,
      qr_url: originalTicket.qr_url,
    };
  });

  const newOrder = {
    order_id: newOrderId,
    user_id: toUserId,
    event_id: originalOrder.event_id,
    amount: originalOrder.amount, // Mantener el monto original
    currency: originalOrder.currency || "COP",
    payment_status: "SOLD", // Ya está pagada (transferida)
    transfer_status: "RECEIVED",
    created_at: now,
    finalized_at: now,
    tickets: newOrderTickets,
    metadata: {
      ...originalOrder.metadata,
      transferredFrom: originalOrder.user_id,
      originalOrderId: originalOrder.order_id,
      transferredAt: now,
    },
    reference: `TRANSFER-${originalOrder.order_id}`,
  };

  await dynamodb
    .put({
      TableName: ORDERS_TABLE,
      Item: newOrder,
    })
    .promise();

  return newOrder;
}

/**
 * Marca la orden original como modificada (transferencia parcial)
 */
async function markOrderAsPartiallyTransferred(
  order,
  updatedTickets,
  transferredTickets,
  toUserId,
  toUserName,
) {
  const now = new Date().toISOString();

  await dynamodb
    .update({
      TableName: ORDERS_TABLE,
      Key: { order_id: order.order_id },
      UpdateExpression: `SET 
        transfer_status = :transferStatus,
        tickets = :updatedTickets,
        last_transfer_to = :lastTransferTo,
        last_transfer_to_detail = :lastTransferToDetail,
        modified_at = :modifiedAt,
        transfer_history = list_append(if_not_exists(transfer_history, :emptyList), :transferHistory)`,
      ExpressionAttributeValues: {
        ":transferStatus": "PARTIALLY_TRANSFERRED",
        ":updatedTickets": updatedTickets,
        ":lastTransferTo": toUserId,
        ":lastTransferToDetail": {
          user_id: toUserId,
          user_name: toUserName,
          transferred_at: now,
        },
        ":modifiedAt": now,
        ":emptyList": [],
        ":transferHistory": [
          {
            transferredAt: now,
            to_user_id: toUserId,
            to_user_name: toUserName,
            ticketsCount: transferredTickets.length,
            transferredTicketIds: transferredTickets.map(
              (t) => t.ticketInstanceId,
            ),
          },
        ],
      },
    })
    .promise();
}

/**
 * Marca la orden original como totalmente transferida
 */
async function markOrderAsFullyTransferred(
  order,
  toUserId,
  toUserName,
  newOrderId,
  updatedTickets,
  transferredTickets,
) {
  const now = new Date().toISOString();

  await dynamodb
    .update({
      TableName: ORDERS_TABLE,
      Key: { order_id: order.order_id },
      UpdateExpression: `SET 
        transfer_status = :transferStatus,
        transferred_to = :transferredTo,
        transferred_to_detail = :transferredToDetail,
        tickets = :updatedTickets,
        transfer_history = list_append(if_not_exists(transfer_history, :emptyList), :transferHistory),
        new_order_id = :newOrderId,
        transferred_at = :transferredAt`,
      ExpressionAttributeValues: {
        ":transferStatus": "TRANSFERRED",
        ":transferredTo": toUserId,
        ":transferredToDetail": {
          user_id: toUserId,
          user_name: toUserName,
          transferred_at: now,
        },
        ":updatedTickets": updatedTickets,
        ":emptyList": [],
        ":transferHistory": [
          {
            transferredAt: now,
            to_user_id: toUserId,
            to_user_name: toUserName,
            ticketsCount: transferredTickets.length,
            transferredTicketIds: transferredTickets.map(
              (t) => t.ticketInstanceId,
            ),
          },
        ],
        ":newOrderId": newOrderId,
        ":transferredAt": now,
      },
    })
    .promise();
}

/**
 * Handler principal para transferir boletas
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event, null, 2));

    const body = JSON.parse(event.body);
    const {
      fromUserId,
      toUserId,
      orderId,
      ticketInstanceIds, // Array de IDs de tickets a transferir
      transferAll, // Boolean: true para transferir todos los tickets
    } = body;

    // 1. Validaciones básicas
    if (!fromUserId || !toUserId || !orderId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Faltan parámetros requeridos: fromUserId, toUserId, orderId",
        }),
      };
    }

    if (fromUserId === toUserId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "No puedes transferir boletas a ti mismo",
        }),
      };
    }

    if (
      !transferAll &&
      (!ticketInstanceIds ||
        !Array.isArray(ticketInstanceIds) ||
        ticketInstanceIds.length === 0)
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error:
            "Debes especificar los ticketInstanceIds a transferir o usar transferAll=true",
        }),
      };
    }

    console.log(
      `🔄 Iniciando transferencia de boletas de ${fromUserId} a ${toUserId}`,
    );

    // 2. Verificar que ambos usuarios existen y están activos
    const fromUserVerification = await verifyUserActive(fromUserId);
    if (!fromUserVerification.valid) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: `Usuario emisor: ${fromUserVerification.error}`,
        }),
      };
    }

    const toUserVerification = await verifyUserActive(toUserId);
    if (!toUserVerification.valid) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: `Usuario receptor: ${toUserVerification.error}`,
        }),
      };
    }

    console.log(`✅ Ambos usuarios verificados y activos`);
    const toUserName =
      toUserVerification.user.name || toUserVerification.user.username || toUserId;
    const fromUserName =
      fromUserVerification.user.name ||
      fromUserVerification.user.username ||
      fromUserId;

    // 3. Obtener y validar la orden
    const orderValidation = await getOrder(orderId, fromUserId);
    if (!orderValidation.valid) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: orderValidation.error,
        }),
      };
    }

    const order = orderValidation.order;
    console.log(`✅ Orden ${orderId} validada`);

    // 4. Determinar qué tickets transferir
    let ticketsToTransfer = [];
    let orderTicketIds = [];
    // Compatibilidad: estructura nueva y legacy (metadata)
    if (
      order.tickets &&
      Array.isArray(order.tickets) &&
      order.tickets.length > 0
    ) {
      // Estructura nueva
      orderTicketIds = order.tickets.map(
        (t) => t.ticket_id || t.ticketInstanceId,
      );
      if (transferAll) {
        ticketsToTransfer = orderTicketIds;
        console.log(
          `📋 Transfiriendo TODOS los ${ticketsToTransfer.length} tickets (estructura nueva)`,
        );
      } else {
        ticketsToTransfer = ticketInstanceIds;
        const invalidTickets = ticketsToTransfer.filter(
          (id) => !orderTicketIds.includes(id),
        );
        if (invalidTickets.length > 0) {
          return {
            statusCode: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              error: `Los siguientes tickets no existen en la orden: ${invalidTickets.join(", ")}`,
            }),
          };
        }
        console.log(
          `📋 Transfiriendo ${ticketsToTransfer.length} tickets específicos (estructura nueva)`,
        );
      }
    } else if (
      order.metadata &&
      Array.isArray(order.metadata.tickets) &&
      order.metadata.tickets.length > 0
    ) {
      // Estructura legacy: tickets agrupados en metadata
      // Buscar en distribuciones los ticketInstanceId asociados a la orden
      const metadataTickets = order.metadata.tickets;
      // Simular ticketInstanceIds como "distId#nro" para cada cantidad
      orderTicketIds = [];
      metadataTickets.forEach((meta) => {
        for (let i = 0; i < (meta.quantity || 0); i++) {
          orderTicketIds.push(`${meta.ticketsDistId}#${i + 1}`);
        }
      });
      if (transferAll) {
        ticketsToTransfer = orderTicketIds;
        console.log(
          `📋 Transfiriendo TODOS los ${ticketsToTransfer.length} tickets (estructura legacy)`,
        );
      } else {
        ticketsToTransfer = ticketInstanceIds;
        const invalidTickets = ticketsToTransfer.filter(
          (id) => !orderTicketIds.includes(id),
        );
        if (invalidTickets.length > 0) {
          return {
            statusCode: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              error: `Los siguientes tickets no existen en la orden (legacy): ${invalidTickets.join(", ")}`,
            }),
          };
        }
        console.log(
          `📋 Transfiriendo ${ticketsToTransfer.length} tickets específicos (estructura legacy)`,
        );
      }
    } else {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error:
            "No se encontraron tickets en la orden (ni estructura nueva ni legacy)",
        }),
      };
    }

    const selectedOrderTickets = (order.tickets || []).filter((ticket) =>
      ticketsToTransfer.includes(ticket.ticket_id || ticket.ticketInstanceId),
    );

    const invalidOwnershipTickets = selectedOrderTickets.filter((ticket) => {
      const ownerId = ticket.user_id || fromUserId;
      return ownerId !== fromUserId || ticket.transfer_status === "TRANSFERRED";
    });

    if (invalidOwnershipTickets.length > 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Uno o más tickets seleccionados ya no pertenecen al usuario emisor o ya fueron transferidos",
          ticketIds: invalidOwnershipTickets.map(
            (t) => t.ticket_id || t.ticketInstanceId,
          ),
        }),
      };
    }

    // 5. Determinar si es transferencia total o parcial
    const isFullTransfer = ticketsToTransfer.length === orderTicketIds.length;

    console.log(
      `🎯 Tipo de transferencia: ${isFullTransfer ? "TOTAL" : "PARCIAL"}`,
    );

    // 6. Transferir tickets en TicketsDistribution
    const newOrderId = isFullTransfer ? uuidv4() : null;
    const targetOrderIdForTransfer = isFullTransfer ? newOrderId : orderId;

    const transferResult = await transferTicketsInDistribution(
      ticketsToTransfer,
      toUserId,
      orderId,
      targetOrderIdForTransfer,
      order,
    );

    console.log(
      `✅ ${transferResult.transferredTickets.length} tickets transferidos en TicketsDistribution`,
    );

    const transferTimestamp = new Date().toISOString();
    const transferredTicketIdsSet = new Set(ticketsToTransfer);
    const updatedOrderTickets = (order.tickets || []).map((ticket) => {
      const ticketId = ticket.ticket_id || ticket.ticketInstanceId;
      if (!transferredTicketIdsSet.has(ticketId)) {
        return ticket;
      }

      return {
        ...ticket,
        user_id: toUserId,
        ticket_status: "TRANSFERRED",
        transfer_status: "TRANSFERRED",
        transferred_to: {
          user_id: toUserId,
          user_name: toUserName,
          transferred_at: transferTimestamp,
        },
        transferred_from: {
          user_id: fromUserId,
          user_name: fromUserName,
          transferred_at: transferTimestamp,
        },
      };
    });

    const remainingTicketsCount = updatedOrderTickets.filter(
      (ticket) => (ticket.user_id || fromUserId) === fromUserId,
    ).length;

    // 7. Actualizar Orders según el tipo de transferencia
    let newOrder = null;
    if (isFullTransfer) {
      // Transferencia TOTAL: Crear nueva orden y marcar original como transferida
      newOrder = await createNewOrderForRecipient(
        order,
        toUserId,
        transferResult.transferredTickets,
        newOrderId,
      );

      await markOrderAsFullyTransferred(
        order,
        toUserId,
        toUserName,
        newOrder.order_id,
        updatedOrderTickets,
        transferResult.transferredTickets,
      );

      console.log(
        `✅ Transferencia TOTAL completada. Nueva orden: ${newOrder.order_id}`,
      );
    } else {
      // Transferencia PARCIAL: Mantener tickets en orden y marcarlos como transferidos
      await markOrderAsPartiallyTransferred(
        order,
        updatedOrderTickets,
        transferResult.transferredTickets,
        toUserId,
        toUserName,
      );

      console.log(
        `✅ Transferencia PARCIAL completada. ${remainingTicketsCount} tickets restantes en orden original`,
      );
    }

    // 8. Enviar notificaciones a ambos usuarios usando Lambda de notificaciones (igual que invitación de evento)
    console.log("📧 Enviando notificaciones de transferencia...");
    try {
      const notificationLambda =
        process.env.NOTIFICATIONS_LAMBDA ||
        "notifications-dev-triggerNotification";
      const eventName =
        order.metadata?.eventName || order.eventName || "Evento";
      const eventId = order.event_id || order.eventId;
      const ticketCount = transferResult.transferredTickets.length;
      const transferDate = new Date().toISOString();
      // Notificación al receptor
      await lambda
        .invoke({
          FunctionName: notificationLambda,
          InvocationType: "Event",
          Payload: JSON.stringify({
            triggerId: "TICKET_TRANSFERRED_RECEIVED",
            userId: toUserId,
            channels: ["email", "push", "inApp", "whatsapp"],
            metadata: {
              userName: toUserVerification.user.name,
              senderName: fromUserVerification.user.name,
              senderEmail: fromUserVerification.user.email,
              receiverName: toUserVerification.user.name,
              senderUserId: fromUserId,
              receiverUserId: toUserId,
              eventId,
              eventName,
              ticketCount,
              orderID:
                isFullTransfer && newOrder ? newOrder.order_id : order.order_id,
              transferDate,
              eventDate: order.metadata?.eventDate || order.eventDate || "",
              eventLocation:
                order.metadata?.eventLocation || order.eventLocation || "",
              ticketDetails: transferResult.transferredTickets.map((t) => ({
                category: t.category,
                ticketInstanceId: t.ticketInstanceId,
              })),
            },
          }),
        })
        .promise();
      console.log("✅ Notificación al receptor enviada");
      // Notificación al emisor
      await lambda
        .invoke({
          FunctionName: notificationLambda,
          InvocationType: "Event",
          Payload: JSON.stringify({
            triggerId: "TICKET_TRANSFERRED_SENT",
            userId: fromUserId,
            channels: ["email", "push", "inApp", "whatsapp"],
            metadata: {
              userName: fromUserVerification.user.name,
              senderName: fromUserVerification.user.name,
              receiverName: toUserVerification.user.name,
              receiverEmail: toUserVerification.user.email,
              senderUserId: fromUserId,
              receiverUserId: toUserId,
              eventId,
              eventName,
              ticketCount,
              orderID: order.order_id,
              transferDate,
              eventDate: order.metadata?.eventDate || order.eventDate || "",
              eventLocation:
                order.metadata?.eventLocation || order.eventLocation || "",
            },
          }),
        })
        .promise();
      console.log("✅ Notificación al emisor enviada");
    } catch (notifError) {
      // No fallar la transferencia si falla la notificación
      console.error(
        "⚠️ Error enviando notificaciones (no crítico):",
        notifError,
      );
    }

    // 9. Retornar respuesta exitosa
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: isFullTransfer
          ? "Transferencia total completada exitosamente"
          : "Transferencia parcial completada exitosamente",
        transferType: isFullTransfer ? "FULL" : "PARTIAL",
        fromUser: {
          userId: fromUserId,
          name: fromUserVerification.user.name,
          email: fromUserVerification.user.email,
        },
        toUser: {
          userId: toUserId,
          name: toUserVerification.user.name,
          email: toUserVerification.user.email,
        },
        originalOrder: {
          orderId: order.order_id,
          status: isFullTransfer ? "TRANSFERRED" : "PARTIALLY_TRANSFERRED",
          remainingTickets: remainingTicketsCount,
        },
        newOrder: newOrder
          ? {
              orderId: newOrder.order_id,
              userId: toUserId,
              ticketsCount: newOrder.tickets.length,
            }
          : null,
        transferredTickets: transferResult.transferredTickets.map((t) => ({
          ticketInstanceId: t.ticketInstanceId,
          category: t.category,
          previousOwner: t.previousOwner,
          newOwner: t.newOwner,
        })),
        transferredCount: transferResult.transferredTickets.length,
      }),
    };
  } catch (error) {
    console.error("❌ Error en transferTickets:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Error interno del servidor al transferir boletas",
        message: error.message,
      }),
    };
  }
};
