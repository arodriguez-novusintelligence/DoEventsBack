# Guía Completa: Clonación de Venue y Consulta de Asientos Disponibles

## 🔄 PASO 1: Request para Clonar Venue

### Endpoint
```
POST https://API_GATEWAY_URL/dev/venues/clone-for-event
```

### Request Actualizado
```json
{
  "baseVenueId": "venue-base-abc-123",
  "eventId": "event-xyz-789",
  "name": "Teatro Metropolitan - Concierto Rock 2026",
  "hasSeating": true,
  "ticketCategories": [
    {
      "id": "cat-vip-001",
      "categoria": "VIP",
      "cantidadTickets": 50,
      "moneda": "COP",
      "costo": 50000,
      "valor": 150000,
      "descripcion": "Zona VIP con las mejores sillas y acceso exclusivo"
    },
    {
      "id": "cat-palco-002",
      "categoria": "Palco",
      "cantidadTickets": 30,
      "moneda": "COP",
      "costo": 80000,
      "valor": 250000,
      "descripcion": "Palcos privados con servicio exclusivo"
    },
    {
      "id": "cat-general-003",
      "categoria": "General",
      "cantidadTickets": 420,
      "moneda": "COP",
      "costo": 20000,
      "valor": 50000,
      "descripcion": "Asientos generales con buena visibilidad"
    }
  ],
  "fechaIniVent": "2026-01-15T00:00:00Z",
  "fechaFinVent": "2026-03-15T20:00:00Z",
  "horaIniVent": "00:00",
  "horaFinVent": "20:00"
}
```

### Respuesta de Clonación
```json
{
  "message": "Venue cloned successfully for event",
  "venue": {
    "venueId": "venue-cloned-new-456",
    "name": "Teatro Metropolitan - Concierto Rock 2026",
    "eventId": "event-xyz-789",
    "baseVenueId": "venue-base-abc-123",
    "isEventVenue": true,
    "hasSeating": true,
    "floorsCloned": 1,
    "categoriesCloned": 3,
    "gatesCloned": 2,
    "ticketRecord": {
      "ticketId": "tk123",
      "categoriesCount": 3,
      "totalCapacity": 500
    }
  }
}
```

---

## 🎫 PASO 2: Consultar Tickets del Evento

### Endpoint Existente
```
GET https://API_GATEWAY_URL/dev/getTicketByEventId/{eventId}
```

### Ejemplo
```bash
GET https://API_GATEWAY_URL/dev/getTicketByEventId/event-xyz-789
```

### Respuesta
```json
[
  {
    "id": "tk123",
    "eventId": "event-xyz-789",
    "venueId": "venue-cloned-new-456",
    "hasSeating": true,
    "boleta": [
      {
        "categoria": "VIP",
        "id": "cat-vip-001",
        "cantidadTickets": 50,
        "avaliableCapacity": 50,
        "valor": 150000,
        "distributionId": "dist-vip-abc-001",
        "distributionCreateDate": "2026-01-12T15:30:00.000Z"
      },
      {
        "categoria": "Palco",
        "id": "cat-palco-002",
        "cantidadTickets": 30,
        "avaliableCapacity": 30,
        "valor": 250000,
        "distributionId": "dist-palco-xyz-002",
        "distributionCreateDate": "2026-01-12T15:30:00.000Z"
      }
    ]
  }
]
```

---

## 🪑 PASO 3: Consultar Asientos Disponibles por Categoría

### ⚠️ NUEVO SERVICIO NECESARIO

Necesitas crear un endpoint que consulte `TicketsDistribution` y retorne los asientos disponibles.

### Endpoint Propuesto
```
GET /events/{eventId}/categories/{categoryId}/available-seats
```

O mejor aún:

```
GET /tickets-distribution/{distributionId}/available-seats
Query params: createDate (requerido)
```

### Request de Ejemplo
```bash
GET https://API_GATEWAY_URL/dev/tickets-distribution/dist-vip-abc-001/available-seats?createDate=2026-01-12T15:30:00.000Z
```

### Respuesta Esperada
```json
{
  "distributionId": "dist-vip-abc-001",
  "categoryId": "cat-vip-001",
  "categoryName": "VIP",
  "totalSeats": 50,
  "availableSeats": 48,
  "reservedSeats": 2,
  "seats": [
    {
      "ticketInstanceId": "ticket-inst-001",
      "location": {
        "seatId": "seat-cloned-101",
        "row": "A",
        "number": "1",
        "seatLabel": "A1"
      },
      "ticketStatus": "AVAILABLE",
      "price": 150000
    },
    {
      "ticketInstanceId": "ticket-inst-002",
      "location": {
        "seatId": "seat-cloned-102",
        "row": "A",
        "number": "2",
        "seatLabel": "A2"
      },
      "ticketStatus": "AVAILABLE",
      "price": 150000
    },
    {
      "ticketInstanceId": "ticket-inst-003",
      "location": {
        "seatId": "seat-cloned-103",
        "row": "A",
        "number": "3",
        "seatLabel": "A3"
      },
      "ticketStatus": "RESERVED",
      "price": 150000,
      "ownerId": "user-456"
    }
  ]
}
```

---

## 🛠️ Código del Nuevo Servicio

### Archivo: `src/tickets-distribution/getAvailableSeats.js`

