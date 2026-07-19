# Guía de Mapeo: Sillas → Tickets → Órdenes

## 🎯 Flujo de Datos Completo

### 1. Estructura de Datos

```
Venue Base (Venue_Seat)
  └─ Categoria A
      ├─ Silla A1 (seatId: "seat-base-001", row: "A", number: "1")
      ├─ Silla A2 (seatId: "seat-base-002", row: "A", number: "2")
      └─ Silla A3 (seatId: "seat-base-003", row: "A", number: "3")

↓ Al clonar para evento

Venue Clonado (Venue_Seat)
  └─ Categoria A' (categoryId: "cat-cloned-vip-001")
      ├─ Silla A1 (seatId: "seat-cloned-101", row: "A", number: "1")
      ├─ Silla A2 (seatId: "seat-cloned-102", row: "A", number: "2")
      └─ Silla A3 (seatId: "seat-cloned-103", row: "A", number: "3")

↓ Se genera automáticamente

TicketsDistribution
  └─ Distribution ID: "dist-xyz-789"
      └─ tickets: [
          {
            ticketInstanceId: "ticket-inst-001",
            categoryId: "cat-cloned-vip-001",
            location: {
              seatId: "seat-cloned-101",
              row: "A",
              number: "1",
              seatLabel: "A1"
            },
            ticketStatus: "AVAILABLE"
          },
          {
            ticketInstanceId: "ticket-inst-002",
            categoryId: "cat-cloned-vip-001",
            location: {
              seatId: "seat-cloned-102",
              row: "A",
              number: "2",
              seatLabel: "A2"
            },
            ticketStatus: "AVAILABLE"
          }
      ]
```

---

## 📊 Tablas y Relaciones

### Tabla: Venue_Seat (Asientos del Venue Clonado)
```javascript
{
  seatId: "seat-cloned-101",          // PK - ID único de la silla clonada
  categoryId: "cat-cloned-vip-001",   // FK - Categoría a la que pertenece
  floorId: "floor-cloned-001",
  venueId: "venue-cloned-xyz",
  row: "A",
  number: "1",
  seatLabel: "A1",
  status: "available",
  posX: 100,
  posY: 100
}
```

### Tabla: Tickets (Resumen por Evento)
```javascript
{
  id: "ticket-abc123",              // PK
  eventId: "event-789",
  venueId: "venue-cloned-xyz",
  boleta: [                         // Array de categorías
    {
      categoria: "VIP",
      id: "cat-cloned-vip-001",     // categoryId
      cantidadTickets: 50,
      avaliableCapacity: 50,
      valor: 150000,
      distributionId: "dist-xyz-789",           // ← Clave para buscar en TicketsDistribution
      distributionCreateDate: "2026-01-12T..."  // ← Clave compuesta
    }
  ]
}
```

### Tabla: TicketsDistribution (Tickets Individuales)
```javascript
{
  id: "dist-xyz-789",                        // PK - distributionId
  createDate: "2026-01-12T15:30:00.000Z",   // SK - Clave compuesta
  ticketId: "ticket-abc123",
  eventId: "event-789",
  venueId: "venue-cloned-xyz",
  boletaId: "cat-cloned-vip-001",
  categoryName: "VIP",
  tickets: [                                 // Array de instancias individuales
    {
      ticketInstanceId: "ticket-inst-001",
      category: "VIP",
      categoryId: "cat-cloned-vip-001",
      location: {
        seatId: "seat-cloned-101",          // ← Referencia a Venue_Seat
        row: "A",
        number: "1",
        seatLabel: "A1"
      },
      ticketStatus: "AVAILABLE",
      qrCodeKey: "qr-unique-key-001",
      ownerId: null,
      orderId: null,
      purchasePrice: 150000
    }
  ]
}
```

---

## 🔄 Proceso de Clonación (Actualizado)

### Paso 1: Clonar Venue y Asientos
```javascript
// 1. Se clona el venue base
newVenueId = "venue-cloned-xyz"

// 2. Se clonan las categorías
categoryIdMapping = {
  "cat-base-vip-001": "cat-cloned-vip-001"
}

// 3. Se clonan los asientos Y se guarda el mapping
seatsMapping = {
  "cat-cloned-vip-001": [
    { seatId: "seat-cloned-101", row: "A", number: "1", seatLabel: "A1" },
    { seatId: "seat-cloned-102", row: "A", number: "2", seatLabel: "A2" },
    { seatId: "seat-cloned-103", row: "A", number: "3", seatLabel: "A3" }
  ]
}
```

