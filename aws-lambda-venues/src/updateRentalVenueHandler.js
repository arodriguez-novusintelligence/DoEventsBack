const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const { tableName, respond, handleOptions } = require("./venueSocialUtils");
const { canEditEntity } = require("./coAdminUtils");
const { toPersistentImageUrl } = require("./imagePersistence");
const { copyGalleryImagesToVenue } = require("./profileGalleryCopy");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});
const s3 = new AWS.S3();
const BUCKET_NAME = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";

const VENUE_TABLE = () => tableName("VENUE_TABLE", "Venues");

async function uploadImages(venueId, images = []) {
  const urls = [];
  for (const imageData of images) {
    if (!imageData?.base64) continue;
    const imageId = uuidv4();
    const fileExtension = (imageData.fileName || "jpg").split(".").pop().toLowerCase();
    const s3Key = `venues/${venueId}/${imageId}.${fileExtension}`;
    const normalizedBase64 = imageData.base64.includes(",")
      ? imageData.base64.split(",")[1]
      : imageData.base64;
    const imageBuffer = Buffer.from(normalizedBase64, "base64");
    await s3
      .upload({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: `image/${fileExtension === "jpg" ? "jpeg" : fileExtension}`,
      })
      .promise();
    urls.push(`https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`);
  }
  return urls;
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const body = JSON.parse(event.body || "{}");
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      body.userId ||
      body.updatedBy;

    if (!venueId || !userId) {
      return respond(400, { error: "venueId y userId son requeridos" });
    }

    const existing = await dynamodb
      .get({ TableName: VENUE_TABLE(), Key: { venue_id: venueId } })
      .promise();

    if (!existing.Item) {
      return respond(404, { error: "Lugar no encontrado" });
    }

    const venue = existing.Item;
    if (!canEditEntity(userId, venue.ownerUserId, venue.coAdminIds)) {
      return respond(403, { error: "Sin permiso para editar este lugar" });
    }

    const now = new Date().toISOString();
    let imageUrls = null;
    if (Array.isArray(body.imageUrls)) {
      const incoming = body.imageUrls
        .map((url) => toPersistentImageUrl(url))
        .filter(Boolean);
      if (incoming.length) {
        imageUrls = incoming;
      }
    }
    if (Array.isArray(body.images) && body.images.length) {
      const uploaded = await uploadImages(venueId, body.images);
      imageUrls = [...(imageUrls || []), ...uploaded];
    }
    if (Array.isArray(body.galleryImageImports) && body.galleryImageImports.length) {
      const copied = await copyGalleryImagesToVenue(userId, venueId, body.galleryImageImports);
      if (copied.length) {
        imageUrls = [...(imageUrls || []), ...copied];
      }
    }
    if (imageUrls === null && Array.isArray(body.images) === false) {
      // No se enviaron imágenes: preservar las existentes
    } else if (imageUrls !== null && !Array.isArray(body.imageUrls)) {
      const prev = venue.images ? String(venue.images).split(",").filter(Boolean) : [];
      imageUrls = [...new Set([...prev, ...imageUrls])];
    }

    let previousAmenities = {};
    try {
      previousAmenities = venue.amenities ? JSON.parse(venue.amenities) : {};
    } catch {
      previousAmenities = {};
    }

    const hasAmenityUpdate =
      body.pricing !== undefined
      || body.parking !== undefined
      || body.features !== undefined
      || body.videos !== undefined
      || body.selectedDates !== undefined
      || body.blockedDates !== undefined
      || body.globalStartTime !== undefined
      || body.globalEndTime !== undefined
      || body.bookingPreference !== undefined
      || body.refundPolicy !== undefined
      || body.directions !== undefined
      || body.nearbyReferences !== undefined
      || body.addonServices !== undefined
      || body.facilities !== undefined
      || body.allowedEventTypes !== undefined
      || body.includedServices !== undefined
      || body.accessibility !== undefined
      || body.security !== undefined
      || body.chargeType !== undefined
      || body.calendarWeekdays !== undefined
      || body.calendarMonths !== undefined
      || body.hostRole !== undefined
      || body.faqs !== undefined
      || body.neighborhood !== undefined;

    const amenities = hasAmenityUpdate
      ? JSON.stringify({
          ...previousAmenities,
          listingType: "rental",
          parking: body.parking !== undefined ? Boolean(body.parking) : previousAmenities.parking,
          features: body.features !== undefined ? body.features : previousAmenities.features,
          pricing: body.pricing !== undefined ? body.pricing : previousAmenities.pricing,
          videos: body.videos !== undefined ? body.videos : previousAmenities.videos,
          availability: {
            ...(previousAmenities.availability || {}),
            ...(body.selectedDates !== undefined && { selectedDates: body.selectedDates }),
            ...(body.blockedDates !== undefined && { blockedDates: body.blockedDates }),
            ...(body.globalStartTime !== undefined && { globalStartTime: body.globalStartTime }),
            ...(body.globalEndTime !== undefined && { globalEndTime: body.globalEndTime }),
          },
          bookingPreference:
            body.bookingPreference !== undefined
              ? body.bookingPreference
              : previousAmenities.bookingPreference,
          refundPolicy:
            body.refundPolicy !== undefined ? body.refundPolicy : previousAmenities.refundPolicy,
          directions: body.directions !== undefined ? body.directions : previousAmenities.directions,
          nearbyReferences:
            body.nearbyReferences !== undefined ? body.nearbyReferences : previousAmenities.nearbyReferences,
          addonServices:
            body.addonServices !== undefined ? body.addonServices : previousAmenities.addonServices,
          facilities: body.facilities !== undefined ? body.facilities : previousAmenities.facilities,
          allowedEventTypes:
            body.allowedEventTypes !== undefined ? body.allowedEventTypes : previousAmenities.allowedEventTypes,
          includedServices:
            body.includedServices !== undefined ? body.includedServices : previousAmenities.includedServices,
          accessibility:
            body.accessibility !== undefined ? body.accessibility : previousAmenities.accessibility,
          security: body.security !== undefined ? body.security : previousAmenities.security,
          chargeType:
            body.chargeType !== undefined ? body.chargeType : previousAmenities.chargeType,
          calendarWeekdays:
            body.calendarWeekdays !== undefined ? body.calendarWeekdays : previousAmenities.calendarWeekdays,
          calendarMonths:
            body.calendarMonths !== undefined ? body.calendarMonths : previousAmenities.calendarMonths,
          hostRole: body.hostRole !== undefined ? body.hostRole : previousAmenities.hostRole,
          faqs: body.faqs !== undefined ? body.faqs : previousAmenities.faqs,
          neighborhood:
            body.neighborhood !== undefined ? body.neighborhood : previousAmenities.neighborhood,
        })
      : undefined;

    const updates = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.city !== undefined && { city: body.city }),
      ...(body.department !== undefined && { department: body.department }),
      ...(body.country !== undefined && { country: body.country }),
      ...(body.latitude !== undefined && { latitude: body.latitude }),
      ...(body.longitude !== undefined && { longitude: body.longitude }),
      ...(body.capacity !== undefined && { capacity: Number(body.capacity) }),
      ...(body.hasSeating !== undefined && { hasSeating: Boolean(body.hasSeating) }),
      ...(body.placeType !== undefined && { type: body.placeType, tags: body.placeType }),
      ...(imageUrls && imageUrls.length && { images: imageUrls.join(",") }),
      ...(amenities && { amenities }),
      updatedAt: now,
      updatedBy: userId,
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
      return respond(400, { error: "No hay campos para actualizar" });
    }

    const result = await dynamodb
      .update({
        TableName: VENUE_TABLE(),
        Key: { venue_id: venueId },
        UpdateExpression: `SET ${expr.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
      .promise();

    return respond(200, { venue: result.Attributes, venueId });
  } catch (error) {
    console.error("updateRentalVenueHandler error:", error);
    return respond(500, { error: error.message || "Error interno" });
  }
};
