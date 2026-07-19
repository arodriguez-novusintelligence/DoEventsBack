# 📡 API Endpoints - Servicios Modificados

Documentación de los endpoints modificados para la generación automática de TicketsDistribution.

---

## 1️⃣ CREATE VENUE

### Endpoint

```
POST /venues
```

### Request Body

```json
{
  "name": "Estadio El Campín",
  "type": "stadium",
  "capacity": 36000,
  "eventId": "event-12345",
  "isEventVenue": true,
  "hasSeating": true,
  "description": "Estadio para evento musical",
  "floors": [
    {
      "name": "Platea",
      "floorNumber": 1,
      "capacity": 10000,
      "categories": [
        {
          "name": "VIP",
          "cantidadTickets": 100,
          "ticketPrice": 500000,
          "currency": "COP",
          "description": "Sillas VIP con mejor vista",
          "gateId": "gate-1"
        },
        {
          "name": "General",
          "cantidadTickets": 9900,
          "ticketPrice": 150000,
          "currency": "COP",
          "description": "Sillas generales",
          "gateId": "gate-2"
        }
      ]
    }
  ],
  "gates": [
    {
      "name": "Puerta Principal",
      "type": "main",
      "description": "Entrada principal"
    }
  ],
  "fechaIniVent": "2026-02-15",
  "fechaFinVent": "2026-02-15",
  "horaIniVent": "18:00",
  "horaFinVent": "23:00"
}
```

### Request Parameters

| Campo                                   | Tipo    | Requerido | Descripción                                         |
| --------------------------------------- | ------- | --------- | --------------------------------------------------- |
| `name`                                  | String  | ✅        | Nombre del venue                                    |
| `type`                                  | String  | ✅        | Tipo de venue (stadium, theater, arena, etc.)       |
| `capacity`                              | Number  | ✅        | Capacidad total del venue                           |
| `eventId`                               | String  | ⚠️        | ID del evento (requerido para generar tickets)      |
| `isEventVenue`                          | Boolean | ❌        | Si es venue para evento (true) o venue base (false) |
| `hasSeating`                            | Boolean | ❌        | Si tiene asientos numerados                         |
| `floors`                                | Array   | ❌        | Pisos/niveles del venue                             |
| `floors[].categories`                   | Array   | ⚠️        | Categorías de boletas (requerido si tiene eventId)  |
| `floors[].categories[].name`            | String  | ✅        | Nombre de la categoría                              |
| `floors[].categories[].cantidadTickets` | Number  | ✅        | Cantidad de tickets para esta categoría             |
| `floors[].categories[].ticketPrice`     | Number  | ✅        | Precio del ticket                                   |
| `floors[].categories[].currency`        | String  | ❌        | Moneda (default: COP)                               |
| `gates`                                 | Array   | ❌        | Puertas de acceso                                   |

