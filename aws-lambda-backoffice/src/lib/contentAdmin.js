const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-2',
});

const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Eventos-qa';
const VENUES_TABLE = process.env.VENUES_TABLE || 'Venues-qa';
const VENUE_PROMO_CODES_TABLE = process.env.VENUE_PROMO_CODES_TABLE || 'VenuePromoCodes-dev';
const SERVICE_PROMO_CODES_TABLE = process.env.SERVICE_PROMO_CODES_TABLE || 'ServicePromoCodes-dev';
const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';
const SERVICE_RATINGS_TABLE = process.env.SERVICE_RATINGS_TABLE || 'ServiceCalification-qa';
const FAV_TABLE = process.env.FAV_TABLE || 'userFavoriteEvents-qa';

function isDeletedEvent(item) {
  const status = String(item?.estatus || item?.status || '').toUpperCase();
  return status === 'DELETED' || Boolean(item?.deletedAt);
}

function mapEventDetail(item) {
  if (!item) return null;
  return {
    id: item.id,
    nombre: item.nombre || item.name || 'Sin nombre',
    descripcion: item.descripcion || item.description || '',
    estatus: item.estatus || item.status || 'desconocido',
    fechaIni: item.fechaIni,
    fechaFin: item.fechaFin,
    ciudad: item.ciudad || item.city,
    departamento: item.departamento,
    userId: item.userId,
    createDate: item.createDate || item.createdAt,
    aforo: item.aforo,
    imagen: item.imagen || item.imageUrl,
    deletedAt: item.deletedAt || null,
  };
}

function mapVenueDetail(item) {
  if (!item) return null;
  return {
    venueId: item.venue_id || item.venueId || item.id,
    name: item.name || item.nombre || 'Sin nombre',
    description: item.description || item.descripcion || '',
    city: item.city || item.ciudad,
    address: item.address || item.direccion,
    ownerUserId: item.ownerUserId || item.userId,
    capacity: item.capacity,
    type: item.type || item.tags,
    mainImage: item.mainImage || item.imageUrl,
    status: item.status || item.accountStatus || 'active',
    createdAt: item.createdAt || item.createDate,
    deletedAt: item.deletedAt || null,
  };
}

function mapServiceDetail(item) {
  if (!item) return null;
  return {
    serviceId: item.serviceId || item.id,
    name: item.name || 'Sin nombre',
    description: item.description || '',
    category: item.category || item.role,
    userId: item.userId,
    city: item.city,
    status: item.status || 'active',
    rating: Number(item.rating || 0),
    minPrice: item.minPrice,
    profileImageUrl: item.profileImageUrl,
    createdAt: item.createdAt,
    deletedAt: item.deletedAt || null,
  };
}

async function getEventDetail(eventId) {
  const result = await dynamodb.get({ TableName: EVENTS_TABLE, Key: { id: eventId } }).promise();
  return mapEventDetail(result.Item);
}

async function getVenuePromoCodesSummary(venueId) {
  const result = await dynamodb
    .query({
      TableName: VENUE_PROMO_CODES_TABLE,
      KeyConditionExpression: 'venueId = :venueId',
      ExpressionAttributeValues: { ':venueId': venueId },
    })
    .promise()
    .catch(() => ({ Items: [] }));

  const items = result.Items || [];
  const batches = [];
  const codes = [];
  const redemptions = [];
  const shares = [];

  items.forEach((item) => {
    const sk = String(item.sk || '');
    if (sk.startsWith('BATCH#')) {
      batches.push({
        id: item.batchId,
        currency: item.currency,
        value: Number(item.value || 0),
        quantity: Number(item.quantity || 0),
        description: item.description || '',
        createdAt: item.createdAt,
      });
    } else if (sk.startsWith('CODE#')) {
      codes.push({
        code: item.code,
        status: item.status || 'AVAILABLE',
        value: Number(item.value || 0),
        currency: item.currency || 'COP',
        batchId: item.batchId,
      });
      if (String(item.status || '').toUpperCase() === 'REDEEMED') {
        redemptions.push({
          code: item.code,
          orderId: item.orderId || '',
          redeemedAt: item.redeemedAt || item.updatedAt || '',
          userId: item.redeemedByUserId || '',
          discount: Number(item.discount || item.value || 0),
        });
      }
    } else if (sk.startsWith('SHARE#')) {
      shares.push({
        promo_code: item.promo_code,
        recipient_name: item.recipient_name,
        created_at: item.created_at,
      });
    }
  });

  return {
    batches,
    totalCodes: codes.length,
    availableCodes: codes.filter((c) => String(c.status).toUpperCase() === 'AVAILABLE').length,
    redeemedCodes: redemptions.length,
    sharedCodes: codes.filter((c) => String(c.status).toUpperCase() === 'SHARED').length,
    cancelledCodes: codes.filter((c) => String(c.status).toUpperCase() === 'CANCELLED').length,
    redemptions,
    shares,
  };
}

