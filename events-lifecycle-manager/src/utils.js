const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const SES = new AWS.SES();
const lambda = new AWS.Lambda();
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const tzLookup = require('tz-lookup');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Eventos';
const VENUES_TABLE = process.env.VENUES_TABLE || 'Venues';
const TICKETS_TABLE = process.env.TICKETS_TABLE || 'Tickets';
const ORDERS_TABLE = process.env.ORDERS_TABLE || 'Orders';
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE || 'Notifications';
const FOLLOWERS_TABLE = process.env.FOLLOWERS_TABLE || 'Followers';
const FAVORITE_EVENTS_TABLE = process.env.FAVORITE_EVENTS_TABLE || 'userFavoriteEvents';
const DEFAULT_NOTIFICATIONS_STAGE = process.env.STAGE || 'dev';
const NOTIFICATIONS_TRIGGER_FUNCTION =
  process.env.NOTIFICATIONS_TRIGGER_FUNCTION ||
  `notifications-${DEFAULT_NOTIFICATIONS_STAGE}-triggerNotification`;
const DEFAULT_EVENT_TIMEZONE = process.env.EVENT_SCHEDULE_TIMEZONE || 'America/Bogota';
const WEB_APP_BASE_URL = String(process.env.WEB_APP_BASE_URL || 'https://qa.doeventsapp.com').replace(/\/$/, '');
const EVENT_DETAIL_BASE_URL = `${WEB_APP_BASE_URL}/events`;

const ORDER_STATUSES_TO_FINISH = new Set(['APPROVED', 'PAID', 'SOLD']);
const ORDER_STATUSES_TO_NOTIFY_EVENT_START = new Set(['APPROVED', 'PAID', 'SOLD', 'FINISHED']);
const SUCCESSFUL_ORDER_STATUSES = new Set(['APPROVED', 'SOLD', 'FINISHED']);
const RUNNING_EVENT_STATUSES = new Set(['ejecucion', 'en_ejecucion']);
const START_OF_DAY_TIME = { hour: 0, minute: 0, second: 0 };
const END_OF_DAY_TIME = { hour: 23, minute: 59, second: 59 };
const TICKET_SALES_REMINDER_WINDOW_HOURS = 24;
const TICKET_SALES_ENDING_SOON_WINDOW_MINUTES = 60;

const TICKET_SALE_MARKERS = {
  REMINDER: 'ticketSalesReminderSentAt',
  STARTED: 'ticketSalesStartedSentAt',
  ENDING_SOON: 'ticketSalesEndingSoonSentAt',
  FINISHED: 'ticketSalesFinishedSentAt',
  SUMMARY: 'ticketSalesSummarySentAt'
};

const TICKET_SALES_WINDOW_KEY_ATTRIBUTE = 'ticketSalesWindowKey';

exports.RUNNING_EVENT_STATUSES = RUNNING_EVENT_STATUSES;

const isValidTimezone = (timeZone) => {
  if (!timeZone || typeof timeZone !== 'string') return false;

  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
};

const normalizeCoordinate = (value) => {
  if (value === undefined || value === null || value === '') return null;

  const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(numericValue) ? numericValue : null;
};

const resolveCoordinates = (source = {}) => {
  if (!source || typeof source !== 'object') return null;

  const latitude = normalizeCoordinate(
    source.latitude ?? source.lat ?? source.ubicacion?.latitude ?? source.ubicacion?.lat ?? source.location?.latitude ?? source.location?.lat
  );
  const longitude = normalizeCoordinate(
    source.longitude ?? source.lng ?? source.lon ?? source.ubicacion?.longitude ?? source.ubicacion?.lng ?? source.location?.longitude ?? source.location?.lng
  );

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
};

const inferTimezoneFromCoordinates = (source = {}) => {
  const coordinates = resolveCoordinates(source);
  if (!coordinates) return null;

  try {
    return tzLookup(coordinates.latitude, coordinates.longitude);
  } catch (_) {
    return null;
  }
};

const getVenueById = async (venueId) => {
  if (!venueId) return null;

  const result = await docClient.get({
    TableName: VENUES_TABLE,
    Key: { venue_id: venueId }
  }).promise();

  return result.Item || null;
};

const enrichEventWithVenue = async (event = {}) => {
  if (!event || !event.venueId) return event;
  if (event.venue) return event;

  try {
    const venue = await getVenueById(event.venueId);
    return venue ? { ...event, venue } : event;
  } catch (error) {
    console.warn(`[events-lifecycle] No se pudo obtener venue ${event.venueId} para evento ${event.id || 'unknown'}: ${error.message}`);
    return event;
  }
};