### Response Success (201 Created)

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-uuid-12345",
    "name": "Estadio El Campín",
    "type": "stadium",
    "capacity": 36000,
    "eventId": "event-12345",
    "isEventVenue": true,
    "hasSeating": true,
    "baseVenueId": null,
    "floorCount": 1,
    "floors": [
      {
        "floorId": "floor-uuid-1",
        "name": "Platea",
        "floorNumber": 1,
        "capacity": 10000,
        "categories": [
          {
            "categoryId": "cat-uuid-1",
            "name": "VIP",
            "cantidadTickets": 100,
            "ticketPrice": 500000,
            "currency": "COP"
          },
          {
            "categoryId": "cat-uuid-2",
            "name": "General",
            "cantidadTickets": 9900,
            "ticketPrice": 150000,
            "currency": "COP"
          }
        ]
      }
    ],
    "gateCount": 1,
    "gates": [
      {
        "gateId": "gate-uuid-1",
        "name": "Puerta Principal",
        "type": "main"
      }
    ],
    "ticketRecord": {
      "ticketId": "ticket-uuid-123",
      "categoriesCount": 2
    }
  }
}
```

### Response Fields

| Campo                                | Tipo   | Descripción                                             |
| ------------------------------------ | ------ | ------------------------------------------------------- |
| `venue.venueId`                      | String | ID único del venue creado                               |
| `venue.ticketRecord`                 | Object | ✨ **NUEVO**: Información del registro en tabla Tickets |
| `venue.ticketRecord.ticketId`        | String | ✨ **NUEVO**: ID del ticket creado                      |
| `venue.ticketRecord.categoriesCount` | Number | ✨ **NUEVO**: Cantidad de categorías creadas            |

### Datos Creados Automáticamente

#### 1. Tabla Tickets

```json
{
  "id": "ticket-uuid-123",
  "eventId": "event-12345",
  "venueId": "venue-uuid-12345",
  "boletas": [
    {
      "categoria": "VIP",
      "id": "cat-uuid-1",
      "cantidadTickets": 100,
      "avaliableCapacity": 100,
      "reservedTickets": 0,
      "soldTickets": 0,
      "valor": 500000,
      "moneda": "COP",
      "distributionId": "dist-uuid-1",
      "distributionCreateDate": "2026-01-10T12:00:00.000Z"
    },
    {
      "categoria": "General",
      "id": "cat-uuid-2",
      "cantidadTickets": 9900,
      "avaliableCapacity": 9900,
      "reservedTickets": 0,
      "soldTickets": 0,
      "valor": 150000,
      "moneda": "COP",
      "distributionId": "dist-uuid-2",
      "distributionCreateDate": "2026-01-10T12:00:00.000Z"
    }
  ],
  "createDate": "2026-01-10T12:00:00.000Z",
  "hasSeating": true
}
```

#### 2. Tabla TicketsDistribution (Automática)

```json
{
  "id": "dist-uuid-1",
  "createDate": "2026-01-10T12:00:00.000Z",
  "eventId": "event-12345",
  "venueId": "venue-uuid-12345",
  "categoryId": "cat-uuid-1",
  "categoryName": "VIP",
  "totalTickets": 100,
  "tickets": [
    {
      "ticketInstanceId": "ticket-instance-uuid-1",
      "ticketStatus": "AVAILABLE",
      "qrCodeKey": "qr-ticket-instance-uuid-1",
      "purchasePrice": 500000,
      "currency": "COP",
      "reservedAt": null,
      "reservedBy": null,
      "expiresAt": null,
      "seatInfo": null
    }
    // ... 99 tickets más
  ]
}
```

**Se crea 1 registro en TicketsDistribution por cada categoría**

- VIP: 100 tickets individuales
- General: 9900 tickets individuales

### Flujo de Creación

```
1. POST /venues
   ↓
2. Crea Venue en tabla Venues
   ↓
3. Crea Floors en tabla Venue_Floor
   ↓
4. Crea Categories en tabla Venue_Category
   ↓
5. Crea Gates en tabla Venue_Gate (si aplica)
   ↓
6. ✨ NUEVO: Crea registro en tabla Tickets
   ↓
7. ✨ NUEVO: Crea registros en tabla TicketsDistribution
   ↓