### Paso 2: Generar TicketsDistribution
```javascript
// Usa seatsMapping para asignar cada ticket a una silla
for (let i = 0; i < cantidadTickets; i++) {
  const seat = seatsMapping[categoryId][i];
  
  tickets.push({
    ticketInstanceId: uuidv4(),
    location: {
      seatId: seat.seatId,        // ← Vincula con Venue_Seat
      row: seat.row,
      number: seat.number,
      seatLabel: seat.seatLabel
    }
  });
}
```

---

## 🎫 Crear Orden con Sillas Específicas

### Request para Orden
```json
{
  "reference": "ORDER-2026-001",
  "customer_email": "cliente@ejemplo.com",
  "metadata": {
    "eventId": "event-789",
    "userID": "user-123",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-cloned-vip-001",
        "quantity": 2,
        "ticketsDistId": "dist-xyz-789",
        "createDate": "2026-01-12T15:30:00.000Z",
        "seats": ["A1", "A2"]  // ← Opcional: filtrar sillas específicas
      }
    ]
  }
}
```

### Consulta en manageOrders.js
```javascript
// 1. Obtener el registro de TicketsDistribution
const ticketsDistItem = await dynamodb.get({
  TableName: "TicketsDistribution",
  Key: { 
    id: "dist-xyz-789",                    // ticketsDistId
    createDate: "2026-01-12T15:30:00.000Z" // createDate
  }
}).promise();

// 2. Filtrar tickets disponibles (opcionalmente por silla)
let disponibles = ticketsDistItem.tickets.filter(t => 
  t.category === "VIP" && 
  t.ticketStatus === "AVAILABLE" &&
  (!seats.length || seats.includes(t.location.seatLabel))
);

// 3. Reservar los primeros N tickets
const toReserve = disponibles.slice(0, quantity);

// 4. Cada ticket reservado tiene la información completa de la silla
toReserve.forEach(ticket => {
  console.log(`Reservado: ${ticket.ticketInstanceId}`);
  console.log(`Silla: ${ticket.location.seatLabel}`);
  console.log(`SeatId: ${ticket.location.seatId}`);
});
```

---

## 🔍 Consultas Útiles

### 1. Obtener todas las sillas de una categoría
```javascript
const seats = await dynamodb.query({
  TableName: "Venue_Seat",
  IndexName: "categoryIdIndex",
  KeyConditionExpression: "categoryId = :categoryId",
  ExpressionAttributeValues: {
    ":categoryId": "cat-cloned-vip-001"
  }
}).promise();
```

### 2. Obtener tickets disponibles de una categoría
```javascript
const dist = await dynamodb.get({
  TableName: "TicketsDistribution",
  Key: { 
    id: "dist-xyz-789",
    createDate: "2026-01-12T15:30:00.000Z"
  }
}).promise();

const available = dist.Item.tickets.filter(t => 
  t.ticketStatus === "AVAILABLE"
);
```

### 3. Verificar disponibilidad de silla específica
```javascript
const ticketForSeat = dist.Item.tickets.find(t => 
  t.location.seatId === "seat-cloned-101" &&
  t.ticketStatus === "AVAILABLE"
);

if (ticketForSeat) {
  console.log("Silla disponible:", ticketForSeat.location.seatLabel);
}
```

---

## ✅ Ventajas de este Diseño

1. **Trazabilidad Completa**: Cada ticket apunta a una silla específica
2. **Flexibilidad**: Soporta venues con y sin sillas (hasSeating)
3. **Escalabilidad**: Las consultas son eficientes usando claves compuestas
4. **Auditabilidad**: Se puede rastrear qué silla fue vendida en qué orden

---

## 🚀 Ejemplo Completo de Flujo

```javascript
// 1. Usuario consulta evento
GET /getTicketByEventId/event-789
// Respuesta: categorías con distributionId y createDate

// 2. Usuario selecciona sillas en el frontend
// Frontend hace query a Venue_Seat para mostrar mapa de asientos

// 3. Usuario crea orden con sillas específicas
POST /orders/create
{
  metadata: {
    tickets: [{
      categoryId: "cat-cloned-vip-001",
      ticketsDistId: "dist-xyz-789",
      createDate: "2026-01-12T...",
      seats: ["A1", "A2"]  // Sillas seleccionadas
    }]
  }
}

// 4. Backend (manageOrders.js)
// - Busca en TicketsDistribution usando ticketsDistId + createDate
// - Filtra tickets con location.seatLabel in ["A1", "A2"]
// - Marca como RESERVED
// - Retorna ticketInstanceIds con sus seatIds
```

---

## 📝 Notas Importantes

- **Siempre** usa `distributionId` + `createDate` para consultar TicketsDistribution (clave compuesta)
- Si `hasSeating: false`, `location` estará vacío `{}`
- El `seatId` en `TicketsDistribution.tickets[].location` corresponde al `seatId` en `Venue_Seat`
- El mapping se mantiene 1:1 entre tickets y sillas cuando `hasSeating: true`
