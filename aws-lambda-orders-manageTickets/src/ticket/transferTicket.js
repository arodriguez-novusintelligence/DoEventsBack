const AWS = require("aws-sdk");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { sendWebSocketMessage } = require("../helpers/websocketHelper");
const {
  resolveRecipientUser,
  generateTicketQr,
  deleteQrImage,
  resolveQrKey,
} = require("../helpers/qrGenerator");
const {
  nextDisplayOrderId,
  generateDisplayTicketId,
} = require("../helpers/displayIdHelper");
const { joinUserToEventChat } = require("../helpers/eventChatJoin");

AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const WEB_APP_BASE_URL = String(
  process.env.WEB_APP_BASE_URL || process.env.APP_WEB_URL || "https://dev.doeventsapp.com",
).replace(/\/$/, "");
const NOTIFICATIONS_API =
  process.env.NOTIFICATIONS_API ||
  (process.env.STAGE === "qa"
    ? "https://api-qa.doeventsapp.com/notifications/trigger-notification"
    : "https://api-dev.doeventsapp.com/notifications/trigger-notification");

const normalizeId = (value) =>
  value == null ? "" : String(value).trim();

const ticketMatchesId = (ticket, requestedId) => {
  const id = normalizeId(requestedId);
  if (!id) return false;

  const instanceId = normalizeId(ticket.ticketInstanceId);
  const ticketId = normalizeId(ticket.ticket_id);
  const displayId = normalizeId(ticket.display_ticket_id);

  if (instanceId && instanceId === id) return true;
  if (displayId && displayId === id) return true;
  if (ticketId && ticketId === id) return true;
  return false;
};

const isSameTicket = (left, right) => {
  if (!left || !right) return false;

  const leftInstance = normalizeId(left.ticketInstanceId);
  const rightInstance = normalizeId(right.ticketInstanceId);
  if (leftInstance && rightInstance) {
    return leftInstance === rightInstance;
  }

  const leftDisplay = normalizeId(left.display_ticket_id);
  const rightDisplay = normalizeId(right.display_ticket_id);
  if (leftDisplay && rightDisplay) {
    return leftDisplay === rightDisplay;
  }

  const leftTicketId = normalizeId(left.ticket_id);
  const rightTicketId = normalizeId(right.ticket_id);
  if (leftTicketId && rightTicketId) {
    return leftTicketId === rightTicketId;
  }

  return false;
};

