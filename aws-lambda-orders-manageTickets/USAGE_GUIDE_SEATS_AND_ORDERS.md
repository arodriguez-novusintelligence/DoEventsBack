# Guía de Uso: Consulta de Asientos y Creación de Órdenes

## 📋 Resumen del Flujo

```
1. Clonar Venue → 2. Consultar Tickets → 3. Consultar Asientos → 4. Crear Orden
```

---

## 🔄 PASO 1: Clonar Venue para Evento

### Request
```bash
POST https://API_URL/dev/venues/clone-for-event
Content-Type: application/json
```

```json
{
  "baseVenueId": "venue-base-123",
  "eventId": "event-456",
  "name": "Teatro Metropolitan - Concierto Rock 2026",
  "hasSeating": true,
  "ticketCategories": [
    {
      "id": "cat-vip-001",
      "categoria": "VIP",
      "cantidadTickets": 50,
      "valor": 150000,
      "moneda": "COP"
    }
  ],
  "fechaIniVent": "2026-01-15T00:00:00Z",
  "fechaFinVent": "2026-03-15T20:00:00Z"
}
```

### Respuesta
```json
{
  "venue": {
    "venueId": "venue-cloned-789",
    "eventId": "event-456"
  }
}
```

---

## 🎫 PASO 2: Consultar Tickets del Evento

### Request
```bash
GET https://API_URL/dev/getTicketByEventId/event-456
```

### Respuesta
```json
[
  {
    "id": "tk-abc",
    "eventId": "event-456",
    "venueId": "venue-cloned-789",
    "hasSeating": true,
    "boleta": [
      {
        "categoria": "VIP",
        "id": "cat-vip-001",
        "cantidadTickets": 50,
        "avaliableCapacity": 50,
        "valor": 150000,
        "distributionId": "dist-vip-xyz",
        "distributionCreateDate": "2026-01-12T15:30:00.000Z"
      }
    ]
  }
]
```

**Guardar:** Para cada categoría que quieras comprar, necesitas `distributionId` y `createDate`.

---

## 🪑 PASO 3: Consultar Asientos Disponibles

### Opción A: Consultar TODAS las categorías del evento (RECOMENDADO)

**Endpoint:**
```
GET /events/{eventId}/available-seats
```

**Request de Ejemplo:**
```bash
GET https://API_URL/dev/events/event-456/available-seats
```

**Respuesta:**
```json
{
  "eventId": "event-456",
  "totalCategories": 3,
  "summary": {
    "totalSeats": 150,
    "availableSeats": 142,
    "reservedSeats": 5,
    "soldSeats": 3
  },
  "categories": [
    {
      "categoryId": "cat-general-001",
      "categoryName": "General",
      "distributionId": "dist-general-xyz",
      "createDate": "2026-01-12T15:30:00.000Z",
      "venueId": "venue-cloned-789",
      "ticketId": "tk-abc",
      "summary": {
        "totalSeats": 100,
        "availableSeats": 95,
        "reservedSeats": 3,
        "soldSeats": 2
      },
      "seats": [
        {
          "ticketInstanceId": "ticket-inst-101",
          "location": {
            "seatId": "seat-cloned-201",
            "row": "A",
            "number": "1",
            "seatLabel": "A1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-101",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-102",
          "location": {
            "seatId": "seat-cloned-202",
            "row": "A",
            "number": "2",
            "seatLabel": "A2"
          },
          "ticketStatus": "RESERVED",
          "price": 50000,
          "qrCodeKey": "qr-key-102",
          "ownerId": "user-123",
          "orderId": "order-abc"
        }
      ]
    },
    {
      "categoryId": "cat-vip-001",
      "categoryName": "VIP",
      "distributionId": "dist-vip-xyz",
      "createDate": "2026-01-12T15:30:00.000Z",
      "venueId": "venue-cloned-789",
      "ticketId": "tk-abc",
      "summary": {
        "totalSeats": 50,
        "availableSeats": 47,
        "reservedSeats": 2,
        "soldSeats": 1
      },
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
          "price": 150000,
          "qrCodeKey": "qr-key-001",
          "ownerId": null,
          "orderId": null
        }
      ]
    }
  ]
}
```

