const {
  getAllEvents,
  getNowForEvent,
  getEventEndDateTime,
  getTicketByEventId,
  getInterestedUserIdsByEvent,
  updateEventStatus,
  getConfirmedEmailsForEvent,
  getOrderUserIdsByEventId,
  sendNotification,
  getEventStartDateTime,
  finalizeOrdersByEventId,
  notifyEventStartedOwner,
  notifyEventStartedUsers,
  notifyEventFinishedOwner,
  notifyEventFinishedUsers,
  notifyRateEventToOrderUsers,
  notifyTicketSalesOwner,
  notifyTicketSalesInterestedUsers,
  buildTicketSalesLifecycleContext,
  syncTicketSalesWindowState,
  claimTicketSaleMarker,
  updateTicketSalesStatusByEventId,
  getEventSalesSummaryByEventId,
  updateChatLifecycleStatusByEventId,
  hasSentThreeDayReminderToday,
  markThreeDayReminderSent,
  RUNNING_EVENT_STATUSES
} = require('./utils');
const dayjs = require('dayjs');

const RUNNING_STATUS = 'ejecucion';
const TICKET_SALE_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  ENDING_SOON: 'ENDING_SOON',
  FINISHED: 'FINISHED'
};
const TICKET_SALE_MARKERS = {
  REMINDER: 'ticketSalesReminderSentAt',
  STARTED: 'ticketSalesStartedSentAt',
  ENDING_SOON: 'ticketSalesEndingSoonSentAt',
  FINISHED: 'ticketSalesFinishedSentAt',
  SUMMARY: 'ticketSalesSummarySentAt'
};

