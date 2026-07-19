const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const axios = require("axios");
const { evaluateRefundEligibility } = require("./lib/refundEligibility");
const { processPaymentRefund } = require("./lib/wompiRefund");

// Configurar cliente de DynamoDB
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);

// URL del API de notificaciones
const NOTIFICATIONS_API =
  process.env.NOTIFICATIONS_API ||
  (process.env.STAGE === "qa"
    ? "https://api-qa.doeventsapp.com/notifications/trigger-notification"
    : "https://api-dev.doeventsapp.com/notifications/trigger-notification");

/**
 * Verifica si ya existe un reembolso para esta orden y tickets
 * @param {string} orderId - ID de la orden
 * @param {Array} ticketInstanceIds - IDs de tickets a reembolsar
 * @returns {Object} - Resultado de la verificación
 */
const checkExistingRefund = async (orderId, ticketInstanceIds) => {
  console.log("🔍 Verificando si ya existe un reembolso para esta orden...");

  try {
    // Buscar reembolsos existentes para esta orden usando orderIdIndex
    const result = await dynamodb.send(
      new QueryCommand({
        TableName:
          process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation",
        IndexName: "orderIdIndex",
        KeyConditionExpression: "orderId = :orderId",
        ExpressionAttributeValues: {
          ":orderId": orderId,
        },
      }),
    );

    if (!result.Items || result.Items.length === 0) {
      console.log("✅ No hay reembolsos previos para esta orden");
      return { exists: false };
    }

    // Verificar si algún reembolso coincide exactamente con los tickets solicitados
    for (const refund of result.Items) {
      // Ordenar arrays para comparación
      const existingTickets = (refund.ticket_instances || []).sort();
      const requestedTickets = (ticketInstanceIds || []).sort();

      // Comparar si son exactamente los mismos tickets
      const areEqual =
        existingTickets.length === requestedTickets.length &&
        existingTickets.every((val, idx) => val === requestedTickets[idx]);

      if (areEqual) {
        // Verificar el estado del reembolso (usar refundStatus de ticketsCancelation)
        if (
          refund.refundStatus === "PENDING" ||
          refund.refundStatus === "COMPLETED"
        ) {
          console.log(
            `⚠️  Ya existe un reembolso ${refund.refundStatus} para estos tickets:`,
            refund.id,
          );
          return {
            exists: true,
            refund: refund,
            status: refund.refundStatus,
          };
        } else if (refund.refundStatus === "REJECTED") {
          console.log(
            `📋 Existe un reembolso REJECTED previo (${refund.id}), permitiendo reintento`,
          );
          // Permitir reintento si fue rechazado
          return { exists: false };
        }
      }
    }

    // Si hay reembolsos pero no coinciden exactamente con los tickets, es un reembolso parcial diferente
    console.log(
      `📋 Existen ${result.Items.length} reembolso(s) previo(s) pero para diferentes tickets`,
    );
    return { exists: false };
  } catch (error) {
    console.error("❌ Error verificando reembolsos existentes:", error);
    // En caso de error, continuar con precaución
    return { exists: false, error: error.message };
  }
};

/**
 * Valida que la orden exista y pertenezca al usuario
 * @param {string} orderId - ID de la orden
 * @param {string} userId - ID del usuario
 * @returns {Object} - Resultado de la validación con la orden si existe
 */
const validateOrder = async (orderId, userId) => {
  console.log("🔍 Validando orden en DynamoDB:", { orderId, userId });

  try {
    const params = {
      TableName: process.env.ORDERS_TABLE || "Orders",
      Key: {
        order_id: orderId,
      },
    };

    const result = await dynamodb.send(new GetCommand(params));

    if (!result.Item) {
      console.error("❌ Orden no encontrada:", orderId);
      return {
        valid: false,
        reason: "Orden no encontrada",
        statusCode: 404,
      };
    }

    const order = result.Item;
    console.log("📦 Orden encontrada:", {
      order_id: order.order_id,
      user_id: order.user_id,
      payment_status: order.payment_status,
      quantity: order.quantity,
    });

    // Validar que la orden pertenezca al usuario
    if (order.user_id !== userId) {
      console.error("❌ La orden no pertenece al usuario:", {
        orderUserId: order.user_id,
        requestUserId: userId,
      });
      return {
        valid: false,
        reason: "La orden no pertenece al usuario especificado",
        statusCode: 403,
      };
    }

    // Validar que la orden esté aprobada
    if (order.payment_status !== "APPROVED") {
      console.error("❌ La orden no está aprobada:", order.payment_status);
      return {
        valid: false,
        reason: `Solo se pueden reembolsar órdenes aprobadas. Estado actual: ${order.payment_status}`,
        statusCode: 400,
      };
    }

    console.log("✅ Orden validada correctamente");
    return {
      valid: true,
      order: order,
    };
  } catch (error) {
    console.error("❌ Error al validar orden:", error);
    return {
      valid: false,
      reason: `Error al validar la orden: ${error.message}`,
      statusCode: 500,
    };
  }
};

/**
 * Busca tickets usando el método legacy (para órdenes antiguas sin structure de tickets individuales)
 * @param {string} orderId - ID de la orden
 * @param {Array} metadataTickets - metadata.tickets de la orden (con quantity)
 * @param {Array} ticketInstanceIds - IDs específicos a buscar (opcional)
 * @returns {Object} - Resultado de la búsqueda
 */
