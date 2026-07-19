const AWS = require("aws-sdk");
const jwt = require("jsonwebtoken");
const jwksRsa = require("jwks-rsa");
const bcrypt = require("bcryptjs");
const { v4 } = require("uuid");
const {
  isClientAccountBlocked,
  isEmailBlacklisted,
  buildBlacklistHttpResponse,
} = require("./blacklistUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const JWT_SECRET = process.env.JWT_SECRET;
const APPLE_SERVICES_ID = process.env.APPLE_SERVICES_ID || process.env.APPLE_CLIENT_ID;
const APPLE_CALLBACK_LANDING_URL = process.env.APPLE_CALLBACK_LANDING_URL || "https://doeventsapp.com/apple-callback";

const jwksAppleClient = jwksRsa({
  jwksUri: "https://appleid.apple.com/auth/keys",
  timeout: 30000,
});

/**
 * Sincroniza el nuevo usuario con FavoriteUsers
 * Busca por email o phone usuarios manuales y los actualiza a usuarios registrados
 */
async function syncWithFavoriteUsers(userId, email, phone, userData) {
  try {
    console.log(
      `🔄 Verificando si ${email} o ${phone} existen en FavoriteUsers...`,
    );

    const usersToUpdate = [];

    // 1. Buscar por EMAIL en FavoriteUsers usando GSI-email
    if (email) {
      try {
        const emailQuery = await dynamodb
          .query({
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            IndexName: "GSI-email",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: {
              ":email": email,
            },
          })
          .promise();

        if (emailQuery.Items && emailQuery.Items.length > 0) {
          console.log(
            `✅ Encontrados ${emailQuery.Items.length} registros con email ${email}`,
          );
          usersToUpdate.push(...emailQuery.Items);
        }
      } catch (error) {
        console.error(`❌ Error buscando por email en FavoriteUsers:`, error);
      }
    }

    // 2. Buscar por PHONE en FavoriteUsers usando GSI-phone
    if (phone && phone !== "n/a") {
      try {
        const phoneQuery = await dynamodb
          .query({
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            IndexName: "GSI-phone",
            KeyConditionExpression: "phone = :phone",
            ExpressionAttributeValues: {
              ":phone": phone,
            },
          })
          .promise();

        if (phoneQuery.Items && phoneQuery.Items.length > 0) {
          console.log(
            `✅ Encontrados ${phoneQuery.Items.length} registros con phone ${phone}`,
          );

          // Evitar duplicados (si ya se encontró por email)
          for (const item of phoneQuery.Items) {
            const exists = usersToUpdate.some(
              (u) =>
                u.userId === item.userId && u.favoriteId === item.favoriteId,
            );
            if (!exists) {
              usersToUpdate.push(item);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error buscando por phone en FavoriteUsers:`, error);
      }
    }

    // 3. Actualizar todos los registros encontrados
    if (usersToUpdate.length > 0) {
      console.log(
        `🔄 Actualizando ${usersToUpdate.length} registros en FavoriteUsers...`,
      );

      const updatePromises = usersToUpdate.map(async (favoriteUser) => {
        try {
          const updateParams = {
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            Key: {
              userId: favoriteUser.userId,
              favoriteId: favoriteUser.favoriteId,
            },
            UpdateExpression: `SET 
              invitedUserId = :invitedUserId,
              #name = :name,
              lastName = :lastName,
              email = :email,
              phone = :phone,
              username = :username,
              profileImageUrl = :profileImageUrl,
              originType = :originType,
              updatedAt = :updatedAt`,
            ExpressionAttributeNames: {
              "#name": "name",
            },
            ExpressionAttributeValues: {
              ":invitedUserId": userId,
              ":name": userData.name,
              ":lastName": userData.lastName,
              ":email": userData.email,
              ":phone": userData.phone,
              ":username": userData.user,
              ":profileImageUrl": userData.fotoPerfilUrl || "",
              ":originType": "REGISTERED",
              ":updatedAt": new Date().toISOString(),
            },
          };

          await dynamodb.update(updateParams).promise();

          console.log(
            `✅ Actualizado FavoriteUsers: userId=${favoriteUser.userId}, favoriteId=${favoriteUser.favoriteId}`,
          );
        } catch (error) {
          console.error(
            `❌ Error actualizando favoriteId ${favoriteUser.favoriteId}:`,
            error,
          );
        }
      });

      await Promise.all(updatePromises);
      console.log(
        `✅ Sincronización con FavoriteUsers completada (${usersToUpdate.length} actualizados)`,
      );
    } else {
      console.log(
        `ℹ️ No se encontraron registros en FavoriteUsers para sincronizar`,
      );
    }
  } catch (error) {
    console.error(`❌ Error general en syncWithFavoriteUsers:`, error);
    // No lanzamos el error para no interrumpir la creación del usuario
  }
}

/*Tipología errores 
Exitoso = 0,
Credenciales erradas = 1,
OTP no validada = 2,
Gustos no registrados = 3,*/

exports.handler = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body);
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Email y contraseña son obligatorios",
          data: { codigoRespuesta: 1 },
        }),
      };
    }

    const clientParams = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "EmailIndex",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": normalizedEmail,
      },
    };

    let clientResult = await dynamodb.query(clientParams).promise();

    // Fallback para registros antiguos con email en mayúsculas
    if (clientResult.Items.length === 0 && email !== normalizedEmail) {
      const legacyParams = {
        ...clientParams,
        ExpressionAttributeValues: { ":email": email },
      };
      clientResult = await dynamodb.query(legacyParams).promise();
    }

    if (clientResult.Items.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          message: "Credenciales inválidas",
          data: { codigoRespuesta: 1 },
        }),
      };
    }

    const user = clientResult.Items.length > 1
      ? [...clientResult.Items].sort((a, b) => {
        const rank = (item) => {
          const role = String(item.platformRole || item.role || "user").toLowerCase();
          if (role === "admin") return 3;
          if (role === "support" || role === "operation") return 2;
          return 1;
        };
        const byRole = rank(b) - rank(a);
        if (byRole !== 0) return byRole;
        return String(b.updatedAt || b.createDate || "").localeCompare(String(a.updatedAt || a.createDate || ""));
      })[0]
      : clientResult.Items[0];

    if (isClientAccountBlocked(user)) {
      return buildBlacklistHttpResponse(403);
    }

    const blacklistCheck = await isEmailBlacklisted(dynamodb, normalizedEmail);
    if (blacklistCheck.blocked) {
      return buildBlacklistHttpResponse(403);
    }

    // Validar la contraseña
    if (user.password !== password) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          success: false,
          message: "Contraseña incorrecta",
          data: { codigoRespuesta: 1 },
        }),
      };
    }

    if (user.userStatus !== "active") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "Usuario inactivo y OTP no validada",
          data: {
            codigoRespuesta: 2,
            userId: user.id,
            phone: user.phone,
            email: user.email,
          },
        }),
      };
    }

    const preferencesParams = {
      TableName: process.env.USER_PREFERENCES_TABLE || "UserPreferences",
      KeyConditionExpression: "UserId = :UserId",
      ExpressionAttributeValues: {
        ":UserId": user.id,
      },
    };

    const preferencesResult = await dynamodb.query(preferencesParams).promise();

    if (preferencesResult.Items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message:
            "El usuario no tiene preferencias guardadas, debe seleccionar una preferencia para iniciar sesión",
          data: { codigoRespuesta: 3, userId: user.id },
        }),
      };
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Inicio de sesión exitoso",

        data: {
          token,
          user: {
            userId: user.id,
            email: user.email,
            userStatus: user.userStatus,
            platformRole: String(user.platformRole || user.role || "user").toLowerCase(),
          },
          codigoRespuesta: 0,
        },
      }),
    };
  } catch (error) {
    console.error("Error en la función de inicio de sesión:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        data: [],
        error: error.message,
      }),
    };
  }
};

exports.googleAuth = async (event) => platformOAuthAuth(event, "GOOGLE");

exports.facebookAuth = async (event) => {
  try {
    const parsed = JSON.parse(event.body || "{}");
    const code = parsed?.data?.code;
    const redirectUri = parsed?.data?.redirectUri;
    if (code && redirectUri) {
      return facebookOAuthWithCode(code, redirectUri);
    }
  } catch (error) {
    console.error("facebookAuth parse:", error);
  }
  return platformOAuthAuth(event, "FACEBOOK");
};

async function facebookOAuthWithCode(code, redirectUri) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Facebook App Secret no configurado en el servidor",
        data: [],
      }),
    };
  }

  try {
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: tokenData.error?.message || "No se pudo obtener token de Facebook",
          data: [],
        }),
      };
    }

    const profileUrl = new URL("https://graph.facebook.com/v21.0/me");
    profileUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
    profileUrl.searchParams.set("access_token", tokenData.access_token);
    const profileRes = await fetch(profileUrl.toString());
    const profile = await profileRes.json();
    if (!profileRes.ok || profile.error) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: profile.error?.message || "No se pudo leer perfil Facebook",
          data: [],
        }),
      };
    }

    const nameParts = (profile.name || "").trim().split(/\s+/);
    return platformOAuthAuth(
      {
        body: JSON.stringify({
          data: {
            user: {
              id: profile.id,
              email: profile.email || "",
              name: profile.name || profile.email || profile.id,
              givenName: nameParts[0] || profile.name || "",
              familyName: nameParts.slice(1).join(" "),
              photo: profile.picture?.data?.url || "",
            },
          },
        }),
      },
      "FACEBOOK",
    );
  } catch (error) {
    console.error("facebookOAuthWithCode:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno al autenticar con Facebook",
        data: [],
        error: error.message,
      }),
    };
  }
}

async function findClientsByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return [];

  const result = await dynamodb.query({
    TableName: process.env.CLIENT_TABLE || "Client",
    IndexName: "EmailIndex",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": normalizedEmail,
    },
  }).promise();

  return result.Items || [];
}

function isExternalOAuthPhoto(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  return /googleusercontent\.com|fbcdn\.net|graph\.facebook|appleid\.apple\.com|gravatar\.com/i.test(raw);
}

function shouldSyncOAuthProfilePhoto(user) {
  if (user?.fotoPerfilUpdatedAt) return false;
  const current = String(user?.fotoPerfilUrl || "").trim();
  return !current || isExternalOAuthPhoto(current);
}

async function syncOAuthProfilePhotoIfNeeded(user, oauthPhoto) {
  const photo = String(oauthPhoto || "").trim();
  if (!user?.id || !photo || !shouldSyncOAuthProfilePhoto(user)) {
    return user;
  }

  const now = new Date().toISOString();
  await dynamodb.update({
    TableName: process.env.CLIENT_TABLE || "Client",
    Key: { id: user.id },
    UpdateExpression: "SET fotoPerfilUrl = :photo, updatedAt = :now",
    ExpressionAttributeValues: {
      ":photo": photo,
      ":now": now,
    },
  }).promise();

  return { ...user, fotoPerfilUrl: photo, updatedAt: now };
}

async function linkOAuthToExistingClient(existing, { platform, platformUserId, fotoPerfilUrl }) {
  const now = new Date().toISOString();
  await dynamodb.update({
    TableName: process.env.CLIENT_TABLE || "Client",
    Key: { id: existing.id },
    UpdateExpression: "SET platform = :platform, authProvider = :platform, PLATFORM = :platform, platformUserId = :platformUserId, updatedAt = :now, fotoPerfilUrl = if_not_exists(fotoPerfilUrl, :photo)",
    ExpressionAttributeValues: {
      ":platform": platform,
      ":platformUserId": platformUserId,
      ":now": now,
      ":photo": fotoPerfilUrl || null,
    },
  }).promise();

  const refreshed = await dynamodb.get({
    TableName: process.env.CLIENT_TABLE || "Client",
    Key: { id: existing.id },
  }).promise();

  return refreshed.Item || existing;
}

function pickPreferredClientAccount(accounts) {
  return [...accounts].sort((a, b) => {
    const score = (user) => {
      let s = 0;
      const role = String(user.platformRole || user.role || '').toLowerCase();
      if (role === 'admin') s += 1000;
      if (user.fotoPerfilUrl) s += 500;
      if (user.name || user.nombre) s += 200;
      if (user.profileCover || user.coverImageUrl) s += 100;
      if (user.password) s += 50;
      const ts = String(user.updatedAt || user.createDate || '');
      return s + (ts ? Date.parse(ts) / 1e15 : 0);
    };
    return score(b) - score(a);
  })[0];
}

async function platformOAuthAuth(event, platform) {
  const { data } = JSON.parse(event.body);
  const rquid = v4();
  const userID = rquid.substring(0, 10);
  const normalizedEmail = (data.user.email || "").trim().toLowerCase();

  const newUserOAuth = {
    userStatus: "active",
    rquid: rquid,
    id: userID,
    name: data.user.givenName,
    lastName: data.user.familyName,
    fotoPerfilUrl: data.user.photo,
    platform,
    authProvider: platform,
    platformUserId: data.user.id,
    date: "",
    phone: data.phone || "n/a",
    phoneNumber: data.phoneNumber || null,
    countryCode: data.countryCode || null,
    indicativo: data.countryCode ? data.countryCode.replace("+", "") : "",
    email: normalizedEmail,
    user: data.user.name,
    createDate: Date.now(),
    isPublicProfile: true,
  };

  try {
    const platformUserIdItsExist = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "PlatformUserIdIndex",
      KeyConditionExpression: "platformUserId = :platformUserId",
      ExpressionAttributeValues: {
        ":platformUserId": newUserOAuth.platformUserId,
      },
    };

    const findUserByPlatformUserId = await exports.findUserByParam(
      platformUserIdItsExist,
    );

    if (
      findUserByPlatformUserId.Items.length > 0 &&
      findUserByPlatformUserId.Items[0].platform &&
      findUserByPlatformUserId.Items[0].platform === platform
    ) {
      const syncedUser = await syncOAuthProfilePhotoIfNeeded(
        findUserByPlatformUserId.Items[0],
        data.user.photo,
      );
      return await exports.loginUserByOthersPlatform(syncedUser);
    }

    if (findUserByPlatformUserId.Items.length === 0) {
      const blacklistCheck = await isEmailBlacklisted(dynamodb, normalizedEmail);
      if (blacklistCheck.blocked) {
        return buildBlacklistHttpResponse(403);
      }

      const existingByEmail = await findClientsByEmail(normalizedEmail);
      if (existingByEmail.length > 0) {
        const existing = pickPreferredClientAccount(existingByEmail);
        const linked = await linkOAuthToExistingClient(existing, newUserOAuth);
        const syncedUser = await syncOAuthProfilePhotoIfNeeded(linked, data.user.photo);
        return await exports.loginUserByOthersPlatform(syncedUser);
      }

      await dynamodb
        .put({
          TableName: process.env.CLIENT_TABLE || "Client",
          Item: newUserOAuth,
        })
        .promise();

      await syncWithFavoriteUsers(
        newUserOAuth.id,
        newUserOAuth.email,
        newUserOAuth.phone,
        {
          name: newUserOAuth.name,
          lastName: newUserOAuth.lastName,
          email: newUserOAuth.email,
          phone: newUserOAuth.phone,
          user: newUserOAuth.user,
          fotoPerfilUrl: newUserOAuth.fotoPerfilUrl,
        },
      );

      return await exports.loginUserByOthersPlatform(newUserOAuth);
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: "Internal Server Error In Save DB user",
        data: err,
      }),
    };
  }
};

exports.appleAuth = async (event) => {
  // CREATE NEW UID
  const rquid = v4();

  // GENERATE USER ID
  const userID = rquid.substring(0, 10);

  // PARSE BODY REQUEST
  const { data } = JSON.parse(event.body);

  // CREATE PARAMS TO SAVE USER
  // Extraer país/indicativo similar a Google Auth
  // Si viene en data.phone, usarlo; si no, "n/a"
  // Si viene data.countryCode, usarlo; si no, dejar vacío
  const normalizedAppleEmail = (data.email || "").trim().toLowerCase();

  const newUserAppleAuth = {
    userStatus: "active",
    rquid: rquid,
    id: userID,
    name: data.fullName.givenName,
    lastName: data.fullName.familyName || data.fullName.givenName,
    fotoPerfilUrl: "",
    platform: "APPLE",
    authProvider: "APPLE",
    platformUserId: data.user,
    date: "",
    phone: data.phone || "n/a", // Aceptar teléfono si viene
    phoneNumber: data.phoneNumber || null, // Teléfono sin indicativo
    countryCode: data.countryCode || null, // Indicativo (+57, +1, etc)
    indicativo: data.countryCode ? data.countryCode.replace("+", "") : "", // Guardar indicativo sin símbolo
    email: normalizedAppleEmail,
    user: data.fullName.givenName || data.email.split("@")[0],
    createDate: Date.now(),
    isPublicProfile: true,
  };

  try {
    // CREATE QUERY SEARCH USER BY PLATFORM USER ID
    const platformUserIdItsExist = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "PlatformUserIdIndex",
      KeyConditionExpression: "platformUserId = :platformUserId",
      ExpressionAttributeValues: {
        ":platformUserId": newUserAppleAuth.platformUserId,
      },
    };

    // VERIFY USER IST EXIST BY PLATFORM USER ID
    const findUserByPlatformUserId = await exports.findUserByParam(
      platformUserIdItsExist,
    );

    // VERIFY THIS USER FIND ITS REGISTER PLATFORM USER ID - LOGIN SUCCESS
    if (
      findUserByPlatformUserId.Items.length > 0 &&
      findUserByPlatformUserId.Items[0].platform &&
      findUserByPlatformUserId.Items[0].platform === "APPLE"
    ) {
      const validateUserByLogin = await exports.loginUserByOthersPlatform(
        findUserByPlatformUserId.Items[0],
      );

      // RETURN RESPONSE REQUEST
      return validateUserByLogin;
    }

    // REGISTER USER BY ITEMS ITS LENGTH 0
    if (findUserByPlatformUserId.Items.length === 0) {
      const blacklistCheck = await isEmailBlacklisted(dynamodb, normalizedAppleEmail);
      if (blacklistCheck.blocked) {
        return buildBlacklistHttpResponse(403);
      }

      const existingByEmail = await findClientsByEmail(normalizedAppleEmail);
      if (existingByEmail.length > 0) {
        const existing = pickPreferredClientAccount(existingByEmail);
        const linked = await linkOAuthToExistingClient(existing, newUserAppleAuth);
        return await exports.loginUserByOthersPlatform(linked);
      }

      // SAVE NEW USER IN DB
      await dynamodb
        .put({
          TableName: process.env.CLIENT_TABLE || "Client",
          Item: newUserAppleAuth,
        })
        .promise();

      // Sincronizar con FavoriteUsers
      await syncWithFavoriteUsers(
        newUserAppleAuth.id,
        newUserAppleAuth.email,
        newUserAppleAuth.phone,
        {
          name: newUserAppleAuth.name,
          lastName: newUserAppleAuth.lastName,
          email: newUserAppleAuth.email,
          phone: newUserAppleAuth.phone,
          user: newUserAppleAuth.user,
          fotoPerfilUrl: newUserAppleAuth.fotoPerfilUrl,
        },
      );

      const validateUserByLogin =
        await exports.loginUserByOthersPlatform(newUserAppleAuth);

      // RETURN RESPONSE REQUEST
      return validateUserByLogin;
    }
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: "Internal Server Error In Save DB user",
        data: err,
      }),
    };
  }
};

exports.findUserByParam = async (param) => {
  return await dynamodb.query(param).promise();
};

exports.loginUserByOthersPlatform = async (user) => {
  try {
    if (isClientAccountBlocked(user)) {
      return buildBlacklistHttpResponse(403);
    }

    const blacklistCheck = await isEmailBlacklisted(dynamodb, user.email);
    if (blacklistCheck.blocked) {
      return buildBlacklistHttpResponse(403);
    }

    // PREPARE QUERY FIND USER BY PREFERENCE
    const paramsUserByPreference = {
      TableName: process.env.USER_PREFERENCES_TABLE || "UserPreferences",
      KeyConditionExpression: "UserId = :UserId",
      ExpressionAttributeValues: {
        ":UserId": user.id,
      },
    };

    // FIND USER BY PREFERENCE COLLECTION
    const findUserByPreference = await exports.findUserByParam(
      paramsUserByPreference,
    );

    // RETURN USER NOT PREFERENCE REGISTER - CODE 3
    if (findUserByPreference.Items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message:
            "El usuario no tiene preferencias guardadas, debe seleccionar una preferencia para iniciar sesión",
          data: { codigoRespuesta: 3, userId: user.id },
        }),
      };
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Inicio de sesión exitoso",

        data: {
          token,
          user: {
            userId: user.id,
            email: user.email,
            userStatus: user.userStatus,
            platformRole: String(user.platformRole || user.role || "user").toLowerCase(),
          },
          codigoRespuesta: 0,
        },
      }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: "Internal Server Error I Auth User",
        data: err,
      }),
    };
  }
};

// PARSE APPLE CALLBACK BODY
const parseAppleCallbackBody = (event) => {

  // GET METHOD IS GET
  const method = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || "GET";
  
  console.log("method parseAppleCallbackBody event", event);

  // VERIFY METHOD IS POST AND BODY IS REQUIRED
  const isPost = method === "POST" && event.body;

  console.log("isPost parseAppleCallbackBody", isPost);

  // VERIFY METHOD IS POST AND BODY IS REQUIRED
  if (isPost) {

    // GET HEADERS
    const headers = event.headers || {};

    // GET CONTENT TYPE
    const contentType = headers["Content-Type"] || headers["content-type"] || "";

    // BODY: API Gateway puede enviar el body en Base64 (isBase64Encoded: true)
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    // CREATE DATA OBJECT
    let data = {};

    // VERIFY CONTENT TYPE IS APPLICATION/X-WWW-FORM-URLENCODED
    if (contentType.includes("application/x-www-form-urlencoded")) {

      // CREATE PARAMS (usar rawBody ya decodificado)
      const params = new URLSearchParams(rawBody);

      console.log("params parseAppleCallbackBody urlencoded", params);
      
      // CREATE DATA OBJECT
      data = {
        code: params.get("code") || undefined,
        id_token: params.get("id_token") || undefined,
        user: params.get("user") || undefined,
        state: params.get("state") || undefined,
        name: params.get("name") || undefined,
        email: params.get("email") || undefined,
      };
      
    } else if (contentType.includes("application/json")) {

      // PARSE JSON BODY (usar rawBody ya decodificado)
      const parsed = JSON.parse(rawBody);

      console.log("parsed parseAppleCallbackBody json", parsed);

      // CREATE DATA OBJECT
      data = {
        code: parsed.code,
        id_token: parsed.id_token,
        user: parsed.user,
        state: parsed.state,
        name: parsed.name,
        email: parsed.email,
      };
    }

    console.log("data parseAppleCallbackBody final", data);

    return data;
  }

  // GET QUERY STRING PARAMETERS
  const q = event.queryStringParameters || {};
  
  // CREATE DATA OBJECT WITH QUERY STRING PARAMETERS
  return {
    code: q.code,
    id_token: q.id_token,
    user: q.user,
    state: q.state,
    name: q.name,
    email: q.email,
  };
}

const verifyAppleIdToken = async (idToken) => {
  // VERIFY ID TOKEN IS REQUIRED
  if (!idToken) {
    throw new Error("ID TOKEN IS REQUIRED");
  }

  // DECODE ID TOKEN
  const decoded = jwt.decode(idToken, { complete: true });

  // VERIFY DECODED ID TOKEN IS REQUIRED
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error("id_token inválido");
  }

  // GET SIGNING KEY
  const key = await jwksAppleClient.getSigningKey(decoded.header.kid);

  // GET PUBLIC KEY
  const signingKey = key.getPublicKey();

  // CREATE OPTIONS FOR VERIFY ID TOKEN
  const options = {
    algorithms: ["RS256"],
    issuer: "https://appleid.apple.com",
  };

  // VERIFY APPLE SERVICES ID IS REQUIRED
  if (APPLE_SERVICES_ID) {
    options.audience = APPLE_SERVICES_ID;
  }

  // VERIFY ID TOKEN
  const payload = jwt.verify(idToken, signingKey, options);

  // RETURN PAYLOAD
  return payload;
}

// REDIRECT TO LANDING
const redirectToLanding = (params) => {
  let queryString;
  if (typeof params === "string") {
    queryString = params;
  } else {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""));
    queryString = new URLSearchParams(clean).toString();
  }
  const url = queryString ? `${APPLE_CALLBACK_LANDING_URL}?${queryString}` : APPLE_CALLBACK_LANDING_URL;
  return {
    statusCode: 302,
    headers: { Location: url },
    body: "",
  };
};

exports.appleCallback = async (event) => {
  try {
    const params = parseAppleCallbackBody(event);
    const { id_token: idToken, user: appleUserFromForm, name: nameFromForm, email: emailFromForm } = params;

    if (!idToken) {
      console.warn("appleCallback: id_token ausente");
      return redirectToLanding({ success: "false", codigoRespuesta: "1" });
    }

    let payload;
    try {
      payload = await verifyAppleIdToken(idToken);
    } catch (err) {
      console.error("appleCallback: error validando id_token", err);
      return redirectToLanding({ success: "false", codigoRespuesta: "1" });
    }

    const platformUserId = payload.sub;
    const email = payload.email || emailFromForm || "";
    let givenName = "";
    let familyName = "";

    if (nameFromForm) {
      try {
        const nameObj = typeof nameFromForm === "string" ? JSON.parse(nameFromForm) : nameFromForm;
        const namePart = nameObj.name || nameObj;
        givenName = namePart.firstName || namePart.givenName || "";
        familyName = namePart.lastName || namePart.familyName || namePart.givenName || "";
      } catch (_) {
        givenName = nameFromForm;
      }
    }

    const newUserAppleAuth = {
      userStatus: "active",
      rquid: v4(),
      id: v4().substring(0, 10),
      name: givenName || email.split("@")[0] || "Usuario",
      lastName: familyName || givenName || "Apple",
      fotoPerfilUrl: "",
      platform: "APPLE",
      platformUserId,
      date: "",
      phone: "n/a",
      phoneNumber: null,
      countryCode: null,
      indicativo: "",
      email: email || `apple-${platformUserId}@privaterelay.appleid.com`,
      user: givenName || email.split("@")[0] || platformUserId,
      createDate: Date.now(),
      isPublicProfile: true,
    };

    const normalizedCallbackEmail = (email || newUserAppleAuth.email || "").trim().toLowerCase();
    newUserAppleAuth.email = normalizedCallbackEmail || newUserAppleAuth.email;

    const platformUserIdQuery = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "PlatformUserIdIndex",
      KeyConditionExpression: "platformUserId = :platformUserId",
      ExpressionAttributeValues: { ":platformUserId": platformUserId },
    };

    const findUserByPlatformUserId = await exports.findUserByParam(platformUserIdQuery);

    console.log("findUserByPlatformUserId appleCallback", findUserByPlatformUserId);

    if (
      findUserByPlatformUserId.Items.length > 0 &&
      findUserByPlatformUserId.Items[0].platform === "APPLE"
    ) {
      const loginResult = await exports.loginUserByOthersPlatform(findUserByPlatformUserId.Items[0]);
      const body = JSON.parse(loginResult.body);
      const data = body.data || {};


      console.log("loginResult appleCallback", loginResult);


      // STRUCTURE OF LOGIN RESULT IS SUCCESS
      if (loginResult.statusCode === 200 && data.codigoRespuesta === 0) {
        return redirectToLanding({
          success: "true",
          codigoRespuesta: "0",
          userId: data.user.userId,
          token: data.token,
          email: data.user.email,
          userStatus: data.user.userStatus,
        });
      }

      // STRUCTURE OF LOGIN RESULT IS ERROR - USER NOT PREFERENCE REGISTER - CODE 3
      if (loginResult.statusCode === 400 && data.codigoRespuesta === 3 && data.userId) {
        return redirectToLanding({
          success: "false",
          codigoRespuesta: "3",
          userId: data.userId,
        });
      }

      // STRUCTURE OF LOGIN RESULT IS ERROR - UNKNOWN ERROR - CODE 1
      return redirectToLanding({ success: "false", codigoRespuesta: "1" });
    }

    // USER NOT FOUND - CREATE NEW USER
    if (findUserByPlatformUserId.Items.length === 0) {
      const blacklistCheck = await isEmailBlacklisted(dynamodb, newUserAppleAuth.email);
      if (blacklistCheck.blocked) {
        return redirectToLanding({ success: "false", codigoRespuesta: "1", reason: "blacklisted" });
      }

      const existingByEmail = await findClientsByEmail(newUserAppleAuth.email);
      if (existingByEmail.length > 0) {
        const existing = pickPreferredClientAccount(existingByEmail);
        const linked = await linkOAuthToExistingClient(existing, newUserAppleAuth);
        const loginResult = await exports.loginUserByOthersPlatform(linked);
        const body = JSON.parse(loginResult.body);
        const data = body.data || {};

        if (loginResult.statusCode === 200 && data.codigoRespuesta === 0) {
          return redirectToLanding({
            success: "true",
            codigoRespuesta: "0",
            userId: data.user.userId,
            token: data.token,
            email: data.user.email,
            userStatus: data.user.userStatus,
          });
        }
        if (loginResult.statusCode === 400 && data.codigoRespuesta === 3 && data.userId) {
          return redirectToLanding({
            success: "false",
            codigoRespuesta: "3",
            userId: data.userId,
          });
        }
        return redirectToLanding({ success: "false", codigoRespuesta: "1" });
      }

      // CREATE NEW USER IN DB
      await dynamodb.put({ TableName: process.env.CLIENT_TABLE || "Client", Item: newUserAppleAuth }).promise();

      await syncWithFavoriteUsers(
        newUserAppleAuth.id,
        newUserAppleAuth.email,
        newUserAppleAuth.phone,
        {
          name: newUserAppleAuth.name,
          lastName: newUserAppleAuth.lastName,
          email: newUserAppleAuth.email,
          phone: newUserAppleAuth.phone,
          user: newUserAppleAuth.user,
          fotoPerfilUrl: newUserAppleAuth.fotoPerfilUrl,
        }
      );

      const loginResult = await exports.loginUserByOthersPlatform(newUserAppleAuth);
      const body = JSON.parse(loginResult.body);
      const data = body.data || {};

      if (loginResult.statusCode === 200 && data.codigoRespuesta === 0) {
        return redirectToLanding({
          success: "true",
          codigoRespuesta: "0",
          userId: data.user.userId,
          token: data.token,
          email: data.user.email,
          userStatus: data.user.userStatus,
        });
      }
      if (loginResult.statusCode === 400 && data.codigoRespuesta === 3 && data.userId) {
        return redirectToLanding({
          success: "false",
          codigoRespuesta: "3",
          userId: data.userId,
        });
      }
    }

    return redirectToLanding({ success: "false", codigoRespuesta: "1" });
  } catch (err) {
    console.error("appleCallback: error", err);
    return redirectToLanding({ success: "false", codigoRespuesta: "1" });
  }
};
