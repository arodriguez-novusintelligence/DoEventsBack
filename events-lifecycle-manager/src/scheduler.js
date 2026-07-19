const AWS = require('aws-sdk');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const {
  getEventById,
  getTicketByEventId,
  getOrderUserIdsByEventId,
  getInterestedUserIdsByEvent,
  updateEventStatus,
  getEventEndDateTime,
  resolveEventTimezone,
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
  getNowForEvent,
  updateChatLifecycleStatusByEventId,
  RUNNING_EVENT_STATUSES
} = require('./utils');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const scheduler = new AWS.Scheduler();
const lambda = new AWS.Lambda();
const sts = new AWS.STS();

const RUNNING_STATUS = 'ejecucion';
const FINISHED_STATUS = 'finalizado';
const ACTIVE_STATUS = 'activo';
const DEFAULT_SCHEDULE_TZ = process.env.EVENT_SCHEDULE_TIMEZONE || 'America/Bogota';
const SCHEDULER_ROLE_ARN = process.env.EVENT_SCHEDULER_ROLE_ARN;
const TRANSITION_FUNCTION_NAME =
  process.env.EVENT_LIFECYCLE_TRANSITION_FUNCTION ||
  'events-lifecycle-manager-transition';
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

const LIFECYCLE_SCHEDULE_IDS = [
  'start',
  'finish',
  'ticket-sales-reminder',
  'ticket-sales-start',
  'ticket-sales-ending-soon',
  'ticket-sales-finish'
];

const parseTime = (rawTime, fallbackTime) => {
  if (!rawTime && rawTime !== 0) return fallbackTime;

  const normalized = String(rawTime)
    .replace(/\u00A0|\u202F/g, ' ')
    .trim();

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(normalized)) {
    const [hour, minute, second = '0'] = normalized.split(':');
    return {
      hour: Math.min(Math.max(parseInt(hour, 10) || 0, 0), 23),
      minute: Math.min(Math.max(parseInt(minute, 10) || 0, 0), 59),
      second: Math.min(Math.max(parseInt(second, 10) || 0, 0), 59)
    };
  }

  if (/^\d{3,4}$/.test(normalized)) {
    const padded = normalized.padStart(4, '0');
    return {
      hour: Math.min(Math.max(parseInt(padded.slice(0, 2), 10) || 0, 0), 23),
      minute: Math.min(Math.max(parseInt(padded.slice(2, 4), 10) || 0, 0), 59),
      second: 0
    };
  }

  const compactAmPm = normalized
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/a\s*m/g, 'am')
    .replace(/p\s*m/g, 'pm')
    .trim();

  const amPmMatch = compactAmPm.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)$/i);
  if (amPmMatch) {
    let hour12 = parseInt(amPmMatch[1], 10);
    const minute = Math.min(Math.max(parseInt(amPmMatch[2] || '0', 10) || 0, 0), 59);
    const second = Math.min(Math.max(parseInt(amPmMatch[3] || '0', 10) || 0, 0), 59);
    const meridiem = amPmMatch[4].toLowerCase();

    if (hour12 < 1 || hour12 > 12) return fallbackTime;
    if (meridiem === 'am') hour12 = hour12 === 12 ? 0 : hour12;
    else hour12 = hour12 === 12 ? 12 : hour12 + 12;

    return { hour: hour12, minute, second };
  }

  return fallbackTime;
};

const buildAtExpression = (yyyymmdd, rawTime, fallbackTime) => {
  if (!/^\d{8}$/.test(String(yyyymmdd || ''))) return null;
  const base = String(yyyymmdd);
  const year = base.slice(0, 4);
  const month = base.slice(4, 6);
  const day = base.slice(6, 8);
  const { hour, minute, second } = parseTime(rawTime, fallbackTime);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  return `${year}-${month}-${day}T${hh}:${mm}:${ss}`;
};

const SCHEDULE_TYPE_ALIASES = {
  'ticket-sales-reminder': 'tsr',
  'ticket-sales-start': 'tss',
  'ticket-sales-ending-soon': 'tse',
  'ticket-sales-finish': 'tsf'
};

const scheduleName = (eventId, type) => {
  const normalizedType = SCHEDULE_TYPE_ALIASES[type] || type;
  const safeType = String(normalizedType || '').replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 16);
  const safeEventId = String(eventId || '').replace(/[^a-zA-Z0-9-_]/g, '');
  const prefix = `event-lifecycle-${safeType}-`;
  const remainingLength = Math.max(0, 64 - prefix.length);
  return `${prefix}${safeEventId.slice(0, remainingLength)}`;
};

