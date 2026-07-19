const axios = require('axios');

// Test de notificación directa
async function testNotification() {
  try {
    console.log('🔔 Enviando notificación de prueba...');
    
    const response = await axios.post(
      'https://q4b7qzgxyi.execute-api.us-east-1.amazonaws.com/dev/notifications/trigger',
      {
        triggerId: 'TICKET_TRANSFERRED_RECEIVED',
        userId: '42c2e4a4-01', // ID del receptor
        channels: ['inApp', 'push', 'email', 'whatsapp'],
        metadata: {
          senderName: 'Usuario de Prueba',
          receiverName: 'Receptor',
          userName: 'Receptor',
          senderUserId: 'sender-test-id',
          ticketCount: 1,
          eventName: 'Evento de Prueba',
          eventId: 'test-event-id',
          eventImage: '',
          orderID: 'test-order-id',
          eventDate: '2026-02-01',
          eventLocation: 'Test Location'
        }
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    console.log('✅ Respuesta:', response.status);
    console.log('📦 Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('📛 Status:', error.response.status);
      console.error('📛 Data:', error.response.data);
    }
  }
}

testNotification();
