const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const PROFILE_BUCKET = process.env.PROFILE_BUCKET || "doeventprofileimagesbucket";
const PROFILE_BUCKET_REGION = process.env.PROFILE_BUCKET_REGION || "us-east-1";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveUserProfileImageUrl = (fotoPerfilUrl, platform) => {
  if (!fotoPerfilUrl) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }

  try {
    const s3Client = PROFILE_BUCKET_REGION && PROFILE_BUCKET_REGION !== process.env.AWS_REGION
      ? new AWS.S3({ region: PROFILE_BUCKET_REGION })
      : s3;
    return s3Client.getSignedUrl("getObject", {
      Bucket: PROFILE_BUCKET,
      Key: fotoPerfilUrl,
      Expires: 3600,
    });
  } catch (error) {
    const key = String(fotoPerfilUrl || "").replace(/^\/+/, "");
    if (key && !isHttpUrl(key)) {
      const regionHost = PROFILE_BUCKET_REGION === "us-east-1"
        ? "s3.amazonaws.com"
        : `s3.${PROFILE_BUCKET_REGION}.amazonaws.com`;
      return `https://${PROFILE_BUCKET}.${regionHost}/${key}`;
    }
    return fotoPerfilUrl;
  }
};

/**
 * Función para buscar usuarios por coincidencia de caracteres
 * Busca en los campos: user, email, nombre, apellido
 * - Case-insensitive (no distingue mayúsculas/minúsculas)
 * - Busca coincidencias parciales en cualquier parte del texto
 * - Si empieza con @, busca solo en el campo user (sin el @)
 */
// QA: paginación completa del scan + CORS
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

exports.searchUsers = async (event) => {
  let response;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    // Obtener el término de búsqueda de los query parameters
    const searchTerm =
      event.queryStringParameters?.q || event.queryStringParameters?.search;

    if (!searchTerm || searchTerm.trim() === "") {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          statusDesc: "El término de búsqueda es obligatorio",
          statusCode: 400,
        }),
      };
    }

    const normalizeHandle = (value) =>
      String(value || "").toLowerCase().replace(/[\s@._-]+/g, "");

    // Detectar si la búsqueda es solo por username (empieza con @)
    const isUsernameSearch = searchTerm.startsWith("@");
    const cleanSearchTerm = isUsernameSearch
      ? searchTerm.substring(1).trim()
      : searchTerm.trim();

    // Normalizar a minúsculas para búsqueda case-insensitive
    const normalizedSearchTerm = cleanSearchTerm.toLowerCase();

    if (normalizedSearchTerm === "") {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          statusDesc: "El término de búsqueda es obligatorio",
          statusCode: 400,
        }),
      };
    }

    const tableName = process.env.CLIENT_TABLE || "Client";
    const projection = {
      ProjectionExpression:
        "id, #user, email, nombre, apellido, fotoPerfilUrl, platform, phone, phoneNumber, indicativo",
      ExpressionAttributeNames: {
        "#user": "user",
      },
    };

    let allItems = [];
    let lastEvaluatedKey;
    do {
      const page = await dynamodb
        .scan({
          TableName: tableName,
          ...projection,
          ExclusiveStartKey: lastEvaluatedKey,
        })
        .promise();
      allItems = allItems.concat(page.Items || []);
      lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    const compactSearch = normalizeHandle(cleanSearchTerm);

    const filteredUsers = allItems.filter((user) => {
      const username = (user.user || "").toLowerCase();
      const compactUsername = normalizeHandle(user.user);
      const email = (user.email || "").toLowerCase();
      const emailLocal = email.split("@")[0] || "";
      const compactEmailLocal = normalizeHandle(emailLocal);
      const nombre = (user.nombre || "").toLowerCase();
      const apellido = (user.apellido || "").toLowerCase();
      const fullName = `${nombre} ${apellido}`.trim();
      const phone = String(user.phone || user.phoneNumber || "").replace(/\D/g, "");
      const searchDigits = cleanSearchTerm.replace(/\D/g, "");
      const id = String(user.id || "").toLowerCase();

      if (isUsernameSearch) {
        return (
          username.includes(normalizedSearchTerm)
          || (compactSearch.length > 0 && compactUsername.includes(compactSearch))
          || emailLocal.includes(normalizedSearchTerm)
          || (compactSearch.length > 0 && compactEmailLocal.includes(compactSearch))
        );
      }

      return (
        username.includes(normalizedSearchTerm)
        || (compactSearch.length > 0 && compactUsername.includes(compactSearch))
        || email.includes(normalizedSearchTerm)
        || emailLocal.includes(normalizedSearchTerm)
        || (compactSearch.length > 0 && compactEmailLocal.includes(compactSearch))
        || nombre.includes(normalizedSearchTerm)
        || apellido.includes(normalizedSearchTerm)
        || fullName.includes(normalizedSearchTerm)
        || id.includes(normalizedSearchTerm)
        || (searchDigits.length >= 4 && phone.includes(searchDigits))
      );
    });

    // Si no hay resultados
    if (filteredUsers.length === 0) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          users: [],
          count: 0,
          message: "No se encontraron usuarios que coincidan con la búsqueda",
          searchTerm: searchTerm,
        }),
      };
    }

    // Procesar los resultados para agregar URLs firmadas de las fotos de perfil
    const usersWithSignedUrls = await Promise.all(
      filteredUsers.map(async (user) => {
        const handle = String(user.user || "").trim();
        const userResponse = {
          id: user.id,
          user: handle,
          username: handle.replace(/^@/, ""),
          email: user.email || "",
          nombre: user.nombre || "",
          apellido: user.apellido || "",
          nombreCompleto: `${user.nombre || ""} ${user.apellido || ""}`.trim(),
          fotoPerfilUrl: null,
          platform: user.platform || null,
          phone: user.phone || user.phoneNumber || null,
          indicativo: user.indicativo || null,
        };

        if (user.fotoPerfilUrl) {
          userResponse.fotoPerfilUrl = resolveUserProfileImageUrl(
            user.fotoPerfilUrl,
            user.platform,
          );
          userResponse.imagen = userResponse.fotoPerfilUrl;
        }

        return userResponse;
      }),
    );

    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        users: usersWithSignedUrls,
        count: usersWithSignedUrls.length,
        searchTerm: searchTerm,
        isUsernameSearch: isUsernameSearch,
      }),
    };
  } catch (error) {
    console.error("Error al buscar usuarios:", error);

    response = {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        statusDesc: "Error interno del servidor al buscar usuarios",
        statusCode: 500,
        error: error.message,
      }),
    };
  }

  return response;
};