### Opción B: Consultar una categoría específica

Si necesitas solo una categoría, usa el endpoint original:

**Endpoint:**
```
GET /tickets-distribution/{distributionId}/available-seats?createDate={createDate}
```

**Request de Ejemplo:**
```bash
GET https://API_URL/dev/tickets-distribution/dist-vip-xyz/available-seats?createDate=2026-01-12T15:30:00.000Z
```

### Respuesta
```json
{
  "distributionId": "dist-vip-xyz",
  "categoryId": "cat-vip-001",
  "categoryName": "VIP",
  "eventId": "event-456",
  "venueId": "venue-cloned-789",
  "ticketId": "tk-abc",
  "summary": {
    "totalSeats": 50,
    "availableSeats": 48,
    "reservedSeats": 2,
    "soldSeats": 0
  },
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
      "price": 150000,
      "ownerId": null,
      "qrCodeKey": "qr-key-001",
      "orderId": null
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
      "price": 150000,
      "ownerId": null,
      "qrCodeKey": "qr-key-002",
      "orderId": null
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
      "ownerId": "user-other",
      "qrCodeKey": "qr-key-003",
      "orderId": "order-123"
    }
  ]
}
```

---

## 🛒 PASO 4: Crear Orden con Asientos Seleccionados

### Opción A: Usuario selecciona asientos específicos

```bash
POST https://API_URL/dev/orders/create
Content-Type: application/json
```

```json
{
  "reference": "ORDER-2026-001",
  "customer_email": "cliente@ejemplo.com",
  "metadata": {
    "eventId": "event-456",
    "userID": "user-789",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-vip-001",
        "quantity": 2,
        "ticketsDistId": "dist-vip-xyz",
        "createDate": "2026-01-12T15:30:00.000Z",
        "seats": ["A1", "A2"]
      }
    ]
  }
}
```

### Opción B: Sistema asigna automáticamente

```json
{
  "reference": "ORDER-2026-002",
  "customer_email": "cliente2@ejemplo.com",
  "metadata": {
    "eventId": "event-456",
    "userID": "user-890",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-vip-001",
        "quantity": 3,
        "ticketsDistId": "dist-vip-xyz",
        "createDate": "2026-01-12T15:30:00.000Z",
        "seats": []
      }
    ]
  }
}
```

---

## 🎨 Ejemplo: Frontend con Mapa de Asientos

### JavaScript/React Ejemplo (Opción Simplificada - Recomendada)

```javascript
// 1. Cargar TODAS las categorías y asientos del evento en una sola llamada
async function loadEventSeats(eventId) {
  const response = await fetch(`${API_URL}/events/${eventId}/available-seats`);
  const data = await response.json();
  
  console.log(`Total categorías: ${data.totalCategories}`);
  console.log(`Asientos disponibles: ${data.summary.availableSeats}/${data.summary.totalSeats}`);
  
  return data; // Contiene todas las categorías con sus asientos
}

// 2. Renderizar selector de categorías
function renderCategorySelector(categories) {
  const selector = document.getElementById('category-selector');
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.categoryId;
    option.textContent = `${cat.categoryName} - ${cat.summary.availableSeats} disponibles (${cat.summary.totalSeats} total)`;
    option.dataset.distributionId = cat.distributionId;
    option.dataset.createDate = cat.createDate;
    selector.appendChild(option);
  });
  
  selector.onchange = () => {
    const selected = categories.find(c => c.categoryId === selector.value);
    if (selected) {
      renderSeatMap(selected.seats);
    }
  };
}

// 3. Renderizar mapa de asientos
function renderSeatMap(seats) {
  const seatMap = document.getElementById('seat-map');
  seatMap.innerHTML = ''; // Limpiar
  
  seats.forEach(seat => {
    const seatButton = document.createElement('button');
    seatButton.textContent = seat.location.seatLabel || 'Sin asiento';
    seatButton.className = `seat seat-${seat.ticketStatus.toLowerCase()}`;
    seatButton.disabled = seat.ticketStatus !== 'AVAILABLE';
    
    if (seat.ticketStatus === 'AVAILABLE') {
      seatButton.onclick = () => selectSeat(seat);
    }
    
    seatMap.appendChild(seatButton);
  });
}

// 4. Seleccionar asientos
const selectedSeats = [];

function selectSeat(seat) {
  const seatLabel = seat.location.seatLabel;
  const index = selectedSeats.indexOf(seatLabel);
  
  if (index > -1) {
    selectedSeats.splice(index, 1); // Deseleccionar
  } else {
    selectedSeats.push(seatLabel); // Seleccionar
  }
  
  updateSelectedSeatsDisplay();
}

// 5. Crear orden
async function createOrder(eventId, selectedCategory, userEmail) {
  const orderRequest = {
    reference: `ORDER-${Date.now()}`,
    customer_email: userEmail,
    metadata: {
      eventId: eventId,
      userID: getCurrentUserId(),
      tickets: [
        {
          category: selectedCategory.categoryName,
          categoryId: selectedCategory.categoryId,
          quantity: selectedSeats.length,
          ticketsDistId: selectedCategory.distributionId,
          createDate: selectedCategory.createDate,
          seats: selectedSeats
        }
      ]
    }
  };
  
  const response = await fetch(`${API_URL}/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderRequest)
  });
  
  return await response.json();
}