const findOrderTicketsLegacy = async (
  orderId,
  metadataTickets,
  ticketInstanceIds = null,
) => {
  console.log(`📦 Escaneando TicketsDistribution para orden ${orderId}...`);

  try {
    const distributions = [];
    const ticketsFound = [];

    // Obtener las distribuciones del metadata
    const distIds = metadataTickets.map((t) => ({
      id: t.ticketsDistId,
      createDate: t.createDate,
      quantity: t.quantity,
    }));

    console.log(`🔍 Buscando en ${distIds.length} distribuciones del metadata`);

    for (const distInfo of distIds) {
      try {
        const distResult = await dynamodb.send(
          new GetCommand({
            TableName: process.env.TICKETS_DIST_TABLE || "TicketsDistribution",
            Key: {
              id: distInfo.id,
              createDate: distInfo.createDate,
            },
          }),
        );

        if (!distResult.Item) {
          console.warn(`⚠️  Distribución ${distInfo.id} no encontrada`);
          continue;
        }

        const dist = distResult.Item;
        const distTickets = dist.tickets || [];

        // Buscar tickets SOLD que pertenezcan a esta orden
        const matchingTickets = [];

        for (let i = 0; i < distTickets.length; i++) {
          const ticket = distTickets[i];

          // Verificar que el ticket esté SOLD y pertenezca a esta orden
          if (ticket.ticketStatus === "SOLD" && ticket.orderId === orderId) {
            // Si se especificaron tickets específicos, filtrar
            if (
              ticketInstanceIds &&
              !ticketInstanceIds.includes(ticket.ticketInstanceId)
            ) {
              continue;
            }

            matchingTickets.push({
              ...ticket,
              distIndex: i,
            });
          }
        }

        if (matchingTickets.length > 0) {
          distributions.push({
            id: dist.id,
            createDate: dist.createDate,
            eventId: dist.eventId,
            tickets: dist.tickets,
            matchingTickets: matchingTickets,
          });

          ticketsFound.push(...matchingTickets);
          console.log(
            `  ✓ Distribución ${dist.id}: ${matchingTickets.length} tickets encontrados`,
          );
        }
      } catch (error) {
        console.error(
          `❌ Error obteniendo distribución ${distInfo.id}:`,
          error,
        );
        continue;
      }
    }

    console.log(
      `✅ Encontrados ${ticketsFound.length} tickets válidos (legacy)`,
    );

    if (ticketsFound.length === 0) {
      return {
        success: false,
        error: "No se encontraron tickets SOLD válidos para reembolsar",
        distributions: [],
        tickets: [],
      };
    }

    return {
      success: true,
      distributions: distributions,
      tickets: ticketsFound,
    };
  } catch (error) {
    console.error("❌ Error en búsqueda legacy:", error);
    return {
      success: false,
      error: error.message,
      distributions: [],
      tickets: [],
    };
  }
};

/**
 * Encuentra los tickets en TicketsDistribution usando la información de la orden
 * @param {Object} order - La orden completa con sus tickets
 * @param {Array} ticketInstanceIds - IDs de las instancias de tickets a reembolsar (opcional)
 * @returns {Object} - Distribuciones y tickets encontrados
 */
