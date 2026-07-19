# 🎯 Flujo Completo: Venue → Evento → Orden con Asientos

## 📋 Índice

1. [Crear Venue Base](#paso-1-crear-venue-base)
2. [Crear Evento](#paso-2-crear-evento)
3. [Clonar Venue para Evento](#paso-3-clonar-venue-para-evento)
4. [Consultar Asientos Disponibles](#paso-4-consultar-asientos-disponibles)
5. [Crear Orden con Asientos](#paso-5-crear-orden-con-asientos)

---

## PASO 1: Crear Venue Base

### Endpoint

```
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues
```

### Request

```json
{
  "name": "Teatro Metropolitan",
  "location": "Bogotá, Colombia",
  "description": "Teatro de categoría internacional",
  "capacity": 1500,
  "hasSeating": true,
  "floors": [
    {
      "name": "Planta Principal",
      "level": 1,
      "categories": [
        {
          "id": "cat-vip-base",
          "categoria": "VIP",
          "valor": 150000,
          "moneda": "COP",
          "color": "#FFD700",
          "seats": [
            { "row": "A", "number": "1", "status": "available" },
            { "row": "A", "number": "2", "status": "available" },
            { "row": "A", "number": "3", "status": "available" },
            { "row": "B", "number": "1", "status": "available" },
            { "row": "B", "number": "2", "status": "available" }
          ]
        },
        {
          "id": "cat-general-base",
          "categoria": "General",
          "valor": 50000,
          "moneda": "COP",
          "color": "#4169E1",
          "seats": [
            { "row": "C", "number": "1", "status": "available" },
            { "row": "C", "number": "2", "status": "available" },
            { "row": "C", "number": "3", "status": "available" },
            { "row": "C", "number": "4", "status": "available" },
            { "row": "C", "number": "5", "status": "available" },
            { "row": "D", "number": "1", "status": "available" },
            { "row": "D", "number": "2", "status": "available" },
            { "row": "D", "number": "3", "status": "available" }
          ]
        }
      ]
    }
  ]
}
```

### Response

```json
{
  "statusCode": 201,
  "body": {
    "message": "Venue created successfully",
    "venue": {
      "venueId": "venue-base-abc123",
      "name": "Teatro Metropolitan",
      "capacity": 1500,
      "hasSeating": true
    },
    "floors": [
      {
        "floorId": "floor-xyz-001",
        "categories": [
          {
            "categoryId": "cat-vip-base",
            "seatsCreated": 5
          },
          {
            "categoryId": "cat-general-base",
            "seatsCreated": 8
          }
        ]
      }
    ],
    "totalSeatsCreated": 13
  }
}
```

**📝 Guardar:**

- `venueId`: `venue-base-abc123`

---

## PASO 2: Crear Evento

### Endpoint

```
POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/createEvent
```

### Request

```json
{
  "nombre": "Concierto de Rock 2026",
  "descripcion": "El mejor concierto de rock del año",
  "lugar": "Teatro Metropolitan",
  "fecha": "2026-03-15",
  "hora": "20:00",
  "userId": "user-organizer-123",
  "categoriaId": "cat-music-001",
  "tipoEventId": "tipo-concert-001",
  "placeId": "place-bogota-001",
  "estado": "draft",
  "skipVenue": true,
  "imagenes": [],
  "certificado": null
}
```

### Response

```json
{
  "statusCode": 200,
  "body": {
    "message": "Evento creado exitosamente",
    "id": "event-456",
    "nombre": "Concierto de Rock 2026",
    "estado": "draft",
    "userId": "user-organizer-123",
    "fecha": "2026-03-15",
    "slug": "concierto-de-rock-2026"
  }
}
```

**📝 Guardar:**

- `eventId`: `event-456`

---

## PASO 3: Clonar Venue para Evento

### Endpoint

```
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/clone-for-event
```

### Request

```json
{
  "baseVenueId": "venue-base-abc123",
  "eventId": "event-456",
  "name": "Teatro Metropolitan - Concierto Rock 2026",
  "hasSeating": true,
  "ticketCategories": [
    {
      "id": "cat-vip-base",
      "categoria": "VIP",
      "valor": 150000,
      "moneda": "COP"
    },
    {
      "id": "cat-general-base",
      "categoria": "General",
      "valor": 50000,
      "moneda": "COP"
    }
  ],
  "fechaIniVent": "2026-01-15T00:00:00Z",
  "fechaFinVent": "2026-03-15T20:00:00Z"
}
```

### Response

```json
{
  "statusCode": 200,
  "body": {
    "message": "Venue clonado exitosamente para el evento",
    "venue": {
      "venueId": "venue-cloned-789",
      "name": "Teatro Metropolitan - Concierto Rock 2026",
      "eventId": "event-456",
      "hasSeating": true
    },
    "clonedData": {
      "floors": 1,
      "categories": 2,
      "seats": 13
    },
    "tickets": {
      "ticketId": "tk-abc",
      "categories": [
        {
          "categoria": "VIP",
          "id": "cat-vip-base",
          "cantidadTickets": 5,
          "valor": 150000,
          "distributionId": "dist-vip-xyz",
          "distributionCreateDate": "2026-01-12T15:30:45.123Z"
        },
        {
          "categoria": "General",
          "id": "cat-general-base",
          "cantidadTickets": 8,
          "valor": 50000,
          "distributionId": "dist-general-abc",
          "distributionCreateDate": "2026-01-12T15:30:45.123Z"
        }
      ]
    }
  }
}
```

**📝 Guardar:**

- `venueId` (clonado): `venue-cloned-789`
- `eventId`: `event-456`
- Para cada categoría:
  - VIP: `distributionId` = `dist-vip-xyz`, `createDate` = `2026-01-12T15:30:45.123Z`
  - General: `distributionId` = `dist-general-abc`, `createDate` = `2026-01-12T15:30:45.123Z`

---

## PASO 4: Consultar Asientos Disponibles

### Opción A: Todas las Categorías (RECOMENDADO)

#### Endpoint

```
GET https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/event-456/available-seats
```

#### Response

```json
{
  "eventId": "event-456",
  "totalCategories": 2,
  "summary": {
    "totalSeats": 13,
    "availableSeats": 13,
    "reservedSeats": 0,
    "soldSeats": 0
  },
  "categories": [
    {
      "categoryId": "cat-general-base",
      "categoryName": "General",
      "distributionId": "dist-general-abc",
      "createDate": "2026-01-12T15:30:45.123Z",
      "venueId": "venue-cloned-789",
      "ticketId": "tk-abc",
      "summary": {
        "totalSeats": 8,
        "availableSeats": 8,
        "reservedSeats": 0,
        "soldSeats": 0
      },
      "seats": [
        {
          "ticketInstanceId": "ticket-inst-201",
          "location": {
            "seatId": "seat-cloned-201",
            "row": "C",
            "number": "1",
            "seatLabel": "C1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-201",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-202",
          "location": {
            "seatId": "seat-cloned-202",
            "row": "C",
            "number": "2",
            "seatLabel": "C2"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-202",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-203",
          "location": {
            "seatId": "seat-cloned-203",
            "row": "C",
            "number": "3",
            "seatLabel": "C3"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-203",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-204",
          "location": {
            "seatId": "seat-cloned-204",
            "row": "C",
            "number": "4",
            "seatLabel": "C4"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-204",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-205",
          "location": {
            "seatId": "seat-cloned-205",
            "row": "C",
            "number": "5",
            "seatLabel": "C5"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-205",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-206",
          "location": {
            "seatId": "seat-cloned-206",
            "row": "D",
            "number": "1",
            "seatLabel": "D1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-206",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-207",
          "location": {
            "seatId": "seat-cloned-207",
            "row": "D",
            "number": "2",
            "seatLabel": "D2"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-207",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-208",
          "location": {
            "seatId": "seat-cloned-208",
            "row": "D",
            "number": "3",
            "seatLabel": "D3"
          },
          "ticketStatus": "AVAILABLE",
          "price": 50000,
          "qrCodeKey": "qr-key-208",
          "ownerId": null,
          "orderId": null
        }
      ]
    },
    {
      "categoryId": "cat-vip-base",
      "categoryName": "VIP",
      "distributionId": "dist-vip-xyz",
      "createDate": "2026-01-12T15:30:45.123Z",
      "venueId": "venue-cloned-789",
      "ticketId": "tk-abc",
      "summary": {
        "totalSeats": 5,
        "availableSeats": 5,
        "reservedSeats": 0,
        "soldSeats": 0
      },
      "seats": [
        {
          "ticketInstanceId": "ticket-inst-101",
          "location": {
            "seatId": "seat-cloned-101",
            "row": "A",
            "number": "1",
            "seatLabel": "A1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-101",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-102",
          "location": {
            "seatId": "seat-cloned-102",
            "row": "A",
            "number": "2",
            "seatLabel": "A2"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-102",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-103",
          "location": {
            "seatId": "seat-cloned-103",
            "row": "A",
            "number": "3",
            "seatLabel": "A3"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-103",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-104",
          "location": {
            "seatId": "seat-cloned-104",
            "row": "B",
            "number": "1",
            "seatLabel": "B1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-104",
          "ownerId": null,
          "orderId": null
        },
        {
          "ticketInstanceId": "ticket-inst-105",
          "location": {
            "seatId": "seat-cloned-105",
            "row": "B",
            "number": "2",
            "seatLabel": "B2"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-105",
          "ownerId": null,
          "orderId": null
        }
      ]
    }
  ]
}
```

### Opción B: Por Categoría Individual

#### Endpoint

```
GET https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets-distribution/dist-vip-xyz/available-seats?createDate=2026-01-12T15:30:45.123Z
```

---

## PASO 5: Crear Orden con Asientos

### Endpoint

```
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders
```

### Request - Opción A: Asientos Específicos

```json
{
  "reference": "ORDER-2026-001",
  "customer_email": "cliente@ejemplo.com",
  "amount_in_cents": 40000000,
  "currency": "COP",
  "metadata": {
    "eventId": "event-456",
    "userID": "user-buyer-789",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-vip-base",
        "quantity": 2,
        "ticketsDistId": "dist-vip-xyz",
        "createDate": "2026-01-12T15:30:45.123Z",
        "seats": ["A1", "A2"]
      },
      {
        "category": "General",
        "categoryId": "cat-general-base",
        "quantity": 3,
        "ticketsDistId": "dist-general-abc",
        "createDate": "2026-01-12T15:30:45.123Z",
        "seats": ["C1", "C2", "C3"]
      }
    ]
  }
}
```

### Request - Opción B: Asignación Automática

```json
{
  "reference": "ORDER-2026-002",
  "customer_email": "cliente2@ejemplo.com",
  "amount_in_cents": 30000000,
  "currency": "COP",
  "metadata": {
    "eventId": "event-456",
    "userID": "user-buyer-890",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-vip-base",
        "quantity": 2,
        "ticketsDistId": "dist-vip-xyz",
        "createDate": "2026-01-12T15:30:45.123Z",
        "seats": []
      }
    ]
  }
}
```

### Response

```json
{
  "statusCode": 200,
  "body": {
    "message": "Orden creada y tickets reservados.",
    "order_id": "ORDER-2026-001",
    "tickets": [
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-101",
        "category": "VIP",
        "categoryId": "cat-vip-base",
        "seat": {
          "seatId": "seat-cloned-101",
          "row": "A",
          "number": "1",
          "seatLabel": "A1"
        },
        "seatId": "seat-cloned-101",
        "seatLabel": "A1",
        "qr_url": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-101.png",
        "qrCodeKey": "qr-key-101",
        "user_id": "user-buyer-789",
        "distributionId": "dist-vip-xyz",
        "distributionCreateDate": "2026-01-12T15:30:45.123Z",
        "price": 150000
      },
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-102",
        "category": "VIP",
        "categoryId": "cat-vip-base",
        "seat": {
          "seatId": "seat-cloned-102",
          "row": "A",
          "number": "2",
          "seatLabel": "A2"
        },
        "seatId": "seat-cloned-102",
        "seatLabel": "A2",
        "qr_url": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-102.png",
        "qrCodeKey": "qr-key-102",
        "user_id": "user-buyer-789",
        "distributionId": "dist-vip-xyz",
        "distributionCreateDate": "2026-01-12T15:30:45.123Z",
        "price": 150000
      },
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-201",
        "category": "General",
        "categoryId": "cat-general-base",
        "seat": {
          "seatId": "seat-cloned-201",
          "row": "C",
          "number": "1",
          "seatLabel": "C1"
        },
        "seatId": "seat-cloned-201",
        "seatLabel": "C1",
        "qr_url": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-201.png",
        "qrCodeKey": "qr-key-201",
        "user_id": "user-buyer-789",
        "distributionId": "dist-general-abc",
        "distributionCreateDate": "2026-01-12T15:30:45.123Z",
        "price": 50000
      },
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-202",
        "category": "General",
        "categoryId": "cat-general-base",
        "seat": {
          "seatId": "seat-cloned-202",
          "row": "C",
          "number": "2",
          "seatLabel": "C2"
        },
        "seatId": "seat-cloned-202",
        "seatLabel": "C2",
        "qr_url": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-202.png",
        "qrCodeKey": "qr-key-202",
        "user_id": "user-buyer-789",
        "distributionId": "dist-general-abc",
        "distributionCreateDate": "2026-01-12T15:30:45.123Z",
        "price": 50000
      },
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-203",
        "category": "General",
        "categoryId": "cat-general-base",
        "seat": {
          "seatId": "seat-cloned-203",
          "row": "C",
          "number": "3",
          "seatLabel": "C3"
        },
        "seatId": "seat-cloned-203",
        "seatLabel": "C3",
        "qr_url": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-203.png",
        "qrCodeKey": "qr-key-203",
        "user_id": "user-buyer-789",
        "distributionId": "dist-general-abc",
        "distributionCreateDate": "2026-01-12T15:30:45.123Z",
        "price": 50000
      }
    ],
    "summary": {
      "totalTickets": 5,
      "categories": [
        {
          "category": "VIP",
          "quantity": 2
        },
        {
          "category": "General",
          "quantity": 3
        }
      ]
    }
  }
}
```

---

## 📊 Logs del Sistema

Durante el proceso de creación de orden, el sistema genera logs detallados:

```
🎫 Procesando 2 categoría(s) de tickets...

📋 Categoría: VIP (cat-vip-base)
   - Cantidad solicitada: 2
   - Asientos específicos: A1, A2
   - DistributionId: dist-vip-xyz
   - CreateDate: 2026-01-12T15:30:45.123Z
   ✓ Distribution encontrada con 5 tickets totales
   ✓ Tickets disponibles encontrados: 2
   ✓ Todos los asientos solicitados están disponibles
     ✓ Reservado: ticket-inst-101 - A1
     ✓ Reservado: ticket-inst-102 - A2
   ✅ 2 ticket(s) reservado(s) en TicketsDistribution

📋 Categoría: General (cat-general-base)
   - Cantidad solicitada: 3
   - Asientos específicos: C1, C2, C3
   - DistributionId: dist-general-abc
   - CreateDate: 2026-01-12T15:30:45.123Z
   ✓ Distribution encontrada con 8 tickets totales
   ✓ Tickets disponibles encontrados: 3
   ✓ Todos los asientos solicitados están disponibles
     ✓ Reservado: ticket-inst-201 - C1
     ✓ Reservado: ticket-inst-202 - C2
     ✓ Reservado: ticket-inst-203 - C3
   ✅ 3 ticket(s) reservado(s) en TicketsDistribution

✅ Total de tickets reservados: 5
🎉 Orden creada exitosamente: ORDER-2026-001
   - Tickets reservados: 5
   - Categorías afectadas: VIP, General
```

---

## 🔄 Estado en DynamoDB

### Tabla: TicketsDistribution

Después de la reserva, los tickets cambian su estado:

```json
{
  "id": "dist-vip-xyz",
  "createDate": "2026-01-12T15:30:45.123Z",
  "eventId": "event-456",
  "venueId": "venue-cloned-789",
  "tickets": [
    {
      "ticketInstanceId": "ticket-inst-101",
      "ticketStatus": "RESERVED",
      "location": {
        "seatId": "seat-cloned-101",
        "row": "A",
        "number": "1",
        "seatLabel": "A1"
      },
      "orderId": "ORDER-2026-001",
      "ownerId": "user-buyer-789",
      "reservationExpiry": 1736694300,
      "qrUrl": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-101.png"
    },
    {
      "ticketInstanceId": "ticket-inst-102",
      "ticketStatus": "RESERVED",
      "location": {
        "seatId": "seat-cloned-102",
        "row": "A",
        "number": "2",
        "seatLabel": "A2"
      },
      "orderId": "ORDER-2026-001",
      "ownerId": "user-buyer-789",
      "reservationExpiry": 1736694300,
      "qrUrl": "https://doeventimageeventbucket.s3.amazonaws.com/qrs/qr-key-102.png"
    },
    {
      "ticketInstanceId": "ticket-inst-103",
      "ticketStatus": "AVAILABLE",
      "location": {
        "seatId": "seat-cloned-103",
        "row": "A",
        "number": "3",
        "seatLabel": "A3"
      }
    }
  ]
}
```

### Tabla: Orders

```json
{
  "order_id": "ORDER-2026-001",
  "event_id": "event-456",
  "user_id": "user-buyer-789",
  "amount": 40000000,
  "currency": "COP",
  "payment_status": "PENDING",
  "created_at": "2026-01-12T15:35:00.000Z",
  "tickets": [
    {
      "ticket_id": "ticket-inst-101",
      "seatId": "seat-cloned-101",
      "seatLabel": "A1",
      "distributionId": "dist-vip-xyz",
      "distributionCreateDate": "2026-01-12T15:30:45.123Z",
      "price": 150000
    }
  ]
}
```

### Tabla: Tickets (Contadores)

```json
{
  "id": "tk-abc",
  "eventId": "event-456",
  "venueId": "venue-cloned-789",
  "boleta": [
    {
      "categoria": "VIP",
      "id": "cat-vip-base",
      "cantidadTickets": 5,
      "avaliableCapacity": 3,
      "reservedTickets": 2,
      "soldTickets": 0,
      "valor": 150000,
      "distributionId": "dist-vip-xyz"
    },
    {
      "categoria": "General",
      "id": "cat-general-base",
      "cantidadTickets": 8,
      "avaliableCapacity": 5,
      "reservedTickets": 3,
      "soldTickets": 0,
      "valor": 50000,
      "distributionId": "dist-general-abc"
    }
  ]
}
```

---

## ✅ Validaciones Implementadas

### 1. Parámetros Requeridos

- ✅ `category`, `categoryId`, `quantity`, `ticketsDistId`, `createDate`

### 2. Disponibilidad de Tickets

- ✅ Verifica que haya suficientes tickets disponibles
- ✅ Error específico si no hay suficientes: `NOT_ENOUGH_TICKETS`

### 3. Asientos Específicos

- ✅ Valida que los asientos solicitados existan
- ✅ Valida que los asientos estén disponibles
- ✅ Error detallado indicando asientos no disponibles: `SEATS_NOT_AVAILABLE`

### 4. Filtro Correcto de Asientos

- ✅ Compara `seatLabel` (string) en lugar de objeto completo
- ✅ Soporta asignación automática (array vacío de seats)

---

## 🎯 Casos de Uso Soportados

### ✅ Caso 1: Usuario Elige Asientos Específicos

1. Frontend muestra mapa de asientos
2. Usuario selecciona A1, A2
3. Request incluye `seats: ["A1", "A2"]`
4. Sistema reserva exactamente esos asientos

### ✅ Caso 2: Sistema Asigna Automáticamente

1. Usuario solo elige cantidad
2. Request incluye `seats: []`
3. Sistema toma los primeros N disponibles ordenados por fila/número

### ✅ Caso 3: Múltiples Categorías

1. Usuario compra VIP + General en una orden
2. Array `tickets` con múltiples objetos
3. Cada uno con su `distributionId` y `createDate`

### ✅ Caso 4: Asientos No Disponibles

1. Usuario intenta reservar A1 (ya reservado)
2. Sistema retorna error específico
3. Frontend debe refrescar disponibilidad

---

## 📝 Resumen de Endpoints Utilizados

| Paso | Servicio | Endpoint                                                                                      | Método |
| ---- | -------- | --------------------------------------------------------------------------------------------- | ------ |
| 1    | Venues   | `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues`                           | POST   |
| 2    | Events   | `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/createEvent`                          | POST   |
| 3    | Venues   | `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/clone-for-event`           | POST   |
| 4    | Orders   | `https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/{eventId}/available-seats` | GET    |
| 5    | Orders   | `https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders`                           | POST   |

---

## 🚀 Notas de Implementación

### Cambios Recientes

1. ✅ Filtro de asientos corregido en `manageOrders.js`
2. ✅ Trazabilidad completa: `seatId`, `distributionId`, `categoryId`, `price`
3. ✅ Validación robusta de asientos específicos
4. ✅ Logs detallados para debugging
5. ✅ Respuesta con resumen por categoría

### Consideraciones

- Los tickets reservados tienen TTL de 15 minutos
- Los QR codes se generan automáticamente al crear la orden
- El estado cambia de `RESERVED` a `SOLD` al confirmar el pago
- Los asientos se ordenan alfabéticamente por fila y número

---

## 🔗 Documentación Relacionada

- [ORDER_CREATION_FLOW_UPDATED.md](aws-lambda-orders-manageTickets/ORDER_CREATION_FLOW_UPDATED.md) - Detalles de creación de órdenes
- [ENDPOINT_COMPARISON_SEATS.md](aws-lambda-orders-manageTickets/ENDPOINT_COMPARISON_SEATS.md) - Comparación de endpoints de asientos
- [USAGE_GUIDE_SEATS_AND_ORDERS.md](aws-lambda-orders-manageTickets/USAGE_GUIDE_SEATS_AND_ORDERS.md) - Guía de uso con ejemplos de frontend
- [SEAT_TICKET_MAPPING_GUIDE.md](SEAT_TICKET_MAPPING_GUIDE.md) - Guía técnica de mapeo de asientos