exports.resolveEventTimezone = (event = {}) => {
  const venueTimezoneByCoordinates = inferTimezoneFromCoordinates(event.venue);
  const eventTimezoneByCoordinates = inferTimezoneFromCoordinates(event);
  const candidates = [
    venueTimezoneByCoordinates,
    eventTimezoneByCoordinates,
    event.venue && event.venue.timezone,
    event.venue && event.venue.timeZone,
    event.venue && event.venue.ubicacion && event.venue.ubicacion.timezone,
    event.venue && event.venue.location && event.venue.location.timezone,
    event.timezone,
    event.timeZone,
    event.ubicacion && event.ubicacion.timezone,
    event.location && event.location.timezone
  ];

  const validTimezone = candidates.find(isValidTimezone);
  return validTimezone || DEFAULT_EVENT_TIMEZONE;
};

exports.getNowForEvent = (event = {}) => dayjs().tz(exports.resolveEventTimezone(event));

// Obtener eventos activos o en ejecución
// NOTA: Los eventos inactivos quedan dormidos y no entran en ciclo de vida hasta que se publiquen
exports.getAllEvents = async () => {
  const maxComparableDate = dayjs().add(1, 'day').format('YYYYMMDD');
  const statuses = ['activo', 'ejecucion', 'en_ejecucion'];
  let allEvents = [];

  for (const status of statuses) {
    const result = await docClient.query({
      TableName: EVENTS_TABLE,
      IndexName: 'EstatusFechaIndex',
      KeyConditionExpression: 'estatus = :s AND fechaIni <= :today',
      ExpressionAttributeValues: {
        ':s': status,
        ':today': maxComparableDate
      }
    }).promise();
    allEvents = allEvents.concat(result.Items || []);
  }

  return Promise.all(allEvents.map(enrichEventWithVenue));
};

exports.getEventById = async (eventId) => {
  if (!eventId) return null;

  const result = await docClient.get({
    TableName: EVENTS_TABLE,
    Key: { id: eventId }
  }).promise();

  if (!result.Item) return null;
  return enrichEventWithVenue(result.Item);
};

const resolveEventOwnerUserId = (event = {}) => {
  const ownerUserId =
    event.userId ||
    event.createdBy ||
    event.user_id ||
    event.id_usuario ||
    null;

  return ownerUserId ? String(ownerUserId).trim() : null;
};

const buildEventDetailLink = (eventId) =>
  eventId ? `${EVENT_DETAIL_BASE_URL}/${eventId}` : WEB_APP_BASE_URL;

const buildEventLocationMetadata = (event = {}) => ({
  eventLocation:
    event.venue?.name ||
    event.ubicacion?.city ||
    event.location?.city ||
    event.ciudad ||
    '',
  eventAddress:
    event.venue?.address ||
    event.ubicacion?.address ||
    event.location?.address ||
    event.direccion ||
    '',
  eventCity:
    event.venue?.city ||
    event.ubicacion?.city ||
    event.location?.city ||
    event.ciudad ||
    '',
  venueName: event.venue?.name || '',
});

const parseEventTime = (rawTime, fallbackTime = END_OF_DAY_TIME) => {
  const fallback = () => ({ ...fallbackTime });

  try {
    if (!rawTime && rawTime !== 0) {
      return fallback();
    }

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

    // Soporte para formatos tipo "12:00 A. M.", "12:00 AM", "1:30 p.m."
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

      if (hour12 < 1 || hour12 > 12) {
        console.warn(`[events-lifecycle] horaFin fuera de rango (${rawTime}), fallback a fin del dia`);
        return fallback();
      }

      if (meridiem === 'am') {
        hour12 = hour12 === 12 ? 0 : hour12;
      } else {
        hour12 = hour12 === 12 ? 12 : hour12 + 12;
      }

      return { hour: hour12, minute, second };
    }

    console.warn(`[events-lifecycle] No se pudo interpretar horaFin (${rawTime}), fallback a fin del dia`);
    return fallback();
  } catch (error) {
    console.warn(
      `[events-lifecycle] Error interpretando horaFin (${rawTime}): ${error.message}. Fallback a fin del dia`
    );
    return fallback();
  }
};

const buildEventDateTime = (rawDate, rawTime, fallbackTime, label, eventId, event = {}) => {
  const comparableDate = String(rawDate || '');
  if (!/^\d{8}$/.test(comparableDate)) return null;
  const timeZone = exports.resolveEventTimezone(event);

  try {
    const { hour, minute, second } = parseEventTime(rawTime, fallbackTime);
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const ss = String(second).padStart(2, '0');

    return dayjs.tz(`${comparableDate} ${hh}:${mm}:${ss}`, 'YYYYMMDD HH:mm:ss', timeZone);
  } catch (error) {
    console.warn(
      `[events-lifecycle] Error construyendo ${label} para evento ${eventId || 'unknown'}: ${error.message}. Fallback aplicado`
    );

    const hh = String(fallbackTime.hour).padStart(2, '0');
    const mm = String(fallbackTime.minute).padStart(2, '0');
    const ss = String(fallbackTime.second).padStart(2, '0');
    return dayjs.tz(`${comparableDate} ${hh}:${mm}:${ss}`, 'YYYYMMDD HH:mm:ss', timeZone);
  }
};

