# Request Actualizado para Crear Venue con Asociación de Sillas

## 🎯 Endpoint
```
POST https://API_GATEWAY_URL/dev/venues
```

## 📝 Request Completo con Sillas Vinculadas

```json
{
  "name": "Teatro Metropolitan",
  "ownerUserId": "user-123",
  "eventId": "event-456",
  "hasSeating": true,
  "type": "theater",
  "capacity": 500,
  "country": "Colombia",
  "city": "Bogotá",
  "address": "Calle 100 #20-30",
  "latitude": 4.6825,
  "longitude": -74.0564,
  "description": "Teatro moderno con capacidad para 500 personas",
  "isCertified": true,
  "gates": [
    {
      "gateId": "gate-principal-001",
      "gateNumber": 1,
      "name": "Puerta Principal",
      "description": "Entrada principal del teatro"
    },
    {
      "gateId": "gate-vip-002",
      "gateNumber": 2,
      "name": "Acceso VIP",
      "description": "Entrada exclusiva para VIP"
    }
  ],
  "floors": [
    {
      "floorId": "floor-platea-001",
      "name": "Platea",
      "description": "Nivel principal del teatro"
    }
  ],
  "categories": [
    {
      "categoryId": "cat-vip-001",
      "name": "VIP",
      "categoria": "VIP",
      "floorId": "floor-platea-001",
      "color": "#FFD700",
      "description": "Zona VIP con las mejores sillas",
      "level": 1,
      "sortOrder": 1,
      "gateId": "gate-vip-002",
      "gateName": "Acceso VIP",
      "relX": 100,
      "relY": 150,
      "width": 500,
      "height": 300,
      "quantity": 50,
      "cantidadTickets": 50,
      "price": 150000,
      "valor": 150000,
      "cost": 50000,
      "costo": 50000,
      "currency": "COP",
      "moneda": "COP",
      "description": "Zona VIP con las mejores sillas y acceso exclusivo",
      "descripcion": "Zona VIP con las mejores sillas y acceso exclusivo",
      "seats": [
        {
          "seatId": "seat-vip-a1",
          "row": "A",
          "number": "1",
          "seatCode": "A1",
          "status": "available",
          "seatType": "standard",
          "isAccessible": false
        },
        {
          "seatId": "seat-vip-a2",
          "row": "A",
          "number": "2",
          "seatCode": "A2",
          "status": "available",
          "seatType": "standard",
          "isAccessible": false
        },
        {
          "seatId": "seat-vip-a3",
          "row": "A",
          "number": "3",
          "seatCode": "A3",
          "status": "available",
          "seatType": "standard",
          "isAccessible": false
        },
        {
          "row": "A",
          "number": "4",
          "status": "available"
        },
        {
          "row": "A",
          "number": "5",
          "status": "available"
        }
      ]
    },
    {
      "categoryId": "cat-palco-002",
      "name": "Palco",
      "categoria": "Palco",
      "floorId": "floor-platea-001",
      "color": "#FF6347",
      "description": "Palcos con vista privilegiada",
      "level": 2,
      "sortOrder": 2,
      "gateId": "gate-principal-001",
      "gateName": "Puerta Principal",
      "relX": 200,
      "relY": 250,
      "width": 400,
      "height": 200,
      "quantity": 30,
      "cantidadTickets": 30,
      "price": 250000,
      "valor": 250000,
      "cost": 80000,
      "costo": 80000,
      "currency": "COP",
      "moneda": "COP",
      "description": "Palcos privados con servicio exclusivo",
      "descripcion": "Palcos privados con servicio exclusivo",
      "seats": [
        {
          "row": "P",
          "number": "1",
          "status": "available"
        },
        {
          "row": "P",
          "number": "2",
          "status": "available"
        },
        {
          "row": "P",
          "number": "3",
          "status": "available"
        }
      ]
    },
    {
      "categoryId": "cat-general-003",
      "name": "General",
      "categoria": "General",
      "floorId": "floor-platea-001",
      "color": "#4169E1",
      "description": "Asientos generales",
      "level": 0,
      "sortOrder": 3,
      "gateId": "gate-principal-001",
      "gateName": "Puerta Principal",
      "relX": 300,
      "relY": 350,
      "width": 600,
      "height": 400,
      "quantity": 420,
      "cantidadTickets": 420,
      "price": 50000,
      "valor": 50000,
      "cost": 20000,
      "costo": 20000,
      "currency": "COP",
      "moneda": "COP",
      "description": "Asientos generales con buena visibilidad",
      "descripcion": "Asientos generales con buena visibilidad",
      "seats": [
        {
          "row": "G",
          "number": "1",
          "status": "available"
        },
        {
          "row": "G",
          "number": "2",
          "status": "available"
        }
      ]
    }
  ],
  "fechaIniVent": "2026-01-15T00:00:00Z",
  "fechaFinVent": "2026-03-15T20:00:00Z",
  "horaIniVent": "00:00",
  "horaFinVent": "20:00"
}
```

---

## 🔑 Cambios Principales