8. Retorna respuesta con ticketRecord
```

### Response Error (400 Bad Request)

```json
{
  "error": "Validation error",
  "message": "name, type y capacity son requeridos"
}
```

### Response Error (500 Internal Server Error)

```json
{
  "error": "Internal server error",
  "message": "Error creating venue"
}
```

---

## 2️⃣ UPDATE VENUE

### Endpoint

```
PUT /venues/{venueId}
```

### URL Parameters

- `venueId` (String, required): ID del venue a actualizar

### Request Body

```json
{
  "name": "Estadio El Campín - Actualizado",
  "capacity": 40000,
  "floors": [
    {
      "floorId": "floor-uuid-1",
      "name": "Platea",
      "categories": [
        {
          "categoryId": "cat-uuid-1",
          "name": "VIP",
          "cantidadTickets": 150,
          "ticketPrice": 550000
        },
        {
          "categoryId": "cat-uuid-2",
          "name": "General",
          "cantidadTickets": 9850,
          "ticketPrice": 150000
        }
      ]
    }
  ]
}
```

### Request Parameters

| Campo                                   | Tipo   | Requerido | Descripción                  |
| --------------------------------------- | ------ | --------- | ---------------------------- |
| `name`                                  | String | ❌        | Nuevo nombre del venue       |
| `capacity`                              | Number | ❌        | Nueva capacidad total        |
| `floors`                                | Array  | ❌        | Actualización de pisos       |
| `floors[].categories`                   | Array  | ❌        | Actualización de categorías  |
| `floors[].categories[].categoryId`      | String | ✅        | ID de la categoría existente |
| `floors[].categories[].cantidadTickets` | Number | ⚠️        | Nueva cantidad de tickets    |

### Response Success (200 OK)

```json
{
  "message": "Venue updated successfully",
  "venue": {
    "venueId": "venue-uuid-12345",
    "name": "Estadio El Campín - Actualizado",
    "capacity": 40000,
    "eventId": "event-12345",
    "updatedAt": "2026-01-10T14:30:00.000Z"
  },
  "updates": {
    "venue": {
      "updated": true,
      "fields": ["name", "capacity"]
    },
    "floors": {
      "updated": 1,
      "total": 1
    },
    "categories": {
      "updated": 2,
      "total": 2
    },
    "ticketsSync": {
      "action": "updated",
      "categoriesCount": 2,
      "message": "Categorías sincronizadas automáticamente con Tickets y TicketsDistribution",
      "distributionSync": {
        "created": 0,
        "updated": 2,
        "details": [
          {
            "categoryName": "VIP",
            "distributionId": "dist-uuid-1",
            "action": "increased",
            "ticketsAdded": 50,
            "currentTotal": 150,
            "breakdown": {
              "existing": 100,
              "added": 50,
              "removed": 0
            }
          },
          {
            "categoryName": "General",
            "distributionId": "dist-uuid-2",
            "action": "decreased",
            "ticketsRemoved": 50,
            "currentTotal": 9850,
            "breakdown": {
              "existing": 9900,
              "added": 0,
              "removed": 50,
              "preservedSold": 0,
              "preservedReserved": 0
            }
          }
        ]
      }
    }
  }
}
```

### Response Fields - ✨ NUEVOS

| Campo                                            | Tipo   | Descripción                                                      |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| `updates.ticketsSync`                            | Object | ✨ **NUEVO**: Resultado de la sincronización con Tickets         |
| `updates.ticketsSync.action`                     | String | Acción realizada: "updated", "created", "preserved", "skipped"   |
| `updates.ticketsSync.distributionSync`           | Object | ✨ **NUEVO**: Detalles de sincronización de TicketsDistribution  |
| `updates.ticketsSync.distributionSync.created`   | Number | Cantidad de distributions nuevas creadas                         |
| `updates.ticketsSync.distributionSync.updated`   | Number | Cantidad de distributions actualizadas                           |
| `updates.ticketsSync.distributionSync.details[]` | Array  | Detalles por categoría                                           |
| `details[].action`                               | String | Tipo de cambio: "increased", "decreased", "unchanged", "created" |
| `details[].ticketsAdded`                         | Number | Cantidad de tickets agregados (si aumentó)                       |
| `details[].ticketsRemoved`                       | Number | Cantidad de tickets eliminados (si disminuyó)                    |
| `details[].breakdown`                            | Object | Desglose detallado de cambios                                    |

### Escenarios de Actualización

#### Escenario 1: Aumentar Cantidad de Tickets

```json
// Request: VIP de 100 → 150 tickets
{
  "floors": [{
    "categories": [{
      "categoryId": "cat-uuid-1",
      "cantidadTickets": 150
    }]
  }]
}

// Response: distributionSync
{
  "distributionSync": {
    "updated": 1,
    "details": [{
      "categoryName": "VIP",
      "action": "increased",
      "ticketsAdded": 50,
      "currentTotal": 150,
      "breakdown": {
        "existing": 100,
        "added": 50,
        "removed": 0
      }
    }]
  }
}
```

**Resultado:**

- ✅ Se agregan 50 nuevos tickets con status `AVAILABLE`
- ✅ Los 100 tickets existentes se mantienen intactos

#### Escenario 2: Reducir Cantidad de Tickets

```json
// Request: General de 9900 → 9850 tickets
{
  "floors": [{
    "categories": [{
      "categoryId": "cat-uuid-2",
      "cantidadTickets": 9850
    }]
  }]
}

// Response: distributionSync
{
  "distributionSync": {
    "updated": 1,
    "details": [{
      "categoryName": "General",
      "action": "decreased",
      "ticketsRemoved": 50,
      "currentTotal": 9850,
      "breakdown": {
        "existing": 9900,
        "added": 0,
        "removed": 50,
        "preservedSold": 0,
        "preservedReserved": 0
      }
    }]
  }
}
```

**Resultado:**

- ✅ Se eliminan 50 tickets con status `AVAILABLE`
- ✅ Tickets `RESERVED`, `SOLD`, `USED` se preservan
- ❌ Si no hay suficientes tickets disponibles, la operación falla

#### Escenario 3: Reducir con Tickets Vendidos

```json
// Request: VIP de 100 → 80 tickets (pero hay 30 vendidos)
{
  "floors": [{
    "categories": [{
      "categoryId": "cat-uuid-1",
      "cantidadTickets": 80
    }]
  }]
}