async function getVenueDetail(venueId) {
  const result = await dynamodb.get({ TableName: VENUES_TABLE, Key: { venue_id: venueId } }).promise();
  const detail = mapVenueDetail(result.Item);
  if (!detail) return null;
  const promoCodes = await getVenuePromoCodesSummary(venueId);
  return { ...detail, promoCodes };
}

async function getServicePromoCodesSummary(serviceId) {
  const result = await dynamodb
    .query({
      TableName: SERVICE_PROMO_CODES_TABLE,
      KeyConditionExpression: 'serviceId = :serviceId',
      ExpressionAttributeValues: { ':serviceId': serviceId },
    })
    .promise()
    .catch(() => ({ Items: [] }));

  const items = result.Items || [];
  const batches = [];
  const codes = [];
  const redemptions = [];
  const shares = [];

  items.forEach((item) => {
    const sk = String(item.sk || '');
    if (sk.startsWith('BATCH#')) {
      batches.push({
        id: item.batchId,
        currency: item.currency,
        value: Number(item.value || 0),
        quantity: Number(item.quantity || 0),
        description: item.description || '',
        createdAt: item.createdAt,
      });
    } else if (sk.startsWith('CODE#')) {
      codes.push({
        code: item.code,
        status: item.status || 'AVAILABLE',
        value: Number(item.value || 0),
        currency: item.currency || 'COP',
        batchId: item.batchId,
      });
      if (String(item.status || '').toUpperCase() === 'REDEEMED') {
        redemptions.push({
          code: item.code,
          orderId: item.orderId || '',
          redeemedAt: item.redeemedAt || item.updatedAt || '',
          userId: item.redeemedByUserId || '',
          discount: Number(item.discount || item.value || 0),
        });
      }
    } else if (sk.startsWith('SHARE#')) {
      shares.push({
        promo_code: item.promo_code,
        recipient_name: item.recipient_name,
        created_at: item.created_at,
      });
    }
  });

  return {
    batches,
    totalCodes: codes.length,
    availableCodes: codes.filter((c) => String(c.status).toUpperCase() === 'AVAILABLE').length,
    redeemedCodes: redemptions.length,
    sharedCodes: codes.filter((c) => String(c.status).toUpperCase() === 'SHARED').length,
    cancelledCodes: codes.filter((c) => String(c.status).toUpperCase() === 'CANCELLED').length,
    redemptions,
    shares,
  };
}

async function getServiceDetail(serviceId) {
  const result = await dynamodb.get({ TableName: SERVICES_TABLE, Key: { serviceId } }).promise();
  const detail = mapServiceDetail(result.Item);
  if (!detail) return null;
  const promoCodes = await getServicePromoCodesSummary(serviceId);
  return { ...detail, promoCodes };
}

