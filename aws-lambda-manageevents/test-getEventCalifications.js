// Test local para getEventCalifications

// Configurar AWS SDK para pruebas locales
const AWS = require("aws-sdk");
AWS.config.update({
  region: "us-east-1",
  // Las credenciales se tomarán automáticamente del perfil por defecto
  // o de las variables de entorno AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY
});

const handler = require("./src/getEventCalifications").handler;

// Mock del evento para pruebas
const testEvent = {
  pathParameters: {
    eventId: "a5a9306f-31cf-4792-89b3-17b535c245d7",
  },
  queryStringParameters: {
    limit: "10",
    // nextToken: 'eyJ0ZXN0IjoidmFsdWUifQ==' // Para probar paginación
  },
};

async function testGetEventCalifications() {
  console.log("🧪 Iniciando prueba de getEventCalifications...\n");

  try {
    const result = await handler(testEvent);

    console.log("📊 Resultado de la prueba:");
    console.log("Status Code:", result.statusCode);
    console.log("Headers:", JSON.stringify(result.headers, null, 2));

    const body = JSON.parse(result.body);
    console.log("\n📋 Respuesta:");
    console.log(JSON.stringify(body, null, 2));

    if (body.success) {
      console.log("\n✅ Estadísticas de la respuesta:");
      console.log(
        `- Calificaciones devueltas: ${body.data.califications.length}`
      );
      console.log(
        `- Total de calificaciones: ${body.data.stats.totalCalifications}`
      );
      console.log(`- Promedio: ${body.data.stats.averageRating}`);
      console.log(`- Tiene más páginas: ${body.data.pagination.hasMore}`);

      if (body.data.califications.length > 0) {
        console.log("\n📝 Primera calificación:");
        const first = body.data.califications[0];
        console.log(`- Usuario: ${first.user.name}`);
        console.log(`- Rating: ${first.rating}`);
        console.log(`- Comentario: ${first.comment || "Sin comentario"}`);
      }
    }
  } catch (error) {
    console.error("❌ Error en la prueba:", error);
  }
}

// Solo ejecutar si se llama directamente
if (require.main === module) {
  testGetEventCalifications();
}

module.exports = { testGetEventCalifications };