// Response: distributionSync
{
  "distributionSync": {
    "updated": 1,
    "details": [{
      "categoryName": "VIP",
      "action": "decreased",
      "ticketsRemoved": 20,
      "currentTotal": 80,
      "breakdown": {
        "existing": 100,
        "added": 0,
        "removed": 20,
        "preservedSold": 30,
        "preservedReserved": 0,
        "availableRemaining": 50
      }
    }]
  }
}
```

**Resultado:**

- ✅ Se eliminan 20 tickets `AVAILABLE` (de los 70 disponibles)
- ✅ Los 30 tickets `SOLD` se mantienen
- ✅ Quedan 50 tickets disponibles + 30 vendidos = 80 total

#### Escenario 4: Intentar Reducir Demasiado

```json
// Request: VIP de 100 → 20 tickets (pero hay 30 vendidos)
{
  "floors": [{
    "categories": [{
      "categoryId": "cat-uuid-1",
      "cantidadTickets": 20
    }]
  }]
}

// Response Error (400 Bad Request)
{
  "error": "Validation error",
  "message": "No se puede reducir la categoría VIP a 20 tickets: hay 30 tickets ya vendidos o reservados",
  "details": {
    "categoryName": "VIP",
    "requestedQuantity": 20,
    "soldTickets": 30,
    "reservedTickets": 0,
    "minimumRequired": 30
  }
}
```

### Flujo de Actualización

```
1. PUT /venues/{venueId}
   ↓
2. Actualiza Venue en tabla Venues
   ↓
3. Actualiza Floors en tabla Venue_Floor
   ↓
4. Actualiza Categories en tabla Venue_Category
   ↓
5. ✨ NUEVO: Sincroniza tabla Tickets
   │  ├─ Preserva soldTickets y reservedTickets
   │  └─ Actualiza cantidadTickets y avaliableCapacity
   ↓
6. ✨ NUEVO: Sincroniza TicketsDistribution
   │  ├─ Aumentar: Agrega nuevos tickets AVAILABLE
   │  ├─ Reducir: Elimina solo tickets AVAILABLE
   │  └─ Preserva: RESERVED, SOLD, USED
   ↓
7. Retorna respuesta con distributionSync
```

### Response Error (400 Bad Request)

```json
{
  "error": "Validation error",
  "message": "Venue not found"
}
```

### Response Error (400 - Reducción Inválida)

```json
{
  "error": "Validation error",
  "message": "No se puede reducir la categoría VIP: hay 50 tickets vendidos o reservados",
  "details": {
    "categoryName": "VIP",
    "requestedQuantity": 30,
    "soldTickets": 40,
    "reservedTickets": 10,
    "minimumRequired": 50
  }
}
```

### Response Error (500 Internal Server Error)

```json
{
  "error": "Internal server error",
  "message": "Error updating venue"
}
```

---

## 🔄 Comparación: Antes vs Después

### CREATE VENUE

| Aspecto                  | Antes ❌                 | Ahora ✅                     |
| ------------------------ | ------------------------ | ---------------------------- |
| **Tabla Tickets**        | ❌ No se creaba          | ✅ Se crea automáticamente   |
| **TicketsDistribution**  | ❌ No se creaba          | ✅ Se crea automáticamente   |
| **Tickets individuales** | ❌ No existían           | ✅ 100% disponibles al crear |
| **Response**             | Solo datos del venue     | Incluye `ticketRecord`       |
| **Para comprar**         | ❌ Error: no hay tickets | ✅ Inmediatamente disponible |

### UPDATE VENUE

| Aspecto                    | Antes ❌                    | Ahora ✅                             |
| -------------------------- | --------------------------- | ------------------------------------ |
| **Sincronización Tickets** | ❌ Manual o inexistente     | ✅ Automática                        |
| **TicketsDistribution**    | ❌ No se actualizaba        | ✅ Se sincroniza automáticamente     |
| **Aumentar cantidad**      | ❌ Tickets no disponibles   | ✅ Se crean automáticamente          |
| **Reducir cantidad**       | ❌ Posible pérdida de datos | ✅ Preserva vendidos/reservados      |
| **Response**               | Sin info de sincronización  | Incluye `distributionSync` completo  |
| **Validación**             | ❌ Sin validación           | ✅ Valida contra vendidos/reservados |

---

## 📊 Estados de Tickets en TicketsDistribution

| Estado      | Descripción                      | Se Modifica en Update             |
| ----------- | -------------------------------- | --------------------------------- |
| `AVAILABLE` | Disponible para compra           | ✅ Sí (se puede agregar/eliminar) |
| `RESERVED`  | Reservado temporalmente (15 min) | ❌ No (se preserva)               |
| `SOLD`      | Vendido y pagado                 | ❌ No (se preserva)               |
| `USED`      | Usado (QR escaneado)             | ❌ No (se preserva)               |

---

## 🎯 Casos de Uso

### Caso 1: Crear Evento y Vender Inmediatamente

```bash
# 1. Crear venue para evento
POST /venues
{
  "eventId": "evento-concierto-123",
  "name": "Movistar Arena",
  "floors": [{
    "categories": [{
      "name": "VIP",
      "cantidadTickets": 500,
      "ticketPrice": 300000
    }]
  }]
}

