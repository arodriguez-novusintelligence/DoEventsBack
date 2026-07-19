const AWS = require("aws-sdk");
const lambda = new AWS.Lambda();

const NOTIFICATIONS_LAMBDA =
  process.env.NOTIFICATIONS_LAMBDA || "notifications-qa-triggerNotification";

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
  try {
    await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_LAMBDA,
        InvocationType: "Event",
        Payload: JSON.stringify({
          body: JSON.stringify({
            templateKey: "CO_ADMIN_ASSIGNED",
            userId: targetUserId,
            eventId: entityType === "EVENT" ? entityId : undefined,
            channels: ["push", "inApp", "email"],
            metadata: {
              userId: targetUserId,
              entityType,
              entityId,
              entityName: entityName || entityType,
              assignedByUserId,
              assignedByName: assignedByName || "Un organizador",
            },
          }),
        }),
      })
      .promise();
  } catch (err) {
    console.warn("notifyCoAdminAssigned failed:", err.message);
  }
}

module.exports = { canEditEntity, canAssignCoAdmins, notifyCoAdminAssigned };