exports.getEventStartDateTime = (event = {}) =>
  buildEventDateTime(
    event.fechaIni,
    event.horaIni || event.hora_ini,
    START_OF_DAY_TIME,
    'fechaIni',
    event.id,
    event
  );

exports.getEventEndDateTime = (event = {}) =>
  buildEventDateTime(
    event.fechaFin,
    event.horaFin || event.hora_fin,
    END_OF_DAY_TIME,
    'fechaFin',
    event.id,
    event
  );

const formatCurrency = (amount, currency = 'DOP') => {
  const code = (currency || 'DOP').toUpperCase();
  try {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0
    }).format(Number(amount || 0));
  } catch (_) {
    return `${code} ${Number(amount || 0).toFixed(0)}`;
  }
};

const toNumber = (value, fallback = 0) => {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
};

const humanizeDuration = (milliseconds) => {
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

const buildTicketSalesWindowKey = (ticket = {}) => {
  const values = [ticket.fechaIniVent, ticket.horaIniVent, ticket.fechaFinVent, ticket.horaFinVent]
    .map((value) => String(value || '').trim());

  if (!values.some(Boolean)) return null;
  return values.join('|');
};

exports.getTicketByEventId = async (eventId) => {
  if (!eventId) return null;

  try {
    const result = await docClient.query({
      TableName: TICKETS_TABLE,
      IndexName: 'eventIdIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      },
      Limit: 1
    }).promise();

    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (queryError) {
    console.warn(`[events-lifecycle] Query de Tickets falló para eventId=${eventId}, usando scan fallback: ${queryError.message}`);
  }

  const scanResult = await docClient.scan({
    TableName: TICKETS_TABLE,
    FilterExpression: 'eventId = :eventId',
    ExpressionAttributeValues: {
      ':eventId': eventId
    },
    Limit: 1
  }).promise();

  return scanResult.Items && scanResult.Items.length > 0 ? scanResult.Items[0] : null;
};

exports.getTicketSaleStartDateTime = (ticket = {}, event = {}) =>
  buildEventDateTime(
    ticket.fechaIniVent,
    ticket.horaIniVent,
    START_OF_DAY_TIME,
    'fechaIniVent',
    ticket.id || event.id,
    event
  );

exports.getTicketSaleEndDateTime = (ticket = {}, event = {}) =>
  buildEventDateTime(
    ticket.fechaFinVent,
    ticket.horaFinVent,
    END_OF_DAY_TIME,
    'fechaFinVent',
    ticket.id || event.id,
    event
  );

exports.buildTicketSalesLifecycleContext = (event = {}, ticket = {}) => {
  const saleStartDateTime = exports.getTicketSaleStartDateTime(ticket, event);
  const saleEndDateTime = exports.getTicketSaleEndDateTime(ticket, event);

  if (!saleStartDateTime || !saleEndDateTime || !saleStartDateTime.isValid() || !saleEndDateTime.isValid()) {
    return null;
  }

  const endingSoonDateTime = saleEndDateTime.subtract(TICKET_SALES_ENDING_SOON_WINDOW_MINUTES, 'minute');

  return {
    saleStartDateTime,
    saleEndDateTime,
    saleReminderDateTime: saleStartDateTime.subtract(TICKET_SALES_REMINDER_WINDOW_HOURS, 'hour'),
    saleEndingSoonDateTime: endingSoonDateTime.isBefore(saleStartDateTime)
      ? saleStartDateTime
      : endingSoonDateTime,
    ticketSalesWindowKey: buildTicketSalesWindowKey(ticket)
  };
};

const getFollowerUserIdsByOwnerId = async (ownerId) => {
  if (!ownerId) return [];

  const userIds = new Set();
  let lastEvaluatedKey;

  do {
    const result = await docClient.query({
      TableName: FOLLOWERS_TABLE,
      IndexName: 'followUserIdIndex',
      KeyConditionExpression: 'follow_userId = :ownerId',
      FilterExpression: '#status = :accepted AND attribute_not_exists(blocked_at)',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':ownerId': ownerId,
        ':accepted': 'accepted'
      },
      ProjectionExpression: 'userId',
      ExclusiveStartKey: lastEvaluatedKey
    }).promise();

    (result.Items || []).forEach((item) => {
      if (item.userId) userIds.add(item.userId);
    });
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return [...userIds];
};

const getFavoriteUserIdsByEventId = async (eventId) => {
  if (!eventId) return [];

  const userIds = new Set();
  let lastEvaluatedKey;

  do {
    const result = await docClient.query({
      TableName: FAVORITE_EVENTS_TABLE,
      IndexName: 'eventIdIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      },
      ProjectionExpression: 'userId',
      ExclusiveStartKey: lastEvaluatedKey
    }).promise();

    (result.Items || []).forEach((item) => {
      if (item.userId) userIds.add(item.userId);
    });
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return [...userIds];
};

exports.getInterestedUserIdsByEvent = async (event = {}) => {
  const ownerUserId = resolveEventOwnerUserId(event);
  const [followerUserIds, favoriteUserIds] = await Promise.all([
    getFollowerUserIdsByOwnerId(ownerUserId),
    getFavoriteUserIdsByEventId(event.id)
  ]);

  const userIds = new Set([...followerUserIds, ...favoriteUserIds]);
  if (ownerUserId) userIds.delete(ownerUserId);
  return [...userIds];
};

exports.syncTicketSalesWindowState = async (event = {}, ticket = {}) => {
  const eventId = event.id;
  const nextWindowKey = buildTicketSalesWindowKey(ticket);
  const currentWindowKey = event[TICKET_SALES_WINDOW_KEY_ATTRIBUTE] || null;

  if (!eventId || !nextWindowKey || nextWindowKey === currentWindowKey) {
    return { changed: false, ticketSalesWindowKey: currentWindowKey || nextWindowKey || null };
  }

  await docClient.update({
    TableName: EVENTS_TABLE,
    Key: { id: eventId },
    UpdateExpression: `SET #windowKey = :windowKey REMOVE #reminder, #started, #endingSoon, #finished, #summary`,
    ExpressionAttributeNames: {
      '#windowKey': TICKET_SALES_WINDOW_KEY_ATTRIBUTE,
      '#reminder': TICKET_SALE_MARKERS.REMINDER,
      '#started': TICKET_SALE_MARKERS.STARTED,
      '#endingSoon': TICKET_SALE_MARKERS.ENDING_SOON,
      '#finished': TICKET_SALE_MARKERS.FINISHED,
      '#summary': TICKET_SALE_MARKERS.SUMMARY
    },
    ExpressionAttributeValues: {
      ':windowKey': nextWindowKey
    }
  }).promise();

  event[TICKET_SALES_WINDOW_KEY_ATTRIBUTE] = nextWindowKey;
  delete event[TICKET_SALE_MARKERS.REMINDER];
  delete event[TICKET_SALE_MARKERS.STARTED];
  delete event[TICKET_SALE_MARKERS.ENDING_SOON];
  delete event[TICKET_SALE_MARKERS.FINISHED];
  delete event[TICKET_SALE_MARKERS.SUMMARY];

  return { changed: true, ticketSalesWindowKey: nextWindowKey };
};

exports.claimTicketSaleMarker = async (eventId, markerAttribute) => {
  if (!eventId || !markerAttribute) return false;

  try {
    await docClient.update({
      TableName: EVENTS_TABLE,
      Key: { id: eventId },
      UpdateExpression: 'SET #marker = :timestamp',
      ConditionExpression: 'attribute_not_exists(#marker)',
      ExpressionAttributeNames: {
        '#marker': markerAttribute
      },
      ExpressionAttributeValues: {
        ':timestamp': new Date().toISOString()
      }
    }).promise();

    return true;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return false;
    }

    throw error;
  }
};

exports.updateTicketSalesStatusByEventId = async (eventId, saleStatus) => {
  if (!eventId || !saleStatus) return;

  const ticket = await exports.getTicketByEventId(eventId);
  if (!ticket || !ticket.id) return;

  await docClient.update({
    TableName: TICKETS_TABLE,
    Key: { id: ticket.id },
    UpdateExpression: 'SET #saleStatus = :saleStatus, #saleStatusUpdatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#saleStatus': 'ticketSalesStatus',
      '#saleStatusUpdatedAt': 'ticketSalesStatusUpdatedAt'
    },
    ExpressionAttributeValues: {
      ':saleStatus': saleStatus,
      ':updatedAt': new Date().toISOString()
    }
  }).promise();
};

exports.getEventSalesSummaryByEventId = async (eventId, currency) => {
  const orders = await getOrdersByEvent(eventId);
  const successfulOrders = orders.filter((order) => {
    const status = String(order.payment_status || order.status || '').toUpperCase();
    return SUCCESSFUL_ORDER_STATUSES.has(status);
  });

  let totalRevenue = 0;
  let soldTickets = 0;

  successfulOrders.forEach((order) => {
    totalRevenue += toNumber(order.total_amount ?? order.amount ?? order.total, 0);
    if (Array.isArray(order.tickets)) {
      soldTickets += order.tickets.length;
      return;
    }
    soldTickets += toNumber(order.quantity ?? order.ticketCount ?? order.totalTickets, 0);
  });

  const effectiveCurrency = currency ||
    (successfulOrders.find(o => o.currency || o.moneda) || orders.find(o => o.currency || o.moneda) || {}).currency ||
    (successfulOrders.find(o => o.moneda) || orders.find(o => o.moneda) || {}).moneda ||
    'DOP';

  return {
    totalOrders: successfulOrders.length,
    soldTickets,
    totalRevenue,
    currency: effectiveCurrency,
    totalOrdersFormatted: String(successfulOrders.length),
    soldTicketsFormatted: String(soldTickets),
    totalRevenueFormatted: formatCurrency(totalRevenue, effectiveCurrency)
  };
};

const buildTicketSalesNotificationMetadata = (event = {}, ticket = {}, extra = {}) => {
  const context = exports.buildTicketSalesLifecycleContext(event, ticket);
  const locationMetadata = buildEventLocationMetadata(event);
  const saleStartDateTime = context?.saleStartDateTime;
  const saleEndDateTime = context?.saleEndDateTime;
  const timeZone = exports.resolveEventTimezone(event);
  const now = exports.getNowForEvent(event);

  return {
    eventId: event.id,
    eventName: event.nombre || event.name || 'tu evento',
    eventSlug: event.slug || event.id,
    eventDate: event.fechaIni || event.fechaFin,
    eventStartTime: event.horaIni || event.hora_ini || '',
    eventEndTime: event.horaFin || event.hora_fin || '',
    eventImage: event.eventImage || event.imagen || event.image || event.urlImagen,
    link: buildEventDetailLink(event.id),
    saleStartDate: ticket.fechaIniVent || '',
    saleStartTime: ticket.horaIniVent || '',
    saleEndDate: ticket.fechaFinVent || '',
    saleEndTime: ticket.horaFinVent || '',
    saleStartDateDisplay: saleStartDateTime ? saleStartDateTime.format('DD/MM/YYYY') : '',
    saleEndDateDisplay: saleEndDateTime ? saleEndDateTime.format('DD/MM/YYYY') : '',
    saleWindowDisplay:
      saleStartDateTime && saleEndDateTime
        ? `${saleStartDateTime.format('DD/MM/YYYY HH:mm')} - ${saleEndDateTime.format('DD/MM/YYYY HH:mm')}`
        : '',
    saleCountdownText:
      saleStartDateTime && saleStartDateTime.isAfter(now)
        ? humanizeDuration(saleStartDateTime.diff(now))
        : saleEndDateTime && saleEndDateTime.isAfter(now)
          ? humanizeDuration(saleEndDateTime.diff(now))
          : '',
    eventTimezone: timeZone,
    notificationTimestamp: now.toISOString(),
    ...locationMetadata,
    ...extra
  };
};

const invokeNotificationTemplate = async ({ templateKey, userId, eventId, channels, metadata }) =>
  lambda.invoke({
    FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION,
    InvocationType: 'Event',
    Payload: JSON.stringify({
      templateKey,
      userId,
      eventId,
      channels,
      metadata: {
        userId,
        eventId,
        ...metadata
      }
    })
  }).promise();

exports.notifyTicketSalesOwner = async (event = {}, ticket = {}, phase = '', extraMetadata = {}) => {
  const userId = resolveEventOwnerUserId(event);
  if (!userId) return { dispatched: 0, failed: 0 };

  const templateKeyByPhase = {
    REMINDER: 'EVENT_TICKET_SALES_REMINDER_OWNER',
    STARTED: 'EVENT_TICKET_SALES_STARTED_OWNER',
    ENDING_SOON: 'EVENT_TICKET_SALES_ENDING_SOON_OWNER',
    FINISHED: 'EVENT_TICKET_SALES_FINISHED_OWNER',
    SUMMARY: 'EVENT_TICKET_SALES_SUMMARY_OWNER'
  };

  const templateKey = templateKeyByPhase[phase];
  if (!templateKey) return { dispatched: 0, failed: 0 };

  try {
    await invokeNotificationTemplate({
      templateKey,
      userId,
      eventId: event.id,
      channels: phase === 'SUMMARY' ? ['email'] : ['push', 'inApp', 'email'],
      metadata: buildTicketSalesNotificationMetadata(event, ticket, extraMetadata)
    });

    return { dispatched: 1, failed: 0 };
  } catch (error) {
    console.warn(`⚠️ notifyTicketSalesOwner falló para eventId=${event.id}, fase=${phase}: ${error.message}`);
    return { dispatched: 0, failed: 1 };
  }
};

exports.notifyTicketSalesInterestedUsers = async (event = {}, ticket = {}, phase = '', userIds = [], extraMetadata = {}) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { dispatched: 0, failed: 0 };
  }

  const templateKeyByPhase = {
    REMINDER: 'EVENT_TICKET_SALES_REMINDER_AUDIENCE',
    STARTED: 'EVENT_TICKET_SALES_STARTED_AUDIENCE',
    ENDING_SOON: 'EVENT_TICKET_SALES_ENDING_SOON_AUDIENCE',
    FINISHED: 'EVENT_TICKET_SALES_FINISHED_AUDIENCE'
  };

  const templateKey = templateKeyByPhase[phase];
  if (!templateKey) return { dispatched: 0, failed: 0 };

  const sharedMetadata = buildTicketSalesNotificationMetadata(event, ticket, extraMetadata);
  const payloads = userIds.map((userId) =>
    invokeNotificationTemplate({
      templateKey,
      userId,
      eventId: event.id,
      channels: ['push', 'inApp', 'email'],
      metadata: sharedMetadata
    })
  );

  const results = await Promise.allSettled(payloads);
  const dispatched = results.filter((result) => result.status === 'fulfilled').length;
  const failed = results.length - dispatched;

  if (failed > 0) {
    console.warn(`⚠️ notifyTicketSalesInterestedUsers completó con fallas: ${failed} de ${results.length} para fase=${phase}`);
  }

  return { dispatched, failed };
};