# 2. Usuario puede comprar inmediatamente
POST /orders/create
{
  "eventId": "evento-concierto-123",
  "tickets": [{
    "categoria": "VIP",
    "cantidad": 2
  }]
}
# ✅ Encuentra 500 tickets AVAILABLE
# ✅ Reserva 2 tickets
# ✅ Usuario paga y recibe boletas
```

### Caso 2: Aumentar Capacidad del Evento

```bash
# Evento con alta demanda, se decide aumentar capacidad
PUT /venues/venue-123
{
  "floors": [{
    "categories": [{
      "categoryId": "cat-vip-1",
      "cantidadTickets": 700  # Era 500
    }]
  }]
}

# Response:
# ✅ Se agregan 200 tickets AVAILABLE
# ✅ Total: 700 tickets disponibles
# ✅ Usuarios pueden comprar los nuevos tickets inmediatamente
```

### Caso 3: Reducir Aforo por Regulación

```bash
# Regulación reduce aforo permitido
PUT /venues/venue-123
{
  "floors": [{
    "categories": [{
      "categoryId": "cat-general-1",
      "cantidadTickets": 800  # Era 1000, hay 150 vendidos
    }]
  }]
}

# Response:
# ✅ Se eliminan 200 tickets AVAILABLE (de los 850 disponibles)
# ✅ Los 150 tickets SOLD se mantienen intactos
# ✅ Total final: 800 tickets (650 disponibles + 150 vendidos)
```

---

## 🔐 Seguridad y Validaciones

### CREATE

- ✅ Valida campos requeridos: name, type, capacity
- ✅ Valida categorías si hay eventId
- ✅ Valida cantidadTickets > 0
- ✅ Genera IDs únicos (UUID v4)

### UPDATE

- ✅ Verifica existencia del venue
- ✅ Valida cantidadTickets contra vendidos/reservados
- ✅ Previene eliminación de tickets no AVAILABLE
- ✅ Transacciones atómicas en DynamoDB
- ✅ Preserva integridad referencial

---

## 📈 Performance

### CREATE

- **Tiempo promedio:** 2-5 segundos
- **Operaciones DynamoDB:** 3 + (N categorías × 2)
- **Batch operations:** Sí (25 items por batch)

### UPDATE

- **Tiempo promedio:** 3-8 segundos (depende de cambios)
- **Operaciones DynamoDB:** 2 + (N categorías × 3)
- **Batch operations:** Sí (25 items por batch)
- **Optimización:** Solo actualiza distributions modificadas

---

## 🧪 Testing

### Postman Collection

```json
{
  "info": {
    "name": "Venues API - TicketsDistribution",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Create Venue with Event",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/venues",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"eventId\": \"{{eventId}}\",\n  \"name\": \"Test Venue\",\n  \"type\": \"stadium\",\n  \"capacity\": 1000,\n  \"floors\": [{\n    \"name\": \"Main Floor\",\n    \"categories\": [{\n      \"name\": \"VIP\",\n      \"cantidadTickets\": 100,\n      \"ticketPrice\": 200000\n    }]\n  }]\n}"
        }
      }
    },
    {
      "name": "Update Venue - Increase Capacity",
      "request": {
        "method": "PUT",
        "url": "{{baseUrl}}/venues/{{venueId}}",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"floors\": [{\n    \"categories\": [{\n      \"categoryId\": \"{{categoryId}}\",\n      \"cantidadTickets\": 150\n    }]\n  }]\n}"
        }
      }
    }
  ]
}
```

---

## 📞 Soporte

Para más información:

- [README.md](README.md) - Documentación general
- [TICKETS_DISTRIBUTION_IMPLEMENTATION.md](TICKETS_DISTRIBUTION_IMPLEMENTATION.md) - Detalles técnicos
- [TICKETS_SYNC_GUIDE.md](TICKETS_SYNC_GUIDE.md) - Guía de sincronización
- [TICKETS_SYNC_EXAMPLES.md](TICKETS_SYNC_EXAMPLES.md) - Ejemplos prácticos

---

**Fecha de última actualización:** Enero 10, 2026  
**Versión:** 2.0.0  
**Módulo:** aws-lambda-venues
