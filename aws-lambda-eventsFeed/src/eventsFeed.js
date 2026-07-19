const AWS = require("aws-sdk");

function stageSuffix() {
  const fn = process.env.AWS_LAMBDA_FUNCTION_NAME || "";
  if (fn.includes("-qa-")) return "-qa";
  if (fn.includes("-test-")) return "-test";
  return "";
}

function resolveTableName(envKey, fallbackBase) {
  const configured = process.env[envKey];
  const suffix = stageSuffix();
  if (configured && suffix && !configured.endsWith(suffix)) {
    const base = configured.replace(/-(qa|test)$/, "");
    return `${base}${suffix}`;
  }
  if (configured) return configured;
  return `${fallbackBase}${suffix}`;
}

const DYNAMODB_REGION =
  process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-1";
AWS.config.update({ region: DYNAMODB_REGION });

const dynamodb = new AWS.DynamoDB.DocumentClient({ region: DYNAMODB_REGION });
const s3 = new AWS.S3({ signatureVersion: "v4", region: DYNAMODB_REGION });

/* ---------- constantes de entorno ---------- */
const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";
const IMAGES_GSI = process.env.IMAGES_GSI || "eventIdIndex";
const FAV_TABLE = resolveTableName("FAV_TABLE", "userFavoriteEvents");
const DEVICE_TABLE = resolveTableName("DEVICE_TABLE", "DeviceData");
const PREFS_TABLE = resolveTableName("PREFS_TABLE", "UserPreferences");
const IMAGES_TABLE = resolveTableName(
  "IMAGES_TABLE",
  process.env.IMAGE_TABLE || process.env.imagesTable || "imagenes",
);
const EVENTS_TABLE = resolveTableName("EVENTS_TABLE", "Eventos");
const VENUES_TABLE = resolveTableName("VENUES_TABLE", "Venues");

const PRESIGN_TTL = 60 * 60; // 1 h