const humanizeSaleCountdown = (milliseconds) => {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days} día${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} minuto${minutes === 1 ? '' : 's'}`);

  if (!parts.length) return 'menos de 1 minuto';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
};

exports.handler = async () => {
  const events = await getAllEvents();

  let updatedStates = 0;
  let updatedOrders = 0;
  let notificationsSent = 0;
  let eventsNotified = 0;

  for (const event of events) {
    const now = getNowForEvent(event);
    const today = now.startOf('day');
    const todayKey = now.format('YYYYMMDD');
    const fechaFin = dayjs(event.fechaFin, 'YYYYMMDD');
    const endDateTime = getEventEndDateTime(event);
    const diffDays = endDateTime ? endDateTime.startOf('day').diff(today, 'day') : fechaFin.diff(today, 'day');
    const isPastEndDateTime =
      !!endDateTime && (now.isAfter(endDateTime) || now.isSame(endDateTime));
    const startDateTime = getEventStartDateTime(event);
    const isPastStartDateTime =
      !!startDateTime && (now.isAfter(startDateTime) || now.isSame(startDateTime));

    const ticket = await getTicketByEventId(event.id);
    if (ticket) {
      await syncTicketSalesWindowState(event, ticket);
      const saleLifecycle = buildTicketSalesLifecycleContext(event, ticket);

      if (saleLifecycle) {
        const interestedUserIds = await getInterestedUserIdsByEvent(event);
        const millisecondsUntilSaleStart = saleLifecycle.saleStartDateTime.diff(now);
        const millisecondsUntilSaleEnd = saleLifecycle.saleEndDateTime.diff(now);
        const isPastSaleStart = saleLifecycle.saleStartDateTime.isBefore(now) || saleLifecycle.saleStartDateTime.isSame(now);
        const isPastSaleEnd = saleLifecycle.saleEndDateTime.isBefore(now) || saleLifecycle.saleEndDateTime.isSame(now);
        const isWithinReminderWindow = !isPastSaleStart && millisecondsUntilSaleStart <= 24 * 60 * 60 * 1000;
        const isWithinEndingSoonWindow = !isPastSaleEnd && millisecondsUntilSaleEnd <= 60 * 60 * 1000;

        if (isWithinReminderWindow) {
          const claimed = await claimTicketSaleMarker(event.id, TICKET_SALE_MARKERS.REMINDER);
          if (claimed) {
            await updateTicketSalesStatusByEventId(event.id, TICKET_SALE_STATUS.SCHEDULED);
            const extraMetadata = { saleCountdownText: humanizeSaleCountdown(millisecondsUntilSaleStart) };
            const owner = await notifyTicketSalesOwner(event, ticket, 'REMINDER', extraMetadata);
            const audience = await notifyTicketSalesInterestedUsers(event, ticket, 'REMINDER', interestedUserIds, extraMetadata);
            notificationsSent += owner.dispatched + audience.dispatched;
            if (owner.dispatched + audience.dispatched > 0) {
              eventsNotified++;
            }
          }
        }

        if (isPastSaleStart && !isPastSaleEnd) {
          const claimed = await claimTicketSaleMarker(event.id, TICKET_SALE_MARKERS.STARTED);
          if (claimed) {
            await updateTicketSalesStatusByEventId(event.id, TICKET_SALE_STATUS.ACTIVE);
            const owner = await notifyTicketSalesOwner(event, ticket, 'STARTED');
            const audience = await notifyTicketSalesInterestedUsers(event, ticket, 'STARTED', interestedUserIds);
            notificationsSent += owner.dispatched + audience.dispatched;
            if (owner.dispatched + audience.dispatched > 0) {
              eventsNotified++;
            }
          }
        }

        if (isWithinEndingSoonWindow) {
          const claimed = await claimTicketSaleMarker(event.id, TICKET_SALE_MARKERS.ENDING_SOON);
          if (claimed) {
            await updateTicketSalesStatusByEventId(event.id, TICKET_SALE_STATUS.ENDING_SOON);
            const extraMetadata = { saleCountdownText: humanizeSaleCountdown(millisecondsUntilSaleEnd) };
            const owner = await notifyTicketSalesOwner(event, ticket, 'ENDING_SOON', extraMetadata);
            const audience = await notifyTicketSalesInterestedUsers(event, ticket, 'ENDING_SOON', interestedUserIds, extraMetadata);
            notificationsSent += owner.dispatched + audience.dispatched;
            if (owner.dispatched + audience.dispatched > 0) {
              eventsNotified++;
            }
          }
        }

        if (isPastSaleEnd) {
          const finishedClaimed = await claimTicketSaleMarker(event.id, TICKET_SALE_MARKERS.FINISHED);
          if (finishedClaimed) {
            await updateTicketSalesStatusByEventId(event.id, TICKET_SALE_STATUS.FINISHED);
            const owner = await notifyTicketSalesOwner(event, ticket, 'FINISHED');
            const audience = await notifyTicketSalesInterestedUsers(event, ticket, 'FINISHED', interestedUserIds);
            notificationsSent += owner.dispatched + audience.dispatched;
            if (owner.dispatched + audience.dispatched > 0) {
              eventsNotified++;
            }
          }

          const summaryClaimed = await claimTicketSaleMarker(event.id, TICKET_SALE_MARKERS.SUMMARY);
          if (summaryClaimed) {
            const eventCurrency = event.currency || event.moneda ||
              ticket?.currency || ticket?.moneda ||
              (Array.isArray(ticket?.categorias) && ticket.categorias[0]?.currency) ||
              (Array.isArray(ticket?.categorias) && ticket.categorias[0]?.moneda);
            const summary = await getEventSalesSummaryByEventId(event.id, eventCurrency);
            const ownerSummary = await notifyTicketSalesOwner(event, ticket, 'SUMMARY', {
              summaryStats: [
                { label: 'Órdenes aprobadas', value: summary.totalOrdersFormatted },
                { label: 'Tickets vendidos', value: summary.soldTicketsFormatted },
                { label: 'Ingresos generados', value: summary.totalRevenueFormatted }
              ],
              totalOrders: summary.totalOrders,
              soldTickets: summary.soldTickets,
              totalRevenue: summary.totalRevenue,
              currency: summary.currency,
              totalOrdersFormatted: summary.totalOrdersFormatted,
              soldTicketsFormatted: summary.soldTicketsFormatted,
              totalRevenueFormatted: summary.totalRevenueFormatted
            });
            notificationsSent += ownerSummary.dispatched;
            if (ownerSummary.dispatched > 0) {
              eventsNotified++;
            }
          }
        }
      }
    }

    // 2. Cambiar estado a finalizado
    if ((diffDays < 0 || isPastEndDateTime) && event.estatus !== 'finalizado') {
      await updateEventStatus(event.id, 'finalizado');
      await updateChatLifecycleStatusByEventId(event.id, 'finalizado');
      updatedStates++;

      const { updatedCount, userIds } = await finalizeOrdersByEventId(event.id);
      updatedOrders += updatedCount;

      const ownerFinishedNotification = await notifyEventFinishedOwner(event);
      const { dispatched } = await notifyEventFinishedUsers(event, userIds);
      notificationsSent += ownerFinishedNotification.dispatched + dispatched;

      const { dispatched: rateDispatched } = await notifyRateEventToOrderUsers(event, userIds);
      notificationsSent += rateDispatched;

      if (ownerFinishedNotification.dispatched > 0 || dispatched > 0 || rateDispatched > 0) {
        eventsNotified++;
      }

      continue;
    }

    // 1. Cambiar estado a en_ejecucion
    if (diffDays === 0 && isPastStartDateTime && !isPastEndDateTime && !RUNNING_EVENT_STATUSES.has(event.estatus)) {
      await updateEventStatus(event.id, RUNNING_STATUS);
      await updateChatLifecycleStatusByEventId(event.id, RUNNING_STATUS);
      updatedStates++;

      const ownerNotification = await notifyEventStartedOwner(event);
      const buyerUserIds = await getOrderUserIdsByEventId(event.id);
      const buyersNotification = await notifyEventStartedUsers(event, buyerUserIds);
      const startNotifications = ownerNotification.dispatched + buyersNotification.dispatched;

      notificationsSent += startNotifications;
      if (startNotifications > 0) {
        eventsNotified++;
      }
    }

    // 3. Notificar 3 días antes del evento
    if (diffDays === 3 && !hasSentThreeDayReminderToday(event, todayKey)) {
      await sendNotification({
        to: event.email,
        subject: 'Tu evento está por comenzar',
        message: `Faltan tres días para que inicie tu evento: ${event.nombre}`,
        userId: event.userId,
        eventId: event.id,
        type: 'EVENT_REMINDER_3D_EVENTER',
        channels: ['Email', 'In-App']
      });

      await markThreeDayReminderSent(event.id, todayKey);
      notificationsSent++;
      eventsNotified++;
    }

    // 4. Notificar asistentes 3 días después para calificar
    if (diffDays === -3) {
      const emails = await getConfirmedEmailsForEvent(event.id);
      const calificaBaseURL = 'https://do.event/califica';

      if (emails.length > 0) {
        for (const email of emails) {
          await sendNotification({
            to: email,
            subject: 'Califica el evento',
            message: `Han pasado tres días desde el evento "${event.nombre}". Califícalo aquí: ${calificaBaseURL}/${event.id}/${email}`,
            userId: 'unknown', // opcional si no tienes el ID del asistente
            eventId: event.id,
            type: 'RATING_REQUEST',
            channels: ['Email', 'In-App']
          });
          notificationsSent++;
        }
      } else {
        await sendNotification({
          to: event.email,
          subject: 'Recordatorio para obtener calificaciones',
          message: `No se encontraron asistentes con email registrado para el evento "${event.nombre}". Puedes compartir este enlace: ${calificaBaseURL}/${event.id}/organizador`,
          userId: event.userId,
          eventId: event.id,
          type: 'RATING_REQUEST',
          channels: ['Email', 'In-App']
        });
        notificationsSent++;
      }

      eventsNotified++;
    }
  }

  const resumen = {
    message: 'Ejecución completada correctamente',
    totalEventosProcesados: events.length,
    eventosConEstadoActualizado: updatedStates,
    ordenesFinalizadas: updatedOrders,
    eventosConNotificaciones: eventsNotified,
    notificacionesEnviadas: notificationsSent
  };

  console.log('[RESUMEN DE EJECUCIÓN]', JSON.stringify(resumen, null, 2));
  return resumen;
};