// Cambiar estado del evento
exports.updateEventStatus = async (eventId, newStatus) => {
  await docClient.update({
    TableName: EVENTS_TABLE,
    Key: { id: eventId },
    UpdateExpression: 'set estatus = :s',
    ExpressionAttributeValues: { ':s': newStatus }
  }).promise();
};

exports.updateChatLifecycleStatusByEventId = async (eventId, eventStatus) => {
  if (!eventId || !eventStatus) {
    return { updatedCount: 0 };
  }

  let chats = [];
  let lastEvaluatedKey;

  do {
    const result = await docClient.query({
      TableName: 'Chats',
      IndexName: 'event-index',
      KeyConditionExpression: 'event = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      },
      ExclusiveStartKey: lastEvaluatedKey
    }).promise();

    chats = chats.concat(result.Items || []);
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (!chats.length) {
    return { updatedCount: 0 };
  }

  const now = dayjs().toISOString();
  const chatStatus = eventStatus === 'finalizado' ? 'finished' : 'active';

  await Promise.all(
    chats
      .filter((chat) => !chat.deletedAt)
      .map((chat) => {
          const roomKey =
            chat.id && chat.updatedAt
              ? { id: chat.id, updatedAt: chat.updatedAt }
              : null;
        if (!roomKey) return Promise.resolve();

          const isFinishedStatus = eventStatus === 'finalizado';
          const expressionAttributeValues = isFinishedStatus
            ? {
                ':chatStatus': chatStatus,
                ':eventStatus': eventStatus,
                ':lifecycleUpdatedAt': now,
                ':closedAt': now
              }
            : {
                ':chatStatus': chatStatus,
                ':eventStatus': eventStatus,
                ':lifecycleUpdatedAt': now,
                ':null': null
              };

          const updateExpression = isFinishedStatus
            ? 'SET #status = :chatStatus, eventStatus = :eventStatus, lifecycleUpdatedAt = :lifecycleUpdatedAt, closedAt = :closedAt'
            : 'SET #status = :chatStatus, eventStatus = :eventStatus, lifecycleUpdatedAt = :lifecycleUpdatedAt, closedAt = :null';

        return docClient.update({
          TableName: 'Chats',
          Key: roomKey,
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: expressionAttributeValues
        }).promise();
      })
  );

  return { updatedCount: chats.filter((chat) => !chat.deletedAt).length };
};

exports.hasSentThreeDayReminderToday = (event = {}, dayKey) => {
  if (!dayKey) return false;
  return (
    event.lastReminder3dDate === dayKey ||
    event.lastReminderDate3d === dayKey ||
    event.lastReminder3DDate === dayKey
  );
};

exports.markThreeDayReminderSent = async (eventId, dayKey) => {
  if (!eventId || !dayKey) return;

  await docClient.update({
    TableName: EVENTS_TABLE,
    Key: { id: eventId },
    UpdateExpression: 'SET lastReminder3dDate = :dayKey, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':dayKey': dayKey,
      ':updatedAt': dayjs().toISOString()
    }
  }).promise();
};

