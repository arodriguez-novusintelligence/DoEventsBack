const {
  getOrdersByEvent,
  getEventById,
  normalizeOrderAmount,
  normalizeTicketsCount,
  isOrderExecutedSale,
  classifyOrderLifecycle,
  getOrderPaymentTimingBucket,
  numberOrZero,
  response,
} = require("./statsShared");

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    const [eventInfo, orders] = await Promise.all([
      getEventById(eventId),
      getOrdersByEvent(eventId),
    ]);

    const lifecycleSummary = {
      executedSalesCount: 0,
      eventCancelledCount: 0,
      purchaseCancelledCount: 0,
      nonExecutedCount: 0,
      cancelledByEventAmount: 0,
      purchaseCancelledAmount: 0,
      nonExecutedAmount: 0,
    };

    const executedOrders = orders.filter((order) => {
      const lifecycle = classifyOrderLifecycle(order);

      if (lifecycle.bucket === "EVENT_CANCELLED") {
        lifecycleSummary.eventCancelledCount += 1;
        lifecycleSummary.cancelledByEventAmount += normalizeOrderAmount(order);
      } else if (lifecycle.bucket === "PURCHASE_CANCELLED") {
        lifecycleSummary.purchaseCancelledCount += 1;
        lifecycleSummary.purchaseCancelledAmount += normalizeOrderAmount(order);
      } else if (lifecycle.bucket === "NON_EXECUTED") {
        lifecycleSummary.nonExecutedCount += 1;
        lifecycleSummary.nonExecutedAmount += normalizeOrderAmount(order);
      } else if (lifecycle.bucket === "EXECUTED_SALE") {
        lifecycleSummary.executedSalesCount += 1;
      }

      return isOrderExecutedSale(order);
    });

    const totalRevenue = executedOrders.reduce(
      (sum, order) => sum + normalizeOrderAmount(order),
      0
    );

    const paymentTimingSummary = {
      preEventoPagado: 0,
      preEventoPendiente: 0,
      postEventoPagado: 0,
      postEventoPendiente: 0,
    };

    orders.forEach((order) => {
      const amount = normalizeOrderAmount(order);
      const timingBucket = getOrderPaymentTimingBucket(order);
      const paymentStatus = String(order.payment_status || order.status || "").toUpperCase();

      if (["APPROVED", "PAID", "SOLD", "FINISHED"].includes(paymentStatus)) {
        if (timingBucket === "POST_EVENT") {
          paymentTimingSummary.postEventoPagado += amount;
        } else {
          paymentTimingSummary.preEventoPagado += amount;
        }
        return;
      }

      if (paymentStatus === "PENDING") {
        if (timingBucket === "POST_EVENT") {
          paymentTimingSummary.postEventoPendiente += amount;
        } else {
          paymentTimingSummary.preEventoPendiente += amount;
        }
      }
    });

    const ticketsSold = executedOrders.reduce(
      (sum, order) => sum + normalizeTicketsCount(order),
      0
    );

    const categoriesMap = new Map();

    executedOrders.forEach((order) => {
      const orderTickets = Array.isArray(order.tickets) ? order.tickets : [];
      orderTickets.forEach((ticket) => {
        const categoryName =
          ticket.category ||
          ticket.categoryName ||
          ticket.ticket_type ||
          ticket.section ||
          "General";

        const ticketPrice = numberOrZero(
          ticket.price || ticket.amount || ticket.unitPrice || ticket.total_amount || ticket.purchasePrice
        );

        if (!categoriesMap.has(categoryName)) {
          categoriesMap.set(categoryName, {
            nombre: categoryName,
            vendidos: 0,
            netoVendido: 0,
          });
        }

        const category = categoriesMap.get(categoryName);
        category.vendidos += 1;
        category.netoVendido += ticketPrice;
      });
    });

    const categories = Array.from(categoriesMap.values()).map((category) => ({
      ...category,
      disponibles: null,
      ocupacion: null,
      precioUnitario:
        category.vendidos > 0
          ? Math.round(category.netoVendido / category.vendidos)
          : 0,
    }));

    const eventCapacity = numberOrZero(
      eventInfo?.aforo || eventInfo?.capacity || eventInfo?.venue?.capacity
    );

    const occupancy =
      eventCapacity > 0
        ? `${Math.min(100, Math.round((ticketsSold / eventCapacity) * 100))}%`
        : null;

    return response(200, {
      eventId,
      eventName: eventInfo?.nombre || eventInfo?.name || null,
      venueName:
        eventInfo?.lugar?.nombre
        || eventInfo?.venue?.name
        || eventInfo?.ciudad
        || null,
      totalVentas: totalRevenue,
      boletosVendidos: ticketsSold,
      boletosDisponibles: eventCapacity > 0 ? Math.max(0, eventCapacity - ticketsSold) : null,
      ocupacion: occupancy,
      preEventoPagado: paymentTimingSummary.preEventoPagado,
      preEventoPendiente: paymentTimingSummary.preEventoPendiente,
      postEventoPagado: paymentTimingSummary.postEventoPagado,
      postEventoPendiente: paymentTimingSummary.postEventoPendiente,
      resumenEstados: {
        ventasEjecutadas: lifecycleSummary.executedSalesCount,
        ordenesCanceladasPorEvento: lifecycleSummary.eventCancelledCount,
        comprasCanceladas: lifecycleSummary.purchaseCancelledCount,
        ordenesNoEjecutadas: lifecycleSummary.nonExecutedCount,
        montoCanceladoPorEvento: lifecycleSummary.cancelledByEventAmount,
        montoComprasCanceladas: lifecycleSummary.purchaseCancelledAmount,
        montoNoEjecutado: lifecycleSummary.nonExecutedAmount,
        ventasPreEventoPagadas: paymentTimingSummary.preEventoPagado,
        ventasPreEventoPendientes: paymentTimingSummary.preEventoPendiente,
        ventasPostEventoPagadas: paymentTimingSummary.postEventoPagado,
        ventasPostEventoPendientes: paymentTimingSummary.postEventoPendiente,
      },
      categorias: categories,
    });
  } catch (error) {
    console.error("getEventStatistics error:", error);
    return response(500, {
      error: "Error getting event statistics",
      message: error.message,
    });
  }
};