const deleteSchedule = async (name) => {
  if (!name) return;

  try {
    await scheduler.deleteSchedule({
      Name: name,
      GroupName: 'default'
    }).promise();
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') throw error;
  }
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

const getTransitionFunctionArn = async () => {
  const caller = await sts.getCallerIdentity({}).promise();
  const region = process.env.AWS_REGION || 'us-east-1';
  return `arn:aws:lambda:${region}:${caller.Account}:function:${TRANSITION_FUNCTION_NAME}`;
};

const upsertSchedule = async ({ name, scheduleAt, scheduleTimezone, payload, targetArn }) => {
  if (!name || !scheduleAt || !targetArn || !SCHEDULER_ROLE_ARN) {
    throw new Error('Missing scheduler configuration for lifecycle schedules');
  }

  const params = {
    Name: name,
    GroupName: 'default',
    ScheduleExpression: `at(${scheduleAt})`,
    ScheduleExpressionTimezone: scheduleTimezone || DEFAULT_SCHEDULE_TZ,
    FlexibleTimeWindow: { Mode: 'OFF' },
    State: 'ENABLED',
    Target: {
      Arn: targetArn,
      RoleArn: SCHEDULER_ROLE_ARN,
      Input: JSON.stringify(payload)
    }
  };

  try {
    await scheduler.createSchedule(params).promise();
  } catch (error) {
    if (error.code !== 'ConflictException') throw error;
    await scheduler.updateSchedule(params).promise();
  }
};

const invokeTransitionNow = async (payload) => {
  await lambda.invoke({
    FunctionName: TRANSITION_FUNCTION_NAME,
    InvocationType: 'Event',
    Payload: JSON.stringify(payload)
  }).promise();
};

const clearEventSchedules = async (eventId) => {
  await Promise.all(
    LIFECYCLE_SCHEDULE_IDS.map((scheduleId) =>
      deleteSchedule(scheduleName(eventId, scheduleId))
    )
  );
};

exports.upsertEventLifecycleSchedules = async (event) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || event || {});
  const eventId = body.eventId;

  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'eventId es requerido' }) };
  }

  const eventItem = await getEventById(eventId);
  if (!eventItem) {
    return { statusCode: 404, body: JSON.stringify({ success: false, message: 'Evento no encontrado' }) };
  }

  // Los eventos inactivos no deben entrar al ciclo de vida ni dejar schedules activos.
  if (eventItem.estatus !== ACTIVE_STATUS && !RUNNING_EVENT_STATUSES.has(eventItem.estatus) && eventItem.estatus !== FINISHED_STATUS) {
    await clearEventSchedules(eventId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        eventId,
        skipped: 'event-inactive',
        status: eventItem.estatus
      })
    };
  }

  const targetArn = await getTransitionFunctionArn();
  const eventTimezone = resolveEventTimezone(eventItem);
  const startAt = buildAtExpression(eventItem.fechaIni, eventItem.horaIni || eventItem.hora_ini, { hour: 0, minute: 0, second: 0 });
  const endAt = buildAtExpression(eventItem.fechaFin, eventItem.horaFin || eventItem.hora_fin, { hour: 23, minute: 59, second: 59 });
  const ticketItem = await getTicketByEventId(eventId);

  if (ticketItem) {
    await syncTicketSalesWindowState(eventItem, ticketItem);
  }

  const now = dayjs().tz(eventTimezone);
  const scheduled = [];

  if (startAt) {
    const startDate = dayjs.tz(startAt, 'YYYY-MM-DDTHH:mm:ss', eventTimezone);
    const payload = { eventId, transition: 'START' };
    if (startDate.isAfter(now)) {
      await upsertSchedule({
        name: scheduleName(eventId, 'start'),
        scheduleAt: startAt,
        scheduleTimezone: eventTimezone,
        payload,
        targetArn
      });
      scheduled.push({ transition: 'START', mode: 'scheduled', at: startAt });
    } else {
      await invokeTransitionNow(payload);
      scheduled.push({ transition: 'START', mode: 'invoked-now', at: startAt });
    }
  }

  if (endAt) {
    const endDate = dayjs.tz(endAt, 'YYYY-MM-DDTHH:mm:ss', eventTimezone);
    const payload = { eventId, transition: 'FINISH' };
    if (endDate.isAfter(now)) {
      await upsertSchedule({
        name: scheduleName(eventId, 'finish'),
        scheduleAt: endAt,
        scheduleTimezone: eventTimezone,
        payload,
        targetArn
      });
      scheduled.push({ transition: 'FINISH', mode: 'scheduled', at: endAt });
    } else {
      await invokeTransitionNow(payload);
      scheduled.push({ transition: 'FINISH', mode: 'invoked-now', at: endAt });
    }
  }

  const ticketSalesLifecycle = ticketItem ? buildTicketSalesLifecycleContext(eventItem, ticketItem) : null;
  const ticketSalesSchedules = [
    {
      transition: 'TICKET_SALES_REMINDER',
      scheduleId: 'ticket-sales-reminder',
      executionTime: ticketSalesLifecycle?.saleReminderDateTime || null,
    },
    {
      transition: 'TICKET_SALES_START',
      scheduleId: 'ticket-sales-start',
      executionTime: ticketSalesLifecycle?.saleStartDateTime || null,
    },
    {
      transition: 'TICKET_SALES_ENDING_SOON',
      scheduleId: 'ticket-sales-ending-soon',
      executionTime: ticketSalesLifecycle?.saleEndingSoonDateTime || null,
    },
    {
      transition: 'TICKET_SALES_FINISH',
      scheduleId: 'ticket-sales-finish',
      executionTime: ticketSalesLifecycle?.saleEndDateTime || null,
    }
  ];

  for (const ticketSalesSchedule of ticketSalesSchedules) {
    const name = scheduleName(eventId, ticketSalesSchedule.scheduleId);
    if (!ticketSalesSchedule.executionTime) {
      await deleteSchedule(name);
      continue;
    }

    const scheduleAt = ticketSalesSchedule.executionTime.format('YYYY-MM-DDTHH:mm:ss');
    const payload = { eventId, transition: ticketSalesSchedule.transition };

    if (ticketSalesSchedule.executionTime.isAfter(now)) {
      await upsertSchedule({
        name,
        scheduleAt,
        scheduleTimezone: eventTimezone,
        payload,
        targetArn
      });
      scheduled.push({ transition: ticketSalesSchedule.transition, mode: 'scheduled', at: scheduleAt });
      continue;
    }

    await deleteSchedule(name);
    await invokeTransitionNow(payload);
    scheduled.push({ transition: ticketSalesSchedule.transition, mode: 'invoked-now', at: scheduleAt });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, eventId, scheduled })
  };
};

