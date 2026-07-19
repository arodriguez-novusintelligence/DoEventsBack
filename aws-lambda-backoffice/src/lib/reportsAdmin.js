const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'sa-east-1',
});

const REPORTS_TABLE = process.env.REPORTS_TABLE || 'Reports-dev';
const BACKOFFICE_TABLE = process.env.BACKOFFICE_TABLE || 'doevents-backoffice-dev-users';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-dev';
const PUBLICATIONS_TABLE = process.env.FEED_PUBLICATIONS_TABLE || 'FeedPublications-dev';
const COMMENTS_TABLE = process.env.FEED_COMMENTS_TABLE || 'FeedComments-dev';

function clientDisplayName(item) {
  if (!item) return 'Usuario';
  const full = [item.name || item.nombre, item.lastName || item.apellido].filter(Boolean).join(' ').trim();
  return full || item.username || item.email || item.id || 'Usuario';
}

function clientUsername(item) {
  if (!item?.username) return '';
  return item.username.startsWith('@') ? item.username : `@${item.username}`;
}

async function getClient(userId) {
  if (!userId) return null;
  const result = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
  return result.Item || null;
}

async function getPublication(publicationId) {
  if (!publicationId) return null;
  const result = await dynamodb.get({ TableName: PUBLICATIONS_TABLE, Key: { id: publicationId } }).promise();
  return result.Item || null;
}

async function getComment(commentId) {
  if (!commentId) return null;
  const result = await dynamodb.get({ TableName: COMMENTS_TABLE, Key: { id: commentId } }).promise();
  return result.Item || null;
}

async function getModeration(reportId) {
  const result = await dynamodb.get({
    TableName: BACKOFFICE_TABLE,
    Key: { PK: `REPORT#${reportId}`, SK: 'META' },
  }).promise();
  return result.Item || {};
}