```javascript
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;

exports.handler = async (event) => {
  const build = (code, body) => ({
    statusCode: code,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  });

  try {
    const distributionId = event.pathParameters?.distributionId;
    const createDate = event.queryStringParameters?.createDate;

    if (!distributionId || !createDate) {
      return build(400, { 
        error: 'MissingParameters', 
        message: 'distributionId y createDate son requeridos' 
      });
    }

    // Consultar TicketsDistribution con clave compuesta
    const result = await doc.get({
      TableName: TICKETS_DIST_TABLE,
      Key: {
        id: distributionId,
        createDate: createDate
      }
    }).promise();

    if (!result.Item) {
      return build(404, { 
        error: 'NotFound', 
        message: 'Distribution no encontrada' 
      });
    }

    const distribution = result.Item;
    const tickets = distribution.tickets || [];

    // Separar por estado
    const available = tickets.filter(t => t.ticketStatus === 'AVAILABLE');
    const reserved = tickets.filter(t => t.ticketStatus === 'RESERVED');
    const sold = tickets.filter(t => t.ticketStatus === 'SOLD');

    // Mapear solo información necesaria
    const seatsInfo = tickets.map(ticket => ({
      ticketInstanceId: ticket.ticketInstanceId,
      location: ticket.location || {},
      ticketStatus: ticket.ticketStatus,
      price: ticket.purchasePrice || 0,
      ownerId: ticket.ownerId || null,
      qrCodeKey: ticket.qrCodeKey
    }));

    return build(200, {
      distributionId: distribution.id,
      categoryId: distribution.boletaId,
      categoryName: distribution.categoryName,
      eventId: distribution.eventId,
      venueId: distribution.venueId,
      totalSeats: tickets.length,
      availableSeats: available.length,
      reservedSeats: reserved.length,
      soldSeats: sold.length,
      seats: seatsInfo
    });

  } catch (err) {
    console.error('getAvailableSeats error:', err);
    return build(500, { 
      error: 'InternalError', 
      message: err.message 
    });
  }
};
```

### Agregar a `serverless.yml`

```yaml
  getAvailableSeats:
    handler: src/tickets-distribution/getAvailableSeats.handler
    description: Obtener asientos disponibles de una distribución
    events:
      - http:
          path: tickets-distribution/{distributionId}/available-seats
          method: get
          cors: true
```

---

## 🔄 Flujo Completo de Compra

### 1. Frontend: Obtener Info del Evento
```javascript
// GET /getTicketByEventId/event-xyz-789
const eventTickets = await fetch(`${API}/getTicketByEventId/${eventId}`);
const categories = eventTickets[0].boleta;
```

### 2. Frontend: Mostrar Categorías al Usuario
```javascript
categories.forEach(cat => {
  console.log(`${cat.categoria} - ${cat.valor} COP`);
  console.log(`Disponibles: ${cat.avaliableCapacity}`);
});
```

### 3. Frontend: Usuario Selecciona una Categoría
```javascript
const selectedCategory = categories[0]; // VIP
const distributionId = selectedCategory.distributionId;
const createDate = selectedCategory.distributionCreateDate;
```

### 4. Frontend: Consultar Asientos Disponibles
```javascript
// GET /tickets-distribution/{distributionId}/available-seats?createDate=...
const seatsResponse = await fetch(
  `${API}/tickets-distribution/${distributionId}/available-seats?createDate=${encodeURIComponent(createDate)}`
);
const seatsData = await seatsResponse.json();

// Filtrar solo disponibles
const availableSeats = seatsData.seats.filter(s => s.ticketStatus === 'AVAILABLE');
```

### 5. Frontend: Mostrar Mapa de Asientos
```javascript
availableSeats.forEach(seat => {
  const seatLabel = seat.location.seatLabel; // "A1", "A2", etc.
  // Renderizar en el mapa visual
  renderSeat(seatLabel, seat.ticketStatus);
});
```

### 6. Usuario Selecciona Asientos Específicos
```javascript
const selectedSeats = ["A1", "A2"]; // Usuario hace clic en el mapa
```

### 7. Frontend: Crear Orden con Asientos Seleccionados
```javascript
const orderRequest = {
  reference: `ORDER-${Date.now()}`,
  customer_email: "cliente@ejemplo.com",
  metadata: {
    eventId: eventId,
    userID: currentUserId,
    tickets: [
      {
        category: selectedCategory.categoria,
        categoryId: selectedCategory.id,
        quantity: selectedSeats.length,
        ticketsDistId: distributionId,
        createDate: createDate,
        seats: selectedSeats  // ["A1", "A2"]
      }
    ]
  }
};

// POST /orders/create
const orderResponse = await fetch(`${API}/orders/create`, {
  method: 'POST',
  body: JSON.stringify(orderRequest)
});
```

---

## 📊 Resumen de Endpoints Necesarios

| Endpoint | Método | Propósito | Estado |
|----------|--------|-----------|--------|
| `/venues/clone-for-event` | POST | Clonar venue para evento | ✅ Existe |
| `/getTicketByEventId/{eventId}` | GET | Obtener categorías del evento | ✅ Existe |
| `/tickets-distribution/{distId}/available-seats` | GET | Consultar asientos disponibles | ❌ **CREAR** |
| `/orders/create` | POST | Crear orden con asientos | ✅ Existe |

---

## ✅ Recomendación Final

**SÍ, necesitas crear el nuevo servicio** `getAvailableSeats` porque:

1. ✅ Los endpoints actuales de `seats` consultan tabla `Seats` (antigua)
2. ✅ La nueva estructura usa `TicketsDistribution` con `location.seatId`
3. ✅ Necesitas consultar tickets disponibles en tiempo real
4. ✅ El frontend necesita mostrar el mapa de asientos con estados

### Pasos a Seguir:

1. Crear el archivo `src/tickets-distribution/getAvailableSeats.js`
2. Agregar la función al `serverless.yml`
3. Desplegar: `serverless deploy --force`
4. Usar el endpoint en el frontend para mostrar asientos disponibles

¿Quieres que te ayude a crear el servicio completo e integrarlo?
