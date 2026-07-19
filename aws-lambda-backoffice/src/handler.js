const AWS = require('aws-sdk');
const { assertAdmin } = require('./lib/adminAuth');
const { writeAuditLog, fetchRecentActivity, fetchUserActivity } = require('./lib/audit');
const { listPlatformRoles, isValidPlatformRole, normalizePlatformRole } = require('./lib/platformRoles');
const {
  getEventDetail,
  getVenueDetail,
  getServiceDetail,
  adminDeleteEvent,
  adminDeleteVenue,
  adminDeleteService,
  listUserEvents,
  listUserVenues,
  listUserServices,
} = require('./lib/contentAdmin');
const { triggerNotification } = require('./lib/notifications');
const { syncPlatformRoleByEmail } = require('./lib/syncPlatformRoleByEmail');
const {
  buildDashboardMetrics,
  buildExtendedDashboard,
  buildSupportProfile,
  mapClient,
  countUserEvents,
  countUserOrders,
  scanClientsProjection,
  getEventsSection,
  getOrdersSection,
  getPaymentsSection,
  getNewUsersSection,
  listAppUsers,
  getAppUsersSummary,
} = require('./lib/metrics');
const { ok, errorResponse } = require('./lib/response');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-2',
});
const cognito = new AWS.CognitoIdentityServiceProvider({
  region: process.env.COGNITO_REGION || 'us-east-2',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const BACKOFFICE_TABLE = process.env.BACKOFFICE_TABLE || 'doevents-backoffice-qa-users';
const WEB_APP_BASE_URL = process.env.WEB_APP_BASE_URL || 'https://qa.doeventsapp.com';

async function getClientDisplayName(userId) {
  const result = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
  const item = result.Item;
  if (!item) return 'Un administrador';
  return [item.name || item.nombre, item.lastName || item.apellido]
    .filter(Boolean)
    .join(' ')
    .trim() || item.email || userId;
}

async function notifyPlatformAdminGranted(targetUserId, adminId, roleLabel = 'Administrador') {
  const grantedByName = await getClientDisplayName(adminId);
  await triggerNotification({
    templateKey: 'PLATFORM_ADMIN_GRANTED',
    userId: targetUserId,
    channels: ['push', 'inApp', 'email'],
    metadata: {
      userId: targetUserId,
      grantedByUserId: adminId,
      grantedByName,
      roleLabel,
      adminPanelUrl: `${WEB_APP_BASE_URL}/admin`,
    },
  });
}

async function upsertEmailBlacklist(email, userId, reason = 'admin_action') {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  await dynamodb.put({
    TableName: BACKOFFICE_TABLE,
    Item: {
      PK: `BLACKLIST#${normalized}`,
      SK: 'META',
      email: normalized,
      userId,
      reason,
      blacklistedAt: new Date().toISOString(),
    },
  }).promise().catch(() => undefined);
}

async function removeEmailBlacklist(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  await dynamodb.delete({
    TableName: BACKOFFICE_TABLE,
    Key: { PK: `BLACKLIST#${normalized}`, SK: 'META' },
  }).promise().catch(() => undefined);
}

exports.getDashboard = async (event) => {
  try {
    await assertAdmin(event);
    const [metrics, recentActivity] = await Promise.all([
      buildExtendedDashboard(),
      fetchRecentActivity(20),
    ]);
    return ok({ ...metrics, recentActivity });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getActivity = async (event) => {
  try {
    await assertAdmin(event);
    const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 100);
    const activity = await fetchRecentActivity(limit);
    return ok({ activity });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getAIMetrics = async (event) => {
  try {
    await assertAdmin(event);
    const { buildAIMetrics } = require('./lib/aiMetrics');
    const metrics = await buildAIMetrics();
    return ok(metrics);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getReports = async (event) => {
  try {
    await assertAdmin(event);
    const { listReportsAdmin } = require('./lib/reportsAdmin');
    const data = await listReportsAdmin();
    return ok(data);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.patchReport = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const reportId = event.pathParameters?.reportId;
    const body = JSON.parse(event.body || '{}');
    const { patchReportAdmin } = require('./lib/reportsAdmin');
    const { writeAuditLog } = require('./lib/audit');
    const { triggerNotification } = require('./lib/notifications');

    const report = await patchReportAdmin(reportId, body, adminId);

    if (body.notifyMessage && report.target_user_id) {
      const channels = body.notifyChannel === 'email' ? ['email', 'inApp'] : ['inApp', 'push'];
      await triggerNotification({
        templateKey: 'ADMIN_MODERATION_NOTICE',
        userId: report.target_user_id,
        channels,
        metadata: {
          userId: report.target_user_id,
          subject: body.notifySubject || 'Aviso de moderación',
          message: body.notifyMessage,
        },
      });
    }

    await writeAuditLog({
      adminId,
      targetUserId: report.target_user_id || null,
      action: 'report_moderated',
      description: `Admin moderó denuncia ${reportId}`,
      patch: { reportId, status: body.status, action: body.actionTaken || body.action_taken },
    });

    return ok({ report });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getDisbursements = async (event) => {
  try {
    await assertAdmin(event);
    const { listDisbursements } = require('./lib/disbursementsAdmin');
    const disbursements = await listDisbursements();
    return ok({ disbursements });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.createDisbursement = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const body = JSON.parse(event.body || '{}');
    const { createDisbursement } = require('./lib/disbursementsAdmin');
    const { writeAuditLog } = require('./lib/audit');
    const disbursement = await createDisbursement(body, adminId);

    await writeAuditLog({
      adminId,
      targetUserId: null,
      action: 'disbursement_uploaded',
      description: `Admin cargó dispersión ${disbursement.fileName}`,
      patch: { disbursementId: disbursement.id, totalRecords: disbursement.totalRecords },
    });

    return ok({ disbursement });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getEvents = async (event) => {
  try {
    await assertAdmin(event);
    const data = await getEventsSection();
    return ok(data);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getOrders = async (event) => {
  try {
    await assertAdmin(event);
    const data = await getOrdersSection();
    return ok(data);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getVenues = async (event) => {
  try {
    await assertAdmin(event);
    const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 100);
    const { listVenues } = require('./lib/metrics');
    const venues = await listVenues(limit);
    return ok({ total: venues.length, venues });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getServices = async (event) => {
  try {
    await assertAdmin(event);
    const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 100);
    const { listServices } = require('./lib/metrics');
    const services = await listServices(limit);
    return ok({ total: services.length, services });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getPayments = async (event) => {
  try {
    await assertAdmin(event);
    const data = await getPaymentsSection();
    return ok(data);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getNewUsers = async (event) => {
  try {
    await assertAdmin(event);
    const period = event.queryStringParameters?.period || 'today';
    const data = await getNewUsersSection(period);
    return ok(data);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getStaffUsers = async (event) => {
  try {
    await assertAdmin(event);
    const q = (event.queryStringParameters?.q || '').trim();
    const limit = Math.min(Number(event.queryStringParameters?.limit || 100), 200);
    const [summary, users] = await Promise.all([
      getAppUsersSummary(),
      listAppUsers({ query: q, limit }),
    ]);
    return ok({ summary, users });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.searchUsers = async (event) => {
  try {
    await assertAdmin(event);
    const q = (event.queryStringParameters?.q || '').trim();
    const limit = Math.min(Number(event.queryStringParameters?.limit || 50), 100);

    let users = await listAppUsers({ query: q, limit: Math.max(limit, 100) });
    const roleFilter = (event.queryStringParameters?.role || '').trim().toLowerCase();
    if (roleFilter === 'admin') {
      users = users.filter((u) => String(u.platformRole || '').toLowerCase() === 'admin');
    } else if (roleFilter === 'blocked') {
      users = users.filter((u) => ['blocked', 'suspended'].includes(String(u.status || '').toLowerCase()));
    }

    return ok({ users: users.slice(0, limit) });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getUser = async (event) => {
  try {
    await assertAdmin(event);
    const userId = event.pathParameters?.userId;
    const result = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
    if (!result.Item) {
      const err = new Error('NOT_FOUND');
      err.message = 'NOT_FOUND';
      throw err;
    }

    const [eventsCount, ordersCount, profile] = await Promise.all([
      countUserEvents(userId),
      countUserOrders(userId),
      buildSupportProfile(result.Item),
    ]);

    return ok({
      ...mapClient(result.Item),
      eventsCount,
      ordersCount,
      profile,
    });
  } catch (error) {
    if (error.message === 'Usuario no encontrado') error.message = 'NOT_FOUND';
    return errorResponse(error);
  }
};

exports.patchUser = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const userId = event.pathParameters?.userId;
    const body = JSON.parse(event.body || '{}');

    const before = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
    if (!before.Item) {
      const err = new Error('NOT_FOUND');
      throw err;
    }

    const beforeRole = String(before.Item.platformRole || before.Item.role || 'user').toLowerCase();
    let grantedRole = null;
    const patch = {};

    if (body.plan) {
      patch.plan = body.plan;
    }

    if (body.platformRole) {
      const role = normalizePlatformRole(body.platformRole);
      if (!isValidPlatformRole(role)) {
        const err = new Error('BAD_REQUEST');
        err.message = 'Rol de plataforma inválido';
        throw err;
      }
      patch.platformRole = role;
      grantedRole = role;
    }

    if (body.staffStatus) {
      const staffStatus = String(body.staffStatus).toLowerCase();
      if (staffStatus === 'aprobado' && body.staffRole) {
        const role = String(body.staffRole).toLowerCase();
        if (!patch.platformRole) {
          patch.platformRole = role;
          grantedRole = role;
        }
        patch.accountStatus = 'active';
      } else if (staffStatus === 'rechazado' || staffStatus === 'cerrado') {
        patch.accountStatus = staffStatus === 'rechazado' ? 'suspended' : 'blocked';
      } else if (staffStatus === 'pendiente') {
        patch.platformRole = 'user';
        patch.accountStatus = 'active';
      }
    }

    if (body.status) {
      patch.accountStatus = body.status;
    }

    if (typeof body.blacklisted === 'boolean') {
      patch.blacklisted = body.blacklisted;
      if (body.blacklisted) {
        patch.blacklistedAt = new Date().toISOString();
        if (!body.status) {
          patch.accountStatus = 'blocked';
        }
        if (before.Item?.email) {
          patch.blacklistedEmail = String(before.Item.email).trim().toLowerCase();
          await upsertEmailBlacklist(before.Item.email, userId);
        }
      } else {
        await removeEmailBlacklist(before.Item?.email);
      }
    }

    if (Object.keys(patch).length) {
      patch.updatedAt = new Date().toISOString();
      const updates = [];
      const names = {};
      const values = {};
      const reserved = { plan: '#plan' };

      Object.entries(patch).forEach(([key, value]) => {
        const placeholder = `:${key}`;
        if (reserved[key]) {
          names[reserved[key]] = key;
          updates.push(`${reserved[key]} = ${placeholder}`);
        } else {
          updates.push(`${key} = ${placeholder}`);
        }
        values[placeholder] = value;
      });

      await dynamodb.update({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: values,
      }).promise();

      if (patch.platformRole && before.Item?.email) {
        await syncPlatformRoleByEmail(
          before.Item.email,
          patch.platformRole,
          userId,
        );
      }
    }

    if (body.password && USER_POOL_ID) {
      await cognito.adminSetUserPassword({
        UserPoolId: USER_POOL_ID,
        Username: userId,
        Password: body.password,
        Permanent: true,
      }).promise().catch(async () => {
        if (before.Item?.email) {
          await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: before.Item.email,
            Password: body.password,
            Permanent: true,
          }).promise();
        }
      });
    }

    const actions = [];
    if (body.status === 'blocked' || body.status === 'suspended') {
      actions.push('user_blocked');
      await triggerNotification({
        templateKey: 'ADMIN_BAN_CONFIRMATION',
        metadata: { userId: adminId, bannedUserId: userId },
      });
      if (USER_POOL_ID) {
        await cognito.adminDisableUser({
          UserPoolId: USER_POOL_ID,
          Username: userId,
        }).promise().catch(async () => {
          if (before.Item?.email) {
            await cognito.adminDisableUser({
              UserPoolId: USER_POOL_ID,
              Username: before.Item.email,
            }).promise().catch(() => undefined);
          }
        });
      }
    }
    if (body.status === 'active') {
      actions.push('user_unblocked');
      if (USER_POOL_ID) {
        await cognito.adminEnableUser({
          UserPoolId: USER_POOL_ID,
          Username: userId,
        }).promise().catch(async () => {
          if (before.Item?.email) {
            await cognito.adminEnableUser({
              UserPoolId: USER_POOL_ID,
              Username: before.Item.email,
            }).promise().catch(() => undefined);
          }
        });
      }
    }
    if (body.blacklisted === true) actions.push('user_blacklisted');
    if (body.blacklisted === false) actions.push('user_unblacklisted');
    if (body.plan === 'pro') actions.push('plan_upgraded');
    if (body.plan === 'free') actions.push('plan_downgraded');
    if (body.platformRole === 'admin') actions.push('role_admin');
    if (grantedRole === 'admin' && beforeRole !== 'admin') {
      await notifyPlatformAdminGranted(userId, adminId, 'Administrador');
    } else if (grantedRole === 'support' && beforeRole !== 'support') {
      await notifyPlatformAdminGranted(userId, adminId, 'Soporte');
    } else if (grantedRole === 'operation' && beforeRole !== 'operation') {
      await notifyPlatformAdminGranted(userId, adminId, 'Operaciones');
    }

    await writeAuditLog({
      adminId,
      targetUserId: userId,
      action: actions[0] || 'admin_user_update',
      description: `Admin actualizó usuario ${before.Item.email || userId}`,
      patch: body,
    });

    const refreshed = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
    const [eventsCount, ordersCount] = await Promise.all([
      countUserEvents(userId),
      countUserOrders(userId),
    ]);

    return ok({
      ...mapClient(refreshed.Item),
      eventsCount,
      ordersCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getRoles = async (event) => {
  try {
    await assertAdmin(event);
    return ok({ roles: listPlatformRoles() });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getEvent = async (event) => {
  try {
    await assertAdmin(event);
    const eventId = event.pathParameters?.eventId;
    const detail = await getEventDetail(eventId);
    if (!detail) {
      const err = new Error('NOT_FOUND');
      throw err;
    }
    return ok({ event: detail });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.deleteEvent = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const eventId = event.pathParameters?.eventId;
    const result = await adminDeleteEvent(eventId, adminId);
    await writeAuditLog({
      adminId,
      targetUserId: null,
      action: 'event_deleted',
      description: `Admin eliminó evento ${eventId}`,
      patch: { eventId },
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getVenue = async (event) => {
  try {
    await assertAdmin(event);
    const venueId = event.pathParameters?.venueId;
    const detail = await getVenueDetail(venueId);
    if (!detail) {
      const err = new Error('NOT_FOUND');
      throw err;
    }
    return ok({ venue: detail });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.deleteVenue = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const venueId = event.pathParameters?.venueId;
    const detail = await getVenueDetail(venueId);
    const result = await adminDeleteVenue(venueId, adminId);
    await writeAuditLog({
      adminId,
      targetUserId: detail?.ownerUserId || null,
      action: 'venue_deleted',
      description: `Admin eliminó lugar ${venueId}`,
      patch: { venueId },
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getService = async (event) => {
  try {
    await assertAdmin(event);
    const serviceId = event.pathParameters?.serviceId;
    const detail = await getServiceDetail(serviceId);
    if (!detail) {
      const err = new Error('NOT_FOUND');
      throw err;
    }
    return ok({ service: detail });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.deleteService = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const serviceId = event.pathParameters?.serviceId;
    const detail = await getServiceDetail(serviceId);
    const result = await adminDeleteService(serviceId, adminId);
    await writeAuditLog({
      adminId,
      targetUserId: detail?.userId || null,
      action: 'service_deleted',
      description: `Admin eliminó servicio ${serviceId}`,
      patch: { serviceId },
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
};

exports.getUserActivity = async (event) => {
  try {
    await assertAdmin(event);
    const userId = event.pathParameters?.userId;
    const limit = Math.min(Number(event.queryStringParameters?.limit || 30), 100);
    const [auditLog, events, venues, services] = await Promise.all([
      fetchUserActivity(userId, limit),
      listUserEvents(userId, 15),
      listUserVenues(userId, 15),
      listUserServices(userId, 15),
    ]);
    return ok({ auditLog, content: { events, venues, services } });
  } catch (error) {
    return errorResponse(error);
  }
};

exports.deleteUser = async (event) => {
  try {
    const adminId = await assertAdmin(event);
    const userId = event.pathParameters?.userId;
    const body = JSON.parse(event.body || '{}');
    const blacklist = body.blacklist !== false;

    const before = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
    if (!before.Item) {
      const err = new Error('NOT_FOUND');
      throw err;
    }
    if (String(before.Item.platformRole || '').toLowerCase() === 'admin') {
      const err = new Error('FORBIDDEN');
      err.message = 'No se puede eliminar un administrador';
      throw err;
    }

    const now = new Date().toISOString();
    const email = String(before.Item.email || '').trim().toLowerCase();

    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: userId },
      UpdateExpression: `SET accountStatus = :deleted, deletedAt = :now, updatedAt = :now,
        blacklisted = :blacklisted, blacklistedAt = :now, blacklistedEmail = :email, deletedByAdmin = :admin`,
      ExpressionAttributeValues: {
        ':deleted': 'deleted',
        ':now': now,
        ':blacklisted': blacklist,
        ':email': email || null,
        ':admin': adminId,
      },
    }).promise();

    if (USER_POOL_ID) {
      await cognito.adminDisableUser({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      }).promise().catch(async () => {
        if (before.Item?.email) {
          await cognito.adminDisableUser({
            UserPoolId: USER_POOL_ID,
            Username: before.Item.email,
          }).promise().catch(() => undefined);
        }
      });
    }

    if (blacklist && email) {
      await upsertEmailBlacklist(email, userId, 'user_deleted');
    }

    await writeAuditLog({
      adminId,
      targetUserId: userId,
      action: blacklist ? 'user_deleted_blacklisted' : 'user_deleted',
      description: `Admin eliminó usuario ${email || userId}`,
      patch: { blacklist },
    });

    return ok({ success: true, userId, blacklisted: blacklist, deletedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
};
