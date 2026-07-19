// Script de prueba para las notificaciones de eventos reprogramados y cancelados
const AWS = require('aws-sdk');

// Configurar AWS
const lambda = new AWS.Lambda({
  region: 'us-east-1'
});

// Ejemplo de prueba para evento reprogramado
async function testEventRescheduled() {
  console.log('🧪 Probando notificaciones para evento reprogramado...');
  
  const payload = {
    eventId: 'test-event-123',
    templateKey: 'EVENT_RESCHEDULED',
    eventData: {
      eventId: 'test-event-123',
      eventName: 'Concierto de Prueba - Rock en Vivo',
      originalStartDate: '20251120',
      originalEndDate: '20251120',
      newStartDate: '20251215',
      newEndDate: '20251215',
      reason: 'Cambio de sede por capacidad insuficiente',
      venue: 'Estadio Nacional'
    }
  };

  try {
    const result = await lambda.invoke({
      FunctionName: 'notifications-dev-notifyEventAffectedUsers',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    }).promise();

    const response = JSON.parse(result.Payload);
    console.log('✅ Resultado de prueba reprogramación:', response);
  } catch (error) {
    console.error('❌ Error en prueba de reprogramación:', error);
  }
}

// Ejemplo de prueba para evento cancelado
async function testEventCancelled() {
  console.log('🧪 Probando notificaciones para evento cancelado...');
  
  const payload = {
    eventId: 'test-event-456',
    templateKey: 'EVENT_CANCELLED',
    eventData: {
      eventId: 'test-event-456',
      eventName: 'Festival de Jazz - Edición Especial',
      eventStartDate: '20251110',
      originalStartDate: '20251110',
      originalEndDate: '20251110',
      reason: 'Problemas técnicos con el escenario principal',
      venue: 'Parque Central'
    }
  };

  try {
    const result = await lambda.invoke({
      FunctionName: 'notifications-dev-notifyEventAffectedUsers',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    }).promise();

    const response = JSON.parse(result.Payload);
    console.log('✅ Resultado de prueba cancelación:', response);
  } catch (error) {
    console.error('❌ Error en prueba de cancelación:', error);
  }
}

// Ejecutar pruebas
async function runTests() {
  console.log('🚀 Iniciando pruebas de notificaciones de eventos\n');
  
  await testEventRescheduled();
  console.log('\n' + '='.repeat(50) + '\n');
  await testEventCancelled();
  
  console.log('\n✨ Pruebas completadas');
}

// Solo ejecutar si es llamado directamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testEventRescheduled,
  testEventCancelled,
  runTests
};