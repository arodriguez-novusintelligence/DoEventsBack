const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const PROFILE_BUCKET = "doeventprofileimagesbucket";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const extractProfileS3Key = (imageValue) => {
  const rawValue = String(imageValue || "").trim();
  if (!rawValue) return null;

  if (!isHttpUrl(rawValue)) {
    return rawValue.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(rawValue);
    const host = parsed.host.toLowerCase();
    const cleanPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

    // Virtual-hosted style: bucket.s3.amazonaws.com/key or bucket.s3.us-east-1.amazonaws.com/key
    if (host === `${PROFILE_BUCKET}.s3.amazonaws.com` || host.startsWith(`${PROFILE_BUCKET}.s3.`)) {
      return cleanPath || null;
    }

    // Path-style: s3.amazonaws.com/bucket/key or s3.us-east-1.amazonaws.com/bucket/key
    if ((host === "s3.amazonaws.com" || host.startsWith("s3.")) && cleanPath.startsWith(`${PROFILE_BUCKET}/`)) {
      return cleanPath.substring(PROFILE_BUCKET.length + 1) || null;
    }
  } catch (_) {
    return null;
  }

  return null;
};

const getSignedProfileImageUrl = (imageValue) => {
  const s3Key = extractProfileS3Key(imageValue);
  if (!s3Key) {
    return imageValue || null;
  }

  try {
    return s3.getSignedUrl("getObject", {
      Bucket: PROFILE_BUCKET,
      Key: s3Key,
      Expires: 3600,
    });
  } catch (_) {
    return imageValue || null;
  }
};

const resolveProfileImageUrl = (imageValue, platform) => {
  if (!imageValue) return null;

  return getSignedProfileImageUrl(imageValue);
};

const parsePhoneNumber = (phone) => {
  if (!phone) return { countryCode: null, phoneNumber: null };

  const phoneStr = String(phone).replace(/[^0-9]/g, "");

  // Si empieza con 57 (Colombia) y tiene 12 dígitos
  if (phoneStr.startsWith("57") && phoneStr.length === 12) {
    return {
      countryCode: "57",
      phoneNumber: phoneStr.substring(2),
    };
  }

  // Si empieza con 1 (USA/Canada/Rep. Dominicana) y tiene 11 dígitos
  if (phoneStr.startsWith("1") && phoneStr.length === 11) {
    return {
      countryCode: "1",
      phoneNumber: phoneStr.substring(1),
    };
  }

  // RD local 10 dígitos (809/829/849) → +1
  if (phoneStr.length === 10 && /^(809|829|849)/.test(phoneStr)) {
    return {
      countryCode: "1",
      phoneNumber: phoneStr,
    };
  }

  // Si tiene 10 dígitos, asumir Colombia
  if (phoneStr.length === 10) {
    return {
      countryCode: "57",
      phoneNumber: phoneStr,
    };
  }

  // Caso genérico: intentar extraer código de país (2-3 dígitos)
  if (phoneStr.length > 10) {
    const countryCode = phoneStr.substring(0, phoneStr.length - 10);
    const phoneNumber = phoneStr.substring(phoneStr.length - 10);
    return { countryCode, phoneNumber };
  }

  // Si no se puede determinar, devolver todo como número
  return {
    countryCode: "57", // Default Colombia
    phoneNumber: phoneStr,
  };
};

function clientIdCandidates(raw) {
  const id = String(raw ?? "").trim();
  if (!id) return [];
  const candidates = [id];
  if (id.length === 36 && id.includes("-")) {
    const shortId = id.substring(0, 10);
    if (shortId !== id) candidates.push(shortId);
  }
  if (/^[a-f0-9]{8,10}-[a-z0-9]$/i.test(id)) {
    const base = id.split("-")[0];
    if (base && base !== id) candidates.push(base);
  }
  return [...new Set(candidates)];
}

function resolveClientDisplayName(client = {}) {
  return (
    client.user
    || [client.name, client.lastName].filter(Boolean).join(" ")
    || client.nombre
    || client.username
    || client.email
    || "Alguien"
  );
}

async function fetchClientById(userId) {
  const params = {
    TableName: process.env.CLIENT_TABLE || "Client",
    Key: { id: userId },
  };
  const res = await dynamodb.get(params).promise();
  return res.Item || null;
}

const getClientByUserId = async (userId, ownerId = null) => {
  // VALIDATE INPUT
  if (!userId) throw new Error("User ID is required");

  console.log(`🔍 Buscando usuario ${userId} en Client...`);

  for (const candidateId of clientIdCandidates(userId)) {
    const item = await fetchClientById(candidateId);
    if (item) {
      console.log(`✅ Usuario encontrado en Client (${candidateId})`);
      const { countryCode, phoneNumber } = parsePhoneNumber(item.phone);
      const resolvedProfileImageUrl = resolveProfileImageUrl(
        item.fotoPerfilUrl || item.profileImageUrl,
        item.platform || item.PLATFORM || null,
      );
      return {
        ...item,
        resolvedProfileImageUrl,
        countryCode,
        phoneNumber,
        fullPhone: item.phone,
      };
    }
  }

  // Si no está en Client y se provee ownerId, buscar en FavoriteUsers
  if (ownerId) {
    console.log(
      `❌ Usuario no encontrado en Client, buscando en FavoriteUsers con ownerId ${ownerId}...`
    );

    try {
      const favoriteParams = {
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Key: {
          userId: ownerId,
          favoriteId: userId,
        },
      };

      const favoriteRes = await dynamodb.get(favoriteParams).promise();

      if (favoriteRes.Item) {
        console.log(`✅ Usuario encontrado en FavoriteUsers`);
        const { countryCode, phoneNumber } = parsePhoneNumber(
          favoriteRes.Item.phone
        );
        const resolvedProfileImageUrl = resolveProfileImageUrl(
          favoriteRes.Item.profileImageUrl,
          favoriteRes.Item.platform || favoriteRes.Item.PLATFORM || null,
        );
        return {
          id: favoriteRes.Item.invitedUserId || favoriteRes.Item.favoriteId,
          name: favoriteRes.Item.name || "",
          lastName: favoriteRes.Item.lastName || "",
          email: favoriteRes.Item.email || "",
          phone: favoriteRes.Item.phone || "",
          countryCode,
          phoneNumber,
          fullPhone: favoriteRes.Item.phone,
          username: favoriteRes.Item.username || "",
          profileImageUrl: favoriteRes.Item.profileImageUrl || "",
          resolvedProfileImageUrl,
          originType: "FAVORITE_USER",
        };
      }
    } catch (error) {
      console.error(`Error buscando en FavoriteUsers:`, error.message);
    }
  }

  // HANDLE USER NOT FOUND
  console.log(`❌ Usuario ${userId} no encontrado en ninguna tabla`);
  throw new Error("User not found");
};

const getUserTokens = async (userId) => {
  // VALIDATE INPUT
  if (!userId) throw new Error("User ID is required");

  // BUILD PARAMS
  const params = {
    TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
  };

  try {
    // FETCH TOKENS FROM DATABASE
    const result = await dynamodb.query(params).promise();

    // MAP ITEMS TO TOKENS
    const token =
      result.Items && result.Items.length > 0 ? result.Items[0].token : null;

    // RETURN SUCCESS RESPONSE
    return token;
  } catch (err) {
    console.warn("⚠️ getUserTokens fallback (no token):", err && err.message);
    return null;
  }
};

module.exports = { getClientByUserId, getUserTokens, parsePhoneNumber, resolveClientDisplayName, clientIdCandidates };
