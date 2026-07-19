const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const tableName = (envKey, fallback) => process.env[envKey] || fallback;

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST,DELETE",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// Carga el mapa categoryId -> cantidadTickets desde la tabla Tickets
async function loadTicketQuantitiesMap(venueId, eventId) {
  const map = {};
  if (!eventId) return map;
  try {
    const ticketsResult = await dynamodb
      .query({
        TableName: tableName("TICKETS_TABLE", "Tickets"),
        IndexName: "eventId-index",
        KeyConditionExpression: "eventId = :eventId",
        FilterExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
          ":venueId": venueId,
        },
      })
      .promise();
    for (const ticket of ticketsResult.Items || []) {
      const boletas = ticket.boletas || ticket.boleta || [];
      for (const b of boletas) {
        if (b.id) {
          map[b.id] = {
            cantidadTickets: b.cantidadTickets ?? 0,
            avaliableCapacity: b.avaliableCapacity ?? b.cantidadTickets ?? 0,
            valor: b.valor ?? 0,
            costo: b.costo ?? false,
            moneda: b.moneda || "COP",
          };
        }
      }
    }
  } catch (err) {
    console.warn(
      "No se pudo cargar Tickets para enriquecer categorías:",
      err.message,
    );
  }
  return map;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId } = event.pathParameters;

    if (!venueId) {
      return jsonResponse(400, { error: "venueId is required" });
    }

    // Obtener venue
    const venueResult = await dynamodb
      .get({
        TableName: tableName("VENUE_TABLE", "Venues"),
        Key: { venue_id: venueId },
      })
      .promise();

    if (!venueResult.Item) {
      return jsonResponse(404, { error: "Venue not found" });
    }

    const venue = venueResult.Item;

    // Cargar cantidades desde Tickets (fallback para categorías sin cantidadTickets)
    const ticketQtyMap = await loadTicketQuantitiesMap(venueId, venue.eventId);

    // Obtener floors del venue
    const floorsResult = await dynamodb
      .query({
        TableName: tableName("VENUE_FLOOR_TABLE", "Venue_Floor"),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":venueId": venueId,
        },
      })
      .promise();

    const floors = [];

    // Para cada floor, obtener sus elements y categories
    for (const floor of floorsResult.Items || []) {
      // Obtener elements del floor
      const elementsResult = await dynamodb
        .query({
          TableName: tableName("VENUE_ELEMENT_TABLE", "Venue_Element"),
          IndexName: "floorIdIndex",
          KeyConditionExpression: "floorId = :floorId",
          FilterExpression: "venueId = :venueId",
          ExpressionAttributeValues: {
            ":floorId": floor.floorId,
            ":venueId": venueId,
          },
        })
        .promise();

      // Obtener categories del floor (filtrar por venueId para evitar categorías de otros venues con el mismo floorId)
      const categoriesResult = await dynamodb
        .query({
          TableName: tableName("VENUE_CATEGORY_TABLE", "Venue_Category"),
          IndexName: "floorIdIndex",
          KeyConditionExpression: "floorId = :floorId",
          FilterExpression: "venueId = :venueId",
          ExpressionAttributeValues: {
            ":floorId": floor.floorId,
            ":venueId": venueId,
          },
        })
        .promise();

      const categories = [];

      // Para cada categoría, obtener sus asientos
      for (const category of categoriesResult.Items || []) {
        const seatsResult = await dynamodb
          .query({
            TableName: tableName("VENUE_SEAT_TABLE", "Venue_Seat"),
            IndexName: "categoryIdIndex",
            KeyConditionExpression: "categoryId = :categoryId",
            ExpressionAttributeValues: {
              ":categoryId": category.categoryId,
            },
          })
          .promise();

        const ticketQty = ticketQtyMap[category.categoryId];
        categories.push({
          ...category,
          cantidadTickets:
            category.cantidadTickets ?? ticketQty?.cantidadTickets ?? 0,
          avaliableCapacity:
            category.avaliableCapacity ?? ticketQty?.avaliableCapacity ?? 0,
          valor: category.valor ?? ticketQty?.valor ?? 0,
          costo: category.costo ?? ticketQty?.costo ?? false,
          moneda: category.moneda ?? ticketQty?.moneda ?? "COP",
          hasPrice:
            category.hasPrice !== undefined
              ? category.hasPrice
              : typeof category.costo === "boolean"
                ? category.costo
                : false,
          seats: seatsResult.Items || [],
        });
      }

      const defaultEditorSettings = {
        showActionLabels: false,
        canvasGridVisible: true,
        canvasDarkMode: false,
        canvasGridVisualMode: "normal",
        workspaceExpansion: { left: 0, top: 0, right: 1800, bottom: 1200 },
      };
      floors.push({
        ...floor,
        editorSettings: floor.editorSettings || defaultEditorSettings,
        elements: elementsResult.Items || [],
        categories,
      });
    }

    // Obtener categorías independientes (sin floorId)
    const independentCategoriesResult = await dynamodb
      .query({
        TableName: tableName("VENUE_CATEGORY_TABLE", "Venue_Category"),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":venueId": venueId,
        },
        FilterExpression: "attribute_not_exists(floorId)",
      })
      .promise();

    const independentCategories = [];
    for (const category of independentCategoriesResult.Items || []) {
      const seatsResult = await dynamodb
        .query({
          TableName: tableName("VENUE_SEAT_TABLE", "Venue_Seat"),
          IndexName: "categoryIdIndex",
          KeyConditionExpression: "categoryId = :categoryId",
          ExpressionAttributeValues: {
            ":categoryId": category.categoryId,
          },
        })
        .promise();

      const ticketQty = ticketQtyMap[category.categoryId];
      independentCategories.push({
        ...category,
        cantidadTickets:
          category.cantidadTickets ?? ticketQty?.cantidadTickets ?? 0,
        avaliableCapacity:
          category.avaliableCapacity ?? ticketQty?.avaliableCapacity ?? 0,
        valor: category.valor ?? ticketQty?.valor ?? 0,
        costo: category.costo ?? ticketQty?.costo ?? false,
        moneda: category.moneda ?? ticketQty?.moneda ?? "COP",
        hasPrice:
          category.hasPrice !== undefined
            ? category.hasPrice
            : typeof category.costo === "boolean"
              ? category.costo
              : false,
        seats: seatsResult.Items || [],
      });
    }

    venue.floors = floors;
    venue.categories = independentCategories;
    // Gates ya vienen en el objeto venue desde DynamoDB

    // Procesar imágenes (convertir string separado por comas a array)
    venue.imageUrls = venue.images
      ? venue.images.split(",").filter((url) => url.trim())
      : [];
    venue.mainImage = venue.images ? venue.images.split(",")[0] : null;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ venue }),
    };
  } catch (error) {
    console.error("Error in getVenueHandler:", error);
    return jsonResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};
