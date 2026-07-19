const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

function canEditEntity(actorUserId, ownerUserId, coAdminIds = []) {
  if (!actorUserId) return false;
  const actor = String(actorUserId).trim();
  if (ownerUserId && String(ownerUserId).trim() === actor) return true;
  const coAdmins = Array.isArray(coAdminIds) ? coAdminIds : [];
  return coAdmins.some((id) => String(id).trim() === actor);
}

function canAssignCoAdmins(actorUserId, ownerUserId) {
  return Boolean(
    actorUserId &&
      ownerUserId &&
      String(actorUserId).trim() === String(ownerUserId).trim(),
  );
}

async function notifyCoAdminAssigned({
  targetUserId,
  entityType,
  entityId,
  entityName,
  assignedByUserId,
  assignedByName,
}) {
  const fn = process.env.NOTIFICATIONS_LAMBDA || 'notifications-qa-triggerNotification';
  try {
    await lambda.invoke({
      FunctionName: fn,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        body: JSON.stringify({
          templateKey: 'CO_ADMIN_ASSIGNED',
          userId: targetUserId,
          channels: ['push', 'inApp', 'email'],
          metadata: {
            userId: targetUserId,
            entityType,
            entityId,
            entityName: entityName || entityType,
            assignedByUserId,
            assignedByName: assignedByName || 'Un organizador',
          },
        }),
      }),
    }).promise();
  } catch (err) {
    console.warn('notifyCoAdminAssigned failed:', err.message);
  }
}

async function notifyContentCreated({
  templateKey,
  userId,
  entityId,
  entityName,
  entityType,
}) {
  const fn = process.env.NOTIFICATIONS_LAMBDA || 'notifications-qa-triggerNotification';
  try {
    await lambda.invoke({
      FunctionName: fn,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        body: JSON.stringify({
          templateKey,
          userId,
          channels: ['push', 'inApp', 'email'],
          metadata: {
            userId,
            entityId,
            entityName: entityName || entityType,
            entityType,
          },
        }),
      }),
    }).promise();
  } catch (err) {
    console.warn('notifyContentCreated failed:', err.message);
  }
}

module.exports = {
  canEditEntity,
  canAssignCoAdmins,
  notifyCoAdminAssigned,
  notifyContentCreated,
};
