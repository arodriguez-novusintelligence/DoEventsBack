const AWS = require('aws-sdk');
const { randomUUID } = require('crypto');
const { jsonResponse, handleOptions } = require('./response');
const { mapProvider } = require('./mapper');
const { toPersistentImageUrl, normalizeGallery } = require('./mediaPersistence');
const { copyGalleryImageToEntity, persistProfileImageToEntity, persistGalleryToEntity } = require('./entityMedia');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2',
});

const TABLE = process.env.SERVICES_TABLE || 'ServiceProviders-qa';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    const userId = String(body.userId || '').trim();
    if (!userId) {
      return jsonResponse(event, 400, { error: 'userId es requerido' });
    }

    const name = String(body.name || body.displayName || '').trim();
    const category = String(body.category || body.sectors?.[0] || 'servicio').trim().toLowerCase();
    const role = String(body.role || category).trim();
    const description = String(body.description || '').trim();
    const serviceId = body.serviceId || `svc-${randomUUID()}`;
    const entityPrefix = `services/${serviceId}`;

    let gallery = await persistGalleryToEntity(
      userId,
      entityPrefix,
      normalizeGallery(Array.isArray(body.gallery) ? body.gallery.filter(Boolean) : []),
    );
    let profileImageUrl = await persistProfileImageToEntity(
      userId,
      entityPrefix,
      toPersistentImageUrl(String(body.profileImageUrl || body.avatarUrl || body.coverImageUrl || '').trim()),
    );

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
    }

    let mergedGallery = gallery;
    if (Array.isArray(body.galleryImportImageIds) && body.galleryImportImageIds.length) {
      const imported = await Promise.all(
        body.galleryImportImageIds.map((imageId) =>
          copyGalleryImageToEntity(userId, entityPrefix, { imageId }),
        ),
      );
      mergedGallery = [...new Set([...gallery, ...imported].filter(Boolean))];
    }

    if (!profileImageUrl && mergedGallery.length) profileImageUrl = mergedGallery[0];

    if (!name || !description) {
      return jsonResponse(event, 400, { error: 'name y description son requeridos' });
    }

    if (!profileImageUrl) {
      return jsonResponse(event, 400, { error: 'Debes subir una foto del servicio o de tu perfil' });
    }

    const now = new Date().toISOString();
    const pricing = body.pricing || body.activityPricing || {};
    const minPrice = Object.values(pricing).reduce((min, p) => {
      const cost = Number(p?.cost || p?.price || 0);
      if (!cost) return min;
      return min == null || cost < min ? cost : min;
    }, null);

    const item = {
      serviceId,
      userId,
      coAdminIds: Array.isArray(body.coAdminIds) ? body.coAdminIds : [],
      name,
      role,
      category,
      description,
      username: body.username || undefined,
      profileImageUrl,
      gallery: mergedGallery.length ? mergedGallery : [profileImageUrl],
      sectors: body.sectors || [category],
      activities: body.activities || {},
      pricing,
      minPrice: minPrice != null ? minPrice : undefined,
      currency: body.currency || 'COP',
      latitude: body.latitude != null ? Number(body.latitude) : undefined,
      longitude: body.longitude != null ? Number(body.longitude) : undefined,
      city: body.city || undefined,
      status: 'active',
      rating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await dynamodb.put({ TableName: TABLE, Item: item }).promise();

    const { notifyContentCreated } = require('./coAdminUtils');
    await notifyContentCreated({
      templateKey: 'SERVICE_CREATED',
      userId,
      entityId: serviceId,
      entityName: name,
      entityType: 'SERVICE',
    });

    try {
      await dynamodb.update({
        TableName: CLIENT_TABLE,
        Key: { id: userId },
        UpdateExpression: 'SET offersServices = :t, serviceType = :c, servicesPublishedThisYear = if_not_exists(servicesPublishedThisYear, :zero) + :one, updatedAt = :now',
        ExpressionAttributeValues: {
          ':t': true,
          ':c': category,
          ':zero': 0,
          ':one': 1,
          ':now': now,
        },
      }).promise();
    } catch (clientErr) {
      console.warn('No se pudo actualizar Client:', clientErr.message);
    }

    return jsonResponse(event, 201, { service: mapProvider(item) });
  } catch (err) {
    console.error('createService error', err);
    return jsonResponse(event, 500, { error: err.message || 'Error interno' });
  }
};