// Obtener asistentes confirmados
exports.getConfirmedEmailsForEvent = async (eventId) => {
  const result = await docClient.query({
    TableName: TICKETS_TABLE,
    IndexName: 'eventIdIndex',
    KeyConditionExpression: 'eventId = :eid',
    ExpressionAttributeValues: { ':eid': eventId }
  }).promise();

  if (!result.Items || result.Items.length === 0) return [];

  const confirmed = result.Items.filter(ticket =>
    ticket.status === 'CONFIRMED' && ticket.email
  );

  return [...new Set(confirmed.map(t => t.email))];
};

const getOrdersByEvent = async (eventId) => {
  const orders = [];
  let lastEvaluatedKey;

  try {
    do {
      const result = await docClient.query({
        TableName: ORDERS_TABLE,
        IndexName: 'eventIdIndex',
        KeyConditionExpression: 'event_id = :eventId',
        ExpressionAttributeValues: {
          ':eventId': eventId
        },
        ExclusiveStartKey: lastEvaluatedKey
      }).promise();

      orders.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return orders;
  } catch (queryError) {
    console.warn(`⚠️ Query de Orders falló para eventId=${eventId}, usando scan fallback`, queryError.message);
  }

  lastEvaluatedKey = undefined;
  do {
    const scanResult = await docClient.scan({
      TableName: ORDERS_TABLE,
      FilterExpression: 'event_id = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      },
      ExclusiveStartKey: lastEvaluatedKey
    }).promise();

    orders.push(...(scanResult.Items || []));
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return orders;
};

exports.getOrderUserIdsByEventId = async (eventId) => {
  const orders = await getOrdersByEvent(eventId);
  if (!orders.length) {
    return [];
  }

  const userIds = new Set();

  for (const order of orders) {
    const currentStatus = String(order.payment_status || order.status || '').toUpperCase();
    if (!ORDER_STATUSES_TO_NOTIFY_EVENT_START.has(currentStatus)) continue;
    const orderUserId = order.user_id || order.userId;
    if (!orderUserId) continue;
    userIds.add(orderUserId);
  }

  return [...userIds];
};

exports.finalizeOrdersByEventId = async (eventId) => {
  const orders = await getOrdersByEvent(eventId);
  if (!orders.length) {
    return { updatedCount: 0, userIds: [] };
  }

  const nowIso = new Date().toISOString();
  const userIds = new Set();
  let updatedCount = 0;

  for (const order of orders) {
    const currentStatus = String(order.payment_status || order.status || '').toUpperCase();
    if (!ORDER_STATUSES_TO_FINISH.has(currentStatus)) continue;

    const orderId = order.order_id || order.id;
    if (!orderId) continue;

    await docClient.update({
      TableName: ORDERS_TABLE,
      Key: { order_id: orderId },
      UpdateExpression: 'SET payment_status = :finished, finalized_at = :now, updated_at = :now',
      ExpressionAttributeValues: {
        ':finished': 'FINISHED',
        ':now': nowIso
      }
    }).promise();

    const orderUserId = order.user_id || order.userId;
    if (orderUserId) {
      userIds.add(orderUserId);
    }

    updatedCount++;
  }

  return {
    updatedCount,
    userIds: [...userIds]
  };
};

exports.notifyEventFinishedUsers = async (event = {}, userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { dispatched: 0, failed: 0 };
  }

  const eventId = event.id;
  const eventName = event.nombre || event.name || 'tu evento';
  const eventSlug = event.slug || eventId;
  const eventLink = buildEventDetailLink(eventId);
  const eventImage = event.eventImage || event.imagen || event.image || event.urlImagen;
  const locationMetadata = buildEventLocationMetadata(event);

  const payloads = userIds.map((userId) => {
    const triggerPayload = {
      templateKey: 'EVENT_FINISHED',
      userId,
      eventId,
      channels: ['push', 'inApp', 'whatsapp', 'email'],
      metadata: {
        userId,
        eventId,
        eventName,
        eventDate: event.fechaIni || event.fechaFin,
        eventEndDate: event.fechaFin,
        eventStartTime: event.horaIni || event.hora_ini || '',
        eventEndTime: event.horaFin || event.hora_fin || '',
        eventSlug,
        eventImage,
        link: eventLink,
        type: 'event_finished',
        ...locationMetadata
      }
    };

    return lambda.invoke({
      FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify(triggerPayload)
    }).promise();
  });

  const results = await Promise.allSettled(payloads);
  const dispatched = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - dispatched;

  if (failed > 0) {
    console.warn(`⚠️ notifyEventFinishedUsers completó con fallas: ${failed} de ${results.length}`);
  }

  return { dispatched, failed };
};

exports.notifyEventFinishedOwner = async (event = {}) => {
  const userId = resolveEventOwnerUserId(event);
  if (!userId) {
    return { dispatched: 0, failed: 0 };
  }

  const eventId = event.id;
  const eventName = event.nombre || event.name || 'tu evento';
  const eventSlug = event.slug || eventId;
  const eventLink = buildEventDetailLink(eventId);
  const eventImage = event.eventImage || event.imagen || event.image || event.urlImagen;
  const locationMetadata = buildEventLocationMetadata(event);

  try {
    await lambda.invoke({
      FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        templateKey: 'EVENT_FINISHED_OWNER',
        userId,
        eventId,
        channels: ['push', 'inApp', 'email'],
        metadata: {
          userId,
          eventId,
          eventName,
          eventDate: event.fechaIni || event.fechaFin,
          eventEndDate: event.fechaFin || event.fechaIni,
          eventStartTime: event.horaIni || event.hora_ini || '',
          eventEndTime: event.horaFin || event.hora_fin || '',
          eventSlug,
          eventImage,
          link: eventLink,
          audience: 'OWNER',
          type: 'event_finished_owner',
          ...locationMetadata
        }
      })
    }).promise();

    return { dispatched: 1, failed: 0 };
  } catch (error) {
    console.warn(`⚠️ notifyEventFinishedOwner falló para eventId=${eventId}: ${error.message}`);
    return { dispatched: 0, failed: 1 };
  }
};

