/**
 * Script de prueba para el servicio de reembolso
 * 
 * Ejecutar con: node test-refund-service.js
 * 
 * IMPORTANTE: Ajusta los valores de userId, orderId, etc. según tu entorno
 * NOTA: Utiliza la tabla existente ticketsCancelation para trazabilidad
 */

const axios = require('axios');

// Configuración
const API_BASE_URL = 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com'; // Reemplazar con tu API
const TEST_USER_ID = 'user-123'; // Reemplazar con un usuario de prueba
const TEST_ORDER_ID = 'order-abc-456'; // Reemplazar con una orden de prueba

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  title: (msg) => console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}\n${colors.cyan}${msg}${colors.reset}\n${colors.cyan}${'='.repeat(50)}${colors.reset}\n`)
};

/**
 * Test 1: Validar que el usuario puede solicitar reembolso
 */
async function testCanRequestRefund(eventId) {
  log.title('TEST 1: Validar si se puede solicitar reembolso');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/canRequestRefund/${eventId}`,
      {
        userId: TEST_USER_ID,
        orderId: TEST_ORDER_ID,
        currentDate: new Date().toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD
      }
    );
    
    if (response.data.success && response.data.data.canRequestRefund) {
      log.success('El usuario PUEDE solicitar reembolso');
      console.log('  Razón:', response.data.data.reason);
      console.log('  Días hasta el evento:', response.data.data.daysUntilEvent);
      return true;
    } else {
      log.warning('El usuario NO puede solicitar reembolso');
      console.log('  Razón:', response.data.data.reason);
      return false;
    }
  } catch (error) {
    log.error('Error en la validación');
    console.error('  Detalle:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test 2: Procesar reembolso total (todas las boletas)
 */
async function testFullRefund() {
  log.title('TEST 2: Reembolso Total (todas las boletas)');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/processRefund`,
      {
        userId: TEST_USER_ID,
        orderId: TEST_ORDER_ID,
        reason: 'Prueba de reembolso total - automatizada'
      }
    );
    
    if (response.data.success) {
      log.success('Reembolso procesado exitosamente');
      console.log('\n  📊 Detalles del reembolso:');
      console.log('    - ID de reembolso:', response.data.data.refundId);
      console.log('    - Tipo:', response.data.data.refundType);
      console.log('    - Estado:', response.data.data.refundStatus);
      console.log('    - Tickets reembolsados:', response.data.data.ticketsRefunded);
      console.log('    - Monto:', response.data.data.refundAmount, response.data.data.currency);
      console.log('    - Nuevo estado de orden:', response.data.data.orderNewStatus);
      
      console.log('\n  🎫 Tickets reembolsados:');
      response.data.data.ticketDetails.forEach((ticket, index) => {
        console.log(`    ${index + 1}. ${ticket.category} - ${ticket.seat} ($${ticket.price})`);
      });
      
      return response.data.data;
    } else {
      log.error('Error en el reembolso');
      console.log('  Mensaje:', response.data.message);
      return null;
    }
  } catch (error) {
    log.error('Error procesando reembolso total');
    console.error('  Detalle:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test 3: Procesar reembolso parcial (boletas específicas)
 */
async function testPartialRefund(ticketInstanceIds) {
  log.title('TEST 3: Reembolso Parcial (boletas específicas)');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/processRefund`,
      {
        userId: TEST_USER_ID,
        orderId: TEST_ORDER_ID,
        ticketInstanceIds: ticketInstanceIds,
        reason: 'Prueba de reembolso parcial - automatizada'
      }
    );
    
    if (response.data.success) {
      log.success('Reembolso parcial procesado exitosamente');
      console.log('\n  📊 Detalles del reembolso:');
      console.log('    - ID de reembolso:', response.data.data.refundId);
      console.log('    - Tipo:', response.data.data.refundType);
      console.log('    - Estado:', response.data.data.refundStatus);
      console.log('    - Tickets reembolsados:', response.data.data.ticketsRefunded);
      console.log('    - Monto:', response.data.data.refundAmount, response.data.data.currency);
      
      console.log('\n  🎫 Tickets reembolsados:');
      response.data.data.ticketDetails.forEach((ticket, index) => {
        console.log(`    ${index + 1}. ${ticket.ticketInstanceId}: ${ticket.category} - ${ticket.seat} ($${ticket.price})`);
      });
      
      return response.data.data;
    } else {
      log.error('Error en el reembolso parcial');
      console.log('  Mensaje:', response.data.message);
      return null;
    }
  } catch (error) {
    log.error('Error procesando reembolso parcial');
    console.error('  Detalle:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test 4: Intentar reembolsar una orden que no pertenece al usuario
 */
async function testUnauthorizedRefund() {
  log.title('TEST 4: Reembolso No Autorizado (orden de otro usuario)');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/processRefund`,
      {
        userId: 'fake-user-999', // Usuario diferente
        orderId: TEST_ORDER_ID,
        reason: 'Prueba de seguridad - debe fallar'
      }
    );
    
    log.error('⚠️  FALLO DE SEGURIDAD: Se procesó un reembolso no autorizado');
    return false;
  } catch (error) {
    if (error.response?.status === 403) {
      log.success('Seguridad correcta: Reembolso rechazado (403 Forbidden)');
      console.log('  Mensaje:', error.response.data.message);
      return true;
    } else {
      log.warning('Error inesperado en la prueba de seguridad');
      console.log('  Detalle:', error.response?.data || error.message);
      return false;
    }
  }
}

/**
 * Test 5: Intentar reembolsar tickets que no existen
 */
async function testInvalidTickets() {
  log.title('TEST 5: Reembolso con Tickets Inválidos');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/processRefund`,
      {
        userId: TEST_USER_ID,
        orderId: TEST_ORDER_ID,
        ticketInstanceIds: ['fake-ticket-1', 'fake-ticket-2'], // Tickets que no existen
        reason: 'Prueba con tickets inválidos - debe fallar'
      }
    );
    
    log.error('⚠️  VALIDACIÓN FALLIDA: Se procesó un reembolso con tickets inválidos');
    return false;
  } catch (error) {
    if (error.response?.status === 404) {
      log.success('Validación correcta: Tickets inválidos rechazados (404 Not Found)');
      console.log('  Mensaje:', error.response.data.message);
      return true;
    } else {
      log.warning('Error inesperado en la prueba de validación');
      console.log('  Detalle:', error.response?.data || error.message);
      return false;
    }
  }
}

/**
 * Test 6: Idempotencia - Solicitud duplicada
 */
async function testIdempotency(ticketInstanceIds) {
  log.title('TEST 6: Idempotencia - Solicitud Duplicada');
  
  try {
    // Primera llamada
    log.info('📤 Primera llamada: procesando reembolso...');
    const firstResponse = await axios.post(
      `${API_BASE_URL}/processRefund`,
      {
        userId: TEST_USER_ID,
        orderId: TEST_ORDER_ID,
        ticketInstanceIds: ticketInstanceIds,
        reason: 'Prueba de idempotencia - primera llamada'
      }
    );
    
    if (!firstResponse.data.success) {
      log.error('Primera llamada falló');
      return false;
    }
    
    const firstRefundId = firstResponse.data.data.refundId;
    log.success(`Primera llamada exitosa: ${firstRefundId}`);
    
    // Esperar un momento
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Segunda llamada idéntica
    log.info('📤 Segunda llamada: mismos datos...');
    const secondResponse = await axios.post(
      `${API_BASE_URL}/processRefund`,
      {
        userId: TEST_USER_ID,
        orderId: TEST_ORDER_ID,
        ticketInstanceIds: ticketInstanceIds,
        reason: 'Prueba de idempotencia - segunda llamada'
      }
    );
    
    if (!secondResponse.data.success) {
      log.error('Segunda llamada falló inesperadamente');
      return false;
    }
    
    // Verificar que devolvió el mismo reembolso
    const secondRefundId = secondResponse.data.data.refundId;
    const isDuplicate = secondResponse.data.duplicate;
    
    if (secondRefundId === firstRefundId && isDuplicate === true) {
      log.success('✅ IDEMPOTENCIA CORRECTA: Segunda llamada devolvió el mismo reembolso sin duplicar');
      console.log('  - Primer refund ID:', firstRefundId);
      console.log('  - Segundo refund ID:', secondRefundId);
      console.log('  - Campo duplicate:', isDuplicate);
      console.log('  - Mensaje:', secondResponse.data.message);
      return true;
    } else {
      log.error('❌ FALLO DE IDEMPOTENCIA: Se creó un reembolso duplicado');
      console.log('  - Primer refund ID:', firstRefundId);
      console.log('  - Segundo refund ID:', secondRefundId);
      console.log('  - Campo duplicate:', isDuplicate);
      return false;
    }
  } catch (error) {
    log.error('Error en la prueba de idempotencia');
    console.error('  Detalle:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Función principal de pruebas
 *  // Test 6: Idempotencia
    log.warning('\n⚠️  TEST 6 deshabilitado por defecto (modifica datos reales)');
    log.info('   Para ejecutar, descomenta la línea y proporciona ticketInstanceIds');
    // const idempotencyResult = await testIdempotency(['ticket-1', 'ticket-2']);
    // results.total++;
    // if (idempotencyResult) results.passed++; else results.failed++;
    
  /
async function runTests() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║        🧪 SUITE DE PRUEBAS - SERVICIO DE REEMBOLSOS 🧪        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  log.info('Configuración de pruebas:');
  console.log('  - API Base URL:', API_BASE_URL);
  console.log('  - User ID:', TEST_USER_ID);
  console.log('  - Order ID:', TEST_ORDER_ID);
  
  log.warning('\n⚠️  IMPORTANTE: Asegúrate de que estos valores sean correctos antes de continuar');
  log.warning('⚠️  Estas pruebas modificarán datos reales en la base de datos\n');
  
  // Esperar confirmación (en un entorno real, podrías querer comentar esto)
  // const readline = require('readline').createInterface({
  //   input: process.stdin,
  //   output: process.stdout
  // });
  // await new Promise((resolve) => {
  //   readline.question('¿Deseas continuar? (y/n): ', (answer) => {
  //     readline.close();
  //     if (answer.toLowerCase() !== 'y') {
  //       console.log('Pruebas canceladas');
  //       process.exit(0);
  //     }
  //     resolve();
  //   });
  // });
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };
  
  // Ejecutar pruebas
  try {
    // Test 1: Validar permisos de reembolso (requiere eventId)
    log.warning('\nℹ️  TEST 1 omitido: requiere un eventId válido');
    log.info('   Para ejecutar este test, llama a testCanRequestRefund(eventId)');
    
    // Test 2: Reembolso total
    log.warning('\n⚠️  TEST 2 deshabilitado por defecto (modifica datos reales)');
    log.info('   Para ejecutar, descomenta la línea correspondiente');
    // const fullRefundResult = await testFullRefund();
    // results.total++;
    // if (fullRefundResult) results.passed++; else results.failed++;
    
    // Test 3: Reembolso parcial (requiere ticketInstanceIds)
    log.warning('\n⚠️  TEST 3 deshabilitado por defecto (modifica datos reales)');
    log.info('   Para ejecutar, descomenta la línea y proporciona ticketInstanceIds');
    // const partialRefundResult = await testPartialRefund(['ticket-1', 'ticket-2']);
    // results.total++;
    // if (partialRefundResult) results.passed++; else results.failed++;
    
    // Test 4: Seguridad - orden de otro usuario
    log.warning('\n⚠️  TEST 4 deshabilitado por defecto');
    // const unauthorizedResult = await testUnauthorizedRefund();
    // results.total++;
    // if (unauthorizedResult) results.passed++; else results.failed++;
    
    // Test 5: Tickets inválidos
    log.warning('\n⚠️  TEST 5 deshabilitado por defecto');
    // const invalidTicketsResult = await testInvalidTickets();
    // results.total++;
    // if (invalidTicketsResult) results.passed++; else results.failed++;
    
  } catch (error) {
    log.error('Error inesperado durante las pruebas');
    console.error(error);
  }
  
  // Resumen
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                      RESUMEN DE PRUEBAS                        ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`  Total de pruebas: ${results.total}`);
  console.log(`  ${colors.green}✓ Pasadas: ${results.passed}${colors.reset}`);
  console.log(`  ${colors.red}✗ Fallidas: ${results.failed}${colors.reset}`);
  
  if (results.total === 0) {
    log.warning('\n⚠️  No se ejecutaron pruebas. Descomenta las líneas de los tests para ejecutarlos.');
    log.info('   Recuerda actualizar API_BASE_URL, TEST_USER_ID y TEST_ORDER_ID con valores reales.');
  }
  
  console.log('\n');
}
,
  testIdempotency
// Exportar funciones para uso individual
module.exports = {
  testCanRequestRefund,
  testFullRefund,
  testPartialRefund,
  testUnauthorizedRefund,
  testInvalidTickets
};

// Ejecutar si se llama directamente
if (require.main === module) {
  runTests();
}
