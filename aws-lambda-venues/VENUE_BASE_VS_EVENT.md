# Venues API - Gestión de Venues Base y Venues de Evento

## 🎯 Conceptos Clave

### Tipos de Venues

1. **Venue Base (Plantilla)**

   - No está atado a ningún evento (`eventId: null`)
   - Es reutilizable para múltiples eventos
   - Sirve como plantilla maestra
   - `isEventVenue: false`

2. **Venue de Evento**
   - Atado a un evento específico (`eventId: "uuid"`)
   - Puede ser clonado desde un venue base o creado desde cero
   - Características únicas por evento
   - `isEventVenue: true`

### Flag hasSeating

- **`hasSeating: true`** - El venue tiene silletería numerada

  - Guarda categorías en `Venue_Category`
  - Guarda asientos en `Venue_Seat`
  - Guarda categorías de tickets en `Tickets` (tabla)

- **`hasSeating: false`** - Entrada general sin asientos numerados
  - NO guarda en `Venue_Category` ni `Venue_Seat`
  - Solo guarda categorías de tickets en `Tickets` (tabla)

---

## 📡 Endpoints

### 1. Crear Venue Base (Plantilla)

**POST** `/venues`

#### Ejemplo 1: Venue Base CON Silletería

```json
{
  "name": "Estadio Nacional",
  "ownerUserId": "user-123",
  "type": "stadium",
  "capacity": 50000,
  "country": "Colombia",
  "city": "Bogotá",
  "address": "Calle 123",
  "hasSeating": true,
  "isTemplate": true,
  "visibility": "public",
  "floor": [
    {
      "name": "Planta Baja",
      "description": "Piso principal",
      "categories": [
        {
          "name": "Tribuna Norte",
          "color": "#FF0000",
          "level": 1,
          "ticketCategory": {
            "categoria": "Tribuna Norte",
            "cantidadTickets": 5000,
            "moneda": "COP",
            "costo": 50000,
            "valor": 80000,
            "descripcion": "Vista norte del estadio"
          },
          "seats": [
            {
              "rowLabel": "A",
              "colNumber": 1,
              "seatCode": "A1",
              "seatType": "standard"
            },
            {
              "rowLabel": "A",
              "colNumber": 2,
              "seatCode": "A2",
              "seatType": "standard"
            }
          ]
        },
        {
          "name": "Tribuna Sur VIP",
          "color": "#FFD700",
          "level": 2,
          "ticketCategory": {
            "categoria": "VIP",
            "cantidadTickets": 500,
            "moneda": "COP",
            "costo": 100000,
            "valor": 200000,
            "descripcion": "Zona VIP con servicios premium"
          },
          "seats": [
            {
              "rowLabel": "VIP",
              "colNumber": 1,
              "seatCode": "VIP1",
              "seatType": "vip"
            }
          ]
        }
      ]
    }
  ]
}
```

