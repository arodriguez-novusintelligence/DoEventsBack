/**
 * Consolida usuarios duplicados (mismo email) en Client-dev y reasigna
 * eventos, lugares y servicios huérfanos al usuario canónico que queda.
 *
 * Uso (dry-run por defecto):
 *   node scripts/merge-duplicate-users.js
 *
 * Ejecutar cambios:
 *   DRY_RUN=0 node scripts/merge-duplicate-users.js
 *
 * Variables opcionales:
 *   DYNAMODB_REGION=sa-east-1
 *   CLIENT_TABLE=Client-dev
 *   EVENTS_TABLE=Eventos-dev
 *   VENUES_TABLE=Venues-dev
 *   SERVICES_TABLE=ServiceProviders-dev
 */
const AWS = require('aws-sdk');

const REGION = process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'sa-east-1';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-dev';
const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Eventos-dev';
const VENUES_TABLE = process.env.VENUES_TABLE || 'Venues-dev';
const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-dev';
const USER_PREFERENCES_TABLE = process.env.USER_PREFERENCES_TABLE || 'UserPreferences-dev';
const DRY_RUN = process.env.DRY_RUN !== '0';
const DEV_ONLY = process.env.ALLOW_NON_DEV !== '1';

const dynamodb = new AWS.DynamoDB.DocumentClient({ region: REGION });

if (DEV_ONLY && !CLIENT_TABLE.endsWith('-dev')) {
  console.error(`Abortado: solo se permite Client-dev (actual: ${CLIENT_TABLE}). Usa ALLOW_NON_DEV=1 para override.`);
  process.exit(1);
}

