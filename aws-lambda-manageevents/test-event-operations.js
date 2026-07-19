const https = require('https');

// Función para hacer peticiones HTTP
function makeRequest(url, method, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test de cancelación de evento
async function testCancelEvent() {
  console.log('🧪 Probando cancelación de evento con notificaciones completas...');
  
  const cancelUrl = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/cancelEvent';
  
  // Usar un eventId que existe en la base de datos con órdenes APPROVED
  const testPayload = {
    eventId: '6f3a2a56-4978-462a-824e-ab2390a81e27', // Mismo ID que usamos en las pruebas
    reason: 'Prueba de cancelación con notificaciones completas'
  };

  try {
    console.log('📤 Enviando petición de cancelación...');
    console.log('URL:', cancelUrl);
    console.log('Payload:', JSON.stringify(testPayload, null, 2));

    const result = await makeRequest(cancelUrl, 'POST', testPayload);
    
    console.log('📥 Respuesta recibida:');
    console.log('Status:', result.statusCode);
    console.log('Body:', JSON.stringify(result.body, null, 2));

    if (result.statusCode === 200 && result.body.success) {
      console.log('✅ Cancelación exitosa!');
      console.log(`📊 Órdenes afectadas: ${result.body.data.affectedOrders}`);
      console.log(`📅 Evento ID: ${result.body.data.eventId}`);
    } else {
      console.log('❌ Error en la cancelación:', result.body);
    }

  } catch (error) {
    console.error('❌ Error ejecutando prueba:', error);
  }
}

// Test de reprogramación de evento
async function testRescheduleEvent() {
  console.log('\n🧪 Probando reprogramación de evento con notificaciones completas...');
  
  const rescheduleUrl = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/rescheduleEvent';
  
  const testPayload = {
    eventId: '6f3a2a56-4978-462a-824e-ab2390a81e27', // Mismo ID que usamos en las pruebas
    newStartDate: '20251215', // Nueva fecha de inicio
    newEndDate: '20251215',   // Nueva fecha de fin
    reason: 'Prueba de reprogramación con notificaciones completas'
  };

  try {
    console.log('📤 Enviando petición de reprogramación...');
    console.log('URL:', rescheduleUrl);
    console.log('Payload:', JSON.stringify(testPayload, null, 2));

    const result = await makeRequest(rescheduleUrl, 'POST', testPayload);
    
    console.log('📥 Respuesta recibida:');
    console.log('Status:', result.statusCode);
    console.log('Body:', JSON.stringify(result.body, null, 2));

    if (result.statusCode === 200 && result.body.success) {
      console.log('✅ Reprogramación exitosa!');
      console.log(`📊 Órdenes afectadas: ${result.body.data.affectedOrders}`);
      console.log(`📅 Evento ID: ${result.body.data.eventId}`);
      console.log(`📅 Nueva fecha: ${result.body.data.newStartDate} - ${result.body.data.newEndDate}`);
    } else {
      console.log('❌ Error en la reprogramación:', result.body);
    }

  } catch (error) {
    console.error('❌ Error ejecutando prueba:', error);
  }
}

// Ejecutar las pruebas
async function runTests() {
  console.log('🚀 Iniciando pruebas de eventos con notificaciones\n');
  
  await testCancelEvent();
  console.log('\n' + '='.repeat(50));
  await testRescheduleEvent();
  
  console.log('\n✨ Pruebas completadas');
  console.log('\n📱 Revisa:');
  console.log('- Tu WhatsApp para mensajes');
  console.log('- Tu aplicación móvil para push notifications');
  console.log('- El WebSocket client para notificaciones in-app');
  console.log('- Tu email para correos');
}

// Solo ejecutar si es llamado directamente
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testCancelEvent,
  testRescheduleEvent,
  runTests
};