const findOrderTicketsInDistributions = async (
  order,
  ticketInstanceIds = null,
) => {
  console.log("🔍 Buscando tickets de la orden:", order.order_id);

  try {
    // COMPATIBILIDAD: Manejar estructura nueva y antigua de órdenes
    const orderTickets = order.tickets || [];

    // Verificar si es estructura nueva (tickets individuales) o antigua (metadata con quantity)
    // Aceptar tanto `ticket_id` como `ticketInstanceId` como indicador de tickets individuales
    const hasIndividualTickets =
      orderTickets.length > 0 &&
      (orderTickets[0].ticket_id || orderTickets[0].ticketInstanceId);

    if (!hasIndividualTickets) {
      // Estructura ANTIGUA: tickets en metadata con quantity
      console.log(
        "⚠️  Orden con estructura antigua (metadata.tickets). Usando Scan para buscar tickets...",
      );

      const metadataTickets = order.metadata?.tickets || [];
      if (metadataTickets.length === 0) {
        console.error(
          "❌ La orden no tiene tickets ni en structure nueva ni antigua",
        );
        return {
          success: false,
          error: "La orden no contiene tickets",
          distributions: [],
          tickets: [],
        };
      }

      // Para estructura antigua, necesitamos escanear TicketsDistribution filtrando por orderId
      return await findOrderTicketsLegacy(
        order.order_id,
        metadataTickets,
        ticketInstanceIds,
      );
    }

    console.log(
      `📋 Orden tiene ${orderTickets.length} tickets (estructura nueva)`,
    );

    // Si se especificaron tickets específicos, filtrar solo esos
    // Aceptar tanto `ticket_id` como `ticketInstanceId` en la petición
    const ticketsToProcess = ticketInstanceIds
      ? orderTickets.filter(
          (t) =>
            (t.ticket_id && ticketInstanceIds.includes(t.ticket_id)) ||
            (t.ticketInstanceId &&
              ticketInstanceIds.includes(t.ticketInstanceId)),
        )
      : orderTickets;

    if (ticketsToProcess.length === 0) {
      console.error(
        "❌ No se encontraron los tickets especificados en la orden",
      );
      return {
        success: false,
        error: "Los tickets especificados no pertenecen a esta orden",
        distributions: [],
        tickets: [],
      };
    }

    console.log(`🎯 Procesando ${ticketsToProcess.length} tickets`);

    // Agrupar tickets por distribución
    const distGroups = {};
    for (const ticket of ticketsToProcess) {
      const distId =
        ticket.ticketsDistId || ticket.distributionId || ticket.distId;
      const createDate =
        ticket.distCreateDate ||
        ticket.distributionCreateDate ||
        ticket.createDate;
      if (!distGroups[distId]) {
        distGroups[distId] = {
          distId: distId,
          createDate: createDate,
          ticketIds: [],
        };
      }
      // Pushar el identificador de instancia que usará TicketsDistribution (preferir ticketInstanceId)
      distGroups[distId].ticketIds.push(
        ticket.ticketInstanceId || ticket.ticket_id,
      );
    }

    console.log(
      `📦 Tickets agrupados en ${Object.keys(distGroups).length} distribuciones`,
    );

    // Obtener cada distribución y verificar los tickets
    const distributions = [];
    const ticketsFound = [];

    for (const [distId, group] of Object.entries(distGroups)) {
      try {
        // Obtener la distribución completa
        const distResult = await dynamodb.send(
          new GetCommand({
            TableName: process.env.TICKETS_DIST_TABLE || "TicketsDistribution",
            Key: {
              id: distId,
              createDate: group.createDate,
            },
          }),
        );

        if (!distResult.Item) {
          console.error(`❌ Distribución no encontrada: ${distId}`);
          continue;
        }

        const dist = distResult.Item;

        // Buscar los tickets en esta distribución
        const distTickets = dist.tickets || [];
        const matchingTickets = [];

        for (const ticketId of group.ticketIds) {
          // Buscar el ticket por ticketInstanceId
          const ticketIndex = distTickets.findIndex(
            (t) => t.ticketInstanceId === ticketId,
          );

          if (ticketIndex === -1) {
            console.error(
              `⚠️  Ticket ${ticketId} no encontrado en distribución ${distId}`,
            );
            continue;
          }

          const ticket = distTickets[ticketIndex];

          // Verificar que el ticket esté en estado SOLD
          if (ticket.ticketStatus !== "SOLD") {
            console.error(
              `⚠️  Ticket ${ticketId} tiene estado ${ticket.ticketStatus}, no SOLD`,
            );
            continue;
          }

          matchingTickets.push({
            ...ticket,
            distIndex: ticketIndex, // Guardar el índice para la actualización
          });
        }

        if (matchingTickets.length > 0) {
          distributions.push({
            id: dist.id,
            createDate: dist.createDate,
            eventId: dist.eventId,
            tickets: dist.tickets,
            matchingTickets: matchingTickets,
          });

          ticketsFound.push(...matchingTickets);

          console.log(
            `  ✓ Distribución ${dist.id}: ${matchingTickets.length} tickets encontrados`,
          );
        }
      } catch (error) {
        console.error(`❌ Error obteniendo distribución ${distId}:`, error);
        continue;
      }
    }

    console.log(
      `✅ Encontrados ${ticketsFound.length} tickets válidos en ${distributions.length} distribuciones`,
    );

    if (ticketsFound.length === 0) {
      // Verificar si los tickets existen pero están en otro estado (ya reembolsados)
      let foundAvailable = 0;
      for (const [distId, group] of Object.entries(distGroups)) {
        try {
          const distResult = await dynamodb.send(
            new GetCommand({
              TableName:
                process.env.TICKETS_DIST_TABLE || "TicketsDistribution",
              Key: { id: distId, createDate: group.createDate },
            }),
          );
          if (distResult.Item) {
            const distTickets = distResult.Item.tickets || [];
            for (const ticketId of group.ticketIds) {
              const ticket = distTickets.find(
                (t) => t.ticketInstanceId === ticketId,
              );
              if (ticket && ticket.ticketStatus === "AVAILABLE") {
                foundAvailable++;
              }
            }
          }
        } catch (err) {
          console.error("Error verificando estado:", err);
        }
      }

      const errorMsg =
        foundAvailable > 0
          ? `Los tickets solicitados ya no están en estado SOLD (${foundAvailable} tickets ya fueron reembolsados o liberados)`
          : "No se encontraron tickets SOLD válidos para reembolsar";

      return {
        success: false,
        error: errorMsg,
        alreadyRefunded: foundAvailable > 0,
        distributions: [],
        tickets: [],
      };
    }

    return {
      success: true,
      distributions: distributions,
      tickets: ticketsFound,
    };
  } catch (error) {
    console.error("❌ Error buscando tickets en distribuciones:", error);
    return {
      success: false,
      error: error.message,
      distributions: [],
      tickets: [],
    };
  }
};

/**
 * Actualiza el estado de tickets en TicketsDistribution a AVAILABLE
 * @param {Array} distributions - Array de distribuciones con los tickets a actualizar
 * @param {Array} ticketInstanceIds - IDs de tickets a liberar
 * @returns {Object} - Resultado de la operación
 */
