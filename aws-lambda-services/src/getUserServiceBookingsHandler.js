const AWS = require("aws-sdk");
const { jsonResponse, handleOptions } = require("./response");
const { tableName } = require("./serviceBookingUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const BOOKINGS_TABLE = () => tableName("SERVICE_BOOKINGS_TABLE", "ServiceBookings");
const SERVICES_TABLE = () => process.env.SERVICES_TABLE || "ServiceProviders-dev";

async function loadServiceMap(serviceIds = []) {
  const uniqueIds = [...new Set(serviceIds.filter(Boolean))];
  const map = new Map();
  await Promise.all(uniqueIds.map(async (serviceId) => {
    try {
      const result = await dynamodb.get({
        TableName: SERVICES_TABLE(),
        Key: { serviceId },
      }).promise();
      if (result.Item) map.set(serviceId, result.Item);
    } catch (error) {
      console.warn("getUserServiceBookings: service lookup failed", serviceId, error.message);
    }
  }));
  return map;
}

function resolveProviderName(service) {
  if (!service) return "";
  return service.businessName || service.providerName || service.ownerName || service.userName || "";
}

function resolveServiceLocation(service) {
  if (!service) return { city: "", address: "" };
  const location = service.location && typeof service.location === "object" ? service.location : {};
  return {
    city: service.city || location.city || location.ciudad || "",
    address: service.address || location.address || location.direccion || "",
  };
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return jsonResponse(event, 400, { error: "userId es requerido" });
    }

    const result = await dynamodb
      .query({
        TableName: BOOKINGS_TABLE(),
        IndexName: "userIdIndex",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ScanIndexForward: false,
      })
      .promise();

    const items = result.Items || [];
    const serviceMap = await loadServiceMap(items.map((item) => item.serviceId));

    const bookings = items.map((item) => {
      const service = serviceMap.get(item.serviceId);
      const location = resolveServiceLocation(service);
      return {
        bookingId: item.bookingId,
        serviceId: item.serviceId,
        serviceName: item.serviceName || service?.name || "Servicio",
        serviceProvider: resolveProviderName(service),
        serviceSector: service?.sector || service?.activity || service?.serviceType || "",
        serviceCity: location.city,
        serviceAddress: location.address,
        orderId: item.orderId,
        status: item.status,
        startDate: item.startDate,
        endDate: item.endDate,
        selectedDates: item.selectedDates || [],
        additionalServices: item.additionalServices || [],
        pricing: item.pricing || {},
        createdAt: item.createdAt,
        confirmedAt: item.confirmedAt || null,
        expired_at_ts: item.expired_at_ts || null,
      };
    });

    return jsonResponse(event, 200, { bookings, count: bookings.length });
  } catch (error) {
    console.error("getUserServiceBookingsHandler error:", error);
    return jsonResponse(event, 500, { error: error.message || "Error interno" });
  }
};
