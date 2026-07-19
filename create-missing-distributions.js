const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });

const ticketId = '7e70b3d2-a';
const eventId = '45969122-45ff-4d0f-81c2-e178237e66a2';
const venueId = 'f89839d3-26d7-4e44-8c67-fa8ed26c445d';

async function createMissingDistributions() {
  console.log('🔧 Creando distribuciones faltantes...\n');
  
  // 1. Obtener el registro de Tickets
  const ticketResult = await dynamodb.scan({
    TableName: 'Tickets',
    FilterExpression: 'eventId = :eventId',
    ExpressionAttributeValues: {
      ':eventId': eventId
    }
  }).promise();
  
  if (ticketResult.Items.length === 0) {
    console.error('❌ No se encontró el registro de Tickets');
    return;
  }
  
  const ticket = ticketResult.Items[0];
  console.log(`✅ Registro de Tickets encontrado: ${ticket.id}`);
  console.log(`   Categorías: ${ticket.boleta.length}`);
  console.log(`   Total tickets: ${ticket.boleta.reduce((sum, c) => sum + c.cantidadTickets, 0)}\n`);
  
  // 2. Generar las distribuciones
  const distributionItems = [];
  
  for (const category of ticket.boleta) {
    const distributionId = category.distributionId;
    const createDate = category.distributionCreateDate;
    const cantidadTickets = category.cantidadTickets;
    
    console.log(`📝 Procesando: ${category.categoria} (${cantidadTickets} tickets)`);
    
    // Generar array de tickets individuales
    const ticketsArray = [];
    for (let i = 0; i < cantidadTickets; i++) {
      ticketsArray.push({
        ticketInstanceId: uuidv4(),
        category: category.categoria,
        categoryId: category.id,
        location: {}, // Sin asientos por ahora
        ticketStatus: "AVAILABLE",
        qrCodeKey: uuidv4(),
        ownerId: null,
        entityType: "TICKET",
        purchasePrice: category.valor || 0,
        orderId: null,
        distributionId: distributionId,
        createDate: createDate,
      });
    }
    
    const distributionItem = {
      id: distributionId, // PK
      createDate: createDate, // SK
      ticketId: ticket.id,
      eventId: eventId,
      venueId: venueId,
      boletaId: category.id,
      categoryName: category.categoria,
      tickets: ticketsArray,
    };
    
    distributionItems.push({
      PutRequest: {
        Item: distributionItem,
      },
    });
    
    console.log(`   ✓ ${cantidadTickets} tickets preparados`);
  }
  
  console.log(`\n📦 Total distribuciones a crear: ${distributionItems.length}`);
  
  // 3. Guardar en TicketsDistribution en batches de 25
  const chunkSize = 25;
  let totalCreated = 0;
  
  for (let i = 0; i < distributionItems.length; i += chunkSize) {
    const chunk = distributionItems.slice(i, i + chunkSize);
    console.log(`\n📤 Guardando batch ${Math.floor(i / chunkSize) + 1}...`);
    
    try {
      const batchResult = await dynamodb.batchWrite({
        RequestItems: {
          TicketsDistribution: chunk,
        },
      }).promise();
      
      if (batchResult.UnprocessedItems && Object.keys(batchResult.UnprocessedItems).length > 0) {
        console.error(`❌ Items sin procesar:`, JSON.stringify(batchResult.UnprocessedItems));
      } else {
        console.log(`   ✅ Batch guardado exitosamente (${chunk.length} items)`);
        totalCreated += chunk.length;
      }
    } catch (error) {
      console.error(`❌ Error guardando batch:`, error.message);
      console.error('   Detalle:', error);
    }
  }
  
  console.log(`\n🎉 Proceso completado!`);
  console.log(`✅ ${totalCreated} distribuciones creadas en TicketsDistribution`);
  console.log(`📊 Total de tickets individuales: ${ticket.boleta.reduce((sum, c) => sum + c.cantidadTickets, 0)}`);
}

createMissingDistributions().catch(console.error);
