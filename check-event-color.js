const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const doc = new AWS.DynamoDB.DocumentClient();

const eventId = '00378638-8694-4b23-9ab3-746ed67e76f8';
const venueId = '581b9bb9-57e4-4300-a818-f50fe3e10e0e';

async function checkEventColor() {
  console.log(`\n🔍 Verificando color en evento: ${eventId}\n`);

  // 1. Consultar tabla Tickets para ver las categorías
  console.log('📋 1. Consultando tabla Tickets...');
  const ticketsResult = await doc.query({
    TableName: 'Tickets',
    IndexName: 'eventIdIndex',
    KeyConditionExpression: 'eventId = :eventId',
    ExpressionAttributeValues: { ':eventId': eventId }
  }).promise();

  if (ticketsResult.Items && ticketsResult.Items.length > 0) {
    const ticket = ticketsResult.Items[0];
    console.log(`   TicketId: ${ticket.id}`);
    console.log(`   Categorías (${ticket.boletas?.length || 0}):`);
    
    if (ticket.boletas) {
      ticket.boletas.forEach((cat, idx) => {
        console.log(`   ${idx + 1}. ${cat.categoria} (id: ${cat.id})`);
        console.log(`      - color: ${cat.color || 'NULL ❌'}`);
        console.log(`      - valor: ${cat.valor}`);
        console.log(`      - cantidadTickets: ${cat.cantidadTickets}`);
      });
    }
  } else {
    console.log('   ❌ No se encontraron tickets para este evento');
  }

  // 2. Consultar TicketsDistribution
  console.log('\n📦 2. Consultando TicketsDistribution...');
  const distResult = await doc.query({
    TableName: 'TicketsDistribution',
    IndexName: 'eventIdIndex',
    KeyConditionExpression: 'eventId = :eventId',
    ExpressionAttributeValues: { ':eventId': eventId }
  }).promise();

  if (distResult.Items && distResult.Items.length > 0) {
    console.log(`   Distribuciones encontradas: ${distResult.Items.length}`);
    distResult.Items.forEach((dist, idx) => {
      console.log(`\n   ${idx + 1}. ${dist.categoryName} (${dist.boletaId})`);
      console.log(`      - categoryColor: ${dist.categoryColor || 'NULL ❌'}`);
      console.log(`      - tickets: ${dist.tickets?.length || 0}`);
      
      if (dist.tickets && dist.tickets.length > 0) {
        const firstTicket = dist.tickets[0];
        console.log(`      - Primer ticket categoryColor: ${firstTicket.categoryColor || 'NULL ❌'}`);
      }
    });
  } else {
    console.log('   ❌ No se encontraron distribuciones para este evento');
  }

  // 3. Consultar el Venue
  console.log('\n🏟️  3. Consultando Venue...');
  const venueResult = await doc.get({
    TableName: 'Venues',
    Key: { venue_id: venueId }
  }).promise();

  if (venueResult.Item) {
    console.log(`   Venue: ${venueResult.Item.name}`);
    console.log(`   eventId: ${venueResult.Item.eventId || 'NULL'}`);
    console.log(`   isEventVenue: ${venueResult.Item.isEventVenue}`);
    console.log(`   hasSeating: ${venueResult.Item.hasSeating}`);
  }

  console.log('\n✅ Análisis completado\n');
}

checkEventColor().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
