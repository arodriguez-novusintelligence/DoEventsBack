const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Configurar clientes de AWS SDK v3
const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const PROFILE_IMAGES_BUCKET = "doeventprofileimagesbucket";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveUserProfileImageUrl = async (fotoPerfilUrl, platform) => {
  if (!fotoPerfilUrl) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: PROFILE_IMAGES_BUCKET,
      Key: fotoPerfilUrl,
    });

    return await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });
  } catch (err) {
    return fotoPerfilUrl;
  }
};

// Nombres de las tablas
const EVENT_CALIFICATION_TABLE = "EventCalification";
const CLIENT_TABLE = "Client"; // Para obtener información del usuario

/**
 * Obtiene información básica del usuario (nombre, imagen de perfil, etc.)
 * @param {string} userId - ID del usuario
 * @returns {Object} - Información del usuario o datos por defecto
 */
const getUserInfo = async (userId) => {
  try {
    const command = new GetCommand({
      TableName: CLIENT_TABLE,
      Key: { id: userId },
      ProjectionExpression:
        "nombre, apellido, imagenPerfil, email, platform, fotoPerfilUrl",
    });

    const { Item } = await dynamodb.send(command);

    if (Item) {
      const profileImage = await resolveUserProfileImageUrl(
        Item.fotoPerfilUrl,
        Item.PLATFORM || Item.platform || "",
      );

      return {
        id: userId,
        name: `${Item.nombre || ""} ${Item.apellido || ""}`.trim() || "Usuario",
        profileImage: profileImage,
        email: Item.email || null,
      };
    }
  } catch (error) {
    console.error(`Error obteniendo información del usuario ${userId}:`, error);
  }

  // Retornar datos por defecto si no se encuentra el usuario
  return {
    id: userId,
    name: "Usuario",
    profileImage: null,
    email: null,
  };
};

/**
 * Procesa las calificaciones para incluir información del usuario
 * @param {Array} califications - Array de calificaciones
 * @returns {Array} - Calificaciones con información del usuario
 */
const enrichCalificationsWithUserInfo = async (califications) => {
  const enrichedCalifications = await Promise.all(
    califications.map(async (calification) => {
      const userInfo = await getUserInfo(calification.userId);

      return {
        id: calification.id,
        eventId: calification.eventId,
        userId: calification.userId,
        rating: calification.rating,
        comment: calification.comment,
        createdAt: calification.createdAt,
        updatedAt: calification.updatedAt,
        user: userInfo,
      };
    })
  );

  return enrichedCalifications;
};

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters;

    // Parámetros de consulta para paginación
    const queryStringParameters = event.queryStringParameters || {};
    const limit = parseInt(queryStringParameters.limit) || 50; // Por defecto 50
    const lastEvaluatedKey = queryStringParameters.nextToken
      ? JSON.parse(
          Buffer.from(queryStringParameters.nextToken, "base64").toString(
            "utf-8"
          )
        )
      : null;

    // Validación de entrada
    if (!eventId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "eventId es obligatorio.",
        }),
      };
    }

    // Validar límite
    if (limit < 1 || limit > 100) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El límite debe ser entre 1 y 100.",
        }),
      };
    }

    // --- Consultar calificaciones del evento ---
    const command = new QueryCommand({
      TableName: EVENT_CALIFICATION_TABLE,
      IndexName: "eventIdIndex", // Índice secundario por eventId
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
      ScanIndexForward: false, // Ordenar por fecha descendente (más recientes primero)
      Limit: limit,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
    });

    const result = await dynamodb.send(command);

    // --- Enriquecer con información del usuario ---
    const enrichedCalifications = await enrichCalificationsWithUserInfo(
      result.Items || []
    );

    // --- Calcular estadísticas ---
    const statsCommand = new QueryCommand({
      TableName: EVENT_CALIFICATION_TABLE,
      IndexName: "eventIdIndex",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
      ProjectionExpression: "rating",
    });

    const statsResult = await dynamodb.send(statsCommand);
    const allRatings = statsResult.Items || [];

    let stats = {
      totalCalifications: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };

    if (allRatings.length > 0) {
      stats.totalCalifications = allRatings.length;

      // Calcular promedio
      const totalRating = allRatings.reduce(
        (sum, item) => sum + item.rating,
        0
      );
      stats.averageRating =
        Math.round((totalRating / allRatings.length) * 10) / 10;

      // Calcular distribución de calificaciones
      allRatings.forEach((item) => {
        const rating = Math.floor(item.rating);
        if (rating >= 1 && rating <= 5) {
          stats.ratingDistribution[rating]++;
        }
      });
    }

    // --- Preparar respuesta ---
    const response = {
      success: true,
      data: {
        califications: enrichedCalifications,
        pagination: {
          count: enrichedCalifications.length,
          limit: limit,
          hasMore: !!result.LastEvaluatedKey,
          nextToken: result.LastEvaluatedKey
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString(
                "base64"
              )
            : null,
        },
        stats: stats,
      },
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error al obtener las calificaciones del evento:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor.",
        error: error.message,
      }),
    };
  }
};
