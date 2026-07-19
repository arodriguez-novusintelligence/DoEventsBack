const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({ 
  region: 'us-east-1'
});

async function findApprovedOrders() {
  try {
    console.log('🔍 Buscando órdenes con payment_status APPROVED...');
    
    // Buscar órdenes APPROVED usando el campo correcto
    const ordersResult = await dynamoDB.scan({
      TableName: 'Orders',
      FilterExpression: 'payment_status = :approved',
      ExpressionAttributeValues: {
        ':approved': 'APPROVED'
      },
      Limit: 10
    }).promise();
    
    console.log(`📋 Total órdenes APPROVED encontradas: ${ordersResult.Items.length}`);
    
    if (ordersResult.Items.length > 0) {
      // Agrupar por event_id
      const eventOrderCounts = {};
      ordersResult.Items.forEach(order => {
        const eventId = order.event_id;
        if (!eventOrderCounts[eventId]) {
          eventOrderCounts[eventId] = 0;
        }
        eventOrderCounts[eventId]++;
      });
      
      console.log('\n🎯 Event IDs con órdenes APPROVED:');
      const eventIds = Object.keys(eventOrderCounts);
      
      for (let i = 0; i < eventIds.length; i++) {
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
            console.log(`   📊 Órdenes APPROVED: ${orderCount}`);
            console.log(`   📅 Status: ${event.status}`);
            console.log(`   🏷️  Nombre: ${event.name}`);
            console.log(`   📅 Fecha: ${event.startDate} - ${event.endDate}`);
            
            if (event.status === 'ACTIVE') {
              console.log(`   ✅ ¡PERFECTO! Este evento está ACTIVO y tiene ${orderCount} órdenes APPROVED`);
            } else {
              console.log(`   ⚠️  Este evento está en status: ${event.status}`);
            }
          } else {
            console.log(`\n${i + 1}. Event ID: ${eventId} (${orderCount} órdenes) - Evento no encontrado en tabla Events`);
          }
        } catch (error) {
          console.log(`\n${i + 1}. Event ID: ${eventId} (${orderCount} órdenes) - Error: ${error.message}`);
        }
      }
      
      // Buscar específicamente eventos ACTIVE con órdenes APPROVED
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
      
      console.log(`\n🚀 EVENTOS IDEALES PARA TESTING (ACTIVE + órdenes APPROVED):`);
      console.log(`Total encontrados: ${activeEventsWithOrders.length}`);
      
      if (activeEventsWithOrders.length > 0) {
        console.log('\n✨ Los mejores candidatos son:');
        activeEventsWithOrders.forEach((item, index) => {
          console.log(`${index + 1}. ${item.eventId}`);
          console.log(`   📊 ${item.orderCount} órdenes APPROVED`);
          console.log(`   🏷️  "${item.event.name}"`);
          console.log(`   📅 ${item.event.startDate} - ${item.event.endDate}`);
          console.log('');
        });
        
        if (activeEventsWithOrders.length > 0) {
          console.log(`🎯 RECOMENDACIÓN: Usa el Event ID: ${activeEventsWithOrders[0].eventId}`);
          console.log(`   Este evento tiene ${activeEventsWithOrders[0].orderCount} órdenes APPROVED y está ACTIVO`);
        }
      } else {
        console.log('❌ No se encontraron eventos ACTIVE con órdenes APPROVED');
        console.log('💡 Puedes usar cualquiera de los eventos listados arriba, pero ten en cuenta que pueden estar CANCELLED o en otro estado');
      }
      
    } else {
      console.log('❌ No se encontraron órdenes con payment_status APPROVED');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findApprovedOrders().catch(console.error);