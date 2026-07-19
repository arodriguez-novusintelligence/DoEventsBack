const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Función para crear un evento de prueba con órdenes
async function createTestEventWithOrders() {
  console.log('🎯 Creando evento de prueba con órdenes...');
  
  const eventId = 'test-event-notifications-' + Date.now();
  const userId = '42c2e4a4-06fc-4b60-b0bc-97667b5edb40'; // Usuario que sabemos que existe
  
  try {
    // 1. Crear evento de prueba
    const eventItem = {
      id: eventId,
      nombre: 'Evento de Prueba para Notificaciones',
      fechaIni: '20251120',
      fechaFin: '20251120',
      lugar: 'Lugar de Prueba',
      estatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'Eventos',
      Item: eventItem
    }).promise();

    console.log('✅ Evento creado:', eventId);

    // 2. Crear orden APPROVED de prueba
    const orderId = 'order-test-' + Date.now();
    const orderItem = {
      id: orderId,
      event_id: eventId,
      user_id: userId,
      payment_status: 'APPROVED',
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dynamodb.put({
      TableName: 'Orders',
      Item: orderItem
    }).promise();

    console.log('✅ Orden creada:', orderId);

    return {
      eventId,
      orderId,
      userId
    };

  } catch (error) {
    console.error('❌ Error creando datos de prueba:', error);
    throw error;
  }
}

// Función para limpiar datos de prueba
async function cleanupTestData(eventId, orderId) {
  console.log('🧹 Limpiando datos de prueba...');
  
  try {
    // Eliminar orden
    await dynamodb.delete({
      TableName: 'Orders',
      Key: { id: orderId }
    }).promise();

    // Eliminar evento
    await dynamodb.delete({
      TableName: 'Eventos',
      Key: { id: eventId }
    }).promise();

    console.log('✅ Datos de prueba eliminados');
  } catch (error) {
    console.error('❌ Error limpiando datos:', error);
  }
}

// Función principal de prueba
async function testFullNotificationFlow() {
  console.log('🚀 Iniciando prueba completa de notificaciones...\n');
  
  let testData = null;
  
  try {
    // 1. Crear datos de prueba
    testData = await createTestEventWithOrders();
    
    console.log('\n📋 Datos de prueba creados:');
    console.log('Event ID:', testData.eventId);
    console.log('Order ID:', testData.orderId);
    console.log('User ID:', testData.userId);

    // 2. Esperar un momento para que los datos se propaguen
    console.log('\n⏰ Esperando propagación de datos...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Probar cancelación
    console.log('\n🧪 Probando cancelación...');
    const lambda = new AWS.Lambda({ region: 'us-east-1' });
    
    const cancelPayload = {
      eventId: testData.eventId,
      reason: 'Prueba completa de notificaciones - Cancelación'
    };

    const cancelResult = await lambda.invoke({
      FunctionName: 'aws-lambda-manageevent-dev-cancelEvent',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ body: JSON.stringify(cancelPayload) })
    }).promise();

    const cancelResponse = JSON.parse(cancelResult.Payload);
    console.log('📥 Resultado de cancelación:', JSON.stringify(cancelResponse, null, 2));

    if (cancelResponse.statusCode === 200) {
      const body = JSON.parse(cancelResponse.body);
      console.log('✅ Cancelación exitosa!');
      console.log(`📊 Órdenes afectadas: ${body.data.affectedOrders}`);
    } else {
      console.log('❌ Error en cancelación:', cancelResponse);
    }

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  } finally {
    // 4. Limpiar datos de prueba
    if (testData) {
      await cleanupTestData(testData.eventId, testData.orderId);
    }
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  testFullNotificationFlow().catch(console.error);
}

module.exports = {
  createTestEventWithOrders,
  cleanupTestData,
  testFullNotificationFlow
};