exports.notifyEventStartedOwner = async (event = {}) => {
  const userId = resolveEventOwnerUserId(event);
  if (!userId) {
    return { dispatched: 0, failed: 0 };
  }

  const eventId = event.id;
  const eventName = event.nombre || event.name || 'tu evento';
  const eventSlug = event.slug || eventId;
  const eventLink = buildEventDetailLink(eventId);
  const eventImage = event.eventImage || event.imagen || event.image || event.urlImagen;
  const locationMetadata = buildEventLocationMetadata(event);

  try {
    await lambda.invoke({
      FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        templateKey: 'EVENT_STARTED_OWNER',
        userId,
        eventId,
        channels: ['push', 'inApp', 'email'],
        metadata: {
          userId,
          eventId,
          eventName,
          eventDate: event.fechaIni || event.fechaFin,
          eventStartTime: event.horaIni || event.hora_ini || '',
          eventEndTime: event.horaFin || event.hora_fin || '',
          eventSlug,
          eventImage,
          link: eventLink,
          type: 'event_started_owner',
          ...locationMetadata
        }
      })
    }).promise();

    return { dispatched: 1, failed: 0 };
  } catch (error) {
    console.warn(`⚠️ notifyEventStartedOwner falló para eventId=${eventId}: ${error.message}`);
    return { dispatched: 0, failed: 1 };
  }
};

