const AWS = require('aws-sdk');
const { jsonResponse, handleOptions } = require('./response');
const { mapProvider } = require('./mapper');
const { canEditEntity } = require('./coAdminUtils');
const { toPersistentImageUrl, normalizeGallery } = require('./mediaPersistence');
const { copyGalleryImageToEntity, persistProfileImageToEntity, persistGalleryToEntity } = require('./entityMedia');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const SERVICES_TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const userId = String(body.userId || '').trim();

    if (!serviceId) {
      return jsonResponse(event, 400, { error: 'serviceId es requerido' });
    }
    if (!userId) {
      return jsonResponse(event, 400, { error: 'userId es requerido' });
    }

    const result = await dynamodb.get({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
    }).promise();

    const service = result.Item;
    if (!service || service.status === 'deleted') {
      return jsonResponse(event, 404, { error: 'Servicio no encontrado' });
    }

    if (!canEditEntity(userId, service.userId, service.coAdminIds)) {
      return jsonResponse(event, 403, { error: 'Sin permiso para editar este servicio' });
    }

    const now = new Date().toISOString();

    const entityPrefix = `services/${serviceId}`;

    let profileImageUrl;
    if (body.profileImageGalleryImageId || body.profileImageGalleryKey) {
      profileImageUrl = await copyGalleryImageToEntity(
        userId,
        entityPrefix,
        {
          imageId: body.profileImageGalleryImageId,
          key: body.profileImageGalleryKey,
          url: body.profileImageUrl,
        },
      );
    } else if (body.profileImageUrl !== undefined) {
      const persistent = toPersistentImageUrl(body.profileImageUrl) || String(body.profileImageUrl).trim();
      profileImageUrl = await persistProfileImageToEntity(userId, entityPrefix, persistent);
    }

    let galleryImportUrls = [];
    if (Array.isArray(body.galleryImportImageIds) && body.galleryImportImageIds.length) {
      galleryImportUrls = await Promise.all(
        body.galleryImportImageIds.map((imageId) =>
          copyGalleryImageToEntity(userId, entityPrefix, { imageId }),
        ),
      );
    }

    let gallery;
    if (body.gallery !== undefined) {
      gallery = await persistGalleryToEntity(userId, entityPrefix, [
        ...(Array.isArray(body.gallery) ? body.gallery : []),
        ...galleryImportUrls,
        ...(profileImageUrl ? [profileImageUrl] : []),
      ]);
    }

    const updates = {
      ...(body.name !== undefined && { name: String(body.name).trim() }),
      ...(body.description !== undefined && { description: String(body.description).trim() }),
      ...(body.role !== undefined && { role: String(body.role).trim() }),
      ...(body.category !== undefined && { category: String(body.category).trim().toLowerCase() }),
      ...(profileImageUrl && { profileImageUrl }),
      ...(gallery !== undefined && { gallery }),
      ...(body.sectors !== undefined && { sectors: body.sectors }),
      ...(body.activities !== undefined && { activities: body.activities }),
      ...(body.pricing !== undefined && { pricing: body.pricing }),
      ...(body.latitude !== undefined && { latitude: body.latitude != null ? Number(body.latitude) : undefined }),
      ...(body.longitude !== undefined && { longitude: body.longitude != null ? Number(body.longitude) : undefined }),
      ...(body.city !== undefined && { city: body.city }),
      updatedAt: now,
    };

    const expr = [];
    const names = {};
    const values = {};
    Object.entries(updates).forEach(([key, val]) => {
      if (val !== undefined) {
        expr.push(`#${key} = :${key}`);
        names[`#${key}`] = key;
        values[`:${key}`] = val;
      }
    });

    if (!expr.length) {
      return jsonResponse(event, 400, { error: 'No hay campos para actualizar' });
    }

    const updated = await dynamodb.update({
      TableName: SERVICES_TABLE,
      Key: { serviceId },
      UpdateExpression: `SET ${expr.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }).promise();

    return jsonResponse(event, 200, { service: mapProvider(updated.Attributes) });
  } catch (err) {
    console.error('updateService error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