const releaseTicketsInDistributions = async (
  distributions,
  ticketInstanceIds,
) => {
  console.log(
    `🔄 Liberando ${ticketInstanceIds.length} tickets en ${distributions.length} distribuciones...`,
  );

  try {
    const updatePromises = [];
    const idSet = new Set(
      (ticketInstanceIds || []).map((id) => String(id || "").trim()).filter(Boolean),
    );

    for (const dist of distributions) {
      // Actualizar los tickets en esta distribución
      const updatedTickets = dist.tickets.map((ticket) => {
        const ticketId = String(ticket.ticketInstanceId || ticket.ticket_id || ticket.id || "").trim();
        if (ticketId && idSet.has(ticketId)) {
          console.log(
            `  ✓ Liberando ticket: ${ticketId} (${ticket.category})`,
          );
          return {
            ...ticket,
            ticketStatus: "AVAILABLE",
            orderId: null,
            ownerId: null,
            userId: null,
            qrUrl: null,
            reservationExpiry: null,
            soldAt: null,
            purchasePrice: ticket.purchasePrice,
          };
        }
        return ticket;
      });

      // Guardar la distribución actualizada
      const updatePromise = dynamodb.send(
        new PutCommand({
          TableName: process.env.TICKETS_DIST_TABLE || "TicketsDistribution",
          Item: {
            ...dist,
            tickets: updatedTickets,
          },
        }),
      );

      updatePromises.push(updatePromise);
    }

    await Promise.all(updatePromises);
    console.log("✅ Todos los tickets liberados exitosamente");

    return { success: true };
  } catch (error) {
    console.error("❌ Error liberando tickets:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Crea un registro de trazabilidad del reembolso
 * @param {Object} refundData - Datos del reembolso
 * @returns {Object} - Resultado de la operación
 */
const buildFilingId = (refundId) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const short = String(refundId || "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();
  return `REF-${y}${m}${d}-${short}`;
};

const createRefundTraceability = async (refundData) => {
  console.log("📝 Creando registro de trazabilidad del reembolso...");

  try {
    const { v4: uuidv4 } = require("uuid");
    const refundId = uuidv4();
    const filingId = buildFilingId(refundId);
    const timestamp = new Date().toISOString();

    // Estructura compatible con ticketsCancelation existente
    const refundRecord = {
      id: refundId, // Campo primario de ticketsCancelation
      filingId,
      orderId: refundData.orderId, // GSI orderIdIndex
      eventId: refundData.eventId, // GSI eventIdIndex
      userId: refundData.userId,
      organizerId: refundData.organizerId || null,
      refund_type: refundData.isFullRefund ? "FULL" : "PARTIAL",
      refundStatus: refundData.refundStatus || "PENDING",
      ticket_instances: refundData.ticketInstanceIds,
      quantity: refundData.ticketInstanceIds.length,
      refund_amount: refundData.refundAmount,
      platform_fee_retained: refundData.platformFeeRetained || 0,
      refund_subtotal: refundData.refundSubtotal || refundData.refundAmount,
      currency: refundData.currency || "COP",
      original_total: refundData.originalTotal,
      payment_method: refundData.paymentMethod,
      reason: refundData.reason || "Solicitud de usuario",
      ticket_details: refundData.ticketDetails || [],
      createdAt: timestamp,
      executionDate: timestamp,
      eventName: refundData.eventName,
      eventStartDate: refundData.eventDate,
      originalStatus: "APPROVED",
      payment_refund: refundData.paymentRefund || null,
    };

    await dynamodb.send(
      new PutCommand({
        TableName:
          process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation",
        Item: refundRecord,
      }),
    );

    console.log(`✅ Registro de trazabilidad creado: ${refundId}`);

    return {
      success: true,
      refundId: refundId,
      filingId,
    };
  } catch (error) {
    console.error("❌ Error creando registro de trazabilidad:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Actualiza el estado de una orden después de un reembolso
 * @param {string} orderId - ID de la orden
 * @param {boolean} isFullRefund - Si es reembolso total o parcial
 * @param {number} refundedQuantity - Cantidad de tickets reembolsados
 * @param {number} refundAmount - Monto reembolsado
 * @returns {Object} - Resultado de la operación
 */
const computeTicketServiceFee = (unitPriceCop) => {
  const price = Math.max(0, Number(unitPriceCop) || 0);
  const taxService = price * 0.08;
  const taxIva = (taxService + 1500) * 0.19;
  return Math.round(taxService + 1500 + taxIva);
};

const sumAdditionalCharges = (charges) => {
  if (!Array.isArray(charges)) return 0;
  return charges.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
};

const resolveTicketFacePrice = (orderTicket = {}, distTicket = {}) => {
  const candidates = [
    orderTicket.price,
    orderTicket.purchasePrice,
    orderTicket.ticket_amount,
    distTicket.purchasePrice,
    distTicket.price,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return 0;
};

const resolveTicketPlatformFee = (orderTicket = {}, facePrice = 0) => {
  const explicit = Number(orderTicket.additional_charges_amount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const fromCharges = sumAdditionalCharges(
    orderTicket.additional_charges || orderTicket.additionalCharges,
  );
  if (fromCharges > 0) return fromCharges;
  return computeTicketServiceFee(facePrice);
};

const isTicketAlreadyRefunded = (ticket = {}) => {
  const status = String(
    ticket.refund_status || ticket.ticket_status || "",
  ).toUpperCase();
  return status === "REFUNDED" || status === "PENDING_REFUND";
};

const isTicketTransferredAway = (ticket = {}, orderUserId) => {
  const status = String(
    ticket.transfer_status || ticket.ticket_status || "",
  ).toUpperCase();
  if (status === "TRANSFERRED") return true;
  const ticketOwner = String(ticket.user_id || "").trim();
  const owner = String(orderUserId || "").trim();
  return Boolean(ticketOwner && owner && ticketOwner !== owner);
};

const countActiveOrderTickets = (order = {}) => {
  const tickets = Array.isArray(order.tickets) ? order.tickets : [];
  if (!tickets.length) return Number(order.quantity) || 0;
  return tickets.filter(
    (ticket) =>
      !isTicketAlreadyRefunded(ticket) &&
      !isTicketTransferredAway(ticket, order.user_id),
  ).length;
};

const buildRefundAmountBreakdown = (order = {}, ticketsToRefund = []) => {
  const orderTickets = Array.isArray(order.tickets) ? order.tickets : [];
  const orderTicketById = new Map();
  orderTickets.forEach((ticket) => {
    const id = ticket.ticket_id || ticket.ticketInstanceId || ticket.id;
    if (id) orderTicketById.set(String(id), ticket);
  });

  let subtotal = 0;
  let platformFee = 0;
  const ticketDetails = ticketsToRefund.map((distTicket) => {
    const ticketId = String(
      distTicket.ticketInstanceId || distTicket.ticket_id || distTicket.id || "",
    );
    const orderTicket = orderTicketById.get(ticketId) || {};
    const facePrice = resolveTicketFacePrice(orderTicket, distTicket);
    const fee = resolveTicketPlatformFee(orderTicket, facePrice);
    subtotal += facePrice;
    platformFee += fee;
    return {
      ticketInstanceId: ticketId,
      category: orderTicket.category || distTicket.category || "General",
      seat:
        orderTicket.seatLabel ||
        orderTicket.seat_label ||
        distTicket.location?.seatLabel ||
        distTicket.seatLabel ||
        "Sin asiento",
      price: facePrice,
      platformFee: fee,
      refundableAmount: facePrice,
    };
  });

  return {
    subtotal,
    platformFee,
    // Solo se reembolsa el valor facial; comisiones no son reembolsables.
    refundAmount: subtotal,
    ticketDetails,
  };
};

const updateOrderStatus = async (
  orderId,
  isFullRefund,
  refundedQuantity,
  refundAmount,
  refundedTicketIds = [],
  platformFee = 0,
  refundStatus = "PENDING",
  paymentRefund = null,
) => {
  console.log(
    `🔄 Actualizando orden ${orderId} (${isFullRefund ? "FULL" : "PARTIAL"} refund, status=${refundStatus})...`,
  );

  try {
    const orderResult = await dynamodb.send(
      new GetCommand({
        TableName: process.env.ORDERS_TABLE || "Orders",
        Key: { order_id: orderId },
      }),
    );
    const order = orderResult.Item || {};
    const refundedSet = new Set(
      (refundedTicketIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    const timestamp = new Date().toISOString();
    const statusValue = refundStatus || "PENDING";
    const ticketMatchesRefund = (ticket = {}) => {
      const candidates = [
        ticket.ticket_id,
        ticket.ticketInstanceId,
        ticket.id,
        ticket.ticket_instance_id,
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean);
      return candidates.some((id) => refundedSet.has(id));
    };
    const anyTicketMatched = (order.tickets || []).some(ticketMatchesRefund);
    const updatedTickets = Array.isArray(order.tickets)
      ? order.tickets.map((ticket) => {
          const matched = ticketMatchesRefund(ticket);
          // Partial: solo IDs match. Full: match, o si ningún ID matcheó marcar todas.
          const shouldMark = matched || (isFullRefund && !anyTicketMatched);
          if (!shouldMark) return ticket;
          return {
            ...ticket,
            refund_status: "REFUNDED",
            ticket_status: "REFUNDED",
            is_refunded: true,
            refunded_at: timestamp,
            qr_url: "",
            qrCodeKey: null,
          };
        })
      : [];

    if (isFullRefund) {
      const values = {
        ":status": statusValue,
        ":now": timestamp,
        ":amount": refundAmount,
        ":fee": platformFee,
        ":true": true,
        ":tickets": updatedTickets,
      };
      let updateExpression =
        "SET refund_status = :status, refunded_at = :now, refund_amount = :amount, platform_fee_retained = :fee, is_refunded = :true, tickets = :tickets";
      if (paymentRefund) {
        updateExpression += ", payment_refund = :paymentRefund";
        values[":paymentRefund"] = paymentRefund;
      }
      if (statusValue === "COMPLETED") {
        updateExpression += ", payment_status = :cancelled";
        values[":cancelled"] = "CANCELLED";
      }

      await dynamodb.send(
        new UpdateCommand({
          TableName: process.env.ORDERS_TABLE || "Orders",
          Key: { order_id: orderId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: values,
        }),
      );

      console.log(`✅ Orden marcada con reembolso ${statusValue}`);
    } else {
      const values = {
        ":refunded": refundedQuantity,
        ":status": statusValue,
        ":amount": refundAmount,
        ":fee": platformFee,
        ":zero": 0,
        ":now": timestamp,
        ":true": true,
        ":tickets": updatedTickets,
      };
      let updateExpression =
        "SET partial_refund_status = :status, partial_refund_amount = if_not_exists(partial_refund_amount, :zero) + :amount, partial_refund_platform_fee = if_not_exists(partial_refund_platform_fee, :zero) + :fee, partial_refund_count = if_not_exists(partial_refund_count, :zero) + :refunded, last_refund_at = :now, is_partially_refunded = :true, tickets = :tickets";
      if (paymentRefund) {
        updateExpression += ", payment_refund = :paymentRefund";
        values[":paymentRefund"] = paymentRefund;
      }

      await dynamodb.send(
        new UpdateCommand({
          TableName: process.env.ORDERS_TABLE || "Orders",
          Key: { order_id: orderId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: values,
        }),
      );

      console.log(
        `✅ Orden actualizada: ${refundedQuantity} tickets reembolsados (parcial)`,
      );
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Error actualizando orden:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

const markRefundPaymentResult = async (refundId, paymentResult) => {
  if (!refundId || !paymentResult) return;
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName:
          process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation",
        Key: { id: refundId },
        UpdateExpression:
          "SET refundStatus = :status, payment_refund = :payment, updatedAt = :now",
        ExpressionAttributeValues: {
          ":status": paymentResult.refundStatus || "PENDING",
          ":payment": paymentResult,
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    console.warn(
      "⚠️ No se pudo actualizar payment_refund en ticketsCancelation:",
      error.message,
    );
  }
};

/**
 * Procesa un reembolso de boletas
 * @param {Object} event - Evento de API Gateway
 * @returns {Object} - Respuesta HTTP con el resultado del reembolso
 */
exports.processRefund = async (event) => {
  console.log("🔄 Iniciando proceso de reembolso");
  console.log("📋 Event:", JSON.stringify(event, null, 2));

  try {
    // 1. Obtener parámetros de la solicitud
    console.log("🔍 Tipo de event.body:", typeof event.body);
    console.log("🔍 event.body valor:", event.body);

    let body;
    if (typeof event.body === "string") {
      console.log("📦 Parseando body desde string...");
      body = JSON.parse(event.body);
    } else {
      console.log("📦 Usando event.body directamente (ya es objeto)");
      body = event.body || {};
    }

    console.log("📋 Body parseado:", JSON.stringify(body, null, 2));

    // Aceptar múltiples nombres de campo para compatibilidad con distintos frontends
    const userId = body.userId || body.user_id;
    const orderId = body.orderId || body.order_id;
    const ticketInstanceIds =
      body.ticketInstanceIds ||
      body.ticket_ids ||
      body.ticketIds ||
      body.ticket_id_list ||
      [];
    const reason = body.reason || body.motivo;

    // 2. Validar parámetros requeridos
    if (!userId) {
      console.error("❌ userId no proporcionado");
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "El parámetro userId es requerido",
        }),
      };
    }

    if (!orderId) {
      console.error("❌ orderId no proporcionado");
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "El parámetro orderId es requerido",
        }),
      };
    }

    // ticketInstanceIds es opcional. Si no se proporciona, se reembolsan todos los tickets de la orden
    const specificTickets =
      ticketInstanceIds &&
      Array.isArray(ticketInstanceIds) &&
      ticketInstanceIds.length > 0;

    console.log(`📅 Procesando reembolso para orden: ${orderId}`);
    console.log(`👤 Usuario: ${userId}`);
    console.log(
      `🎫 Tickets específicos: ${specificTickets ? ticketInstanceIds.join(", ") : "TODOS"}`,
    );

    // 3. Validar que la orden existe y pertenece al usuario
    const orderValidation = await validateOrder(orderId, userId);

    if (!orderValidation.valid) {
      console.error("❌ Validación de orden fallida:", orderValidation.reason);
      return {
        statusCode: orderValidation.statusCode,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: orderValidation.reason,
        }),
      };
    }

    const order = orderValidation.order;
    console.log("✅ Orden validada, procediendo con reembolso");

    const earlyTicketIds =
      specificTickets && Array.isArray(ticketInstanceIds)
        ? ticketInstanceIds
        : (Array.isArray(order.tickets)
            ? order.tickets
                .map((t) => t.ticket_id || t.ticketInstanceId || t.id)
                .filter(Boolean)
            : null);
    const earlyIdempotency = await checkExistingRefund(orderId, earlyTicketIds);
    if (earlyIdempotency.exists) {
      console.log(
        `⚠️  Reembolso duplicado detectado temprano (${earlyIdempotency.status})`,
      );
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          message: `Reembolso ya procesado previamente (${earlyIdempotency.status})`,
          duplicate: true,
          data: {
            refundId: earlyIdempotency.refund.id,
            filingId: earlyIdempotency.refund.filingId || null,
            orderId: earlyIdempotency.refund.orderId,
            refundType: earlyIdempotency.refund.refund_type,
            refundStatus: earlyIdempotency.refund.refundStatus,
            ticketsRefunded: earlyIdempotency.refund.quantity,
            refundAmount: earlyIdempotency.refund.refund_amount,
            processedAt: earlyIdempotency.refund.createdAt,
          },
        }),
      };
    }

    const eventIdForPolicy = order.event_id || order.eventId;
    if (eventIdForPolicy) {
      try {
        const eventResult = await dynamodb.send(
          new GetCommand({
            TableName: process.env.EVENTS_TABLE || "Eventos",
            Key: { id: eventIdForPolicy },
          }),
        );
        const evento = eventResult.Item;
        const now = new Date();
        const currentDate = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("");

        const eligibility = evaluateRefundEligibility({
          categoriaReembolso: evento?.categoriaReembolso,
          currentDate,
          eventDate: evento?.fechaIni,
        });

        if (!eligibility.canRequestRefund) {
          return {
            statusCode: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify({
              success: false,
              message: eligibility.reason,
              requiresManualReview: Boolean(eligibility.requiresManualReview),
            }),
          };
        }
      } catch (policyErr) {
        console.error("❌ Error validando política de reembolso:", policyErr);
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            success: false,
            message: "No se pudo validar la política de reembolsos del evento.",
          }),
        };
      }
    }

    if (specificTickets) {
      const orderTickets = Array.isArray(order.tickets) ? order.tickets : [];
      const invalidTickets = ticketInstanceIds.filter((id) => {
        const ticket = orderTickets.find(
          (t) =>
            String(t.ticket_id || t.ticketInstanceId || t.id || "") ===
            String(id),
        );
        if (!ticket) return false;
        return (
          isTicketAlreadyRefunded(ticket) ||
          isTicketTransferredAway(ticket, order.user_id)
        );
      });
      if (invalidTickets.length > 0) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            success: false,
            message:
              "Una o más boletas ya fueron transferidas o reembolsadas y no pueden reembolsarse",
            invalidTickets,
          }),
        };
      }
    }

    // 4. Buscar los tickets en TicketsDistribution usando la información de la orden
    const ticketSearch = await findOrderTicketsInDistributions(
      order, // Pasar la orden completa
      specificTickets ? ticketInstanceIds : null,
    );

    if (!ticketSearch.success || ticketSearch.tickets.length === 0) {
      console.error("❌ No se encontraron tickets para reembolsar");

      // Mensaje específico si los tickets ya fueron reembolsados
      const statusCode = ticketSearch.alreadyRefunded ? 400 : 404;
      const userMessage = ticketSearch.alreadyRefunded
        ? "Los tickets seleccionados ya han sido reembolsados anteriormente"
        : "No se encontraron tickets válidos para reembolsar";

      return {
        statusCode: statusCode,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: userMessage,
          error: ticketSearch.error,
          alreadyRefunded: ticketSearch.alreadyRefunded || false,
        }),
      };
    }

    const ticketsToRefund = ticketSearch.tickets;
    console.log(
      `✅ Encontrados ${ticketsToRefund.length} tickets para reembolsar`,
    );

    // 5. Doble verificación de idempotencia antes de modificar datos
    // (por si hubo una llamada concurrente)
    const finalIdempotencyCheck = await checkExistingRefund(
      orderId,
      ticketsToRefund.map((t) => t.ticketInstanceId),
    );

    if (finalIdempotencyCheck.exists) {
      console.log(
        "⚠️  Reembolso duplicado detectado en verificación final (posible concurrencia)",
      );
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: true,
          message: `Reembolso ya procesado previamente (${finalIdempotencyCheck.status})`,
          duplicate: true,
          data: {
            refundId: finalIdempotencyCheck.refund.id,
            orderId: finalIdempotencyCheck.refund.orderId,
            refundType: finalIdempotencyCheck.refund.refund_type,
            refundStatus: finalIdempotencyCheck.refund.refundStatus,
            ticketsRefunded: finalIdempotencyCheck.refund.quantity,
            refundAmount: finalIdempotencyCheck.refund.refund_amount,
            processedAt: finalIdempotencyCheck.refund.createdAt,
          },
        }),
      };
    }

    // 6. Determinar tipo de reembolso

    // Validar que si se especificaron tickets, todos existan
    if (specificTickets) {
      const foundIds = ticketsToRefund.map((t) => t.ticketInstanceId);
      const missingIds = ticketInstanceIds.filter(
        (id) => !foundIds.includes(id),
      );

      if (missingIds.length > 0) {
        console.error(
          "❌ Algunos tickets especificados no se encontraron:",
          missingIds,
        );
        return {
          statusCode: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
          body: JSON.stringify({
            success: false,
            message:
              "Algunos tickets especificados no fueron encontrados o no son válidos para reembolso",
            missingTickets: missingIds,
          }),
        };
      }
    }

    // 9. Crear registro de trazabilidad del reembolso (debe ser el primer write para idempotencia)
    const activeTicketsInOrder = countActiveOrderTickets(order);
    const isFullRefund = ticketsToRefund.length >= activeTicketsInOrder;

    console.log(`📊 Tipo de reembolso: ${isFullRefund ? "TOTAL" : "PARCIAL"}`);
    console.log(
      `📊 Tickets activos en orden: ${activeTicketsInOrder}, a reembolsar: ${ticketsToRefund.length}`,
    );

    // Solo valor facial; comisiones de plataforma no son reembolsables.
    const amountBreakdown = buildRefundAmountBreakdown(order, ticketsToRefund);
    const refundAmount = amountBreakdown.refundAmount;
    const platformFeeRetained = amountBreakdown.platformFee;
    const refundSubtotal = amountBreakdown.subtotal;
    console.log(
      `💰 Monto a reembolsar (sin comisiones): ${refundAmount} ${order.currency || "COP"} | comisión retenida: ${platformFeeRetained}`,
    );

    // 7. Liberar los tickets en TicketsDistribution (volver a AVAILABLE)
    const releaseResult = await releaseTicketsInDistributions(
      ticketSearch.distributions,
      ticketsToRefund.map((t) => t.ticketInstanceId),
    );

    if (!releaseResult.success) {
      console.error("❌ Error liberando tickets:", releaseResult.error);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "Error al liberar los tickets",
          error: releaseResult.error,
        }),
      };
    }

    // 8. Crear registro de trazabilidad del reembolso
    // Nunca usar order.userId/user_id como organizador: ese es el comprador.
    const eventIdForOrganizer =
      order.event_id || order.eventId || order.metadata?.eventId || null;
    let organizerId =
      order.organizer_id
      || order.organizerId
      || order.metadata?.organizerId
      || order.metadata?.ownerId
      || null;
    let eventName = order.metadata?.eventName || order.eventName || "Evento";
    try {
      if (eventIdForOrganizer) {
        const eventResult = await dynamodb.send(
          new GetCommand({
            TableName: process.env.EVENTS_TABLE || "Eventos",
            Key: { id: eventIdForOrganizer },
          }),
        );
        if (eventResult.Item) {
          organizerId =
            eventResult.Item.userId
            || eventResult.Item.user_id
            || eventResult.Item.userID
            || eventResult.Item.createdBy
            || eventResult.Item.organizerId
            || organizerId;
          eventName =
            eventResult.Item.nombre
            || eventResult.Item.name
            || eventName;
        }
      }
    } catch (eventErr) {
      console.warn("⚠️ No se pudo cargar evento para organizerId:", eventErr.message);
    }

    console.log("👤 Destinatarios reembolso:", {
      requesterUserId: userId,
      organizerId,
      eventId: eventIdForOrganizer,
      willNotifyOrganizer: Boolean(organizerId && organizerId !== userId),
    });

    const ticketDetails = amountBreakdown.ticketDetails;

    const traceabilityResult = await createRefundTraceability({
      orderId: orderId,
      userId: userId,
      eventId: order.event_id,
      organizerId,
      isFullRefund: isFullRefund,
      ticketInstanceIds: ticketsToRefund.map((t) => t.ticketInstanceId),
      refundAmount: refundAmount,
      currency: order.currency || "COP",
      originalTotal: order.total_amount || order.amount || refundAmount,
      paymentMethod: order.payment_method || order.paymentMethod || "unknown",
      reason: reason || "Usuario solicitó reembolso",
      eventName,
      eventDate: order.metadata?.eventDate || order.eventDate || "",
      ticketDetails,
      platformFeeRetained,
      refundSubtotal,
    });

    if (!traceabilityResult.success) {
      console.error(
        "❌ Error crítico creando trazabilidad:",
        traceabilityResult.error,
      );
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "Error al crear registro de trazabilidad del reembolso",
          error: traceabilityResult.error,
        }),
      };
    }

    // 10. Actualizar el estado de la orden
    // 9. Devolución de dinero vía Wompi (void en reembolso FULL)
    let paymentResult = {
      attempted: false,
      success: false,
      skipped: true,
      reason: "not_attempted",
      refundStatus: "PENDING",
    };
    try {
      paymentResult = await processPaymentRefund({
        order,
        isFullRefund,
        refundAmount,
      });
      console.log("💳 Resultado pasarela:", JSON.stringify(paymentResult));
    } catch (paymentErr) {
      console.error("❌ Error en pasarela de reembolso:", paymentErr.message);
      paymentResult = {
        attempted: true,
        success: false,
        error: paymentErr.message,
        refundStatus: "PENDING",
      };
    }

    const finalRefundStatus = paymentResult.refundStatus || "PENDING";

    const orderUpdateResult = await updateOrderStatus(
      orderId,
      isFullRefund,
      ticketsToRefund.length,
      refundAmount,
      ticketsToRefund.map((t) => t.ticketInstanceId),
      platformFeeRetained,
      finalRefundStatus,
      paymentResult,
    );

    if (!orderUpdateResult.success) {
      console.error("❌ Error actualizando orden:", orderUpdateResult.error);
      return {
        statusCode: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "Error al actualizar el estado de la orden",
          error: orderUpdateResult.error,
        }),
      };
    }

    await markRefundPaymentResult(traceabilityResult.refundId, paymentResult);

    // 10. Preparar respuesta exitosa
    const response = {
      success: true,
      message: `Reembolso ${isFullRefund ? "total" : "parcial"} procesado exitosamente`,
      data: {
        refundId: traceabilityResult.refundId,
        filingId: traceabilityResult.filingId,
        orderId: orderId,
        refundType: isFullRefund ? "FULL" : "PARTIAL",
        refundStatus: finalRefundStatus,
        paymentRefund: {
          success: Boolean(paymentResult.success),
          attempted: Boolean(paymentResult.attempted),
          skipped: Boolean(paymentResult.skipped),
          reason: paymentResult.reason || paymentResult.error || null,
          transactionId: paymentResult.transactionId || null,
        },
        ticketsRefunded: ticketsToRefund.length,
        refundAmount: refundAmount,
        subtotal: refundSubtotal,
        platformFee: platformFeeRetained,
        currency: order.currency || "COP",
        orderNewStatus: isFullRefund ? "CANCELLED" : "PARTIALLY_REFUNDED",
        ticketDetails,
        processedAt: new Date().toISOString(),
      },
    };

    console.log("✅ Reembolso procesado exitosamente:", response);

    // 11. Enviar notificación al usuario usando API de notificaciones (igual que transferencia)
    console.log("📧 Enviando notificación de reembolso...");
    try {
      const ticketCount = ticketsToRefund.length;
      const refundDate = new Date().toISOString();
      const notifyEventId = eventIdForOrganizer || order.event_id || order.eventId;

      // Obtener información del usuario para el userName
      let userName = "Usuario";
      try {
        const userResult = await dynamodb.send(
          new GetCommand({
            TableName: process.env.CLIENT_TABLE || "Client",
            Key: { id: userId },
          }),
        );
        const client = userResult.Item || {};
        userName =
          `${client.nombre || client.name || ""} ${client.apellido || client.lastName || ""}`.trim()
          || client.user
          || client.username
          || "Usuario";
      } catch (userErr) {
        console.log("⚠️ No se pudo obtener nombre de usuario, usando default");
      }

      let organizerName = "Organizador";
      if (organizerId) {
        try {
          const orgResult = await dynamodb.send(
            new GetCommand({
              TableName: process.env.CLIENT_TABLE || "Client",
              Key: { id: organizerId },
            }),
          );
          const org = orgResult.Item || {};
          organizerName =
            `${org.nombre || org.name || ""} ${org.apellido || org.lastName || ""}`.trim()
            || org.user
            || org.username
            || "Organizador";
        } catch (orgErr) {
          console.log("⚠️ No se pudo obtener nombre del organizador:", orgErr.message);
        }
      }

      const sharedMeta = {
        refundId: traceabilityResult.refundId,
        filingId: traceabilityResult.filingId,
        orderID: orderId,
        eventId: notifyEventId,
        eventName,
        ticketCount,
        refundAmount,
        platformFee: platformFeeRetained,
        subtotal: refundSubtotal,
        currency: order.currency || "COP",
        refundType: isFullRefund ? "TOTAL" : "PARCIAL",
        refundDate,
        reason: reason || "Usuario solicitó reembolso",
        processingDays: "3-5",
        eventDate: order.metadata?.eventDate || order.eventDate || "",
        eventLocation: order.metadata?.eventLocation || order.eventLocation || "",
        ticketDetails,
      };

      await axios.post(NOTIFICATIONS_API, {
        triggerId: "REFUND_REQUESTED",
        userId,
        channels: ["inApp", "email", "push", "whatsapp"],
        metadata: {
          ...sharedMeta,
          userId,
          userName,
          type: "refund_requested",
        },
      });
      console.log("✅ Notificación REFUND_REQUESTED enviada al solicitante:", userId);

      if (organizerId && String(organizerId) !== String(userId)) {
        await axios.post(NOTIFICATIONS_API, {
          triggerId: "REFUND_REQUESTED_ORGANIZER",
          userId: organizerId,
          channels: ["inApp", "email", "push", "whatsapp"],
          metadata: {
            ...sharedMeta,
            // Crítico: metadata.userId debe ser el destinatario (dueño).
            // Los gateways usan metadata.userId para email/WhatsApp/campana.
            userId: organizerId,
            userName: organizerName,
            organizerId,
            organizerName,
            requesterUserId: userId,
            requesterName: userName,
            type: "refund_requested_organizer",
            isOrganizerNotice: true,
          },
        });
        console.log(
          "✅ Notificación REFUND_REQUESTED_ORGANIZER enviada al dueño:",
          organizerId,
        );
      } else {
        console.warn(
          "⚠️ No se notificó al organizador:",
          organizerId
            ? "organizador es el mismo solicitante"
            : "organizerId no resuelto",
        );
      }
      console.log("✅ Notificaciones de reembolso enviadas exitosamente");
    } catch (notifError) {
      // No fallar el reembolso si falla la notificación
      console.error(
        "⚠️ Error enviando notificación (no crítico):",
        notifError.message,
      );
      console.error("⚠️ Stack:", notifError.stack);
      if (notifError.response) {
        console.error("⚠️ Response status:", notifError.response.status);
        console.error(
          "⚠️ Response data:",
          JSON.stringify(notifError.response.data),
        );
      }
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("❌ Error en processRefund:", error);
    console.error("Stack trace:", error.stack);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor al procesar el reembolso",
        error: error.message,
      }),
    };
  }
};
