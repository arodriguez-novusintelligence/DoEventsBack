const { v4: uuidv4 } = require('uuid');

// Datos del registro de Tickets que SÍ se creó
const ticketData = {
  "id": "7e70b3d2-a",
  "eventId": "45969122-45ff-4d0f-81c2-e178237e66a2",
  "venueId": "f89839d3-26d7-4e44-8c67-fa8ed26c445d",
  "boleta": [
    {
      "id": "ea580a26-9017-4bfe-8986-14e67ff18e79",
      "categoria": "VIP",
      "cantidadTickets": 20,
      "valor": 0,
      "distributionId": "28bbac52-455e-420a-a370-ca49b0a4f03d",
      "distributionCreateDate": "2026-01-23T04:41:52.742Z"
    },
    {
      "id": "1f3e6240-f040-43f3-906b-a8e1eec32ca2",
      "categoria": "GENERAL",
      "cantidadTickets": 20,
      "valor": 0,
      "distributionId": "bf16cf37-3152-4097-a213-cda2bd96737d",
      "distributionCreateDate": "2026-01-23T04:41:52.742Z"
    },
    {
      "id": "cat-vip-001",
      "categoria": "VIP",
      "cantidadTickets": 50,
      "valor": 150000,
      "distributionId": "868e71c2-cbb3-414a-afa6-0e5fb08ee0b2",
      "distributionCreateDate": "2026-01-23T04:41:52.742Z"
    },
    {
      "id": "cat-palco-002",
      "categoria": "Palco",
      "cantidadTickets": 30,
      "valor": 250000,
      "distributionId": "32142555-3893-4a6a-9ead-0fa2aa78d2f9",
      "distributionCreateDate": "2026-01-23T04:41:52.742Z"
    },
    {
      "id": "cat-general-003",
      "categoria": "General",
      "cantidadTickets": 420,
      "valor": 50000,
      "distributionId": "0d0f29d3-af85-4ca3-ba41-31cbd13aa9b6",
      "distributionCreateDate": "2026-01-23T04:41:52.742Z"
    }
  ]
};

// Simular lo que generateTicketsDistribution DEBERÍA crear
console.log('🎫 Simulando creación de TicketsDistribution...\n');

const distributionItems = [];

for (const category of ticketData.boleta) {
  const distributionId = category.distributionId;
  const createDate = category.distributionCreateDate;
  const cantidadTickets = category.cantidadTickets;

  console.log(`📝 Categoría: ${category.categoria} (ID: ${category.id})`);
  console.log(`   Tickets: ${cantidadTickets}`);
  console.log(`   distributionId: ${distributionId}`);
  console.log(`   createDate: ${createDate}\n`);

  // Generar array de tickets individuales
  const ticketsArray = [];
  for (let i = 0; i < cantidadTickets; i++) {
    ticketsArray.push({
      ticketInstanceId: uuidv4(),
      category: category.categoria,
      categoryId: category.id,
      location: {}, // Sin asientos para las categorías del body
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
    ticketId: ticketData.id,
    eventId: ticketData.eventId,
    venueId: ticketData.venueId,
    boletaId: category.id,
    categoryName: category.categoria,
    tickets: ticketsArray,
  };

  distributionItems.push({
    PutRequest: {
      Item: distributionItem,
    },
  });
}

console.log(`📦 Total de distribuciones a crear: ${distributionItems.length}`);
console.log(`📊 Total de tickets a crear: ${ticketData.boleta.reduce((sum, c) => sum + c.cantidadTickets, 0)}`);

console.log('\n✅ Estructura correcta - Listo para batchWrite\n');
console.log('Primer item de ejemplo:');
console.log(JSON.stringify(distributionItems[0].PutRequest.Item, null, 2));