exports.processEventLifecycleTransition = async (event) => {
  const payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event;
  const eventId = payload.eventId;
  const transition = String(payload.transition || '').toUpperCase();

  if (!eventId || !transition) {
    return { statusCode: 400, body: JSON.stringify({ success: false, message: 'eventId y transition son requeridos' }) };
  }

  const eventItem = await getEventById(eventId);
  if (!eventItem) {
    return { statusCode: 404, body: JSON.stringify({ success: false, message: 'Evento no encontrado' }) };
  }

  // Defensa extra: nunca ejecutar transiciones cuando el evento sigue inactivo.
  if (eventItem.estatus !== ACTIVE_STATUS && !RUNNING_EVENT_STATUSES.has(eventItem.estatus) && eventItem.estatus !== FINISHED_STATUS) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        eventId,
        transition,
        skipped: 'event-inactive',
        status: eventItem.estatus
      })
    };
  }

  if (transition === 'START') {
    if (!RUNNING_EVENT_STATUSES.has(eventItem.estatus) && eventItem.estatus !== FINISHED_STATUS) {
      await updateEventStatus(eventId, RUNNING_STATUS);
      await updateChatLifecycleStatusByEventId(eventId, RUNNING_STATUS);

      const buyerUserIds = await getOrderUserIdsByEventId(eventId);
      await notifyEventStartedOwner(eventItem);
      await notifyEventStartedUsers(eventItem, buyerUserIds);
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, status: RUNNING_STATUS }) };
  }

  if (transition === 'FINISH') {
    if (eventItem.estatus !== FINISHED_STATUS) {
      await updateEventStatus(eventId, FINISHED_STATUS);
      await updateChatLifecycleStatusByEventId(eventId, FINISHED_STATUS);

      const { userIds } = await finalizeOrdersByEventId(eventId);
      await notifyEventFinishedOwner(eventItem);
      await notifyEventFinishedUsers(eventItem, userIds);
      await notifyRateEventToOrderUsers(eventItem, userIds);
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, status: FINISHED_STATUS }) };
  }

  if (transition.startsWith('TICKET_SALES_')) {
    const ticketItem = await getTicketByEventId(eventId);
    if (!ticketItem) {
      return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, skipped: 'No ticket sales config found' }) };
    }

    const interestedUserIds = await getInterestedUserIdsByEvent(eventItem);
    const ticketSalesLifecycle = buildTicketSalesLifecycleContext(eventItem, ticketItem);

    if (transition === 'TICKET_SALES_REMINDER') {
      const claimed = await claimTicketSaleMarker(eventId, TICKET_SALE_MARKERS.REMINDER);
      if (!claimed) {
        return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, skipped: 'already-sent' }) };
      }

      await updateTicketSalesStatusByEventId(eventId, TICKET_SALE_STATUS.SCHEDULED);
      const extraMetadata = {
        saleCountdownText: ticketSalesLifecycle
          ? humanizeSaleCountdown(ticketSalesLifecycle.saleStartDateTime.diff(getNowForEvent(eventItem)))
          : ''
      };
      const owner = await notifyTicketSalesOwner(eventItem, ticketItem, 'REMINDER', extraMetadata);
      const audience = await notifyTicketSalesInterestedUsers(eventItem, ticketItem, 'REMINDER', interestedUserIds, extraMetadata);

      return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, dispatched: owner.dispatched + audience.dispatched }) };
    }

    if (transition === 'TICKET_SALES_START') {
      const claimed = await claimTicketSaleMarker(eventId, TICKET_SALE_MARKERS.STARTED);
      if (!claimed) {
        return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, skipped: 'already-sent' }) };
      }

      await updateTicketSalesStatusByEventId(eventId, TICKET_SALE_STATUS.ACTIVE);
      const owner = await notifyTicketSalesOwner(eventItem, ticketItem, 'STARTED');
      const audience = await notifyTicketSalesInterestedUsers(eventItem, ticketItem, 'STARTED', interestedUserIds);

      return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, dispatched: owner.dispatched + audience.dispatched }) };
    }

    if (transition === 'TICKET_SALES_ENDING_SOON') {
      const claimed = await claimTicketSaleMarker(eventId, TICKET_SALE_MARKERS.ENDING_SOON);
      if (!claimed) {
        return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, skipped: 'already-sent' }) };
      }

      await updateTicketSalesStatusByEventId(eventId, TICKET_SALE_STATUS.ENDING_SOON);
      const extraMetadata = {
        saleCountdownText: ticketSalesLifecycle
          ? humanizeSaleCountdown(ticketSalesLifecycle.saleEndDateTime.diff(getNowForEvent(eventItem)))
          : ''
      };
      const owner = await notifyTicketSalesOwner(eventItem, ticketItem, 'ENDING_SOON', extraMetadata);
      const audience = await notifyTicketSalesInterestedUsers(eventItem, ticketItem, 'ENDING_SOON', interestedUserIds, extraMetadata);

      return { statusCode: 200, body: JSON.stringify({ success: true, eventId, transition, dispatched: owner.dispatched + audience.dispatched }) };
    }

    if (transition === 'TICKET_SALES_FINISH') {
      const finishedClaimed = await claimTicketSaleMarker(eventId, TICKET_SALE_MARKERS.FINISHED);
      if (finishedClaimed) {
        await updateTicketSalesStatusByEventId(eventId, TICKET_SALE_STATUS.FINISHED);
        await notifyTicketSalesOwner(eventItem, ticketItem, 'FINISHED');
        await notifyTicketSalesInterestedUsers(eventItem, ticketItem, 'FINISHED', interestedUserIds);
      }

      const summaryClaimed = await claimTicketSaleMarker(eventId, TICKET_SALE_MARKERS.SUMMARY);
      if (summaryClaimed) {
        const eventCurrency = eventItem.currency || eventItem.moneda ||
          ticketItem?.currency || ticketItem?.moneda ||
          (Array.isArray(ticketItem?.categorias) && ticketItem.categorias[0]?.currency) ||
          (Array.isArray(ticketItem?.categorias) && ticketItem.categorias[0]?.moneda);
        const summary = await getEventSalesSummaryByEventId(eventId, eventCurrency);
        await notifyTicketSalesOwner(eventItem, ticketItem, 'SUMMARY', {
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
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          eventId,
          transition,
          finishedSent: finishedClaimed,
          summarySent: summaryClaimed
        })
      };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ success: false, message: `Transición no soportada: ${transition}` }) };
};
