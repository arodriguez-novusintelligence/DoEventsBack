/**
 * Script de prueba LOCAL para canRequestRefund
 *
 * Ejecuta la función directamente sin necesidad de desplegarla a AWS
 * Útil para desarrollo y debugging rápido
 */

// Simular variables de entorno
process.env.AWS_REGION = "us-east-1";
process.env.EVENTS_TABLE = "Eventos";
process.env.ORDERS_TABLE = "Orders";

const { canRequestRefund } = require("./src/canRequestRefund");

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

/**
 * Ejecuta una prueba local de la función
 */
async function testLocal(eventId, userId, orderId, currentDate, description) {
  console.log(
    `\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.blue}🧪 ${description}${colors.reset}`);
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );

  const event = {
    pathParameters: {
      eventId: eventId,
    },
    body: JSON.stringify({
      userId: userId,
      orderId: orderId,
      currentDate: currentDate,
    }),
  };

  console.log(`📋 Parámetros:`);
  console.log(`   EventId: ${eventId}`);
  console.log(`   UserId: ${userId}`);
  console.log(`   OrderId: ${orderId}`);
  console.log(`   CurrentDate: ${currentDate}\n`);

  try {
    const startTime = Date.now();
    const result = await canRequestRefund(event);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Duración: ${duration}ms`);
    console.log(`📊 StatusCode: ${result.statusCode}`);

    const body = JSON.parse(result.body);

    if (result.statusCode === 200 && body.success) {
      console.log(`${colors.green}✅ Resultado exitoso${colors.reset}\n`);
      console.log(`📌 Datos:`);
      console.log(`   Evento: ${body.data.eventName}`);
      console.log(`   Fecha del evento: ${body.data.eventDate}`);
      console.log(`   Fecha actual: ${body.data.currentDate}`);
      console.log(`   Días faltantes: ${body.data.daysUntilEvent}`);
      console.log(`   Categoría: ${body.data.refundCategory}`);

      if (body.data.canRequestRefund) {
        console.log(`   Puede solicitar: ${colors.green}✅ SÍ${colors.reset}`);
      } else {
        console.log(`   Puede solicitar: ${colors.red}❌ NO${colors.reset}`);
      }

      if (body.data.requiresManualReview) {
        console.log(
          `   Revisión manual: ${colors.yellow}⚠️  SÍ${colors.reset}`
        );
      } else {
        console.log(`   Revisión manual: NO`);
      }

      console.log(`\n   ${colors.magenta}💬 Razón:${colors.reset}`);
      console.log(`   ${body.data.reason}`);
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
      `${colors.red}❌ Error al ejecutar función:${colors.reset}`,
      error.message
    );
    console.error(error.stack);
    return null;
  }
}

/**
 * Ejecuta todos los tests locales
 */
async function runLocalTests() {
  console.log(
    `\n${colors.yellow}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.yellow}║  🧪 PRUEBAS LOCALES - VALIDACIÓN DE REEMBOLSOS            ║${colors.reset}`
  );
  console.log(
    `${colors.yellow}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );
  console.log(`📍 Modo: Local (sin desplegar a AWS)\n`);

  // IMPORTANTE: Reemplaza estos valores con datos reales de tu base de datos
  const testEventId = "3adf210f-716b-43fb-84b4-ece5e2119af2";
  const testUserId = "42c2e4a4-0";
  const testOrderId = "test-cf0f7283-31"; // Una orden válida del evento

  console.log(`${colors.yellow}⚠️  NOTA IMPORTANTE:${colors.reset}`);
  console.log(`   Este script conecta directamente a DynamoDB en AWS`);
  console.log(`   Asegúrate de tener credenciales AWS configuradas`);
  console.log(`   EventId: ${testEventId}`);
  console.log(`   UserId: ${testUserId}`);
  console.log(`   OrderId: ${testOrderId}\n`);

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Orden válida - CON suficiente anticipación
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const test1 = await testLocal(
    testEventId,
    testUserId,
    testOrderId,
    "20251101",
    "Test 1: Orden válida - Con 53 días de anticipación"
  );
  if (test1?.success) testsPassed++;
  else testsFailed++;

  // Test 2: Orden válida - SIN suficiente anticipación
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const test2 = await testLocal(
    testEventId,
    testUserId,
    testOrderId,
    "20251210",
    "Test 2: Orden válida - Con 14 días de anticipación (puede rechazar según categoría)"
  );
  if (test2?.success) testsPassed++;
  else testsFailed++;

  // Test 3: Orden inválida - userId incorrecto
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const test3 = await testLocal(
    testEventId,
    "usuario-incorrecto-123",
    testOrderId,
    "20251205",
    "Test 3: userId incorrecto (debe fallar con 403)"
  );
  if (test3 && !test3.success) testsPassed++;
  else testsFailed++;

  // Test 4: Orden inexistente
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const test4 = await testLocal(
    testEventId,
    testUserId,
    "orden-inexistente-123",
    "20251205",
    "Test 4: Orden inexistente (debe fallar con 404)"
  );
  if (test4 && !test4.success) testsPassed++;
  else testsFailed++;

  // Test 5: Falta userId
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const event5 = {
    pathParameters: { eventId: testEventId },
    body: JSON.stringify({ orderId: testOrderId, currentDate: "20251101" }),
  };
  const test5 = await canRequestRefund(event5);
  const body5 = JSON.parse(test5.body);
  console.log(`Test 5: Sin userId (debe fallar con 400)`);
  console.log(`StatusCode: ${test5.statusCode}`);
  console.log(`Message: ${body5.message}\n`);
  if (!body5.success) testsPassed++;
  else testsFailed++;

  // Test 6: Falta orderId
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const event6 = {
    pathParameters: { eventId: testEventId },
    body: JSON.stringify({ userId: testUserId, currentDate: "20251101" }),
  };
  const test6 = await canRequestRefund(event6);
  const body6 = JSON.parse(test6.body);
  console.log(`Test 6: Sin orderId (debe fallar con 400)`);
  console.log(`StatusCode: ${test6.statusCode}`);
  console.log(`Message: ${body6.message}\n`);
  if (!body6.success) testsPassed++;
  else testsFailed++;

  // Test 7: Formato incorrecto de fecha
  console.log(
    `${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  const test7 = await testLocal(
    testEventId,
    testUserId,
    testOrderId,
    "2025-11-01",
    "Test 7: Formato de fecha incorrecto (debe fallar con 400)"
  );
  if (test7 && !test7.success) testsPassed++;
  else testsFailed++;

  // Resumen final
  console.log(
    `\n${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(`${colors.yellow}📊 RESUMEN DE PRUEBAS${colors.reset}`);
  console.log(
    `${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}\n`
  );

  console.log(`   Tests ejecutados: ${testsPassed + testsFailed}`);
  console.log(`   ${colors.green}✅ Exitosos: ${testsPassed}${colors.reset}`);
  console.log(`   ${colors.red}❌ Fallidos: ${testsFailed}${colors.reset}\n`);

  if (testsFailed === 0) {
    console.log(
      `${colors.green}🎉 ¡Todas las pruebas pasaron exitosamente!${colors.reset}\n`
    );
  } else {
    console.log(
      `${colors.yellow}⚠️  Revisa los tests fallidos arriba${colors.reset}\n`
    );
  }

  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`
  );
  console.log(`${colors.cyan}📝 Próximos pasos:${colors.reset}\n`);
  console.log(`   1. Si las pruebas locales pasan, despliega a AWS:`);
  console.log(
    `      ${colors.magenta}serverless deploy --stage dev${colors.reset}\n`
  );
  console.log(`   2. Prueba el endpoint desplegado:`);
  console.log(
    `      ${colors.magenta}node test-canRequestRefund.js${colors.reset}\n`
  );
  console.log(`   3. Verifica los logs en CloudWatch`);
  console.log(
    `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`
  );
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runLocalTests().catch((error) => {
    console.error(`${colors.red}❌ Error fatal:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { testLocal, runLocalTests };