async function scanAllReports() {
  const items = [];
  let lastKey;
  do {
    const result = await dynamodb.scan({
      TableName: REPORTS_TABLE,
      ExclusiveStartKey: lastKey,
    }).promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

function mapAccountStatus(client, moderation) {
  const status = String(moderation.accountStatus || client?.accountStatus || 'active').toLowerCase();
  if (status === 'blocked') return 'blocked';
  if (status === 'suspended') return 'suspended';
  if (status === 'warned') return 'warned';
  return 'active';
}

async function enrichReport(raw) {
  const reportId = raw.report_id;
  const moderation = await getModeration(reportId);
  const reporter = await getClient(raw.client_id);

  const publicationId = raw.publication_id || (raw.source === 'feed-publication' ? raw.post_id : null);
  let publication = publicationId ? await getPublication(publicationId) : null;
  let comment = null;

  if (!publication && raw.comment_id) {
    comment = await getComment(raw.comment_id);
    if (comment?.publicationId) {
      publication = await getPublication(comment.publicationId);
    }
  }

  const targetUserId = publication?.userId || comment?.userId || raw.target_user_id || null;
  const targetUser = targetUserId ? await getClient(targetUserId) : null;

  const targetType = raw.target_type === 'profile' || raw.source === 'profile'
    ? 'profile'
    : 'post';

  const targetName = targetType === 'profile'
    ? clientDisplayName(targetUser)
    : (publication?.text?.slice(0, 80) || publication?.caption?.slice(0, 80) || comment?.text?.slice(0, 80) || `Publicación ${publicationId || raw.post_id || '—'}`);

  const reasons = [];
  if (raw.reason) reasons.push(String(raw.reason));
  if (raw.details) reasons.push(String(raw.details));

  const notifications = Array.isArray(moderation.notifications) ? moderation.notifications : [];

  return {
    id: reportId,
    target_type: targetType,
    target_id: targetUserId || publicationId || raw.post_id || raw.comment_id || reportId,
    target_name: targetName,
    target_username: clientUsername(targetUser) || (targetUserId ? `@${targetUserId.slice(0, 8)}` : '@desconocido'),
    target_user_id: targetUserId,
    reporter_name: clientDisplayName(reporter),
    reporter_id: raw.client_id,
    reasons,
    other_reason: raw.details && raw.reason ? String(raw.details) : undefined,
    status: moderation.status || 'pending',
    created_at: raw.timestamp || moderation.createdAt || new Date().toISOString(),
    action_taken: moderation.actionTaken || 'none',
    admin_notes: moderation.adminNotes || '',
    account_status: mapAccountStatus(targetUser, moderation),
    suspended_until: moderation.suspendedUntil || null,
    notifications,
    source: raw.source || 'feed',
  };
}

function computeSuspendedUntil(action) {
  const now = new Date();
  if (action === 'suspend_24h') now.setHours(now.getHours() + 24);
  else if (action === 'suspend_7d') now.setDate(now.getDate() + 7);
  else if (action === 'suspend_30d') now.setDate(now.getDate() + 30);
  else return null;
  return now.toISOString();
}

function deriveAccountStatus(action, current) {
  switch (action) {
    case 'warning': return 'warned';
    case 'suspend_24h':
    case 'suspend_7d':
    case 'suspend_30d': return 'suspended';
    case 'permanent_block': return 'blocked';
    default: return current === 'blocked' ? 'blocked' : current;
  }
}

function deriveUserStatus(action, current) {
  if (action === 'permanent_block') return 'blocked';
  if (action.startsWith('suspend')) return 'suspended';
  if (action === 'warning') return 'active';
  if (action === 'none' && current === 'blocked') return 'blocked';
  return current === 'suspended' ? 'suspended' : 'active';
}

async function listReportsAdmin() {
  const rawReports = await scanAllReports();
  const reports = await Promise.all(rawReports.map(enrichReport));

  const summary = {
    pending: reports.filter((r) => r.status === 'pending').length,
    posts: reports.filter((r) => r.target_type === 'post').length,
    profiles: reports.filter((r) => r.target_type === 'profile').length,
    activeSanctions: reports.filter((r) => ['blocked', 'suspended'].includes(r.account_status)).length,
  };

  return { summary, reports };
}

async function patchReportAdmin(reportId, body, adminId) {
  const rawItems = await scanAllReports();
  const raw = rawItems.find((r) => r.report_id === reportId);
  if (!raw) {
    const err = new Error('NOT_FOUND');
    throw err;
  }

  const existing = await getModeration(reportId);
  const enriched = await enrichReport(raw);

  const status = body.status || existing.status || 'pending';
  const action = body.actionTaken ?? body.action_taken ?? existing.actionTaken ?? 'none';
  const adminNotes = body.adminNotes ?? body.admin_notes ?? existing.adminNotes ?? '';
  const notifyChannel = body.notifyChannel || body.notify_channel || 'in-app';
  const notifySubject = String(body.notifySubject || body.notify_subject || '').trim();
  const notifyMessage = String(body.notifyMessage || body.notify_message || '').trim();
  const liftSanction = body.liftSanction === true;

  let accountStatus = enriched.account_status;
  let suspendedUntil = existing.suspendedUntil || null;
  let actionTaken = action;

  if (liftSanction) {
    accountStatus = 'active';
    actionTaken = 'none';
    suspendedUntil = null;
  } else if (action !== 'none') {
    accountStatus = deriveAccountStatus(action, accountStatus);
    suspendedUntil = computeSuspendedUntil(action);
  }

  const notifications = Array.isArray(existing.notifications) ? [...existing.notifications] : [];
  if (notifyMessage && (action !== 'none' || liftSanction)) {
    notifications.push({
      sent_at: new Date().toISOString(),
      channel: notifyChannel,
      subject: notifySubject || (liftSanction ? 'Sanción levantada' : action),
      message: notifyMessage,
    });
  }

  const moderationItem = {
    PK: `REPORT#${reportId}`,
    SK: 'META',
    reportId,
    status,
    actionTaken,
    adminNotes,
    accountStatus,
    suspendedUntil,
    notifications,
    updatedAt: new Date().toISOString(),
    updatedBy: adminId,
  };

  await dynamodb.put({ TableName: BACKOFFICE_TABLE, Item: moderationItem }).promise();

  const targetUserId = enriched.target_user_id;
  if (targetUserId && (action !== 'none' || liftSanction)) {
    const userStatus = liftSanction ? 'active' : deriveUserStatus(action, 'active');
    const patch = {
      accountStatus: userStatus,
      updatedAt: new Date().toISOString(),
    };
    if (action === 'permanent_block') {
      patch.blacklisted = true;
      patch.blacklistedAt = new Date().toISOString();
    }
    if (liftSanction) {
      patch.accountStatus = 'active';
    }

    const updates = [];
    const values = {};
    Object.entries(patch).forEach(([key, value]) => {
      updates.push(`${key} = :${key}`);
      values[`:${key}`] = value;
    });

    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: targetUserId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: values,
    }).promise().catch(() => undefined);
  }

  const updated = await enrichReport(raw);
  return updated;
}

module.exports = {
  listReportsAdmin,
  patchReportAdmin,
};