**Respuesta:**

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-uuid-123",
    "name": "Estadio Nacional",
    "type": "stadium",
    "capacity": 50000,
    "eventId": null,
    "isEventVenue": false,
    "hasSeating": true,
    "baseVenueId": null,
    "floorCount": 1,
    "floors": [
      {
        "floorId": "floor-uuid-1",
        "name": "Planta Baja",
        "categoryCount": 2,
        "elementCount": 0,
        "categories": [...]
      }
    ],
    "ticketRecord": null
  }
}
```

---

#### Ejemplo 2: Venue Base SIN Silletería (Entrada General)

```json
{
  "name": "Parque de Eventos",
  "ownerUserId": "user-123",
  "type": "park",
  "capacity": 10000,
  "country": "Colombia",
  "city": "Medellín",
  "address": "Carrera 50",
  "hasSeating": false,
  "isTemplate": true,
  "visibility": "public",
  "ticketCategories": [
    {
      "categoria": "Entrada General",
      "cantidadTickets": 8000,
      "moneda": "COP",
      "costo": 30000,
      "valor": 50000,
      "descripcion": "Acceso general al parque"
    },
    {
      "categoria": "VIP",
      "cantidadTickets": 2000,
      "moneda": "COP",
      "costo": 80000,
      "valor": 120000,
      "descripcion": "Zona VIP con bar incluido"
    }
  ]
}
```

**Nota:** Cuando `hasSeating: false`, no se necesitan `floors`, `categories` ni `seats`. Solo `ticketCategories`.

---

### 2. Crear Venue de Evento (Desde Cero)

**POST** `/venues`

```json
{
  "name": "Concierto Shakira 2025",
  "ownerUserId": "user-123",
  "eventId": "event-shakira-2025",
  "type": "stadium",
  "capacity": 50000,
  "country": "Colombia",
  "city": "Bogotá",
  "address": "Estadio El Campín",
  "hasSeating": true,
  "isTemplate": false,
  "visibility": "private",
  "fechaIniVent": "2025-01-01",
  "fechaFinVent": "2025-03-01",
  "horaIniVent": "08:00",
  "horaFinVent": "18:00",
  "floor": [
    {
      "name": "Planta Principal",
      "categories": [
        {
          "name": "Platea",
          "color": "#0000FF",
          "ticketCategory": {
            "categoria": "Platea",
            "cantidadTickets": 3000,
            "moneda": "COP",
            "costo": 200000,
            "valor": 350000,
            "descripcion": "Zona platea"
          },
          "seats": [
            { "rowLabel": "A", "colNumber": 1, "seatCode": "A1" },
            { "rowLabel": "A", "colNumber": 2, "seatCode": "A2" }
          ]
        }
      ]
    }
  ]
}
```

**Respuesta:**

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-event-uuid",
    "name": "Concierto Shakira 2025",
    "eventId": "event-shakira-2025",
    "isEventVenue": true,
    "hasSeating": true,
    "baseVenueId": null,
    "floorCount": 1,
    "ticketRecord": {
      "ticketId": "ticket-123",
      "categoriesCount": 1
    }
  }
}
```

---

### 3. Clonar Venue Base para Evento

**POST** `/venues/clone-for-event`

Este endpoint clona un venue base existente y lo convierte en un venue específico para un evento.

#### Request Body:

```json
{
  "baseVenueId": "venue-uuid-123",
  "eventId": "event-shakira-2025",
  "name": "Estadio Nacional - Shakira 2025",
  "hasSeating": true,
  "fechaIniVent": "2025-01-01",
  "fechaFinVent": "2025-03-01",
  "horaIniVent": "08:00",
  "horaFinVent": "20:00",
  "ticketCategories": [
    {
      "id": "cat-tribuna-norte",
      "categoria": "Tribuna Norte",
      "cantidadTickets": 5000,
      "moneda": "COP",
      "costo": 50000,
      "valor": 100000,
      "descripcion": "Vista norte - Evento especial"
    },
    {
      "id": "cat-vip",
      "categoria": "VIP Premium",
      "cantidadTickets": 500,
      "moneda": "COP",
      "costo": 150000,
      "valor": 300000,
      "descripcion": "Zona VIP con meet & greet"
    }
  ],
  "overrides": {
    "capacity": 45000,
    "status": "active"
  }
}
```

#### Respuesta:

```json
{
  "message": "Venue cloned successfully for event",
  "venue": {
    "venueId": "new-venue-uuid",
    "name": "Estadio Nacional - Shakira 2025",
    "eventId": "event-shakira-2025",
    "baseVenueId": "venue-uuid-123",
    "isEventVenue": true,
    "hasSeating": true,
    "floorsCloned": 1,
    "categoriesCloned": 2,
    "ticketRecord": {
      "ticketId": "ticket-abc",
      "categoriesCount": 2,
      "totalCapacity": 5500
    }
  }
}
```

---

### 4. Actualizar Venue

**PUT** `/venues/{venueId}`

```json
{
  "name": "Estadio Nacional Renovado",
  "capacity": 55000,
  "status": "active",
  "hasSeating": true
}
```

---

## 🔄 Flujos de Trabajo

### Flujo 1: Crear Venue Base y Reutilizar

