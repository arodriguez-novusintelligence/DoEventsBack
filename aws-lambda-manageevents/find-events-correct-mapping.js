const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({ 
  region: 'us-east-1'
});

async function findEventsWithCorrectMapping() {
  try {
    console.log('🔍 Buscando eventos usando el mapeo correcto (event_id -> id)...');
    
    // Buscar órdenes APPROVED
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
        const eventId = order.event_id; // Este es el ID que se usará como "id" en Eventos
        if (!eventOrderCounts[eventId]) {
          eventOrderCounts[eventId] = 0;
        }
        eventOrderCounts[eventId]++;
      });
      
      console.log('\n🎯 Event IDs con órdenes APPROVED:');
      const eventIds = Object.keys(eventOrderCounts);
      
      // Verificar eventos en la tabla "Eventos" usando el campo "id"
      const activeEventsWithOrders = [];
      
      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        const orderCount = eventOrderCounts[eventId];
        
        try {
          // Usar "id" como clave, no "eventId"
          const eventResult = await dynamoDB.get({
            TableName: 'Eventos',
            Key: { id: eventId } // ¡Mapeo correcto!
          }).promise();
          
          if (eventResult.Item) {
            const event = eventResult.Item;
            console.log(`\n${i + 1}. Event ID: ${eventId}`);
            console.log(`   📊 Órdenes APPROVED: ${orderCount}`);
            console.log(`   📅 Status (estatus): ${event.estatus}`);
            console.log(`   🏷️  Nombre: ${event.nombreDelEvento || event.name || 'Sin nombre'}`);
            console.log(`   📅 Fecha: ${event.fechaIni} - ${event.fechaFin}`);
            console.log(`   🏙️  Ciudad: ${event.ciudad}`);
            
            // En esta tabla el status podría ser "estatus" y podría tener valores diferentes
            if (event.estatus === 'ACTIVE' || event.estatus === 'activo' || event.estatus === 'Activo') {
              console.log(`   ✅ ¡PERFECTO! Este evento está ACTIVO y tiene ${orderCount} órdenes APPROVED`);
              activeEventsWithOrders.push({
                eventId,
                orderCount,
                event
              });
            } else {
              console.log(`   ⚠️  Este evento está en estatus: ${event.estatus}`);
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
          console.log(`   🏷️  "${item.event.nombreDelEvento || item.event.name || 'Sin nombre'}"`);
          console.log(`   📅 ${item.event.fechaIni} - ${item.event.fechaFin}`);
        });
        
        console.log(`\n🎯 RECOMENDACIÓN FINAL:`);
        console.log(`Usa el Event ID: ${activeEventsWithOrders[0].eventId}`);
        console.log(`Este evento tiene ${activeEventsWithOrders[0].orderCount} órdenes APPROVED y está ACTIVO`);
      } else {
        console.log('\n❌ No se encontraron eventos ACTIVOS con órdenes APPROVED');
        console.log('💡 Los eventos listados arriba pueden estar CANCELLED, POSTPONED o en otro estado');
        console.log('🔄 Pero podemos usar cualquiera para probar el sistema y ver qué pasa');
        
        // Al menos mostrar el primer evento disponible
        if (eventIds.length > 0) {
          console.log(`\n💡 Para testing puedes probar con: ${eventIds[0]} (${eventOrderCounts[eventIds[0]]} órdenes)`);
        }
      }
      
    } else {
      console.log('❌ No se encontraron órdenes con payment_status APPROVED');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findEventsWithCorrectMapping().catch(console.error);