// Uso completo simplificado
async function setupEventPurchase(eventId) {
  // 1. Una sola llamada trae TODO
  const eventData = await loadEventSeats(eventId);
  
  // 2. Renderizar selector de categorías
  renderCategorySelector(eventData.categories);
  
  // 3. Usuario selecciona categoría y ve mapa automáticamente
  // 4. Usuario selecciona asientos (clicks en el mapa)
  // 5. Usuario confirma y crea orden
  
  const selectedCategory = eventData.categories[0]; // O la que seleccionó el usuario
  const order = await createOrder(
    eventId,
    selectedCategory,
    'user@example.com'
  );
  
  console.log('Orden creada:', order);
}
```

### JavaScript/React Ejemplo (Opción Original - Por Categoría)

```javascript
// 1. Obtener categorías del evento
async function loadEventCategories(eventId) {
  const response = await fetch(`${API_URL}/getTicketByEventId/${eventId}`);
  const data = await response.json();
  return data[0].boleta; // Array de categorías
}

// 2. Cargar asientos disponibles de una categoría
async function loadAvailableSeats(distributionId, createDate) {
  const url = `${API_URL}/tickets-distribution/${distributionId}/available-seats?createDate=${encodeURIComponent(createDate)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.seats;
}

// 3. Renderizar mapa de asientos
function renderSeatMap(seats) {
  const seatMap = document.getElementById('seat-map');
  
  seats.forEach(seat => {
    const seatButton = document.createElement('button');
    seatButton.textContent = seat.location.seatLabel;
    seatButton.className = `seat seat-${seat.ticketStatus.toLowerCase()}`;
    seatButton.disabled = seat.ticketStatus !== 'AVAILABLE';
    
    if (seat.ticketStatus === 'AVAILABLE') {
      seatButton.onclick = () => selectSeat(seat);
    }
    
    seatMap.appendChild(seatButton);
  });
}

// 4. Seleccionar asientos
const selectedSeats = [];

function selectSeat(seat) {
  const seatLabel = seat.location.seatLabel;
  const index = selectedSeats.indexOf(seatLabel);
  
  if (index > -1) {
    selectedSeats.splice(index, 1); // Deseleccionar
  } else {
    selectedSeats.push(seatLabel); // Seleccionar
  }
  
  updateSelectedSeatsDisplay();
}

// 5. Crear orden
async function createOrder(eventId, categoryData, userEmail) {
  const orderRequest = {
    reference: `ORDER-${Date.now()}`,
    customer_email: userEmail,
    metadata: {
      eventId: eventId,
      userID: getCurrentUserId(),
      tickets: [
        {
          category: categoryData.categoria,
          categoryId: categoryData.id,
          quantity: selectedSeats.length,
          ticketsDistId: categoryData.distributionId,
          createDate: categoryData.distributionCreateDate,
          seats: selectedSeats
        }
      ]
    }
  };
  
  const response = await fetch(`${API_URL}/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderRequest)
  });
  
  return await response.json();
}