async function adminDeleteEvent(eventId, adminId) {
  const now = new Date().toISOString();
  await dynamodb.update({
    TableName: EVENTS_TABLE,
    Key: { id: eventId },
    UpdateExpression: 'SET estatus = :deleted, deletedAt = :now, updatedAt = :now, deletedByAdmin = :admin',
    ConditionExpression: 'attribute_exists(id)',
    ExpressionAttributeValues: {
      ':deleted': 'DELETED',
      ':now': now,
      ':admin': adminId,
    },
  }).promise();

  let lastKey;
  do {
    const favs = await dynamodb.query({
      TableName: FAV_TABLE,
      IndexName: 'eventIdIndex',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':eventId': eventId },
      ExclusiveStartKey: lastKey,
    }).promise().catch(() => ({ Items: [] }));
    await Promise.all((favs.Items || []).map((item) =>
      dynamodb.delete({
        TableName: FAV_TABLE,
        Key: { userId: item.userId, eventId: item.eventId },
      }).promise().catch(() => undefined)));
    lastKey = favs.LastEvaluatedKey;
  } while (lastKey);

  return { success: true, eventId, deletedAt: now };
}

async function adminDeleteVenue(venueId, adminId) {
  const now = new Date().toISOString();
  await dynamodb.update({
    TableName: VENUES_TABLE,
    Key: { venue_id: venueId },
    UpdateExpression: 'SET #status = :deleted, deletedAt = :now, updatedAt = :now, deletedByAdmin = :admin',
    ConditionExpression: 'attribute_exists(venue_id)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':deleted': 'deleted',
      ':now': now,
      ':admin': adminId,
    },
  }).promise();
  return { success: true, venueId, deletedAt: now };
}

async function deleteServiceRatings(serviceId) {
  let lastKey;
  do {
    const result = await dynamodb.query({
      TableName: SERVICE_RATINGS_TABLE,
      KeyConditionExpression: 'serviceId = :serviceId',
      ExpressionAttributeValues: { ':serviceId': serviceId },
      ExclusiveStartKey: lastKey,
    }).promise().catch(() => ({ Items: [] }));
    await Promise.all((result.Items || []).map((item) =>
      dynamodb.delete({
        TableName: SERVICE_RATINGS_TABLE,
        Key: { serviceId: item.serviceId, calificationId: item.calificationId },
      }).promise().catch(() => undefined)));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function adminDeleteService(serviceId, adminId) {
  const existing = await dynamodb.get({
    TableName: SERVICES_TABLE,
    Key: { serviceId },
  }).promise();
  if (!existing.Item) {
    const err = new Error('NOT_FOUND');
    throw err;
  }
  await deleteServiceRatings(serviceId);
  await dynamodb.delete({
    TableName: SERVICES_TABLE,
    Key: { serviceId },
  }).promise();
  return { success: true, serviceId, deletedBy: adminId };
}

async function listUserEvents(userId, limit = 20) {
  const result = await dynamodb.query({
    TableName: EVENTS_TABLE,
    IndexName: 'userIdIndex',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Limit: limit,
  }).promise().catch(() => ({ Items: [] }));
  return (result.Items || [])
    .filter((item) => !isDeletedEvent(item))
    .map(mapEventDetail);
}

async function listUserVenues(userId, limit = 20) {
  const items = await dynamodb.scan({
    TableName: VENUES_TABLE,
    FilterExpression: 'ownerUserId = :uid AND (attribute_not_exists(#status) OR #status <> :deleted)',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':uid': userId, ':deleted': 'deleted' },
    Limit: 200,
  }).promise().catch(() => ({ Items: [] }));
  return (items.Items || []).map(mapVenueDetail).slice(0, limit);
}

async function listUserServices(userId, limit = 20) {
  const result = await dynamodb.query({
    TableName: SERVICES_TABLE,
    IndexName: 'userIdIndex',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    Limit: limit,
  }).promise().catch(() => ({ Items: [] }));
  return (result.Items || [])
    .filter((item) => item.status !== 'deleted')
    .map(mapServiceDetail);
}

module.exports = {
  getEventDetail,
  getVenueDetail,
  getServiceDetail,
  adminDeleteEvent,
  adminDeleteVenue,
  adminDeleteService,
  listUserEvents,
  listUserVenues,
  listUserServices,
  mapEventDetail,
  mapVenueDetail,
  mapServiceDetail,
};