/* ---------- utilidades ---------- */
const hav = (la1, lo1, la2, lo2) => {
  if ([la1, lo1, la2, lo2].some((v) => v == null)) return 999;
  const R = 6371,
    rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(la2 - la1),
    dLon = rad(lo2 - lo1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
function toCoord(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const getLat = (e) =>
  toCoord(e?.lat ?? e?.latitude ?? e?.ubicacion?.latitude ?? e?.ubicacion?.lat);
const getLon = (e) =>
  toCoord(
    e?.lon ?? e?.longitude ?? e?.lng ?? e?.ubicacion?.longitude ?? e?.ubicacion?.lng,
  );

const DISCOVER_EVENT_STATUSES = ["activo", "ejecucion", "en_ejecucion"];
const HIDDEN_EVENT_STATUSES = new Set([
  "deleted",
  "deactivated",
  "inactivo",
  "inactive",
  "borrador",
  "draft",
  "cancelado",
  "cancelled",
]);

function normalizeFechaIniKey(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{8}$/.test(raw)) return raw;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return `${yyyy}${mm.padStart(2, "0")}${dd.padStart(2, "0")}`;
  }
  const d = toDate(raw);
  if (!d || Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function todayKeyFromDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function shiftFechaKey(yyyyMMdd, deltaDays) {
  if (!/^\d{8}$/.test(String(yyyyMMdd || ""))) return yyyyMMdd;
  const y = Number(yyyyMMdd.slice(0, 4));
  const m = Number(yyyyMMdd.slice(4, 6)) - 1;
  const d = Number(yyyyMMdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return todayKeyFromDate(dt);
}

function isDiscoverableEvent(item, todayKey) {
  const status = String(item?.estatus || "").trim().toLowerCase();
  if (!DISCOVER_EVENT_STATUSES.includes(status)) return false;
  if (HIDDEN_EVENT_STATUSES.has(status) || item?.deletedAt) return false;
  const fechaIniKey = normalizeFechaIniKey(item?.fechaIni);
  if (!fechaIniKey) return false;
  // Multi-día: vigente mientras fechaFin (o fechaIni) >= hoy
  const fechaFinKey = normalizeFechaIniKey(item?.fechaFin) || fechaIniKey;
  return fechaFinKey >= todayKey;
}

const toDate = (v) => {
  if (!v) return null;
  if (typeof v === "number") return new Date(v);
  if (/^\d{8}$/.test(v))
    return new Date(
      `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}T00:00:00Z`,
    );
  const d = new Date(v);
  return isNaN(d) ? null : d;
};

// Función para validar si el userID es válido
const isValidUserID = (userID) => {
  return userID && typeof userID === "string" && userID.trim().length > 0;
};

//Categories no se esta utilizando para filtros
const W = (() => {
  // Pesos para score según contexto:
  // - interest: afinidad del usuario con la categoría
  // - distance: distancia al evento
  // - recency: antigüedad de la publicación
  // - starts: tiempo hasta inicio del evento
  // Se definen valores alto, bajo e intermedio para interest y distance
  return {
    interestHigh: 3.0,
    interestMedium: 2.0,
    interestLow: 1.0,
    distanceHigh: -0.2,
    distanceMedium: -0.12,
    distanceLow: -0.05,
    recency: -0.1,
    starts: -0.02,
  };
})();
const score = (e, ctx) => {
  const inter = ctx.pref.has(String(e.Categoria)) ? 1 : 0;
  const km = ctx.hasLocation ? hav(ctx.lat, ctx.lon, getLat(e), getLon(e)) : 0;
  const pub = toDate(e.publishDate);
  const start = toDate(e.startDate);
  const rec = pub ? (ctx.now - pub) / 86_400_000 : 0;
  const sIn = start ? (start - ctx.now) / 86_400_000 : 0;
  // Usar un peso mayor si userLocation viene en el request
  const distanceWeight = ctx.userLocationProvided
    ? W.distanceHigh
    : W.distanceLow;
  return (
    W.interest * inter +
    (ctx.hasLocation ? distanceWeight * km : 0) +
    W.recency * rec +
    W.starts * sIn
  );
};

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const json = (s, b) => ({
  statusCode: s,
  headers: CORS_HEADERS,
  body: JSON.stringify(b),
});

/* ---------- firma de imagen ---------- */
const signedUrl = async (id) => {
  const q = await dynamodb
    .query({
      TableName: IMAGES_TABLE,
      IndexName: IMAGES_GSI,
      KeyConditionExpression: "id_evento = :id",
      ExpressionAttributeValues: { ":id": id },
      ProjectionExpression: "imagenesCargadas",
      Limit: 1,
    })
    .promise();
  const img = q.Items?.[0]?.imagenesCargadas?.[0];
  if (!img) return "";
  const key = img.includes(".com/") ? img.split(".com/")[1] : img;
  return `https://${IMAGE_BUCKET}.s3.amazonaws.com/${key}`;
};

/* ====================== Funcion principal ====================== */
exports.handler = async (ev) => {
  if (ev.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  try {
    const body = ev.body ? JSON.parse(ev.body) : {};

    /* -------- parámetros entrada -------- */
    const {
      userID: rawUserID,
      offset = 0,
      limit = 50,
      category,
      type,
      maxDistanceKm = 500,
      fechaActual,
      userLocation = {},
    } = body;

    // Validar y limpiar userID - solo usar si es realmente válido
    const userID = isValidUserID(rawUserID) ? rawUserID.trim() : null;

    console.log("=== INICIO DEBUG ===");
    console.log("Request body completo:", JSON.stringify(body));
    console.log("Raw userID:", JSON.stringify(rawUserID));
    console.log("Processed userID:", JSON.stringify(userID));
    console.log("UserID es válido:", !!userID);
    console.log("Parámetros:", {
      offset,
      limit,
      category,
      type,
      maxDistanceKm,
      fechaActual,
      userLocation,
    });

    /* -------- ubicación -------- */
    let { latitude: lat, longitude: lon } = userLocation;
    if ((lat == null || lon == null) && userID) {
      try {
        console.log("Buscando ubicación para userID:", userID);
        const dev = await dynamodb
          .query({
            TableName: DEVICE_TABLE,
            IndexName: "UserIDIndex",
            KeyConditionExpression: "#u = :uid",
            ExpressionAttributeNames: { "#u": "userID" },
            ExpressionAttributeValues: { ":uid": userID },
            Limit: 10, // Puedes aumentar el límite si hay más de un dispositivo
          })
          .promise();

        // Buscar el item con el createdAt más reciente
        const mostRecentDevice = dev.Items?.reduce((latest, item) => {
          if (!item.createdAt) return latest;
          if (!latest) return item;
          return new Date(item.createdAt) > new Date(latest.createdAt)
            ? item
            : latest;
        }, null);

        const loc = mostRecentDevice?.location || {};
        lat = lat ?? loc.latitude;
        lon = lon ?? loc.longitude;
      } catch (error) {
        console.log("Error obteniendo ubicación del device:", error.message);
      }
    }
    const hasLocation = lat != null && lon != null;
    console.log("Ubicación final:", { lat, lon, hasLocation });

    /* -------- preferencias -------- */
    let pref = new Set();
    if (userID) {
      try {
        console.log("Buscando preferencias para userID:", userID);
        const pr = await dynamodb
          .get({
            TableName: PREFS_TABLE,
            Key: { UserId: userID },
          })
          .promise();
        console.log(
          "Preferencias encontradas:",
          pr.Item?.Preferences?.length || 0,
        );
        pref = new Set((pr.Item?.Preferences || []).map(String));
      } catch (error) {
        console.log("Error obteniendo preferencias:", error.message);
      }
    }

    /* -------- contexto -------- */
    let nowDate = new Date();
    if (typeof fechaActual === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(fechaActual.trim())) {
      const [dd, mm, yyyy] = fechaActual.trim().split("/").map(Number);
      nowDate = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
    }
    const ctx = {
      now: nowDate,
      lat: toCoord(lat),
      lon: toCoord(lon),
      hasLocation,
      pref,
      userLocationProvided:
        userLocation.latitude != null &&
        userLocation.longitude != null &&
        maxDistanceKm > 0,
    };
    ctx.hasLocation = ctx.lat != null && ctx.lon != null;
    console.log("Contexto:", {
      now: ctx.now.toISOString(),
      hasLocation: ctx.hasLocation,
      preferences: pref.size,
    });

    /* -------- query base -------- */
    const todayKey = todayKeyFromDate(ctx.now);
    // Incluye eventos multi-día que empezaron antes de hoy (luego se filtra por fechaFin).
    const gsiLowerBound = shiftFechaKey(todayKey, -90);

    console.log("Filtros base - todayKey:", todayKey);

    const categoryNames = {};
    const categoryVals = {};
    const filters = [];

    if (category !== undefined) {
      categoryNames["#cat"] = "Categoria";
      categoryVals[":cat"] = String(category);
      filters.push("#cat = :cat");
      console.log("Aplicando filtro de categoría:", category);
    }
    if (type !== undefined) {
      categoryNames["#t"] = "tipoEvento";
      categoryVals[":t"] = String(type);
      filters.push("#t = :t");
      console.log("Aplicando filtro de tipo:", type);
    }

    const itemsById = new Map();
    for (const status of DISCOVER_EVENT_STATUSES) {
      let lastEvaluatedKey = undefined;
      let page = 0;
      do {
        const queryParams = {
          TableName: EVENTS_TABLE,
          IndexName: "EstatusFechaIndex",
          KeyConditionExpression: "#e = :est AND #f >= :d",
          ExpressionAttributeNames: {
            "#e": "estatus",
            "#f": "fechaIni",
            ...categoryNames,
          },
          ExpressionAttributeValues: {
            ":est": status,
            ":d": gsiLowerBound,
            ...categoryVals,
          },
          Limit: 500,
          ExclusiveStartKey: lastEvaluatedKey,
        };

        if (filters.length > 0) {
          queryParams.FilterExpression = filters.join(" AND ");
        }

        const q = await dynamodb.query(queryParams).promise();
        page += 1;
        console.log(`Eventos obtenidos (${status}) page=${page}:`, (q.Items || []).length);
        for (const item of q.Items || []) {
          if (!itemsById.has(item.id)) {
            itemsById.set(item.id, item);
          }
        }
        lastEvaluatedKey = q.LastEvaluatedKey;
      } while (lastEvaluatedKey && page < 6 && itemsById.size < 1500);
    }

    const qItems = [...itemsById.values()].filter((item) =>
      isDiscoverableEvent(item, todayKey),
    );

    console.log("Eventos vigentes tras filtro de fecha/estatus:", qItems.length);

    if (qItems.length > 0) {
      console.log("Primer evento ejemplo:", {
        id: qItems[0].id,
        userId: qItems[0].userId,
        clase: qItems[0].clase,
        estatus: qItems[0].estatus,
        fechaIni: qItems[0].fechaIni,
      });
    }

    /* -------- Enriquecer con ubicación de Venues si no tienen ubicacion -------- */
    console.log("Enriqueciendo eventos con ubicación de Venues...");
    let venuesEnriched = 0;
    await Promise.all(
      qItems.map(async (item) => {
        if (getLat(item) != null && getLon(item) != null) return;
        if (!item.venueId) return;
          try {
            const venueParams = {
              TableName: VENUES_TABLE,
              Key: {
                venue_id: item.venueId,
              },
            };
            const venueResult = await dynamodb.get(venueParams).promise();

            if (venueResult.Item) {
              const venue = venueResult.Item;
              const vLat = toCoord(
                venue.latitude ?? venue.lat ?? venue.ubicacion?.latitude,
              );
              const vLon = toCoord(
                venue.longitude ?? venue.lng ?? venue.lon ?? venue.ubicacion?.longitude,
              );
              if (vLat != null && vLon != null) {
                item.latitude = vLat;
                item.longitude = vLon;
                item.ubicacion = {
                  ...(item.ubicacion && typeof item.ubicacion === "object"
                    ? item.ubicacion
                    : {}),
                  latitude: vLat,
                  longitude: vLon,
                };
                venuesEnriched++;
                console.log(
                  `✓ Ubicación de venue agregada al evento ${item.id} (lat: ${vLat}, lon: ${vLon})`,
                );
              } else {
                console.log(
                  `⚠ Venue encontrado para evento ${item.id} pero sin coordenadas válidas`,
                );
              }
            } else {
              console.log(
                `⚠ No se encontró venue ${item.venueId} para evento ${item.id}`,
              );
            }
          } catch (err) {
            console.error(
              `Error obteniendo venue para evento ${item.id}:`,
              err.message,
            );
          }
      }),
    );
    console.log(
      `Total de eventos enriquecidos con ubicación de Venues: ${venuesEnriched}`,
    );

    /* -------- filtros en memoria & orden -------- */
    console.log("Aplicando filtro de distancia. MaxDistance:", maxDistanceKm);

    // Contar eventos con y sin ubicación
    const eventsWithLocation = qItems.filter(
      (e) => getLat(e) != null && getLon(e) != null,
    ).length;
    const eventsWithoutLocation = qItems.length - eventsWithLocation;
    console.log(
      `Eventos con ubicación: ${eventsWithLocation}, sin ubicación: ${eventsWithoutLocation}`,
    );

    let base;
    const distanceFilterApplied =
      hasLocation &&
      userLocation.latitude != null &&
      userLocation.longitude != null &&
      maxDistanceKm > 0;

    if (distanceFilterApplied) {
      const itemsWithDistance = qItems.map((item) => {
        const eLat = getLat(item);
        const eLon = getLon(item);

        if (eLat != null && eLon != null) {
          item.distancia = hav(ctx.lat, ctx.lon, eLat, eLon);
          console.log(
            `✓ Evento ${item.id}: distancia ${item.distancia.toFixed(2)}km`,
          );
        } else {
          item.distancia = Infinity;
          console.log(
            `✗ Evento ${item.id}: sin ubicación (distancia = Infinity)`,
          );
        }
        return item;
      });

      base = itemsWithDistance
        .filter((item) => {
          const withinRange = item.distancia <= maxDistanceKm;
          if (!withinRange && item.distancia !== Infinity) {
            console.log(
              `✗ Evento ${item.id} excluido: distancia ${item.distancia.toFixed(2)}km > ${maxDistanceKm}km`,
            );
          }
          return withinRange;
        })
        .sort((a, b) => a.distancia - b.distancia);

      console.log(
        `Total después de filtrar por distancia: ${base.length} eventos`,
      );
    } else if (hasLocation) {
      // Si la ubicación se obtuvo pero no venía en el request, ordenar por distancia (no filtrar)
      const withLoc = qItems.filter(
        (e) => getLat(e) != null && getLon(e) != null,
      )
        .map((e) => ({
          ...e,
          _distance: hav(ctx.lat, ctx.lon, getLat(e), getLon(e)),
        }))
        .sort((a, b) => a._distance - b._distance)
        .map((e) => {
          delete e._distance;
          return e;
        });

      const withoutLoc = qItems.filter(
        (e) => getLat(e) == null || getLon(e) == null,
      );

      base = [...withLoc, ...withoutLoc];
    } else {
      base = qItems;
    }

    console.log("Eventos después del filtro de distancia:", base.length);

    const ordered = distanceFilterApplied
      ? base
      : hasLocation
        ? base
            .map((e) => ({ ...e, score: score(e, ctx) }))
            .sort((a, b) => b.score - a.score)
        : base.sort((a, b) => {
            const da =
              toDate(a.startDate) ||
              toDate(a.fechaIni) ||
              new Date(8640000000000000);
            const db =
              toDate(b.startDate) ||
              toDate(b.fechaIni) ||
              new Date(8640000000000000);
            return da - db;
          });

    console.log("Eventos después del ordenamiento:", ordered.length);
    // Formatear fechaIni en DD/MM/YYYY
    ordered.forEach((ev) => {
      if (ev.fechaIni) {
        const d = toDate(ev.fechaIni);
        if (d) {
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yyyy = d.getFullYear();
          ev.fechaIni = `${dd}/${mm}/${yyyy}`;
        }
      }
    });
    /* -------- paginación -------- */
    const paged = ordered.slice(offset, offset + limit);
    const nextOffset = offset + paged.length;

    console.log("Eventos después de paginación:", paged.length);

    /* -------- favoritos -------- */
    if (userID) {
      console.log("Aplicando favoritos para userID:", userID);
      await Promise.all(
        paged.map(async (it) => {
          try {
            const fav = await dynamodb
              .get({
                TableName: FAV_TABLE,
                Key: { userId: userID, eventId: it.id },
              })
              .promise();
            it.liked = !!fav.Item;
          } catch {
            it.liked = false;
          }
        }),
      );
    }

    /* -------- imagen firmada -------- */
    await Promise.all(
      paged.map(async (it) => {
        it.imagen = await signedUrl(it.id);
      }),
    );

    console.log("=== FIN DEBUG ===");
    console.log("RESPUESTA FINAL:");
    console.log("- Total de eventos:", ordered.length);
    console.log("- Eventos en esta página:", paged.length);
    console.log("- Offset actual:", offset);
    console.log(
      "- Next offset:",
      nextOffset < ordered.length ? nextOffset : null,
    );
    console.log("- UserID usado:", userID || "SIN USUARIO");

    /* -------- respuesta -------- */
    return json(200, {
      items: paged,
      nextOffset: nextOffset < ordered.length ? nextOffset : null,
      total: ordered.length,
      debug: {
        userIDProvided: !!userID,
        hasLocation: hasLocation,
        filtersApplied: {
          category: category !== undefined,
          type: type !== undefined,
          distance: hasLocation && userLocation.latitude != null,
        },
      },
    });
  } catch (err) {
    console.error("Lambda ERROR", err);
    return json(500, { mensaje: "Error interno", detalle: err.message });
  }
};
