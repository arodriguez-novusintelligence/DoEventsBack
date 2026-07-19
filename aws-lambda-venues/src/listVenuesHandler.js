const { dynamodb, venueTable } = require("./dynamoClient");

const MAX_SCAN_PAGES = 25;
const SCAN_PAGE_SIZE = 100;

/**
 * Calcula la distancia entre dos coordenadas usando la fórmula de Haversine
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function parseVenueImages(venue) {
  const raw = venue.images;
  let urls = [];
  if (Array.isArray(raw)) {
    urls = raw.map((entry) => String(entry || "").trim()).filter(Boolean);
  } else if (typeof raw === "string" && raw.trim()) {
    urls = raw.split(",").map((url) => url.trim()).filter(Boolean);
  }
  return {
    ...venue,
    imageUrls: urls,
    mainImage: urls[0] || null,
  };
}

function applyLocationFilters(venues, userLat, userLon, maxDistance) {
  if (userLat === null || userLon === null) return venues;

  let withDistance = venues.map((venue) => {
    if (venue.latitude && venue.longitude) {
      const distance = calculateDistance(
        userLat,
        userLon,
        venue.latitude,
        venue.longitude,
      );
      return { ...venue, distance: parseFloat(distance.toFixed(2)) };
    }
    return { ...venue, distance: null };
  });

  if (maxDistance !== null) {
    withDistance = withDistance.filter(
      (venue) => venue.distance !== null && venue.distance <= maxDistance,
    );
  }

  return withDistance.sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });
}

async function collectFilteredItems(operation, baseParams, targetLimit, startKey) {
  const items = [];
  let exclusiveStartKey = startKey || undefined;
  let pages = 0;

  while (items.length < targetLimit && pages < MAX_SCAN_PAGES) {
    const params = {
      ...baseParams,
      Limit: SCAN_PAGE_SIZE,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    };

    const result = await dynamodb[operation](params).promise();
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
    pages += 1;

    if (!exclusiveStartKey) break;
  }

  return {
    items: items.slice(0, targetLimit),
    lastEvaluatedKey: exclusiveStartKey || null,
    hasMore: Boolean(exclusiveStartKey),
  };
}

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
};

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const queryParams = event.queryStringParameters || {};
    const ownerUserId = queryParams.ownerUserId;
    const isTemplate = queryParams.isTemplate;
    const status = queryParams.status;

    const userLat = queryParams.latitude
      ? parseFloat(queryParams.latitude)
      : null;
    const userLon = queryParams.longitude
      ? parseFloat(queryParams.longitude)
      : null;
    const maxDistance = queryParams.maxDistance
      ? parseFloat(queryParams.maxDistance)
      : null;

    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;
    const lastEvaluatedKey = queryParams.lastEvaluatedKey
      ? JSON.parse(decodeURIComponent(queryParams.lastEvaluatedKey))
      : null;
    const collectLimit =
      userLat !== null && userLon !== null
        ? Math.min(Math.max(limit * 10, limit), 500)
        : limit;

    const filterExpressions = [];
    const filterValues = {};
    const expressionAttributeNames = {};

    if (isTemplate !== undefined) {
      filterExpressions.push("isTemplate = :isTemplate");
      filterValues[":isTemplate"] = isTemplate === "true";
    }

    if (status) {
      filterExpressions.push("#status = :status");
      filterValues[":status"] = status;
      expressionAttributeNames["#status"] = "status";
    }

    let result;

    if (ownerUserId) {
      const baseParams = {
        TableName: venueTable(),
        IndexName: "ownerUserIdIndex",
        KeyConditionExpression: "ownerUserId = :ownerUserId",
        ExpressionAttributeValues: {
          ":ownerUserId": ownerUserId,
          ...filterValues,
        },
      };

      if (filterExpressions.length > 0) {
        baseParams.FilterExpression = filterExpressions.join(" AND ");
      }
      if (Object.keys(expressionAttributeNames).length > 0) {
        baseParams.ExpressionAttributeNames = expressionAttributeNames;
      }

      result = await collectFilteredItems("query", baseParams, collectLimit, lastEvaluatedKey);
    } else {
      const baseParams = {
        TableName: venueTable(),
      };

      if (filterExpressions.length > 0) {
        baseParams.FilterExpression = filterExpressions.join(" AND ");
        baseParams.ExpressionAttributeValues = filterValues;
      }
      if (Object.keys(expressionAttributeNames).length > 0) {
        baseParams.ExpressionAttributeNames = expressionAttributeNames;
      }

      result = await collectFilteredItems("scan", baseParams, collectLimit, lastEvaluatedKey);
    }

    let venues = (result.items || []).map(parseVenueImages);
    venues = applyLocationFilters(venues, userLat, userLon, maxDistance);
    if (venues.length > limit) {
      venues = venues.slice(0, limit);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        venues,
        count: venues.length,
        lastEvaluatedKey: result.lastEvaluatedKey
          ? encodeURIComponent(JSON.stringify(result.lastEvaluatedKey))
          : null,
        hasMore: result.hasMore,
        filters: {
          ownerUserId,
          isTemplate,
          status,
          location:
            userLat && userLon
              ? { latitude: userLat, longitude: userLon, maxDistance }
              : null,
        },
      }),
    };
  } catch (error) {
    console.error("Error in listVenuesHandler:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
