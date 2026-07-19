/**
 * Handler: getEventBySlug
 *
 * Propósito: Obtener un evento usando su slug (URL-friendly identifier)
 *
 * Método: GET
 * Path: /events/slug/{slug}
 *
 * Parámetros de path:
 *   - slug: URL-friendly identifier del evento
 *
 * Respuestas:
 *   200: Evento encontrado
 *   404: Evento no encontrado
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
    // Extraer slug de los parámetros de ruta
    const slug = event.pathParameters?.slug;

    if (!slug) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Slug es requerido",
        }),
      };
    }

    console.log(`🔍 Buscando evento con slug: ${slug}`);

    // Consultar usando el GSI slug-index
    const queryParams = {
      TableName: EVENTS_TABLE,
      IndexName: "slug-index",
      KeyConditionExpression: "slug = :slug",
      ExpressionAttributeValues: {
        ":slug": slug,
      },
      Limit: 1,
    };

    console.log(
      "🔧 Parámetros de consulta:",
      JSON.stringify(queryParams, null, 2)
    );

    const result = await dynamoDb.send(new QueryCommand(queryParams));

    if (!result.Items || result.Items.length === 0) {
      console.log("❌ Evento no encontrado");
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: "Evento no encontrado",
          slug: slug,
        }),
      };
    }

    const evento = result.Items[0];
    console.log("✅ Evento encontrado:", evento.id);

    // Si el evento está cancelado o eliminado, retornar 404
    if (evento.estado === "Cancelado" || evento.estado === "Eliminado") {
      console.log(`⚠️  Evento ${evento.estado.toLowerCase()}`);
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: `Evento ${evento.estado.toLowerCase()}`,
          slug: slug,
        }),
      };
    }

    // Respuesta exitosa
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Evento obtenido exitosamente",
        evento: evento,
      }),
    };
  } catch (error) {
    console.error("❌ Error al obtener evento por slug:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Error al obtener evento",
        details: error.message,
      }),
    };
  }
};
