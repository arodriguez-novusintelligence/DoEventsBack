const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({ 
  region: 'us-east-1'
});

async function findEventsWithOrders() {
  try {
    console.log('🔍 Buscando eventos con órdenes APPROVED...');
    
    // Buscar órdenes APPROVED
    const ordersResult = await dynamoDB.scan({
      TableName: 'Orders',
      FilterExpression: '#status = :approved',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':approved': 'APPROVED'
      },
      Limit: 20
    }).promise();
    
    console.log(`📋 Total órdenes APPROVED encontradas: ${ordersResult.Items.length}`);
    
    if (ordersResult.Items.length > 0) {
      // Agrupar por eventId
      const eventOrderCounts = {};
      ordersResult.Items.forEach(order => {
        const eventId = order.eventId;
        if (!eventOrderCounts[eventId]) {
          eventOrderCounts[eventId] = 0;
        }
        eventOrderCounts[eventId]++;
      });
      
      console.log('\n🎯 Event IDs con órdenes APPROVED:');
      const eventIds = Object.keys(eventOrderCounts);
      
      for (let i = 0; i < Math.min(5, eventIds.length); i++) {
        const eventId = eventIds[i];
        const orderCount = eventOrderCounts[eventId];
        
        try {
          const eventResult = await dynamoDB.get({
            TableName: 'Events',
            Key: { eventId }
          }).promise();
          
          if (eventResult.Item) {
            const event = eventResult.Item;
            console.log(`\n${i + 1}. Event ID: ${eventId}`);
            console.log(`   📊 Órdenes: ${orderCount}`);
            console.log(`   📅 Status: ${event.status}`);
            console.log(`   🏷️  Nombre: ${event.name}`);
            console.log(`   📅 Fecha: ${event.startDate} - ${event.endDate}`);
            
            if (event.status === 'ACTIVE') {
              console.log(`   ✅ Este evento está ACTIVO y tiene ${orderCount} órdenes - ¡Perfecto para testing!`);
            }
          } else {
            console.log(`\n${i + 1}. Event ID: ${eventId} (Evento no encontrado en tabla Events)`);
          }
        } catch (error) {
          console.log(`\n${i + 1}. Event ID: ${eventId} - Error: ${error.message}`);
        }
      }
      
      // Buscar específicamente eventos ACTIVE con órdenes
      const activeEventsWithOrders = [];
      for (const eventId of eventIds) {
        try {
          const eventResult = await dynamoDB.get({
            TableName: 'Events',
            Key: { eventId }
          }).promise();
          
          if (eventResult.Item && eventResult.Item.status === 'ACTIVE') {
            activeEventsWithOrders.push({
              eventId,
              orderCount: eventOrderCounts[eventId],
              event: eventResult.Item
            });
          }
        } catch (error) {
          // Continuar con el siguiente
        }
      }
      
      console.log(`\n🎯 Eventos ACTIVE con órdenes APPROVED: ${activeEventsWithOrders.length}`);
      if (activeEventsWithOrders.length > 0) {
        console.log('\n🚀 Mejores candidatos para testing:');
        activeEventsWithOrders.slice(0, 3).forEach((item, index) => {
          console.log(`${index + 1}. ${item.eventId} (${item.orderCount} órdenes) - "${item.event.name}"`);
        });
      }
      
    } else {
      console.log('❌ No se encontraron órdenes APPROVED');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findEventsWithOrders().catch(console.error);