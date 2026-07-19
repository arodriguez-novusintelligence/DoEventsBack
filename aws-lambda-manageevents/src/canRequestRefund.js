const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { evaluateRefundEligibility } = require("./lib/refundEligibility");

// Configurar cliente de DynamoDB
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);

/**
 * Valida que la orden exista y pertenezca al z vvvvcx/./usuario y evento especificados
 * @param {string} orderId - ID de la orden
 * @param {string} userId - ID del usuario
 * @param {string} eventId - ID del evento
 * @returns {Object} - Resultado de la validación con la orden si existe
 */
const validateOrder = async (orderId, userId, eventId) => {
  console.log("🔍 Validando orden en DynamoDB:", {
    orderId,
    userId,
    eventId,
  });

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
      event_id: order.event_id,
      payment_status: order.payment_status,
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

    // Validar que la orden sea del evento especificado
    if (order.event_id !== eventId) {
      console.error("❌ La orden no pertenece al evento:", {
        orderEventId: order.event_id,
        requestEventId: eventId,
      });
      return {
        valid: false,
        reason: "La orden no pertenece al evento especificado",
        statusCode: 403,
      };
    }

    // Validar que la orden esté aprobada
    if (order.payment_status !== "APPROVED") {
      console.error("❌ La orden no está aprobada:", order.payment_status);
      return {
        valid: false,
        reason: `No se puede solicitar reembolso para una orden con estado: ${order.payment_status}`,
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
 * Calcula la diferencia en días entre dos fechas en formato YYYYMMDD
 * @deprecated Usar lib/refundEligibility.calculateDaysUntilEvent
 */
const calculateDaysDifference = (currentDate, eventDate) => {
  const { calculateDaysUntilEvent } = require("./lib/refundEligibility");
  return calculateDaysUntilEvent(currentDate, eventDate);
};

/**
 * Valida si un usuario puede solicitar reembolso para un evento
 * @param {Object} event - Evento de API Gateway
 * @returns {Object} - Respuesta HTTP con el resultado de la validación
 */
exports.canRequestRefund = async (event) => {
  console.log("🔍 Iniciando validación de reembolso");
  console.log("📋 Event:", JSON.stringify(event, null, 2));

  try {
    // 1. Obtener parámetros de la solicitud
    const eventId = event.pathParameters?.eventId;
    const body = JSON.parse(event.body || "{}");
    const currentDate = body.currentDate; // Formato YYYYMMDD
    const userId = body.userId;
    const orderId = body.orderId;

    // 2. Validar parámetros requeridos
    if (!eventId) {
      console.error("❌ eventId no proporcionado");
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "El parámetro eventId es requerido",
        }),
      };
    }

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
          message: "El parámetro userId es requerido en el body",
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
          message: "El parámetro orderId es requerido en el body",
        }),
      };
    }

    if (!currentDate) {
      console.error("❌ currentDate no proporcionado");
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message:
            "El parámetro currentDate es requerido en el body (formato YYYYMMDD)",
        }),
      };
    }

    // 3. Validar formato de fecha
    if (!/^\d{8}$/.test(currentDate)) {
      console.error("❌ Formato de currentDate inválido:", currentDate);
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "El formato de currentDate debe ser YYYYMMDD",
        }),
      };
    }

    console.log(`📅 Validando reembolso para evento: ${eventId}`);
    console.log(`📅 Usuario: ${userId}`);
    console.log(`📅 Orden: ${orderId}`);
    console.log(`📅 Fecha actual: ${currentDate}`);

    // 4. Validar que la orden existe y pertenece al usuario y evento
    const orderValidation = await validateOrder(orderId, userId, eventId);

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
    console.log("✅ Orden validada, procediendo con validación de reembolso");

    // 5. Obtener información del evento desde DynamoDB
    const params = {
      TableName: process.env.EVENTS_TABLE || "Eventos",
      Key: {
        id: eventId,
      },
    };

    console.log("🔍 Consultando evento en DynamoDB:", params);
    const result = await dynamodb.send(new GetCommand(params));

    if (!result.Item) {
      console.error("❌ Evento no encontrado:", eventId);
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: "Evento no encontrado",
        }),
      };
    }

    const evento = result.Item;
    console.log("✅ Evento encontrado:", {
      id: evento.id,
      nombre: evento.nombre,
      fechaIni: evento.fechaIni,
      categoriaReembolso: evento.categoriaReembolso,
    });

    // 6. Validar elegibilidad según política de reembolsos
    const eligibility = evaluateRefundEligibility({
      categoriaReembolso: evento.categoriaReembolso,
      currentDate,
      eventDate: evento.fechaIni,
    });

    if (eligibility.statusCode && eligibility.statusCode >= 400 && !eligibility.canRequestRefund) {
      return {
        statusCode: eligibility.statusCode,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          message: eligibility.reason,
        }),
      };
    }

    const {
      canRequestRefund: canRefund,
      requiresManualReview,
      reason,
      daysUntilEvent,
      refundCategory: categoria,
    } = eligibility;

    // 9. Preparar respuesta exitosa
    const response = {
      success: true,
      data: {
        eventId: eventId,
        eventName: evento.nombre || "Sin nombre",
        eventDate: evento.fechaIni,
        currentDate: currentDate,
        daysUntilEvent: daysUntilEvent,
        refundCategory: categoria,
        canRequestRefund: canRefund,
        requiresManualReview: requiresManualReview,
        reason: reason,
        orderInfo: {
          orderId: order.order_id,
          userId: order.user_id,
          amount: order.amount,
          currency: order.currency || "COP",
          paymentStatus: order.payment_status,
          createdAt: order.created_at,
        },
      },
    };

    console.log("✅ Validación completada:", response);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("❌ Error en canRequestRefund:", error);
    console.error("Stack trace:", error.stack);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
};