exports.notifyEventStartedUsers = async (event = {}, userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { dispatched: 0, failed: 0 };
  }

  const eventId = event.id;
  const eventName = event.nombre || event.name || 'tu evento';
  const eventSlug = event.slug || eventId;
  const eventLink = buildEventDetailLink(eventId);
  const eventImage = event.eventImage || event.imagen || event.image || event.urlImagen;
  const locationMetadata = buildEventLocationMetadata(event);

  const payloads = userIds.map((userId) =>
    lambda.invoke({
      FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        templateKey: 'EVENT_STARTED_BUYER',
        userId,
        eventId,
        channels: ['push', 'inApp', 'email'],
        metadata: {
          userId,
          eventId,
          eventName,
          eventDate: event.fechaIni || event.fechaFin,
          eventStartTime: event.horaIni || event.hora_ini || '',
          eventEndTime: event.horaFin || event.hora_fin || '',
          eventSlug,
          eventImage,
          link: eventLink,
          type: 'event_started_buyer',
          ...locationMetadata
        }
      })
    }).promise()
  );

  const results = await Promise.allSettled(payloads);
  const dispatched = results.filter((result) => result.status === 'fulfilled').length;
  const failed = results.length - dispatched;

  if (failed > 0) {
    console.warn(`⚠️ notifyEventStartedUsers completó con fallas: ${failed} de ${results.length}`);
  }

  return { dispatched, failed };
};

