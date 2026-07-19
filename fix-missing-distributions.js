/**
 * Script para recrear distribuciones de tickets faltantes
 * Busca registros en Tickets que no tengan distribuciones creadas en TicketsDistribution
 * y las crea manualmente
 */

const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

const TICKETS_TABLE = 'Tickets';
const TICKETS_DIST_TABLE = 'TicketsDistribution';
const SEATS_TABLE = 'Seats';

async function getTicketsByEventId(eventId) {
  const result = await dynamodb.scan({
    TableName: TICKETS_TABLE,
    FilterExpression: 'eventId = :eid',
    ExpressionAttributeValues: {
      ':eid': eventId
    }
  }).promise();
  
  return result.Items;
}

async function getSeatsByVenueId(venueId) {
  const result = await dynamodb.scan({
    TableName: SEATS_TABLE,
    FilterExpression: 'venueId = :vid',
    ExpressionAttributeValues: {
      ':vid': venueId
    }
  }).promise();
  
  return result.Items || [];
}

async function checkDistributionExists(distributionId, createDate) {
  const result = await dynamodb.get({
    TableName: TICKETS_DIST_TABLE,
    Key: {
      id: distributionId,
      createDate: createDate
    }
  }).promise();
  
  return !!result.Item;
}

async function createTicketsDistribution(ticketRecord) {
  const { eventId, venueId, boletas, hasSeating } = ticketRecord;
  
  console.log(`\n🎫 Procesando evento: ${eventId}`);
  console.log(`📍 Venue: ${venueId}, Tiene asientos: ${hasSeating}`);
  
  // Obtener seats si es un venue con asientos
  let seatsMapping = {};
  if (hasSeating) {
    console.log('🪑 Cargando asientos...');
    const seats = await getSeatsByVenueId(venueId);
    console.log(`✅ Encontrados ${seats.length} asientos`);
    
    // Agrupar seats por categoryId
    seats.forEach(seat => {
      if (!seatsMapping[seat.categoryId]) {
        seatsMapping[seat.categoryId] = [];
      }
      seatsMapping[seat.categoryId].push(seat);
    });
  }
  
  const distributionsCreated = [];
  
  for (const boleta of boletas) {
    const { id: categoryId, categoria, cantidadTickets, valor, distributionId, distributionCreateDate } = boleta;
    
    console.log(`\n📝 Categoría: ${categoria}`);
    console.log(`   - ID: ${categoryId}`);
    console.log(`   - Tickets: ${cantidadTickets}`);
    console.log(`   - Distribution ID: ${distributionId}`);
    
    // Verificar si ya existe
    const exists = await checkDistributionExists(distributionId, distributionCreateDate);
    if (exists) {
      console.log(`   ⏭️  Ya existe, omitiendo...`);
      continue;
    }
    
    // Obtener seats de esta categoría
    const categorySeats = seatsMapping[categoryId] || [];
    console.log(`   🪑 Asientos disponibles: ${categorySeats.length}`);
    
    // Generar tickets individuales
    const ticketsArray = [];
    for (let i = 0; i < cantidadTickets; i++) {
      const seat = categorySeats[i];
      
      ticketsArray.push({
        ticketInstanceId: uuidv4(),
        category: categoria,
        categoryId: categoryId,
        location: seat ? {
          seatId: seat.seatId,
          row: seat.row,
          number: seat.number,
          seatLabel: seat.seatLabel || `${seat.row}${seat.number}`
        } : {},
        ticketStatus: 'AVAILABLE',
        qrCodeKey: uuidv4(),
        ownerId: null,
        entityType: 'TICKET',
        purchasePrice: valor || 0,
        orderId: null,
        distributionId: distributionId,
        createDate: distributionCreateDate
      });
    }
    
    const distributionItem = {
      id: distributionId,
      createDate: distributionCreateDate,
      ticketId: ticketRecord.id,
      eventId: eventId,
      venueId: venueId,
      boletaId: categoryId,
      categoryName: categoria,
      tickets: ticketsArray
    };
    
    // Guardar en DynamoDB
    try {
      await dynamodb.put({
        TableName: TICKETS_DIST_TABLE,
        Item: distributionItem
      }).promise();
      
      console.log(`   ✅ Distribución creada con ${ticketsArray.length} tickets`);
      distributionsCreated.push(distributionItem);
    } catch (error) {
      console.error(`   ❌ Error creando distribución:`, error.message);
      throw error;
    }
  }
  
  return distributionsCreated;
}

async function main() {
  const eventId = process.argv[2];
  
  if (!eventId) {
    console.error('❌ Debes proporcionar el eventId como parámetro');
    console.log('Uso: node fix-missing-distributions.js <eventId>');
    process.exit(1);
  }
  
  console.log(`🔍 Buscando tickets para evento: ${eventId}\n`);
  
  try {
    // Obtener tickets del evento
    const tickets = await getTicketsByEventId(eventId);
    
    if (tickets.length === 0) {
      console.log('❌ No se encontraron tickets para este evento');
      return;
    }
    
    console.log(`✅ Encontrados ${tickets.length} registros de tickets\n`);
    
    // Procesar cada registro de tickets
    for (const ticketRecord of tickets) {
      const distributions = await createTicketsDistribution(ticketRecord);
      console.log(`\n✅ ${distributions.length} distribuciones creadas para este registro`);
    }
    
    console.log('\n🎉 Proceso completado exitosamente');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main();