// Uso completo
async function setupEventPurchase(eventId) {
  // 1. Cargar categorías
  const categories = await loadEventCategories(eventId);
  
  // 2. Usuario selecciona categoría (ej: primera categoría)
  const selectedCategory = categories[0];
  
  // 3. Cargar asientos de esa categoría
  const seats = await loadAvailableSeats(
    selectedCategory.distributionId,
    selectedCategory.distributionCreateDate
  );
  
  // 4. Renderizar mapa
  renderSeatMap(seats);
  
  // 5. Usuario selecciona asientos (clicks en el mapa)
  // ...
  
  // 6. Crear orden
  const order = await createOrder(
    eventId,
    selectedCategory,
    'user@example.com'
  );
  
  console.log('Orden creada:', order);
}
```

---

## 🎯 CSS para Mapa de Asientos

```css
.seat-map {
  display: grid;
  grid-template-columns: repeat(10, 50px);
  gap: 5px;
  padding: 20px;
}

.seat {
  width: 50px;
  height: 50px;
  border: 2px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s;
}

.seat-available {
  background: #4CAF50;
  color: white;
  border-color: #45a049;
}

.seat-available:hover {
  background: #45a049;
  transform: scale(1.1);
}

.seat-available.selected {
  background: #2196F3;
  border-color: #0b7dda;
}

.seat-reserved {
  background: #FF9800;
  color: white;
  border-color: #e68900;
  cursor: not-allowed;
}

.seat-sold {
  background: #f44336;
  color: white;
  border-color: #da190b;
  cursor: not-allowed;
}

.seat:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

## 📊 Estructura de Datos Completa

```
┌─────────────────────────────────────────────────┐
│ 1. Tickets (Tabla)                              │
│ ├─ eventId: "event-456"                         │
│ ├─ boleta: [                                    │
│ │   ├─ distributionId: "dist-vip-xyz" ────────┐│
│ │   └─ distributionCreateDate: "2026-01..." ──┤│
│ └─ ...                                          ││
└─────────────────────────────────────────────────┘│
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────┐
│ 2. TicketsDistribution (Tabla)                  │
│ ├─ id: "dist-vip-xyz" (PK)                      │
│ ├─ createDate: "2026-01..." (SK)                │
│ ├─ tickets: [                                   │
│ │   ├─ ticketInstanceId: "ticket-inst-001"      │
│ │   ├─ location: {                              │
│ │   │   ├─ seatId: "seat-cloned-101" ─────────┐│
│ │   │   ├─ row: "A"                            ││
│ │   │   ├─ number: "1"                         ││
│ │   │   └─ seatLabel: "A1"                     ││
│ │   └─ ticketStatus: "AVAILABLE"               ││
│ └─ ...                                          ││
└─────────────────────────────────────────────────┘│
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────┐
│ 3. Venue_Seat (Tabla)                           │
│ ├─ seatId: "seat-cloned-101" (PK)               │
│ ├─ categoryId: "cat-vip-001"                    │
│ ├─ row: "A"                                     │
│ ├─ number: "1"                                  │
│ └─ status: "available"                          │
└─────────────────────────────────────────────────┘
```

---

## ✅ Resumen de Endpoints

| # | Endpoint | Propósito | Respuesta Clave | Notas |
|---|----------|-----------|-----------------|-------|
| 1 | `POST /venues/clone-for-event` | Clonar venue | `venueId`, `eventId` | Crea venue del evento |
| 2 | `GET /getTicketByEventId/{eventId}` | Categorías | `boleta[]` con `distributionId`, `createDate` | Si necesitas info individual |
| 3A | `GET /events/{eventId}/available-seats` | **Todos los asientos** | `categories[]` con todos los asientos | **RECOMENDADO** - Una sola llamada |
| 3B | `GET /tickets-distribution/{distId}/available-seats` | Asientos de una categoría | `seats[]` con `location` | Si solo necesitas una categoría |
| 4 | `POST /orders/create` | Crear orden | `order_id`, `tickets[]` | Usa datos del paso 3 |

---

## 🚀 Despliegue

```powershell
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-orders-manageTickets
serverless deploy --force
```

Después del despliegue, el endpoint estará disponible en:
```
https://YOUR_API_GATEWAY_URL/dev/tickets-distribution/{distributionId}/available-seats
```