```javascript
// 1. Crear venue base (plantilla)
const baseVenue = await fetch('/venues', {
  method: 'POST',
  body: JSON.stringify({
    name: "Coliseo Principal",
    ownerUserId: "user-123",
    hasSeating: true,
    isTemplate: true,
    floor: [...] // Configuración completa
  })
});

// 2. Clonar para evento 1
const event1Venue = await fetch('/venues/clone-for-event', {
  method: 'POST',
  body: JSON.stringify({
    baseVenueId: baseVenue.venueId,
    eventId: "event-001",
    name: "Coliseo - Concierto Rock",
    ticketCategories: [
      { categoria: "General", costo: 50000, valor: 80000, cantidadTickets: 5000 }
    ]
  })
});

// 3. Clonar para evento 2
const event2Venue = await fetch('/venues/clone-for-event', {
  method: 'POST',
  body: JSON.stringify({
    baseVenueId: baseVenue.venueId,
    eventId: "event-002",
    name: "Coliseo - Festival Pop",
    ticketCategories: [
      { categoria: "VIP", costo: 100000, valor: 150000, cantidadTickets: 1000 },
      { categoria: "General", costo: 40000, valor: 70000, cantidadTickets: 4000 }
    ]
  })
});
```

### Flujo 2: Evento con Entrada General (Sin Silletería)

```javascript
const venueGeneral = await fetch("/venues", {
  method: "POST",
  body: JSON.stringify({
    name: "Festival al Aire Libre",
    ownerUserId: "user-123",
    eventId: "event-festival-2025",
    hasSeating: false, // ⚠️ Sin silletería
    capacity: 10000,
    fechaIniVent: "2025-06-01",
    fechaFinVent: "2025-07-01",
    ticketCategories: [
      {
        categoria: "Entrada General",
        cantidadTickets: 8000,
        costo: 30000,
        valor: 50000,
      },
      {
        categoria: "VIP",
        cantidadTickets: 2000,
        costo: 80000,
        valor: 120000,
      },
    ],
  }),
});
```

---

## 📊 Tablas DynamoDB Afectadas

### Cuando `hasSeating: true`

- ✅ `Venues` - Información del venue
- ✅ `Venue_Floor` - Pisos del venue
- ✅ `Venue_Category` - Categorías con ubicación espacial
- ✅ `Venue_Seat` - Asientos numerados
- ✅ `Tickets` - Categorías de boletas (si `isEventVenue: true`)

### Cuando `hasSeating: false`

- ✅ `Venues` - Información del venue
- ❌ `Venue_Floor` - No se usa
- ❌ `Venue_Category` - No se usa
- ❌ `Venue_Seat` - No se usa
- ✅ `Tickets` - Categorías de boletas (si `isEventVenue: true`)

---

## ⚠️ Consideraciones Importantes

1. **Venue Base vs Evento:**

   - Venue base: `eventId: null`, `isEventVenue: false`
   - Venue de evento: `eventId: "uuid"`, `isEventVenue: true`

2. **Campo `hasSeating`:**

   - Determina si se guarda estructura de asientos
   - Independiente de si es venue base o de evento

3. **Categorías de Tickets:**

   - Siempre se guardan en tabla `Tickets` si `isEventVenue: true`
   - Se pueden definir en `ticketCategory` dentro de cada categoría
   - O en array `ticketCategories` en el root del body

4. **Clonación:**

   - El clonado copia: floors, elements, categories, seats
   - El `usageCount` del venue base se incrementa
   - Se pueden sobrescribir campos con `overrides`
   - Se pueden agregar/modificar `ticketCategories`

5. **Imágenes:**
   - Se pueden enviar en base64 en el campo `images`
   - Se suben a S3 automáticamente
   - Se almacenan URLs en el venue

---

## 🧪 Ejemplos Completos

Ver archivo `VENUE_EXAMPLES.md` para ejemplos completos de:

- Venue de estadio con múltiples pisos
- Venue de teatro con palcos
- Venue de festival sin asientos
- Clonación con modificaciones
- Actualización de precios por evento
