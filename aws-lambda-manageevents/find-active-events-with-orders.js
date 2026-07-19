const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({ 
  region: 'us-east-1'
});

async function findActiveEventsWithOrders() {
  try {
    console.log('🔍 Buscando eventos ACTIVOS con órdenes APPROVED...');
    
    // Buscar órdenes APPROVED
    const ordersResult = await dynamoDB.scan({
      TableName: 'Orders',
      FilterExpression: 'payment_status = :approved',
      ExpressionAttributeValues: {
        ':approved': 'APPROVED'
      },
      Limit: 15
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
      
      // Verificar eventos en la tabla "Eventos" (nombre correcto)
      const activeEventsWithOrders = [];
      
      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        const orderCount = eventOrderCounts[eventId];
        
        try {
          const eventResult = await dynamoDB.get({
            TableName: 'Eventos', // Nombre correcto de la tabla
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
              activeEventsWithOrders.push({
                eventId,
                orderCount,
                event
              });
            } else {
              console.log(`   ⚠️  Este evento está en status: ${event.status}`);
            }
          } else {
            console.log(`\n${i + 1}. Event ID: ${eventId} (${orderCount} órdenes) - Evento no encontrado en tabla Eventos`);
          }
        } catch (error) {
          console.log(`\n${i + 1}. Event ID: ${eventId} (${orderCount} órdenes) - Error: ${error.message}`);
        }
      }
      
      console.log(`\n🚀 RESUMEN - EVENTOS IDEALES PARA TESTING:`);
      console.log(`Total eventos ACTIVOS con órdenes APPROVED: ${activeEventsWithOrders.length}`);
      
      if (activeEventsWithOrders.length > 0) {
        console.log('\n✨ Los mejores candidatos son:');
        activeEventsWithOrders.forEach((item, index) => {
          console.log(`${index + 1}. ${item.eventId}`);
          console.log(`   📊 ${item.orderCount} órdenes APPROVED`);
          console.log(`   🏷️  "${item.event.name}"`);
          console.log(`   📅 ${item.event.startDate} - ${item.event.endDate}`);
        });
        
        console.log(`\n🎯 RECOMENDACIÓN FINAL:`);
        console.log(`Usa el Event ID: ${activeEventsWithOrders[0].eventId}`);
        console.log(`Este evento tiene ${activeEventsWithOrders[0].orderCount} órdenes APPROVED y está ACTIVO`);
        console.log(`Nombre: "${activeEventsWithOrders[0].event.name}"`);
      } else {
        console.log('\n❌ No se encontraron eventos ACTIVOS con órdenes APPROVED');
        console.log('💡 Los eventos listados arriba pueden estar CANCELLED, POSTPONED o en otro estado');
        console.log('🔄 Puedes probar con cualquiera para ver el comportamiento del sistema');
      }
      
    } else {
      console.log('❌ No se encontraron órdenes con payment_status APPROVED');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findActiveEventsWithOrders().catch(console.error);