### 1. Campo `seats` en cada categoría
Cada silla puede tener:
- `seatId` (opcional - se genera si no se envía)
- `row` **REQUERIDO** - Fila de la silla
- `number` **REQUERIDO** - Número de la silla
- `seatCode` (opcional - se genera como `row+number`)
- `status` - Estado de la silla (default: "available")
- `seatType` - Tipo de silla (default: "standard")
- `isAccessible` - Si es accesible (default: false)

### 2. Cantidad automática
Ya NO necesitas especificar `cantidadTickets` si tienes el array `seats`, se calcula automáticamente:
```javascript
cantidadTickets: cat.cantidadTickets || cat.quantity || seatsMapping[categoryId].length || 0
```

---

## 📊 Lo que crea este request

### 1. Tabla: Venues
```javascript
{
  venue_id: "venue-xyz-123",
  name: "Teatro Metropolitan",
  hasSeating: true,
  eventId: "event-456",
  isEventVenue: true,
  // ... otros campos
}
```

### 2. Tabla: Venue_Floor
```javascript
{
  floorId: "floor-platea-001",
  venueId: "venue-xyz-123",
  name: "Platea",
  // ... otros campos
}
```

### 3. Tabla: Venue_Category
```javascript
{
  categoryId: "cat-vip-001",
  floorId: "floor-platea-001",
  venueId: "venue-xyz-123",
  name: "VIP",
  // ... otros campos
}
```

### 4. Tabla: Venue_Seat
```javascript
// Para cada silla en el array seats
{
  seatId: "seat-vip-a1",
  categoryId: "cat-vip-001",
  floorId: "floor-platea-001",
  venueId: "venue-xyz-123",
  rowLabel: "A",
  colNumber: "1",
  seatCode: "A1",
  status: "available"
}
```

### 5. Tabla: Tickets
```javascript
{
  id: "ticket-abc123",
  eventId: "event-456",
  venueId: "venue-xyz-123",
  boleta: [
    {
      categoria: "VIP",
      id: "cat-vip-001",
      cantidadTickets: 5,  // ← Calculado del array seats
      avaliableCapacity: 5,
      valor: 150000,
      distributionId: "dist-xyz-001",
      distributionCreateDate: "2026-01-12T..."
    }
  ]
}
```

### 6. Tabla: TicketsDistribution (NUEVO - con sillas vinculadas)
```javascript
{
  id: "dist-xyz-001",
  createDate: "2026-01-12T15:30:00.000Z",
  eventId: "event-456",
  venueId: "venue-xyz-123",
  categoryName: "VIP",
  tickets: [
    {
      ticketInstanceId: "ticket-inst-001",
      categoryId: "cat-vip-001",
      location: {
        seatId: "seat-vip-a1",  // ← VINCULADO
        row: "A",
        number: "1",
        seatLabel: "A1"
      },
      ticketStatus: "AVAILABLE",
      qrCodeKey: "qr-key-001",
      purchasePrice: 150000
    },
    {
      ticketInstanceId: "ticket-inst-002",
      categoryId: "cat-vip-001",
      location: {
        seatId: "seat-vip-a2",  // ← VINCULADO
        row: "A",
        number: "2",
        seatLabel: "A2"
      },
      ticketStatus: "AVAILABLE",
      qrCodeKey: "qr-key-002",
      purchasePrice: 150000
    }
  ]
}
```

---

## 🚀 Respuesta Exitosa

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-xyz-123",
    "name": "Teatro Metropolitan",
    "type": "theater",
    "capacity": 500,
    "eventId": "event-456",
    "isEventVenue": true,
    "hasSeating": true,
    "baseVenueId": null,
    "floorCount": 1,
    "categoryCount": 3,
    "seatCount": 8,
    "gates": [
      {
        "gateId": "gate-principal-001",
        "name": "Puerta Principal"
      },
      {
        "gateId": "gate-vip-002",
        "name": "Acceso VIP"
      }
    ]
  }
}
```

---

## ✅ Ventajas de este Formato

1. **Asociación directa**: Cada ticket en `TicketsDistribution` sabe a qué silla pertenece
2. **Consulta eficiente**: Puedes filtrar tickets por `location.seatLabel`
3. **Trazabilidad**: Desde el ticket puedes llegar a `Venue_Seat` usando `location.seatId`
4. **Flexibilidad**: Soporta venues con y sin sillas (omite `seats` si `hasSeating: false`)

---

## 🔍 Validaciones del Backend

El backend ahora:
1. ✅ Guarda cada silla en `Venue_Seat`
2. ✅ Crea un mapping `categoryId → [seatIds]`
3. ✅ Genera tickets en `TicketsDistribution` vinculados a sillas
4. ✅ Calcula automáticamente `cantidadTickets` basado en el array `seats`
5. ✅ Cada ticket tiene `location.seatId` referenciando a `Venue_Seat`

---

## 📝 Notas Importantes

- Si `hasSeating: false`, NO envíes el array `seats`
- Cada silla DEBE tener `row` y `number`
- El `seatCode` se genera automáticamente si no se envía
- El orden de las sillas en el array se respeta en `TicketsDistribution`
- Puedes enviar `seatId` personalizado o dejar que se genere automáticamente
