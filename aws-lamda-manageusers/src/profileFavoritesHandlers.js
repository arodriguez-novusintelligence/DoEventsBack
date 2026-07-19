const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const PROFILE_BUCKET = "doeventprofileimagesbucket";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const isGoogleOrApple = (platform) => {
  const normalized = String(platform || "").trim().toUpperCase();
  return normalized === "GOOGLE" || normalized === "APPLE";
};

const extractS3KeyFromProfileValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (!isHttpUrl(raw)) {
    return raw.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (
      host === `${PROFILE_BUCKET}.s3.amazonaws.com` ||
      host.startsWith(`${PROFILE_BUCKET}.s3.`)
    ) {
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    }
  } catch (error) {
    return null;
  }

  return null;
};

const signProfileImage = (key, expires = 3600) => {
  if (!key) return "";

  try {
    return s3.getSignedUrl("getObject", {
      Bucket: PROFILE_BUCKET,
      Key: key,
      Expires: expires,
    });
  } catch (error) {
    return key;
  }
};

const resolveFavoriteProfileImageUrl = (profileImageUrl, platform) => {
  const raw = String(profileImageUrl || "").trim();
  if (!raw) return "";

  // If the value points to our S3 bucket (key or S3 URL), always sign it.
  const s3Key = extractS3KeyFromProfileValue(raw);
  if (s3Key) {
    return signProfileImage(s3Key);
  }

  // For Apple/Google users, keep external provider URL when it is not S3.
  if (isGoogleOrApple(platform) && isHttpUrl(raw)) {
    return raw;
  }

  return raw;
};

const getClient = async (id) => {
  const result = await dynamodb
    .get({
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: { id },
    })
    .promise();
  return result.Item || null;
};

