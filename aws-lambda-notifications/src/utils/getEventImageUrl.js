const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize DynamoDB clients
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);

// Configuration
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const IMAGES_TABLE = process.env.IMAGES_TABLE || "imagenes";
const IMAGES_EVENT_INDEX = process.env.IMAGES_EVENT_INDEX || "eventIdIndex";
const BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";
const DEFAULT_IMAGE =
  "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";

function normalizeImageValue(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsedUrl = new URL(rawValue);
      const normalizedHost = parsedUrl.host.toLowerCase();

      if (normalizedHost === `${BUCKET}.s3.amazonaws.com` || normalizedHost.startsWith(`${BUCKET}.s3.`)) {
        const key = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
        return key ? `https://${BUCKET}.s3.amazonaws.com/${key}` : null;
      }
    } catch (error) {
      return rawValue;
    }

    return rawValue;
  }

  return `https://${BUCKET}.s3.amazonaws.com/${rawValue.replace(/^\/+/, "")}`;
}

async function getImageFromImagenesTable(eventId) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: IMAGES_TABLE,
      IndexName: IMAGES_EVENT_INDEX,
      KeyConditionExpression: "id_evento = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
      ProjectionExpression: "imagenesCargadas, s3Keys, id_evento",
      Limit: 1,
    })
  );

  const item = result.Items && result.Items[0];
  if (!item) {
    return null;
  }

  const candidates = [...(item.imagenesCargadas || []), ...(item.s3Keys || [])]
    .map(normalizeImageValue)
    .filter(Boolean);

  return candidates[0] || null;
}

/**
 * Obtiene la imagen de un evento y devuelve una URL pública para usar en notificaciones.
 * Prioriza la tabla `imagenes`, que es donde `aws-lambda-imagenes` persiste las cargas actuales.
 * Mantiene compatibilidad con `Eventos.main_image`/`imagenPrincipal` para eventos legados.
 *
 * @param {string} eventId - ID del evento en DynamoDB
 * @param {number} expiresIn - Segundos para que expire la URL (default: 86400 = 24h)
 * @returns {Promise<string>} - URL pública de S3 o URL por defecto si hay error
 *
 * @example
 * const imageUrl = await getEventImageUrl("evt-123-abc");
 * // Returns: "https://bucket.s3.amazonaws.com/key?X-Amz-Signature=..."
 */
const getEventImageUrl = async (eventId, expiresIn = 86400) => {
  if (!eventId) {
    console.log("⚠️ getEventImageUrl: eventId no proporcionado");
    return DEFAULT_IMAGE;
  }

  try {
    console.log(`🖼️ Consultando imagen para evento ${eventId}...`);

    const imageFromImagenes = await getImageFromImagenesTable(eventId);
    if (imageFromImagenes) {
      console.log(`✅ Imagen encontrada en tabla ${IMAGES_TABLE} para evento ${eventId}`);
      return imageFromImagenes;
    }

    console.log(
      `ℹ️ Evento ${eventId} sin imagen utilizable en tabla ${IMAGES_TABLE}; revisando ${EVENTS_TABLE}`
    );

    // Fetch event from DynamoDB as backwards-compatible fallback
    const result = await dynamodb.send(
      new GetCommand({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        ProjectionExpression: "main_image,imagenPrincipal,id,nombre",
      })
    );

    if (!result.Item) {
      console.log(`⚠️ Evento ${eventId} no encontrado en tabla ${EVENTS_TABLE}`);
      return DEFAULT_IMAGE;
    }

    // Extract image key (try both field names for compatibility)
    const imageKey = result.Item.main_image || result.Item.imagenPrincipal;

    // If event has no image, return default
    if (!imageKey) {
      console.log(
        `ℹ️ Evento ${eventId} (${result.Item.nombre || "sin nombre"}) no tiene imagen`
      );
      return DEFAULT_IMAGE;
    }

    // El bucket doeventimageeventbucket es público — usar URL pública directa
    // para que WhatsApp CDN y otros servicios puedan acceder sin restricciones
    const publicUrl = normalizeImageValue(imageKey);

    console.log(
      `✅ URL pública generada para evento ${eventId} (${imageKey})`
    );

    return publicUrl;
  } catch (error) {
    console.error(
      `❌ Error obteniendo imagen del evento ${eventId}:`,
      error.message
    );
    return DEFAULT_IMAGE;
  }
};

module.exports = { getEventImageUrl };