exports.handler = async (event) => {
  console.log("[DEBUG] Event received:", JSON.stringify(event, null, 2));
  console.log("[DEBUG] Event.body type:", typeof event.body);
  console.log("[DEBUG] Event.body value:", event.body);

  try {
    // Parse body - puede venir como string o ya parseado
    let body;
    if (typeof event.body === "string") {
      console.log("[DEBUG] Parsing body as string");
      body = JSON.parse(event.body);
    } else {
      console.log("[DEBUG] Body is already an object");
      body = event.body || {};
    }

    console.log("[DEBUG] Parsed body:", JSON.stringify(body, null, 2));
    let {
      ticketIDs,
      ticketID,
      newUserID,
      currentUserID,
      orderID,
      targetEmail,
      targetUsername,
      recipientEmail,
      recipientUser,
    } = body;

    // Normalizar ticketIDs
    if (!ticketIDs && ticketID) {
      ticketIDs = [ticketID];
    } else if (typeof ticketIDs === "string") {
      ticketIDs = [ticketIDs];
    }

    if (!ticketIDs || !Array.isArray(ticketIDs) || ticketIDs.length === 0) {
      return buildResponse(400, {
        message: "ticketIDs debe ser un array con al menos un ticket",
      });
    }
    if (!currentUserID) {
      return buildResponse(400, {
        message: "currentUserID es requerido",
      });
    }

    if (!newUserID) {
      const recipient = await resolveRecipientUser({
        targetEmail,
        targetUsername,
        recipientEmail,
        recipientUser,
      });
      if (!recipient?.id) {
        return buildResponse(404, {
          message: "El usuario destino debe estar registrado en DoEvents",
        });
      }
      newUserID = recipient.id;
    }

    console.log(`🎫 Iniciando transferencia de ${ticketIDs.length} ticket(s)`);
    console.log(`   De: ${currentUserID}`);
    console.log(`   Para: ${newUserID}`);
    console.log(`   Tickets: ${ticketIDs.join(", ")}`);

    const timestamp = new Date().toISOString();

    // 1. OBTENER LA ORDEN
    // Si no se proporciona orderID, buscamos la orden que contiene el primer ticket
    if (!orderID) {
      console.log("🔍 Buscando orden que contiene el ticket...");
      const ordersResult = await doc
        .query({
          TableName: ORDERS_TABLE,
          IndexName: "user_id-created_at-index",
          KeyConditionExpression: "user_id = :uid",
          ExpressionAttributeValues: { ":uid": currentUserID },
        })
        .promise();

      const orderWithTicket = ordersResult.Items.find(
        (order) =>
          order.tickets &&
          order.tickets.some((t) =>
            ticketIDs.some((requestedId) => ticketMatchesId(t, requestedId)),
          ),
      );

      if (!orderWithTicket) {
        return buildResponse(404, {
          message: `No se encontró ninguna orden con el ticket ${ticketIDs[0]}`,
        });
      }
      orderID = orderWithTicket.order_id;
      console.log(`   ✅ Orden encontrada: ${orderID}`);
    }

    // 2. OBTENER LA ORDEN COMPLETA
    const orderResult = await doc
      .get({
        TableName: ORDERS_TABLE,
        Key: { order_id: orderID },
      })
      .promise();

    const originalOrder = orderResult.Item;
    if (!originalOrder) {
      return buildResponse(404, { message: "Orden no encontrada" });
    }

    // Validaciones de la orden
    if (originalOrder.user_id !== currentUserID) {
      return buildResponse(403, {
        message: "No tienes permiso para transferir esta orden",
      });
    }

    // Validar estado de pago (debe estar APPROVED)
    const paymentStatus = String(
      originalOrder.payment_status || originalOrder.status || "",
    ).toUpperCase();
    const transferableStatuses = new Set([
      "APPROVED",
      "PAID",
      "SOLD",
    ]);
    if (!transferableStatuses.has(paymentStatus)) {
      return buildResponse(400, {
        message: `No se pueden transferir tickets de una orden no aprobada. Estado: ${paymentStatus}`,
      });
    }

    // 3. IDENTIFICAR LOS TICKETS A TRANSFERIR
    const ticketsToTransfer = [];
    const ticketsInOrder = originalOrder.tickets || [];

    for (const ticketID of ticketIDs) {
      const ticket = ticketsInOrder.find(
        (t) =>
          !ticketsToTransfer.some((selected) => isSameTicket(selected, t)) &&
          ticketMatchesId(t, ticketID),
      );
      if (!ticket) {
        return buildResponse(404, {
          message: `Ticket ${ticketID} no encontrado en la orden ${orderID}`,
        });
      }
      const ticketOwner = ticket.user_id || currentUserID;
      if (ticketOwner !== currentUserID) {
        return buildResponse(400, {
          message: `El ticket ${ticketID} ya no pertenece al usuario emisor`,
        });
      }
      if (ticket.transfer_status === "TRANSFERRED") {
        return buildResponse(400, {
          message: `El ticket ${ticketID} ya fue transferido previamente`,
        });
      }
      // NOTA: No validamos ticket.user_id porque puede ser diferente del owner de la orden
      // La validación de propiedad se hace a nivel de orden (línea 96)
      ticketsToTransfer.push(ticket);
    }

    console.log(
      `✅ ${ticketsToTransfer.length} ticket(s) válidos para transferir`,
    );

    // 4. OBTENER INFORMACIÓN DEL EVENTO
    const eventResult = await doc
      .get({
        TableName: EVENTS_TABLE,
        Key: { id: originalOrder.event_id },
      })
      .promise();
    const eventData = eventResult.Item;

    // 5. OBTENER INFORMACIÓN DE USUARIOS
    const [senderResult, receiverResult] = await Promise.all([
      doc.get({ TableName: CLIENT_TABLE, Key: { id: currentUserID } }).promise(),
      doc.get({ TableName: CLIENT_TABLE, Key: { id: newUserID } }).promise(),
    ]);

    const resolveClientDisplayName = (item) => {
      if (!item) return "Usuario";
      const full = [item.nombre, item.apellido].filter(Boolean).join(" ").trim();
      if (full) return full;
      return item.name || item.username || item.email || "Usuario";
    };
    const senderName = resolveClientDisplayName(senderResult.Item);
    const receiverName = resolveClientDisplayName(receiverResult.Item);

    if (!receiverResult.Item) {
      return buildResponse(404, {
        message: `El usuario receptor con ID ${newUserID} no existe`,
      });
    }

    const receiverDocument =
      receiverResult.Item.documento || receiverResult.Item.document || null;

    // 6. CREAR NUEVA ORDEN PARA EL RECEPTOR
    const newOrderID = uuidv4();
    const newDisplayOrderId = await nextDisplayOrderId(doc, ORDERS_TABLE);
    const ticketViewLink = `${WEB_APP_BASE_URL}/tickets/${encodeURIComponent(newOrderID)}`;

    // Calcular totales proporcionales
    const totalAmount = originalOrder.total_amount || originalOrder.amount || 0;
    const originalTicketCount = ticketsInOrder.length;
    const transferredCount = ticketsToTransfer.length;
    const proportionalAmount = Math.round(
      (totalAmount / originalTicketCount) * transferredCount,
    );

    const transferredTicketsForNewOrder = await Promise.all(
      ticketsToTransfer.map(async (ticket) => {
        const oldQrKey = resolveQrKey(ticket, currentUserID);
        await deleteQrImage(oldQrKey);
        if (ticket.qrCodeKey && ticket.qrCodeKey !== oldQrKey) {
          await deleteQrImage(ticket.qrCodeKey);
        }

        const qrResult = await generateTicketQr({
          order: {
            ...originalOrder,
            order_id: newOrderID,
            user_id: newUserID,
            payment_status: "APPROVED",
          },
          ticket: {
            ...ticket,
            user_id: newUserID,
            order_id: newOrderID,
          },
          userId: newUserID,
          userDocument: receiverDocument,
          paymentStatus: "APPROVED",
          expiresSeconds: 24 * 60 * 60,
          regenerate: true,
        });

        return {
          ...ticket,
          user_id: newUserID,
          user_document: receiverDocument,
          order_id: newOrderID,
          display_ticket_id: generateDisplayTicketId(),
          qr_url: qrResult?.qr_url || ticket.qr_url || "",
          qrCodeKey: qrResult?.qrCodeKey || resolveQrKey(ticket, newUserID),
          transferred_from: {
            user_id: currentUserID,
            user_name: senderName,
            original_order_id: orderID,
            transferred_at: timestamp,
          },
          transferred_to: {
            user_id: newUserID,
            user_name: receiverName,
            new_order_id: newOrderID,
            transferred_at: timestamp,
          },
        };
      }),
    );

    const newOrder = {
      order_id: newOrderID,
      display_order_id: newDisplayOrderId,
      user_id: newUserID,
      event_id: originalOrder.event_id,
      created_at: timestamp,
      finalized_at: timestamp,
      payment_status: "APPROVED",
      status: "approved",
      amount: proportionalAmount,
      currency: originalOrder.currency || "COP",
      tickets: transferredTicketsForNewOrder,
      transferred_from: {
        user_id: currentUserID,
        user_name: senderName,
        original_order_id: orderID,
        transferred_at: timestamp,
      },
      metadata: {
        ...originalOrder.metadata,
        transferredFrom: orderID,
        originalOwner: currentUserID,
      },
    };

    await doc
      .put({
        TableName: ORDERS_TABLE,
        Item: newOrder,
      })
      .promise();

    console.log(`✅ Nueva orden creada: ${newOrderID}`);

    if (originalOrder.event_id && newUserID) {
      const chatJoinResult = await joinUserToEventChat(
        originalOrder.event_id,
        newUserID,
      );
      console.log(`[CHAT] Receptor unido al chat del evento:`, chatJoinResult);
    }

    // 7. ACTUALIZAR ORDEN ORIGINAL
    const updatedOriginalTickets = ticketsInOrder.map((ticket) => {
      const shouldTransfer = ticketsToTransfer.some((selected) =>
        isSameTicket(selected, ticket),
      );
      if (!shouldTransfer) {
        return ticket;
      }

      return {
        ...ticket,
        user_id: newUserID,
        ticket_status: "TRANSFERRED",
        transfer_status: "TRANSFERRED",
        qr_url: "",
        qrCodeKey: null,
        qr_key: null,
        transferred_to: {
          user_id: newUserID,
          user_name: receiverName,
          new_order_id: newOrderID,
          transferred_at: timestamp,
        },
        transferred_from: {
          user_id: currentUserID,
          user_name: senderName,
          original_order_id: orderID,
          transferred_at: timestamp,
        },
      };
    });

    const remainingTicketsCount = updatedOriginalTickets.filter(
      (ticket) => (ticket.user_id || currentUserID) === currentUserID,
    ).length;

    const transferEntry = {
      to_user_id: newUserID,
      to_user_name: receiverName,
      new_order_id: newOrderID,
      ticket_count: transferredCount,
      ticket_ids: ticketIDs,
      transferred_at: timestamp,
    };

    if (remainingTicketsCount === 0) {
      // Todos los tickets transferidos
      await doc
        .update({
          TableName: ORDERS_TABLE,
          Key: { order_id: orderID },
          UpdateExpression: `
          SET tickets = :tickets,
              transfer_status = :tstatus,
              transferred_to = :transferred,
              modified_at = :timestamp,
              transfer_history = list_append(
                if_not_exists(transfer_history, :empty),
                :history
              )
        `,
          ExpressionAttributeValues: {
            ":tickets": updatedOriginalTickets,
            ":tstatus": "FULLY_TRANSFERRED",
            ":transferred": {
              user_id: newUserID,
              user_name: receiverName,
              new_order_id: newOrderID,
              ticket_count: transferredCount,
              transferred_at: timestamp,
            },
            ":timestamp": timestamp,
            ":empty": [],
            ":history": [transferEntry],
          },
        })
        .promise();
    } else {
      // Transferencia parcial
      await doc
        .update({
          TableName: ORDERS_TABLE,
          Key: { order_id: orderID },
          UpdateExpression: `
          SET tickets = :tickets,
              transfer_status = :tstatus,
              modified_at = :timestamp,
              transfer_history = list_append(
                if_not_exists(transfer_history, :empty),
                :history
              )
        `,
          ExpressionAttributeValues: {
            ":tickets": updatedOriginalTickets,
            ":tstatus": "PARTIALLY_TRANSFERRED",
            ":timestamp": timestamp,
            ":empty": [],
            ":history": [transferEntry],
          },
        })
        .promise();
    }

    console.log(`✅ Orden original actualizada`);

    // 8. ACTUALIZAR TICKETSDISTRIBUTION SI APLICA
    // Si los tickets tienen distributionId, actualizar el ownerId en TicketsDistribution
    for (const ticket of ticketsToTransfer) {
      if (ticket.distributionId && ticket.distributionCreateDate) {
        try {
          console.log(
            `🔄 Actualizando TicketsDistribution: ${ticket.distributionId}`,
          );

          const distResult = await doc
            .get({
              TableName: TICKETS_DIST_TABLE,
              Key: {
                id: String(ticket.distributionId),
                createDate: String(ticket.distributionCreateDate),
              },
            })
            .promise();

          if (distResult.Item) {
            const ticketId = normalizeId(
              ticket.ticketInstanceId || ticket.ticket_id,
            );
            const updatedTickets = distResult.Item.tickets.map((t) => {
              if (normalizeId(t.ticketInstanceId) === ticketId) {
                return {
                  ...t,
                  ownerId: newUserID,
                  orderId: newOrderID,
                  ticketStatus: "SOLD",
                };
              }
              return t;
            });

            await doc
              .put({
                TableName: TICKETS_DIST_TABLE,
                Item: {
                  ...distResult.Item,
                  id: String(distResult.Item.id),
                  createDate: String(distResult.Item.createDate),
                  tickets: updatedTickets,
                },
              })
              .promise();

            console.log(`   ✅ TicketsDistribution actualizado`);
          }
        } catch (distError) {
          console.error(
            `⚠️ Error actualizando TicketsDistribution:`,
            distError,
          );
          // No falla la transferencia por esto
        }
      }
    }

    // 9. ENVIAR NOTIFICACIONES
    try {
      // Al RECEPTOR
      await axios.post(NOTIFICATIONS_API, {
        triggerId: "TICKET_TRANSFERRED_RECEIVED",
        userId: newUserID,
        channels: ["inApp", "push", "email", "whatsapp"],
        metadata: {
          userId: newUserID,
          senderName,
          receiverName,
          userName: receiverName,
          senderUserId: currentUserID,
          receiverUserId: newUserID,
          ticketCount: transferredCount,
          eventName: eventData?.name || eventData?.nombre || "un evento",
          eventId: originalOrder.event_id,
          eventImage: eventData?.main_image || eventData?.imagenPrincipal || "",
          orderID: newOrderID,
          ticketViewLink,
          viewTicketsLink: ticketViewLink,
          eventDate: eventData?.date || eventData?.fechaIni,
          eventLocation: eventData?.location || eventData?.lugar,
          type: "ticket_transferred",
        },
      });

      // Al REMITENTE
      await axios.post(NOTIFICATIONS_API, {
        triggerId: "TICKET_TRANSFERRED_SENT",
        userId: currentUserID,
        channels: ["inApp", "push", "email", "whatsapp"],
        metadata: {
          userId: currentUserID,
          senderName,
          receiverName,
          userName: senderName,
          senderUserId: currentUserID,
          receiverUserId: newUserID,
          ticketCount: transferredCount,
          eventName: eventData?.name || eventData?.nombre || "un evento",
          eventId: originalOrder.event_id,
          eventImage: eventData?.main_image || eventData?.imagenPrincipal || "",
          orderID: orderID,
          eventDate: eventData?.date || eventData?.fechaIni,
          eventLocation: eventData?.location || eventData?.lugar,
          type: "ticket_transferred_sent",
        },
      });

      // WebSocket al receptor
      await sendWebSocketMessage(newUserID, {
        channel: "notification",
        action: "tickets-received",
        type: "TICKET_TRANSFERRED_RECEIVED",
        senderName,
        ticketCount: transferredCount,
        eventName: eventData?.name || "un evento",
        orderID: newOrderID,
        timestamp,
      });

      // WebSocket al remitente
      await sendWebSocketMessage(currentUserID, {
        channel: "notification",
        action: "tickets-sent",
        type: "TICKET_TRANSFERRED_SENT",
        receiverName,
        ticketCount: transferredCount,
        eventName: eventData?.name || "un evento",
        orderID: orderID,
        timestamp,
      });

      console.log("✅ Notificaciones enviadas");
    } catch (notifError) {
      console.error("⚠️ Error al enviar notificaciones:", notifError.message);
      console.error("⚠️ Stack:", notifError.stack);
      if (notifError.response) {
        console.error("⚠️ Response status:", notifError.response.status);
        console.error(
          "⚠️ Response data:",
          JSON.stringify(notifError.response.data),
        );
      }
    }

    return buildResponse(200, {
      message: "Tickets transferidos exitosamente",
      transferredTickets: transferredCount,
      originalOrderID: orderID,
      newOrderID,
      recipient: {
        userId: newUserID,
        name: receiverName,
      },
      remainingTickets: remainingTicketsCount,
    });
  } catch (error) {
    console.error("❌ Error en transferTicket:", error);
    return buildResponse(500, {
      message: "Error interno",
      detail: error.message,
    });
  }
};

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}
