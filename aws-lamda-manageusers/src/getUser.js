const AWS = require("aws-sdk");
const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-2";
AWS.config.update({ region: awsRegion });
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: awsRegion });
const s3 = new AWS.S3({ region: awsRegion });

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const PROFILE_MEDIA_BUCKET =
  process.env.PROFILE_BUCKET || process.env.IMAGE_BUCKET || "doeventprofileimagesbucket";
const LEGACY_PROFILE_BUCKET = "doeventprofileimagesbucket";
const PROFILE_MEDIA_REGION =
  process.env.PROFILE_BUCKET_REGION || process.env.S3_BUCKET_REGION || "us-east-1";

const s3Media = new AWS.S3({ region: PROFILE_MEDIA_REGION, signatureVersion: "v4" });
const s3Legacy = new AWS.S3({ region: "us-east-1", signatureVersion: "v4" });

const resolveS3ClientForBucket = (bucket) => {
  if (bucket === PROFILE_MEDIA_BUCKET) return s3Media;
  if (bucket === LEGACY_PROFILE_BUCKET) return s3Legacy;
  return s3Media;
};

const parseS3Location = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (!isHttpUrl(value)) {
    return { bucket: PROFILE_MEDIA_BUCKET, key: value };
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\/+/, "");
    if (host === `${PROFILE_MEDIA_BUCKET}.s3.amazonaws.com` || host.startsWith(`${PROFILE_MEDIA_BUCKET}.s3.`)) {
      return { bucket: PROFILE_MEDIA_BUCKET, key: path };
    }
    if (host === `${LEGACY_PROFILE_BUCKET}.s3.amazonaws.com` || host.startsWith(`${LEGACY_PROFILE_BUCKET}.s3.`)) {
      return { bucket: LEGACY_PROFILE_BUCKET, key: path };
    }
    if (host.includes(".s3.") && path) {
      const bucket = host.split(".s3.")[0];
      return { bucket, key: path };
    }
  } catch (error) {
    return null;
  }
  return null;
};

const resolveUserProfileImageUrl = (fotoPerfilUrl, platform) => {
  if (!fotoPerfilUrl) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }

  try {
    return s3Legacy.getSignedUrl("getObject", {
      Bucket: LEGACY_PROFILE_BUCKET,
      Key: fotoPerfilUrl,
      Expires: 3600,
    });
  } catch (error) {
    return fotoPerfilUrl;
  }
};

const resolveSignedAssetUrl = (value, expires = 3600) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const location = parseS3Location(raw);
  if (!location?.key) {
    return isHttpUrl(raw) ? raw : "";
  }

  try {
    return resolveS3ClientForBucket(location.bucket).getSignedUrl("getObject", {
      Bucket: location.bucket,
      Key: location.key,
      Expires: expires,
    });
  } catch (error) {
    return isHttpUrl(raw) ? raw : "";
  }
};

const resolvePublicAssetUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isHttpUrl(raw)) return raw;
  const regionSegment = PROFILE_MEDIA_REGION === "us-east-1" ? "s3" : `s3.${PROFILE_MEDIA_REGION}`;
  return `https://${PROFILE_MEDIA_BUCKET}.${regionSegment}.amazonaws.com/${raw}`;
};

