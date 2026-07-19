const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });

const eventId = '45969122-45ff-4d0f-81c2-e178237e66a2';
const clonedVenueId = 'f89839d3-26d7-4e44-8c67-fa8ed26c445d';

async function checkDistributions() {
  console.log('🔍 Verificando distribuciones para el evento:', eventId);
  
  // 1. Verificar registro en Tickets
  console.log('\n📋 Buscando en tabla Tickets...');
  try {
    const ticketsResult = await dynamodb.query({
      TableName: 'Tickets',
      IndexName: 'eventId-index',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    }).promise();
    
    console.log(`✅ Encontrados ${ticketsResult.Items.length} registros en Tickets`);
    if (ticketsResult.Items.length > 0) {
      const ticket = ticketsResult.Items[0];
      console.log('\n📝 Registro de Ticket:');
      console.log('- TicketId:', ticket.id);
      console.log('- EventId:', ticket.eventId);
      console.log('- VenueId:', ticket.venueId);
      console.log('- Categorías:', ticket.boleta?.length || 0);
      if (ticket.boleta && ticket.boleta.length > 0) {
        console.log('\n📦 Categorías:');
        ticket.boleta.forEach((cat, idx) => {
          console.log(`  ${idx + 1}. ${cat.categoria} - ${cat.cantidadTickets} tickets`);
          console.log(`     distributionId: ${cat.distributionId}`);
          console.log(`     distributionCreateDate: ${cat.distributionCreateDate}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error consultando Tickets:', error.message);
  }
  
  // 2. Verificar TicketsDistribution por eventId
  console.log('\n📦 Buscando en tabla TicketsDistribution...');
  try {
    const distResult = await dynamodb.scan({
      TableName: 'TicketsDistribution',
      FilterExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    }).promise();
    
    console.log(`✅ Encontradas ${distResult.Items.length} distribuciones en TicketsDistribution`);
    if (distResult.Items.length > 0) {
      console.log('\n📝 Distribuciones encontradas:');
      distResult.Items.forEach((dist, idx) => {
        console.log(`  ${idx + 1}. ${dist.categoryName || dist.boletaId}`);
        console.log(`     id: ${dist.id}`);
        console.log(`     createDate: ${dist.createDate}`);
        console.log(`     tickets: ${dist.tickets?.length || 0}`);
      });
    } else {
      console.log('❌ NO SE ENCONTRARON DISTRIBUCIONES - Este es el problema!');
    }
  } catch (error) {
    console.error('❌ Error consultando TicketsDistribution:', error.message);
  }
  
  // 3. Verificar venue clonado
  console.log('\n🏢 Verificando venue clonado...');
  try {
    const venueResult = await dynamodb.get({
      TableName: 'Venues',
      Key: { venue_id: clonedVenueId }
    }).promise();
    
    if (venueResult.Item) {
      console.log('✅ Venue encontrado:');
      console.log('- venueId:', venueResult.Item.venue_id);
      console.log('- name:', venueResult.Item.name);
      console.log('- eventId:', venueResult.Item.eventId);
      console.log('- hasSeating:', venueResult.Item.hasSeating);
      console.log('- isEventVenue:', venueResult.Item.isEventVenue);
    } else {
      console.log('❌ Venue no encontrado');
    }
  } catch (error) {
    console.error('❌ Error consultando Venues:', error.message);
  }
  
  // 4. Verificar categorías del venue
  console.log('\n📊 Verificando categorías del venue...');
  try {
    const categoriesResult = await dynamodb.query({
      TableName: 'Venue_Category',
      IndexName: 'venueIdIndex',
      KeyConditionExpression: 'venueId = :venueId',
      ExpressionAttributeValues: {
        ':venueId': clonedVenueId
      }
    }).promise();
    
    console.log(`✅ Encontradas ${categoriesResult.Items.length} categorías en Venue_Category`);
    if (categoriesResult.Items.length > 0) {
      console.log('\n📝 Categorías:');
      categoriesResult.Items.forEach((cat, idx) => {
        console.log(`  ${idx + 1}. ${cat.name}`);
        console.log(`     categoryId: ${cat.categoryId}`);
        console.log(`     totalSeats: ${cat.totalSeats}`);
      });
    }
  } catch (error) {
    console.error('❌ Error consultando Venue_Category:', error.message);
  }
}

checkDistributions().catch(console.error);
