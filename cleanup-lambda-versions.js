const AWS = require("aws-sdk");
//const { sendEmailNotification } = require("../utils/emailService");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({ region: "us-east-1" });

exports.handler = async (event) => {
  try {
    console.log(
      "🔔 Notificación de evento recibida:",
      JSON.stringify(event, null, 2)
    );

    // Parsear body si viene de API Gateway
    let requestData;
    if (event.body) {
      requestData =
        typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } else {
      requestData = event; // Para invocaciones directas
    }

    const { eventId, templateKey, eventData } = requestData;

    if (!eventId || !templateKey) {
      console.error("❌ eventId y templateKey son requeridos");
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "eventId y templateKey son requeridos",
        }),
      };
    }

    console.log(
      `📋 Procesando notificaciones para evento ${eventId} con template ${templateKey}`
    );

    // Usar el nuevo índice eventIdIndex para buscar TODAS las órdenes del evento
    const ordersParams = {
      TableName: "Orders",
      IndexName: "eventIdIndex",
      KeyConditionExpression: "event_id = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    };

    console.log("🔍 Buscando TODAS las órdenes usando eventIdIndex...");
    const allOrdersResult = await dynamodb.query(ordersParams).promise();
    const allOrders = allOrdersResult.Items || [];

    console.log(
      `📊 Total de órdenes encontradas para evento ${eventId}: ${allOrders.length}`
    );

    // Imprimir TODOS los registros encontrados
    if (allOrders.length > 0) {
      console.log("📋 TODAS LAS ÓRDENES ENCONTRADAS:");
      allOrders.forEach((order, index) => {
        console.log(`📄 Orden ${index + 1}:`, JSON.stringify(order, null, 2));
      });
    } else {
      console.log("❌ No se encontraron órdenes para este evento");
    }

    // Ahora filtrar solo las APPROVED para el proceso de notificación
    const approvedOrders = allOrders.filter(
      (order) =>
        order.payment_status === "APPROVED" || order.status === "APPROVED"
    );
    console.log(`✅ Órdenes APPROVED: ${approvedOrders.length}`);

    if (approvedOrders.length > 0) {
      console.log("📋 ÓRDENES APPROVED:");
      approvedOrders.forEach((order, index) => {
        console.log(
          `✅ Orden APPROVED ${index + 1}:`,
          JSON.stringify(
            {
              order_id: order.order_id,
              user_id: order.user_id,
              payment_status: order.payment_status,
              status: order.status,
              amount: order.amount,
            },
            null,
            2
          )
        );
      });
    }

    if (approvedOrders.length === 0) {
      console.log("ℹ️ No hay usuarios con órdenes APPROVED para notificar");
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "No hay usuarios con órdenes APPROVED para notificar",
          affectedUsers: 0,
          searchMethod: "eventIdIndex",
        }),
      };
    }

    // Obtener usuarios únicos de las órdenes APPROVED
    const userIds = [
      ...new Set(approvedOrders.map((order) => order.userId || order.user_id)),
    ];
    console.log(`👥 Usuarios únicos afectados: ${userIds.length}`);

    // Procesar notificaciones para cada usuario
    const notificationResults = [];

    for (const userId of userIds) {
      try {
        console.log(`📤 Enviando notificaciones para usuario: ${userId}`);

        // Enviar notificación por email
        const emailResult = await sendEmailNotification(
          userId,
          eventId,
          templateKey,
          eventData
        );
        notificationResults.push({
          userId: userId,
          channel: "email",
          status: emailResult.success ? "SUCCESS" : "ERROR",
          message: emailResult.message,
          messageId: emailResult.messageId || null,
          timestamp: new Date().toISOString(),
        });

        // Enviar notificación inApp
        const inAppResult = await sendInAppNotification(
          userId,
          eventId,
          templateKey,
          eventData
        );
        notificationResults.push({
          userId: userId,
          channel: "inApp",
          status: inAppResult.success ? "SUCCESS" : "ERROR",
          message: inAppResult.message,
          notificationId: inAppResult.notificationId || null,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ Notificaciones procesadas para usuario ${userId}`);
      } catch (userError) {
        console.error(
          `❌ Error procesando notificaciones para usuario ${userId}:`,
          userError
        );
        notificationResults.push({
          userId: userId,
          error: userError.message,
          status: "ERROR",
          timestamp: new Date().toISOString(),
        });
      }
    }

    console.log(
      `🎉 Proceso completado. ${notificationResults.length} notificaciones procesadas`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Notificaciones enviadas exitosamente usando eventIdIndex`,
        affectedUsers: userIds.length,
        totalNotifications: notificationResults.length,
        eventId: eventId,
        templateKey: templateKey,
        searchMethod: "eventIdIndex",
        results: notificationResults,
      }),
    };
  } catch (error) {
    console.error("❌ Error en notifyEventAffectedUsers:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
};

// Función para enviar notificación inApp
async function sendInAppNotification(userId, eventId, templateKey, eventData) {
  try {
    console.log(`🔔 Enviando notificación inApp a usuario ${userId}`);

    const dynamodb = new AWS.DynamoDB.DocumentClient();

    // Guardar notificación en la tabla Notifications
    const notificationItem = {
      id: `${Date.now()}-${userId}-${eventId}`,
      userId: userId,
      eventId: eventId,
      type: templateKey,
      title: getNotificationTitle(templateKey),
      message: getNotificationMessage(templateKey, eventData),
      isRead: false,
      timestamp: new Date().toISOString(),
      data: eventData,
    };

    await dynamodb
      .put({
        TableName: "Notifications",
        Item: notificationItem,
      })
      .promise();

    console.log(`✅ Notificación inApp guardada para usuario ${userId}`);

    return {
      success: true,
      message: `Notificación inApp guardada para ${templateKey}`,
      notificationId: notificationItem.id,
    };
  } catch (error) {
    console.error(`❌ Error enviando notificación inApp a ${userId}:`, error);
    return {
      success: false,
      message: error.message,
    };
  }
}

// Helper para obtener título de notificación
function getNotificationTitle(templateKey) {
  switch (templateKey) {
    case "EVENT_RESCHEDULED":
      return "Evento Reprogramado";
    case "EVENT_CANCELLED":
      return "Evento Cancelado";
    default:
      return "Actualización de Evento";
  }
}

// Helper para obtener mensaje de notificación
function getNotificationMessage(templateKey, eventData) {
  switch (templateKey) {
    case "EVENT_RESCHEDULED":
      return `El evento "${
        eventData?.eventName || "tu evento"
      }" ha sido reprogramado para el ${
        eventData?.newStartDate || "una nueva fecha"
      }. ${eventData?.reason || ""}`;
    case "EVENT_CANCELLED":
      return `El evento "${
        eventData?.eventName || "tu evento"
      }" ha sido cancelado. ${eventData?.reason || ""}`;
    default:
      return `Hay una actualización importante sobre tu evento "${
        eventData?.eventName || "evento"
      }".`;
  }
}

// Función para limpiar versiones antiguas de las funciones Lambda
async function cleanupLambdaVersions() {
  const functions = await lambda.listFunctions().promise();
  for (const fn of functions.Functions) {
    const versions = await lambda
      .listVersionsByFunction({ FunctionName: fn.FunctionName })
      .promise();
    for (const v of versions.Versions) {
      if (v.Version !== "$LATEST") {
        try {
          await lambda
            .deleteFunction({
              FunctionName: fn.FunctionName,
              Qualifier: v.Version,
            })
            .promise();
          console.log(
            `Deleted version ${v.Version} of function ${fn.FunctionName}`
          );
        } catch (err) {
          console.error(
            `Error deleting version ${v.Version} of function ${fn.FunctionName}:`,
            err.message
          );
        }
      }
    }
  }
}

cleanupLambdaVersions().then(() => {
  console.log("Cleanup complete.");
});