async function countFavoritesReceived(userId) {
  let total = 0;

  try {
    let lastEvaluatedKey;
    do {
      const data = await dynamodb
        .query({
          TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
          IndexName: "GSI-followers",
          KeyConditionExpression: "invitedUserId = :invitedUserId",
          FilterExpression: "isFavorite = :isFavorite",
          ExpressionAttributeValues: {
            ":invitedUserId": userId,
            ":isFavorite": true,
          },
          Select: "COUNT",
          ExclusiveStartKey: lastEvaluatedKey,
        })
        .promise();

      total += data.Count || 0;
      lastEvaluatedKey = data.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return total;
  } catch (error) {
    let lastEvaluatedKey;
    do {
      const data = await dynamodb
        .scan({
          TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
          FilterExpression: "isFavorite = :isFavorite AND invitedUserId = :uid",
          ExpressionAttributeValues: {
            ":isFavorite": true,
            ":uid": userId,
          },
          Select: "COUNT",
          ExclusiveStartKey: lastEvaluatedKey,
        })
        .promise();

      total += data.Count || 0;
      lastEvaluatedKey = data.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return total;
  }
}

async function countFavoritesGiven(userId) {
  let total = 0;
  let lastEvaluatedKey;

  do {
    const data = await dynamodb
      .query({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "isFavorite = :isFavorite",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":isFavorite": true,
        },
        Select: "COUNT",
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    total += data.Count || 0;
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return total;
}

async function isProfileFavoritedByViewer(viewerId, targetUserId) {
  if (!viewerId || !targetUserId || viewerId === targetUserId) {
    return false;
  }

  const directHit = await dynamodb
    .get({
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      Key: {
        userId: viewerId,
        favoriteId: targetUserId,
      },
    })
    .promise();

  if (directHit.Item) {
    return directHit.Item.isFavorite === true;
  }

  const data = await dynamodb
    .query({
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "invitedUserId = :targetUserId AND isFavorite = :isFavorite",
      ExpressionAttributeValues: {
        ":userId": viewerId,
        ":targetUserId": targetUserId,
        ":isFavorite": true,
      },
    })
    .promise();

  return (data.Items || []).length > 0;
}

exports.getUser = async (event) => {
  let response;

  try {
    // Obtener el id del usuario de los parámetros de la ruta
    const { id } = event.pathParameters;
    const viewerId =
      event?.queryStringParameters?.viewerId ||
      event?.queryStringParameters?.requesterId ||
      event?.queryStringParameters?.currentUserId ||
      event?.queryStringParameters?.userId ||
      null;

    if (!id) {
      throw new Error("El id del usuario es obligatorio");
    }

    // Configurar los parámetros para la consulta
    const params = {
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: {
        id: id,
      },
    };

    // Ejecutar la consulta
    const result = await dynamodb.get(params).promise();

    if (!result.Item) {
      throw new Error("Usuario no encontrado");
    }
    const userItem = result.Item;

    // Si el usuario tiene una foto de perfil, resolver según platform y tipo de URL
    if (userItem.fotoPerfilUrl) {
      const isExternalOAuthPhoto = /googleusercontent\.com|fbcdn\.net|graph\.facebook|appleid\.apple\.com|gravatar\.com/i
        .test(String(userItem.fotoPerfilUrl));
      if (isExternalOAuthPhoto) {
        userItem.fotoPerfilSignedUrl = userItem.fotoPerfilUrl;
      } else {
        userItem.fotoPerfilSignedUrl = resolveSignedAssetUrl(userItem.fotoPerfilUrl);
        if (!userItem.fotoPerfilSignedUrl) {
          userItem.fotoPerfilSignedUrl = resolvePublicAssetUrl(userItem.fotoPerfilUrl);
        }
      }
    }

    const favoritesReceivedCount = await countFavoritesReceived(id);
    const favoritesGivenCount = await countFavoritesGiven(id);
    const isFavoriteByViewer = await isProfileFavoritedByViewer(viewerId, id);

    userItem.favoritesReceivedCount = favoritesReceivedCount;
    userItem.likesReceivedCount = favoritesReceivedCount;
    userItem.favoritesGivenCount = favoritesGivenCount;
    userItem.favoriteProfilesCount = favoritesGivenCount;
    userItem.isFavoriteByViewer = isFavoriteByViewer;
    userItem.isFavoriteProfile = isFavoriteByViewer;

    const coverUrl =
      userItem.profileCover?.url ||
      userItem.coverImageUrl ||
      userItem.profileCoverUrl ||
      "";

    userItem.coverImagePublicUrl = resolvePublicAssetUrl(coverUrl);
    userItem.coverImageSignedUrl = resolveSignedAssetUrl(coverUrl);
    userItem.coverImageUrl =
      userItem.coverImageSignedUrl || userItem.coverImagePublicUrl;

    if (Array.isArray(userItem.profileGallery)) {
      userItem.profileGallery = userItem.profileGallery.map((item) => ({
        ...item,
        publicUrl: resolvePublicAssetUrl(item.url || item.key),
        signedUrl: resolveSignedAssetUrl(item.url || item.key),
        url:
          resolveSignedAssetUrl(item.url || item.key) ||
          resolvePublicAssetUrl(item.url || item.key),
      }));
    }
    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        rquid: id,
      },
      body: JSON.stringify(userItem),
    };
  } catch (error) {
    console.error("Error al consultar el usuario:", error);

    // Manejo de errores
    let errorMessage = "Error interno del servidor";
    let statusCode = 500;

    if (error.message === "El id del usuario es obligatorio") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "Usuario no encontrado") {
      errorMessage = error.message;
      statusCode = 404;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statusDesc: errorMessage,
        statusCode,
      }),
    };
  }

  return response;
};