const stats = {
  duplicateGroups: 0,
  usersDeleted: 0,
  eventsReassigned: 0,
  venuesReassigned: 0,
  servicesReassigned: 0,
  orphansReassigned: 0,
  preferencesMigrated: 0,
  oauthIdsSynced: 0,
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function scoreUser(user, resourceCounts) {
  const counts = resourceCounts?.get(user.id) || { events: 0, venues: 0, services: 0 };
  let score = counts.events * 100 + counts.venues * 50 + counts.services * 50;
  const role = String(user.platformRole || user.role || 'user').toLowerCase();
  if (role === 'admin') score += 1000;
  else if (role === 'support' || role === 'operation') score += 500;
  if (user.fotoPerfilUrl) score += 200;
  if (user.name || user.nombre) score += 100;
  if (user.profileCover || user.coverImageUrl) score += 50;
  const platformUserId = String(user.platformUserId || '');
  if (platformUserId) score += 30;
  if (user.password) score += 50;
  if (user.userStatus === 'active') score += 25;
  const ts = user.updatedAt || user.createDate;
  if (ts) {
    const ms = typeof ts === 'number' ? ts : Date.parse(String(ts));
    if (!Number.isNaN(ms)) score += ms / 1e12;
  }
  return score;
}

function pickCanonicalUser(users, resourceCounts) {
  return [...users].sort((a, b) => scoreUser(b, resourceCounts) - scoreUser(a, resourceCounts))[0];
}

async function buildResourceCounts(userIds) {
  const map = new Map(userIds.map((id) => [id, { events: 0, venues: 0, services: 0 }]));
  for (const userId of userIds) {
    const [events, venues, services] = await Promise.all([
      queryByUserId(EVENTS_TABLE, 'userIdIndex', userId, 'id'),
      queryVenuesByOwner(userId),
      queryByUserId(SERVICES_TABLE, 'userIdIndex', userId, 'serviceId'),
    ]);
    map.set(userId, { events: events.length, venues: venues.length, services: services.length });
  }
  return map;
}

async function scanAll(tableName, projection, extra = {}) {
  const items = [];
  let lastKey;
  do {
    const result = await dynamodb.scan({
      TableName: tableName,
      ProjectionExpression: projection,
      ExclusiveStartKey: lastKey,
      ...extra,
    }).promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function queryByUserId(tableName, indexName, userId, projection) {
  const items = [];
  let lastKey;
  do {
    const result = await dynamodb.query({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ProjectionExpression: projection,
      ExclusiveStartKey: lastKey,
    }).promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function queryVenuesByOwner(ownerUserId) {
  const items = [];
  let lastKey;
  do {
    const result = await dynamodb.query({
      TableName: VENUES_TABLE,
      IndexName: 'ownerUserIdIndex',
      KeyConditionExpression: 'ownerUserId = :ownerUserId',
      ExpressionAttributeValues: { ':ownerUserId': ownerUserId },
      ExclusiveStartKey: lastKey,
    }).promise().catch(async () => {
      return dynamodb.scan({
        TableName: VENUES_TABLE,
        FilterExpression: 'ownerUserId = :ownerUserId OR userId = :ownerUserId',
        ExpressionAttributeValues: { ':ownerUserId': ownerUserId },
        ExclusiveStartKey: lastKey,
      }).promise();
    });
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function updateItem(tableName, key, updates) {
  if (DRY_RUN) return;
  const names = {};
  const values = {};
  const parts = [];
  Object.entries(updates).forEach(([field, value], idx) => {
    const nameKey = `#f${idx}`;
    const valueKey = `:v${idx}`;
    names[nameKey] = field;
    values[valueKey] = value;
    parts.push(`${nameKey} = ${valueKey}`);
  });
  parts.push('#updatedAt = :now');
  names['#updatedAt'] = 'updatedAt';
  values[':now'] = new Date().toISOString();

  await dynamodb.update({
    TableName: tableName,
    Key: key,
    UpdateExpression: `SET ${parts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }).promise();
}

async function deleteClient(userId) {
  if (DRY_RUN) return;
  await dynamodb.delete({
    TableName: CLIENT_TABLE,
    Key: { id: userId },
  }).promise();
}

async function deleteUserPreferences(userId) {
  const prefs = await dynamodb.query({
    TableName: USER_PREFERENCES_TABLE,
    KeyConditionExpression: 'UserId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
  }).promise();
  for (const pref of prefs.Items || []) {
    if (DRY_RUN) continue;
    await dynamodb.delete({
      TableName: USER_PREFERENCES_TABLE,
      Key: { UserId: pref.UserId },
    }).promise();
  }
}

async function mergeProfileOntoCanonical(canonical, duplicate) {
  const patch = {};
  const fields = [
    'fotoPerfilUrl', 'name', 'nombre', 'lastName', 'apellido', 'user', 'phone', 'phoneNumber',
    'coverImageUrl', 'profileCover', 'profileGallery', 'bio', 'description', 'plan', 'serviceType',
  ];
  for (const field of fields) {
    if (!canonical[field] && duplicate[field]) patch[field] = duplicate[field];
  }
  if (!Object.keys(patch).length) return;
  console.log(`  copiar perfil faltante → canónico ${canonical.id}`);
  if (!DRY_RUN) {
    const names = {};
    const values = { ':now': new Date().toISOString() };
    const parts = Object.entries(patch).map(([field, value], idx) => {
      names[`#f${idx}`] = field;
      values[`:v${idx}`] = value;
      return `#f${idx} = :v${idx}`;
    });
    names['#updatedAt'] = 'updatedAt';
    parts.push('#updatedAt = :now');
    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: canonical.id },
      UpdateExpression: `SET ${parts.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }).promise();
  }
}

async function syncOAuthLoginId(canonical, duplicate, resourceCounts) {
  if (!duplicate.platformUserId) return;
  const dupResources = resourceCounts.get(duplicate.id) || { events: 0, venues: 0, services: 0 };
  const dupTotal = dupResources.events + dupResources.venues + dupResources.services;
  const shouldTakeLoginId = dupTotal === 0
    || !canonical.platformUserId
    || String(canonical.platformUserId) !== String(duplicate.platformUserId);

  if (!shouldTakeLoginId) return;

  console.log(`  sincronizar platformUserId canónico ${canonical.id} → ${duplicate.platformUserId}`);
  if (!DRY_RUN) {
    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: canonical.id },
      UpdateExpression: 'SET platform = :platform, platformUserId = :platformUserId, updatedAt = :now',
      ExpressionAttributeValues: {
        ':platform': duplicate.platform || canonical.platform || 'GOOGLE',
        ':platformUserId': duplicate.platformUserId,
        ':now': new Date().toISOString(),
      },
    }).promise();
    stats.oauthIdsSynced += 1;
  }
}

async function reassignEvents(fromUserId, toUserId) {
  const events = await queryByUserId(EVENTS_TABLE, 'userIdIndex', fromUserId, 'id,userId,user_id');
  for (const event of events) {
    const eventId = event.id;
    if (!eventId || eventId === toUserId) continue;
    console.log(`  evento ${eventId}: ${fromUserId} → ${toUserId}`);
    await updateItem(EVENTS_TABLE, { id: eventId }, { userId: toUserId, user_id: toUserId });
    stats.eventsReassigned += 1;
  }
}

async function reassignVenues(fromUserId, toUserId) {
  const venues = await queryVenuesByOwner(fromUserId);
  for (const venue of venues) {
    const venueId = venue.venue_id || venue.venueId || venue.id;
    if (!venueId) continue;
    const currentOwner = venue.ownerUserId || venue.userId;
    if (String(currentOwner) !== String(fromUserId)) continue;
    console.log(`  lugar ${venueId}: ${fromUserId} → ${toUserId}`);
    const patch = { ownerUserId: toUserId, updatedBy: toUserId };
    if (venue.userId) patch.userId = toUserId;
    await updateItem(VENUES_TABLE, { venue_id: venueId }, patch);
    stats.venuesReassigned += 1;
  }
}

async function reassignServices(fromUserId, toUserId) {
  const services = await queryByUserId(SERVICES_TABLE, 'userIdIndex', fromUserId, 'serviceId,userId');
  for (const service of services) {
    const serviceId = service.serviceId;
    if (!serviceId) continue;
    console.log(`  servicio ${serviceId}: ${fromUserId} → ${toUserId}`);
    await updateItem(SERVICES_TABLE, { serviceId }, { userId: toUserId });
    stats.servicesReassigned += 1;
  }
}

async function mergeRoleOntoCanonical(canonical, duplicate) {
  const canonicalRole = String(canonical.platformRole || canonical.role || 'user').toLowerCase();
  const duplicateRole = String(duplicate.platformRole || duplicate.role || 'user').toLowerCase();
  const roleRank = { admin: 3, support: 2, operation: 2, user: 1 };
  if ((roleRank[duplicateRole] || 1) <= (roleRank[canonicalRole] || 1)) return;

  console.log(`  promover rol ${duplicateRole} en canónico ${canonical.id}`);
  if (!DRY_RUN) {
    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: canonical.id },
      UpdateExpression: 'SET platformRole = :role, updatedAt = :now',
      ExpressionAttributeValues: {
        ':role': duplicateRole,
        ':now': new Date().toISOString(),
      },
    }).promise();
  }
}

async function migratePreferencesToCanonical(canonicalId, duplicateId) {
  const [canonicalPrefs, duplicatePrefs] = await Promise.all([
    dynamodb.query({
      TableName: USER_PREFERENCES_TABLE,
      KeyConditionExpression: 'UserId = :userId',
      ExpressionAttributeValues: { ':userId': canonicalId },
    }).promise(),
    dynamodb.query({
      TableName: USER_PREFERENCES_TABLE,
      KeyConditionExpression: 'UserId = :userId',
      ExpressionAttributeValues: { ':userId': duplicateId },
    }).promise(),
  ]);

  if (!duplicatePrefs.Items?.length) return;
  if (canonicalPrefs.Items?.length) {
    console.log(`  eliminar preferencias duplicadas de ${duplicateId}`);
    await deleteUserPreferences(duplicateId);
    return;
  }

  console.log(`  migrar preferencias ${duplicateId} → ${canonicalId}`);
  if (!DRY_RUN) {
    const pref = duplicatePrefs.Items[0];
    await dynamodb.put({
      TableName: USER_PREFERENCES_TABLE,
      Item: {
        ...pref,
        UserId: canonicalId,
        updatedAt: new Date().toISOString(),
      },
    }).promise();
    await deleteUserPreferences(duplicateId);
    stats.preferencesMigrated += 1;
  }
}

async function reassignOrphans(validUserIds, idRemap, defaultAdminId) {
  const events = await scanAll(EVENTS_TABLE, 'id,userId,user_id,venueId');
  const venues = await scanAll(VENUES_TABLE, 'venue_id,venueId,ownerUserId,userId');
  const services = await scanAll(SERVICES_TABLE, 'serviceId,userId');

  const venueOwnerByEvent = new Map();
  for (const event of events) {
    if (event.venueId && event.userId && validUserIds.has(event.userId)) {
      venueOwnerByEvent.set(event.venueId, event.userId);
    }
  }

  const resolveTarget = (userId, venueId) => {
    if (!userId) return null;
    if (validUserIds.has(userId)) return null;
    if (idRemap.has(userId)) return idRemap.get(userId);
    if (venueId && venueOwnerByEvent.has(venueId)) return venueOwnerByEvent.get(venueId);
    return defaultAdminId;
  };

  for (const event of events) {
    const uid = event.userId || event.user_id;
    const target = resolveTarget(uid);
    if (!target || !event.id) continue;
    console.log(`  huérfano evento ${event.id}: ${uid} → ${target}`);
    await updateItem(EVENTS_TABLE, { id: event.id }, { userId: target, user_id: target });
    stats.orphansReassigned += 1;
  }

  for (const venue of venues) {
    const venueId = venue.venue_id || venue.venueId;
    const uid = venue.ownerUserId || venue.userId;
    const target = resolveTarget(uid, venueId);
    if (!target || !venueId) continue;
    console.log(`  huérfano lugar ${venueId}: ${uid} → ${target}`);
    const patch = { ownerUserId: target, updatedBy: target };
    if (venue.userId) patch.userId = target;
    await updateItem(VENUES_TABLE, { venue_id: venueId }, patch);
    stats.orphansReassigned += 1;
  }

  for (const service of services) {
    const target = resolveTarget(service.userId);
    if (!target || !service.serviceId) continue;
    console.log(`  huérfano servicio ${service.serviceId}: ${service.userId} → ${target}`);
    await updateItem(SERVICES_TABLE, { serviceId: service.serviceId }, { userId: target });
    stats.orphansReassigned += 1;
  }
}

(async () => {
  console.log(`=== Merge usuarios duplicados (${DRY_RUN ? 'DRY-RUN' : 'EJECUCIÓN'}) ===`);
  console.log(`Región: ${REGION}`);
  console.log(`Tablas: ${CLIENT_TABLE}, ${EVENTS_TABLE}, ${VENUES_TABLE}, ${SERVICES_TABLE}\n`);

  const allUsers = await scanAll(
    CLIENT_TABLE,
    'id,email,platformRole,#role,platform,platformUserId,password,userStatus,updatedAt,createDate,fotoPerfilUrl,#name,nombre,lastName,apellido,#user,phone,phoneNumber,coverImageUrl,profileCover,profileGallery,#plan,serviceType',
    { ExpressionAttributeNames: { '#role': 'role', '#name': 'name', '#user': 'user', '#plan': 'plan' } },
  );

  const resourceCounts = await buildResourceCounts(allUsers.map((u) => u.id));

  const byEmail = new Map();
  for (const user of allUsers) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(user);
  }

  const duplicateGroups = [...byEmail.entries()].filter(([, users]) => users.length > 1);
  const validUserIds = new Set(allUsers.map((u) => u.id));
  const idRemap = new Map();
  const defaultAdmin = pickCanonicalUser(
    allUsers.filter((u) => String(u.platformRole || u.role || '').toLowerCase() === 'admin'),
    resourceCounts,
  ) || allUsers[0];

  for (const [email, users] of duplicateGroups) {
    const canonical = pickCanonicalUser(users, resourceCounts);
    const duplicates = users.filter((u) => u.id !== canonical.id);
    stats.duplicateGroups += 1;

    const canRes = resourceCounts.get(canonical.id) || { events: 0, venues: 0, services: 0 };
    console.log(`\n[${email}]`);
    console.log(`  conservar: ${canonical.id} (rol ${canonical.platformRole || canonical.role || 'user'}, ${canRes.events} ev / ${canRes.venues} lug / ${canRes.services} svc)`);
    for (const dup of duplicates) {
      const dupRes = resourceCounts.get(dup.id) || { events: 0, venues: 0, services: 0 };
      console.log(`  eliminar:  ${dup.id} (${dupRes.events} ev / ${dupRes.venues} lug / ${dupRes.services} svc)`);
      idRemap.set(dup.id, canonical.id);

      await mergeRoleOntoCanonical(canonical, dup);
      await mergeProfileOntoCanonical(canonical, dup);
      await syncOAuthLoginId(canonical, dup, resourceCounts);
      await migratePreferencesToCanonical(canonical.id, dup.id);
      await reassignEvents(dup.id, canonical.id);
      await reassignVenues(dup.id, canonical.id);
      await reassignServices(dup.id, canonical.id);

      await deleteUserPreferences(dup.id);
      await deleteClient(dup.id);
      validUserIds.delete(dup.id);
      stats.usersDeleted += 1;
    }

    if (!DRY_RUN && String(canonical.platformRole || canonical.role || '').toLowerCase() !== 'admin') {
      const anyAdmin = duplicates.some((d) => String(d.platformRole || d.role || '').toLowerCase() === 'admin')
        || String(canonical.platformRole || canonical.role || '').toLowerCase() === 'admin';
      if (anyAdmin) {
        await dynamodb.update({
          TableName: CLIENT_TABLE,
          Key: { id: canonical.id },
          UpdateExpression: 'SET platformRole = :admin, #plan = :pro, updatedAt = :now',
          ExpressionAttributeNames: { '#plan': 'plan' },
          ExpressionAttributeValues: {
            ':admin': 'admin',
            ':pro': 'pro',
            ':now': new Date().toISOString(),
          },
        }).promise();
      }
    }
  }

  // Limpiar preferencias de usuarios que ya no existen
  const allPrefs = await scanAll(USER_PREFERENCES_TABLE, 'UserId');
  for (const pref of allPrefs) {
    if (pref.UserId && !validUserIds.has(pref.UserId)) {
      const target = idRemap.get(pref.UserId);
      if (target) {
        await migratePreferencesToCanonical(target, pref.UserId);
      } else {
        console.log(`  eliminar preferencias huérfanas ${pref.UserId}`);
        await deleteUserPreferences(pref.UserId);
      }
    }
  }

  console.log('\n--- Huérfanos (userId inexistente en Client) ---');
  await reassignOrphans(validUserIds, idRemap, defaultAdmin?.id || null);

  console.log('\n=== Resumen ===');
  console.log(JSON.stringify(stats, null, 2));
  if (DRY_RUN) {
    console.log('\nSin cambios en DynamoDB. Ejecuta con DRY_RUN=0 para aplicar.');
  } else {
    console.log('\nListo.');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