exports.notifyRateEventToOrderUsers = async (event = {}, userIds = []) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { dispatched: 0, failed: 0 };
  }

  const eventId = event.id;
  const eventName = event.nombre || event.name || 'tu evento';
  const eventSlug = event.slug || eventId;
  const eventLink = buildEventDetailLink(eventId);
  const eventImage = event.eventImage || event.imagen || event.image || event.urlImagen;
  const locationMetadata = buildEventLocationMetadata(event);

  const payloads = userIds.map((userId) => {
    const triggerPayload = {
      templateKey: 'EVENT_RATE_REQUEST',
      userId,
      eventId,
      channels: ['push', 'inApp', 'email'],
      metadata: {
        userId,
        eventId,
        eventName,
        eventSlug,
        eventImage,
        link: eventLink,
        eventDate: event.fechaIni || event.fechaFin,
        eventStartTime: event.horaIni || event.hora_ini || '',
        eventEndTime: event.horaFin || event.hora_fin || '',
        type: 'event_rate_request',
        ...locationMetadata
      }
    };

    return lambda.invoke({
      FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION,
      InvocationType: 'Event',
      Payload: JSON.stringify(triggerPayload)
    }).promise();
  });

  const results = await Promise.allSettled(payloads);
  const dispatched = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.length - dispatched;

  if (failed > 0) {
    console.warn(`⚠️ notifyRateEventToOrderUsers completó con fallas: ${failed} de ${results.length}`);
  }

  return { dispatched, failed };
};

// Enviar email + guardar notificación in-app
exports.sendNotification = async ({ to, subject, message, userId, eventId, type, channels }) => {
  const timestamp = dayjs().toISOString();

  if (channels.includes('Email') && to) {
    await SES.sendEmail({
      Destination: { ToAddresses: [to] },
      Message: {
        Body: { Text: { Data: message } },
        Subject: { Data: subject }
      },
      Source: 'notificaciones.doevents@doeventsapp.com',
      ConfigurationSetName: 'doevents-no-tracking'
    }).promise();
  }

  if (channels.includes('In-App')) {
    await docClient.put({
      TableName: NOTIFICATIONS_TABLE,
      Item: {
        userId,
        timestamp,
        id: uuidv4(),
        eventId,
        type,
        message,
        channels,
        read: false
      }
    }).promise();
  }
};
