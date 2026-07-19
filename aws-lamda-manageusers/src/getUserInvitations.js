const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const IMAGE_BUCKET =
  process.env.IMAGE_BUCKET || "doeventimageeventbucket";
const IMAGE_BUCKET_REGION =
  process.env.IMAGE_BUCKET_REGION || process.env.S3_BUCKET_REGION || "us-east-1";

const s3 = new AWS.S3({
  region: IMAGE_BUCKET_REGION,
  signatureVersion: "v4",
});

function buildPublicEventImageUrl(keyOrUrl) {
  const raw = String(keyOrUrl || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    // Corregir host firmado/apuntado a región incorrecta del lambda (sa-east-1)
    return raw.replace(
      /\.s3\.sa-east-1\.amazonaws\.com\//i,
      IMAGE_BUCKET_REGION === "us-east-1"
        ? ".s3.us-east-1.amazonaws.com/"
        : `.s3.${IMAGE_BUCKET_REGION}.amazonaws.com/`,
    ).replace(
      /\.s3\.amazonaws\.com\//i,
      IMAGE_BUCKET_REGION === "us-east-1"
        ? ".s3.amazonaws.com/"
        : `.s3.${IMAGE_BUCKET_REGION}.amazonaws.com/`,
    );
  }
  const key = raw.replace(/^\/+/, "");
  const host =
    IMAGE_BUCKET_REGION === "us-east-1"
      ? `${IMAGE_BUCKET}.s3.us-east-1.amazonaws.com`
      : `${IMAGE_BUCKET}.s3.${IMAGE_BUCKET_REGION}.amazonaws.com`;
  return `https://${host}/${key}`;
}

function extractS3Key(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");
  const marker = ".com/";
  const pos = value.indexOf(marker);
  if (pos === -1) return null;
  return value.substring(pos + marker.length).split("?")[0];
}

// Prefiere URL pública del evento; firma solo como respaldo en la región correcta del bucket.
async function getEventImageSignedUrl(eventId) {
  if (!eventId) return null;

  try {
    const queryParams = {
      TableName: process.env.IMAGE_TABLE || "imagenes",
      IndexName: "eventIdIndex",
      KeyConditionExpression: "id_evento = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
      Limit: 1,
    };

    const result = await dynamodb.query(queryParams).promise();
    const imageRecord = result.Items && result.Items[0];
    const images = Array.isArray(imageRecord?.imagenesCargadas)
      ? imageRecord.imagenesCargadas
      : [];
    const s3Keys = Array.isArray(imageRecord?.s3Keys) ? imageRecord.s3Keys : [];

    const firstPublic = images.find((v) => String(v || "").trim());
    if (firstPublic) {
      return buildPublicEventImageUrl(firstPublic);
    }

    const firstKey = s3Keys.find((v) => String(v || "").trim()) || extractS3Key(firstPublic);
    if (!firstKey) return null;

    return s3.getSignedUrl("getObject", {
      Bucket: IMAGE_BUCKET,
      Key: String(firstKey).replace(/^\/+/, ""),
      Expires: 3600,
    });
  } catch (err) {
    console.error(
      `Error obteniendo imagen firmada para evento ${eventId}:`,
      err.message,
    );
    return null;
  }
}

// Lista invitaciones recibidas por un usuario desde la tabla EventInvitations usando el GSI UserIdIndex
exports.getUserInvitations = async (event) => {
  try {
    const pathParams = event.pathParameters || {};
    const queryParams = event.queryStringParameters || {};
    const userId = pathParams.userId;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId es requerido" }),
      };
    }

    const status = queryParams.status;
    const limitParam = parseInt(queryParams.limit, 10);
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 100)
        : 20;

    let exclusiveStartKey;
    if (queryParams.cursor) {
      try {
        const decoded = Buffer.from(queryParams.cursor, "base64").toString(
          "utf8",
        );
        exclusiveStartKey = JSON.parse(decoded);
      } catch (err) {
        console.warn("Cursor inválido, se ignorará", err.message);
      }
    }

    const params = {
      TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
      IndexName: "UserIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false, // más recientes primero
      Limit: limit,
    };

    if (status) {
      params.FilterExpression = "#status = :status";
      params.ExpressionAttributeNames = { "#status": "status" };
      params.ExpressionAttributeValues[":status"] = status;
    }

    if (exclusiveStartKey) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    // Cuando hay FilterExpression, DynamoDB aplica Limit ANTES del filtro.
    // Paginamos internamente hasta reunir `limit` ítems que pasen el filtro.
    let invitations = [];
    let lastKey = exclusiveStartKey || null;
    const pageSize = status ? Math.max(limit * 5, 100) : limit;
    let result;

    do {
      const pageParams = {
        ...params,
        Limit: pageSize,
        ExclusiveStartKey: lastKey || undefined,
      };
      result = await dynamodb.query(pageParams).promise();
      invitations = invitations.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey || null;
    } while (lastKey && invitations.length < limit);

    invitations = invitations.slice(0, limit);

    // Enriquecer con imagen firmada por eventId (cacheado por página)
    const eventIds = Array.from(
      new Set(
        invitations
          .map((inv) => inv.eventId)
          .filter((id) => typeof id === "string" && id.length > 0),
      ),
    );

    const imageCache = {};
    for (const id of eventIds) {
      imageCache[id] = await getEventImageSignedUrl(id);
    }

    const invitationsWithImage = invitations.map((inv) => ({
      ...inv,
      eventImageSigned: inv.eventId ? imageCache[inv.eventId] || null : null,
    }));

    const stats = invitationsWithImage.reduce(
      (acc, inv) => {
        acc.total += 1;
        if (inv.status === "pending") acc.pending += 1;
        else if (inv.status === "accepted") acc.accepted += 1;
        else if (inv.status === "rejected") acc.rejected += 1;
        else if (inv.status === "expired") acc.expired += 1;
        return acc;
      },
      { total: 0, pending: 0, accepted: 0, rejected: 0, expired: 0 },
    );

    const nextCursor = lastKey
      ? Buffer.from(JSON.stringify(lastKey)).toString("base64")
      : null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        invitations: invitationsWithImage,
        stats,
        nextCursor,
      }),
    };
  } catch (error) {
    console.error("Error en getUserInvitations", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno", detail: error.message }),
    };
  }
};