exports.setFavoriteProfile = async (event) => {
  try {
    const { userId, targetUserId } = event.pathParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    if (!userId || !targetUserId) {
      return jsonResponse(400, { error: "userId and targetUserId are required" });
    }

    if (userId === targetUserId) {
      return jsonResponse(400, {
        error: "No puedes marcar tu propio perfil como favorito",
      });
    }

    const target = await getClient(targetUserId);
    if (!target) {
      return jsonResponse(404, { error: "Perfil destino no encontrado" });
    }

    const now = new Date().toISOString();
    const isFavorite = body.isFavorite !== undefined ? !!body.isFavorite : true;

    const existing = await dynamodb
      .get({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Key: {
          userId,
          favoriteId: targetUserId,
        },
      })
      .promise();

    if (existing.Item) {
      await dynamodb
        .update({
          TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
          Key: { userId, favoriteId: targetUserId },
          UpdateExpression:
            "SET isFavorite = :isFavorite, updatedAt = :updatedAt, invitedUserId = :invitedUserId, #name = :name, lastName = :lastName, email = :email, phone = :phone, username = :username, profileImageUrl = :profileImageUrl, originType = :originType",
          ExpressionAttributeNames: {
            "#name": "name",
          },
          ExpressionAttributeValues: {
            ":isFavorite": isFavorite,
            ":updatedAt": now,
            ":invitedUserId": targetUserId,
            ":name": target.name || target.nombre || "",
            ":lastName": target.lastName || target.apellido || "",
            ":email": target.email || "",
            ":phone": target.phone || target.phoneNumber || "",
            ":username": target.user || "",
            ":profileImageUrl": target.fotoPerfilUrl || "",
            ":originType": "REGISTERED",
          },
          ReturnValues: "ALL_NEW",
        })
        .promise();
    } else {
      await dynamodb
        .put({
          TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
          Item: {
            userId,
            favoriteId: targetUserId,
            invitedUserId: targetUserId,
            name: target.name || target.nombre || "",
            lastName: target.lastName || target.apellido || "",
            email: target.email || "",
            phone: target.phone || target.phoneNumber || "",
            username: target.user || "",
            profileImageUrl: target.fotoPerfilUrl || "",
            originType: "REGISTERED",
            isFavorite,
            groupIds: [],
            tags: [],
            createdAt: now,
            updatedAt: now,
          },
        })
        .promise();
    }

    return jsonResponse(200, {
      message: isFavorite
        ? "Perfil marcado como favorito"
        : "Perfil removido de favoritos",
      userId,
      targetUserId,
      isFavorite,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};

exports.listFavoriteProfiles = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const mode = String(
      event?.queryStringParameters?.mode || event?.queryStringParameters?.type || "",
    )
      .trim()
      .toLowerCase();

    if (!userId) {
      return jsonResponse(400, { error: "userId is required" });
    }

    if (["received", "favorited-by", "followers"].includes(mode)) {
      return exports.listProfilesWhoFavoritedMe(event);
    }

    const data = await dynamodb
      .query({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "isFavorite = :isFavorite",
        ExpressionAttributeValues: {
          ":userId": userId,
          ":isFavorite": true,
        },
      })
      .promise();

    const favorites = (data.Items || []).map((item) => ({
      favoriteId: item.favoriteId,
      invitedUserId: item.invitedUserId || item.favoriteId,
      name: item.name || "",
      lastName: item.lastName || "",
      email: item.email || "",
      phone: item.phone || "",
      username: item.username || item.user || "",
      profileImageUrl: resolveFavoriteProfileImageUrl(
        item.profileImageUrl,
        item.platform || item.PLATFORM || null,
      ),
      isFavorite: item.isFavorite === true,
      originType: item.originType || "",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    return jsonResponse(200, {
      userId,
      count: favorites.length,
      favorites,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};

exports.listProfilesWhoFavoritedMe = async (event) => {
  try {
    const { userId } = event.pathParameters || {};

    if (!userId) {
      return jsonResponse(400, { error: "userId is required" });
    }

    const items = [];
    let lastEvaluatedKey;

    try {
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
            ExclusiveStartKey: lastEvaluatedKey,
          })
          .promise();

        if (Array.isArray(data.Items)) {
          items.push(...data.Items);
        }
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);
    } catch (queryError) {
      // Fallback path without mixing favoriteId to avoid inflated lists.
      do {
        const data = await dynamodb
          .scan({
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            FilterExpression: "invitedUserId = :invitedUserId AND isFavorite = :isFavorite",
            ExpressionAttributeValues: {
              ":invitedUserId": userId,
              ":isFavorite": true,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
          .promise();

        if (Array.isArray(data.Items)) {
          items.push(...data.Items);
        }
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);
    }

    const strictFavorites = (items || []).filter((item) => {
      const targetFavoriteId = String(item.favoriteId || "").trim();
      const targetInvitedId = String(item.invitedUserId || "").trim();
      const markerUserId = String(item.userId || "").trim();

      // Strict profile-favorite relation: follower(userId) -> favoriteId(target user)
      if (!markerUserId || markerUserId === String(userId)) return false;
      if (targetFavoriteId && targetFavoriteId !== String(userId)) return false;
      if (targetInvitedId && targetInvitedId !== String(userId)) return false;
      return item.isFavorite === true;
    });

    const uniqueByMarker = new Map();

    for (const item of strictFavorites) {
      const markerUserId = item.userId || item.ownerId || item.favoriteOwnerId;
      const dedupeKey = String(markerUserId || item.favoriteId || item.invitedUserId || "").trim();
      if (!dedupeKey || uniqueByMarker.has(dedupeKey)) continue;

      uniqueByMarker.set(dedupeKey, {
        userId: markerUserId || "",
        favoriteId: item.favoriteId || "",
        invitedUserId: item.invitedUserId || "",
        name: item.name || "",
        lastName: item.lastName || "",
        email: item.email || "",
        phone: item.phone || "",
        username: item.username || item.user || "",
        profileImageUrl: resolveFavoriteProfileImageUrl(
          item.profileImageUrl,
          item.platform || item.PLATFORM || null,
        ),
        isFavorite: item.isFavorite === true,
        originType: item.originType || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    const favorites = await Promise.all(
      Array.from(uniqueByMarker.values()).map(async (item) => {
        // Prefer current Client data when available to avoid stale/legacy rows.
        const client = item.userId ? await getClient(item.userId) : null;
        if (!client) return item;

        return {
          ...item,
          name: client.name || client.nombre || item.name || "",
          lastName: client.lastName || client.apellido || item.lastName || "",
          email: client.email || item.email || "",
          phone: client.phone || client.phoneNumber || item.phone || "",
          username: client.user || item.username || "",
          profileImageUrl: resolveFavoriteProfileImageUrl(
            client.fotoPerfilUrl || item.profileImageUrl || "",
            client.PLATFORM || client.platform || null,
          ),
        };
      }),
    );

    return jsonResponse(200, {
      userId,
      count: favorites.length,
      favorites,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};
