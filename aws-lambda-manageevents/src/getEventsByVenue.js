/**
 * Handler: getEventsByVenue
 *
 * Propósito: Obtener todos los eventos asociados a un venue
 *
 * Método: GET
 * Path: /events/venue/{venueId}
 *
 * Parámetros de path:
 *   - venueId: ID del venue
 *
 * Query parameters opcionales:
 *   - status: Filtrar por estado (Activo, Publicado, Borrador, etc.)
 *   - limit: Número máximo de resultados (default: 50)
 *
 * Respuestas:
 *   200: Eventos encontrados
 *   404: No se encontraron eventos
 *   500: Error del servidor
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDbClient = new DynamoDBClient({ region: "us-east-1" });
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";

exports.handler = async (event) => {
  console.log("📥 Evento recibido:", JSON.stringify(event, null, 2));

  try {
    // Extraer venueId de los parámetros de ruta
    const venueId = event.pathParameters?.venueId;

    if (!venueId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "venueId es requerido",
        }),
      };
    }

    // Extraer query parameters opcionales
    const queryParams = event.queryStringParameters || {};
    const statusFilter = queryParams.status;
    const limit = parseInt(queryParams.limit) || 50;

    console.log(`🔍 Buscando eventos para venue: ${venueId}`);
    if (statusFilter) {
      console.log(`   Filtro de estado: ${statusFilter}`);
    }

    // Consultar usando el GSI venueId-index
    const queryParameters = {
      TableName: EVENTS_TABLE,
      IndexName: "venueId-index",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: {
        ":venueId": venueId,
      },
      Limit: limit,
    };

    // Agregar filtro de estado si se especificó
    if (statusFilter) {
      queryParameters.FilterExpression = "estado = :status";
      queryParameters.ExpressionAttributeValues[":status"] = statusFilter;
    }

    console.log(
      "🔧 Parámetros de consulta:",
      JSON.stringify(queryParameters, null, 2)
    );

    const result = await dynamoDb.send(new QueryCommand(queryParameters));

    if (!result.Items || result.Items.length === 0) {
      console.log("❌ No se encontraron eventos");
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          message: "No se encontraron eventos para este venue",
          venueId: venueId,
          count: 0,
          eventos: [],
        }),
      };
    }

    console.log(`✅ Se encontraron ${result.Items.length} eventos`);

    // Ordenar por fecha de inicio (más recientes primero)
    const sortedEvents = result.Items.sort((a, b) => {
      const dateA = new Date(a.fechaInicio || a.startDate);
      const dateB = new Date(b.fechaInicio || b.startDate);
      return dateB - dateA;
    });

    // Respuesta exitosa
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Eventos obtenidos exitosamente",
        venueId: venueId,
        count: sortedEvents.length,
        eventos: sortedEvents,
        hasMore: result.LastEvaluatedKey ? true : false,
        lastEvaluatedKey: result.LastEvaluatedKey,
      }),
    };
  } catch (error) {
    console.error("❌ Error al obtener eventos por venue:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Error al obtener eventos",
        details: error.message,
      }),
    };
  }
};
