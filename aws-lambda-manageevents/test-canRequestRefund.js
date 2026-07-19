/**
 * Script de prueba para validar la función canRequestRefund
 *
 * Este script prueba diferentes escenarios:
 * 1. Categoría 30 días - Puede solicitar
 * 2. Categoría 30 días - NO puede solicitar
 * 3. Categoría 7 días - Puede solicitar
 * 4. Categoría 1 día - Puede solicitar
 * 5. Categoría 0 - Evaluación manual
 * 6. Categoría N - No permite reembolsos
 */

const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({ region: "us-east-1" });

// Configuración
const STAGE = "dev"; // Cambiar según el stage
const FUNCTION_NAME = `aws-lambda-manageevent-${STAGE}-canRequestRefund`;

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

/**
 * Invoca la función Lambda de validación de reembolso
 */
async function testCanRequestRefund(
  eventId,
  userId,
  orderId,
  currentDate,
  description
) {
  console.log(
    `\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.blue}🧪 Test: ${description}${colors.reset}`);
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );

  const payload = {
    pathParameters: {
      eventId: eventId,
    },
    body: JSON.stringify({
      userId: userId,
      orderId: orderId,
      currentDate: currentDate,
    }),
  };

  console.log(`📋 Payload:`);
  console.log(`   EventId: ${eventId}`);
  console.log(`   UserId: ${userId}`);
  console.log(`   OrderId: ${orderId}`);
  console.log(`   CurrentDate: ${currentDate}\n`);

  try {
    const params = {
      FunctionName: FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    };

    const result = await lambda.invoke(params).promise();
    const response = JSON.parse(result.Payload);

    console.log(`📊 StatusCode: ${response.statusCode}`);

    const body = JSON.parse(response.body);

    if (response.statusCode === 200 && body.success) {
      console.log(`${colors.green}✅ Resultado exitoso${colors.reset}\n`);
      console.log(`📌 Datos:`);
      console.log(`   Evento: ${body.data.eventName}`);
      console.log(`   Fecha del evento: ${body.data.eventDate}`);
      console.log(`   Días faltantes: ${body.data.daysUntilEvent}`);
      console.log(`   Categoría: ${body.data.refundCategory}`);
      console.log(
        `   Puede solicitar: ${body.data.canRequestRefund ? "✅ SÍ" : "❌ NO"}`
      );
      console.log(
        `   Revisión manual: ${body.data.requiresManualReview ? "⚠️ SÍ" : "NO"}`
      );
      console.log(`   Razón: ${body.data.reason}`);
      if (body.data.orderInfo) {
        console.log(`\n   📦 Información de la orden:`);
        console.log(`      OrderId: ${body.data.orderInfo.orderId}`);
        console.log(`      UserId: ${body.data.orderInfo.userId}`);
        console.log(
          `      Monto: ${body.data.orderInfo.amount} ${body.data.orderInfo.currency}`
        );
        console.log(`      Estado: ${body.data.orderInfo.paymentStatus}`);
        console.log(`      Fecha de compra: ${body.data.orderInfo.createdAt}`);
      }
    } else {
      console.log(`${colors.red}❌ Error en la respuesta${colors.reset}\n`);
      console.log(`   Mensaje: ${body.message}`);
      if (body.error) {
        console.log(`   Error: ${body.error}`);
      }
    }

    return body;
  } catch (error) {
    console.error(
      `${colors.red}❌ Error al invocar Lambda:${colors.reset}`,
      error.message
    );
    return null;
  }
}

/**
 * Ejecuta todos los tests
 */
