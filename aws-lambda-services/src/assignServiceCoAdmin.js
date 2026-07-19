const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');
const {
  canAssignCoAdmins,
  notifyCoAdminAssigned,
} = require('./coAdminUtils');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';

async function getUserName(userId) {
  try {
    const res = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
    const u = res.Item;
    if (!u) return 'Usuario';
    return [u.nombre, u.apellido].filter(Boolean).join(' ').trim() || u.username || 'Usuario';
  } catch {
    return 'Usuario';
  }
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const ownerUserId = String(body.ownerUserId || body.userId || '').trim();
    const coAdminUserId = String(body.coAdminUserId || body.targetUserId || '').trim();

    if (!serviceId || !ownerUserId || !coAdminUserId) {
      return jsonResponse(event, 400, { error: 'serviceId, ownerUserId y coAdminUserId son requeridos' });
    }
    if (ownerUserId === coAdminUserId) {
      return jsonResponse(event, 400, { error: 'No puedes designarte a ti mismo como co-admin' });
    }

    const result = await dynamodb.get({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
    }).promise();

    const service = result.Item;
    if (!service || service.status === 'deleted') {
      return jsonResponse(event, 404, { error: 'Servicio no encontrado' });
    }

    if (!canAssignCoAdmins(ownerUserId, service.userId)) {
      return jsonResponse(event, 403, { error: 'Solo el creador puede designar co-administradores' });
    }

    const coAdminIds = Array.isArray(service.coAdminIds) ? [...service.coAdminIds] : [];
    if (!coAdminIds.includes(coAdminUserId)) {
      coAdminIds.push(coAdminUserId);
    }

    const now = new Date().toISOString();
    await dynamodb.update({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
      UpdateExpression: 'SET coAdminIds = :coAdminIds, updatedAt = :now',
      ExpressionAttributeValues: { ':coAdminIds': coAdminIds, ':now': now },
    }).promise();

    const assignedByName = await getUserName(ownerUserId);
    await notifyCoAdminAssigned({
      targetUserId: coAdminUserId,
      entityType: 'SERVICE',
      entityId: serviceId,
      entityName: service.name || 'Servicio',
      assignedByUserId: ownerUserId,
      assignedByName,
    });

    return jsonResponse(event, 200, { success: true, coAdminIds });
  } catch (err) {
    console.error('assignServiceCoAdmin error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