async function runAllTests() {
  console.log(
    `\n${colors.yellow}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.yellow}║  🧪 PRUEBAS DE VALIDACIÓN DE REEMBOLSOS                   ║${colors.reset}`
  );
  console.log(
    `${colors.yellow}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );
  console.log(`📍 Función Lambda: ${FUNCTION_NAME}\n`);

  // IMPORTANTE: Reemplaza este eventId con un ID real de tu base de datos
  // Puedes crear eventos de prueba con diferentes categorías de reembolso
  const testEventId = "3adf210f-716b-43fb-84b4-ece5e2119af2"; // ⚠️ REEMPLAZAR CON UN ID REAL

  console.log(
    `${colors.yellow}⚠️  NOTA: Asegúrate de tener un evento con ID: ${testEventId}${colors.reset}`
  );
  console.log(
    `${colors.yellow}   Y una orden válida con userId y orderId correspondientes${colors.reset}\n`
  );

  // IDs de prueba - REEMPLAZAR CON IDs REALES
  const testUserId = "user123"; // ⚠️ REEMPLAZAR con un userId real
  const testOrderId = "order-abc-123"; // ⚠️ REEMPLAZAR con un orderId real

  // Test 1: Categoría 30 días - CON suficiente anticipación
  await testCanRequestRefund(
    testEventId,
    testUserId,
    testOrderId,
    "20251101", // Fecha actual
    "Categoría 30 días - Con 44 días de anticipación (DEBE PERMITIR)"
  );

  // Test 2: Categoría 30 días - SIN suficiente anticipación
  await testCanRequestRefund(
    testEventId,
    testUserId,
    testOrderId,
    "20251125", // Fecha actual (20 días antes del evento)
    "Categoría 30 días - Con 20 días de anticipación (NO DEBE PERMITIR)"
  );

  // Test 3: Categoría 7 días - CON suficiente anticipación
  await testCanRequestRefund(
    testEventId,
    testUserId,
    testOrderId,
    "20251205", // Fecha actual (10 días antes)
    "Categoría 7 días - Con 10 días de anticipación (DEBE PERMITIR)"
  );

  // Test 4: Categoría 1 día - Al límite
  await testCanRequestRefund(
    testEventId,
    testUserId,
    testOrderId,
    "20251214", // Fecha actual (1 día antes)
    "Categoría 1 día - Con 1 día de anticipación (DEBE PERMITIR)"
  );

  // Test 5: Evento ya pasado
  await testCanRequestRefund(
    testEventId,
    testUserId,
    testOrderId,
    "20251220", // Fecha después del evento
    "Evento ya pasado (NO DEBE PERMITIR)"
  );

  // Test 6: Usuario incorrecto (403)
  await testCanRequestRefund(
    testEventId,
    "user-wrong-999",
    testOrderId,
    "20251101",
    "Usuario incorrecto (DEBE DAR ERROR 403)"
  );

  // Test 7: Orden no encontrada (404)
  await testCanRequestRefund(
    testEventId,
    testUserId,
    "order-inexistente-999",
    "20251101",
    "Orden no encontrada (DEBE DAR ERROR 404)"
  );

  // Test 8: Error de formato de fecha
  await testCanRequestRefund(
    testEventId,
    testUserId,
    testOrderId,
    "2025-11-01", // Formato incorrecto
    "Formato de fecha incorrecto (DEBE DAR ERROR)"
  );

  // Test 9: Evento no encontrado
  await testCanRequestRefund(
    "evento-inexistente-123",
    testUserId,
    testOrderId,
    "20251101",
    "Evento no encontrado (DEBE DAR ERROR 404)"
  );

  console.log(
    `\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.green}✅ Pruebas completadas${colors.reset}`);
  console.log(
    `${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`
  );

  console.log(`${colors.yellow}📝 Próximos pasos:${colors.reset}`);
  console.log(
    `   1. Verifica que tengas eventos en DynamoDB con diferentes categorías:`
  );
  console.log(`      - categoriaReembolso: "30" (30 días de anticipación)`);
  console.log(`      - categoriaReembolso: "7" (7 días de anticipación)`);
  console.log(`      - categoriaReembolso: "1" (1 día de anticipación)`);
  console.log(`      - categoriaReembolso: "0" (evaluación manual)`);
  console.log(`      - categoriaReembolso: "N" (no permite reembolsos)`);
  console.log(`   2. Actualiza el eventId en este script con IDs reales`);
  console.log(`   3. Ejecuta: node test-canRequestRefund.js\n`);
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllTests().catch((error) => {
    console.error(`${colors.red}❌ Error fatal:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { testCanRequestRefund, runAllTests };
