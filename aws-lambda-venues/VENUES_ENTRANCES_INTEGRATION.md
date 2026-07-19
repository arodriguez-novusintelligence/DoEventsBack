# Integración de Entrances en Venues CRUD

## Resumen

Los venues ahora soportan la gestión de **entrances (accesos/puertas)** como un array integrado en las operaciones CRUD principales. Las entrances se almacenan en tablas separadas (`Venue_Entrance` y `Venue_Entrance_Category`) pero se pueden crear, actualizar y consultar directamente desde los endpoints de venues.

---

## Estructura de Datos

### Entrance (Acceso Principal)

```json
{
  "entranceId": "uuid",
  "venueId": "uuid",
  "name": "Accesos Estadio Nacional",
  "description": "Puertas de acceso para el estadio",
  "type": "general",  // general, vip, accessible, emergency
  "isActive": true,
  "capacity": 50000,
  "availableCapacity": 50000,
  "requiresReservation": false,
  "allowsGroupBooking": true,
  "minGroupSize": 1,
  "maxGroupSize": 10,
  "validFrom": "2025-01-01T00:00:00Z",
  "validUntil": "2025-12-31T23:59:59Z",
  "metadata": {},
  "categories": [...]  // Array de categorías de entrada
}
```

### Entrance Category (Puerta Específica)

```json
{
  "entranceCategoryId": "uuid",
  "entranceId": "uuid",
  "venueId": "uuid",
  "name": "Puerta VIP Norte",
  "description": "Acceso preferencial VIP",
  "type": "vip", // vip, standard, student, senior, child, accessible
  "capacity": 1000,
  "availableCapacity": 1000,
  "minAge": 18,
  "maxAge": null,
  "requiresDocumentation": true,
  "allowedDays": [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ],
  "allowedTimeRanges": [{ "start": "09:00", "end": "17:00" }],
  "priority": 1,
  "sortOrder": 0,
  "isActive": true,
  "metadata": {}
}
```

---

## Endpoints Modificados

### 1. Crear Venue con Entrances

**Endpoint:** `POST /venues`

**Request Body:**

```json
{
  "name": "Estadio Nacional",
  "ownerUserId": "user_123",
  "capacity": 50000,
  "entrances": [
    {
      "name": "Accesos Principales",
      "description": "Entradas generales del estadio",
      "type": "general",
      "capacity": 40000,
      "requiresReservation": false,
      "allowsGroupBooking": true,
      "categories": [
        {
          "name": "Puerta Norte",
          "type": "standard",
          "capacity": 15000,
          "allowedDays": ["saturday", "sunday"]
        },
        {
          "name": "Puerta Sur",
          "type": "standard",
          "capacity": 15000
        },
        {
          "name": "Acceso VIP",
          "type": "vip",
          "capacity": 2000,
          "requiresDocumentation": true,
          "priority": 1
        }
      ]
    },
    {
      "name": "Acceso Accesibilidad",
      "type": "accessible",
      "capacity": 500,
      "categories": [
        {
          "name": "Puerta Accesible Este",
          "type": "accessible",
          "capacity": 500,
          "requiresDocumentation": true
        }
      ]
    }
  ],
  "floor": [...],
  "hasSeating": true
}
```

**Response:**

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue_123",
    "name": "Estadio Nacional",
    "capacity": 50000,
    "entranceCount": 2,
    "entrances": [
      {
        "entranceId": "entrance_abc",
        "name": "Accesos Principales",
        "type": "general",
        "capacity": 40000,
        "categoryCount": 3,
        "categories": [
          {
            "entranceCategoryId": "cat_xyz",
            "name": "Puerta Norte",
            "type": "standard",
            "capacity": 15000
          }
        ]
      }
    ]
  }
}
```

---

### 2. Actualizar Venue con Entrances

**Endpoint:** `PUT /venues/{venueId}`

**Comportamiento:**

- Si `entranceId` está presente → **Actualiza** el entrance existente
- Si NO tiene `entranceId` → **Crea** un nuevo entrance
- Lo mismo aplica para `entranceCategoryId` en las categorías

**Request Body:**

```json
{
  "name": "Estadio Nacional Renovado",
  "entrances": [
    {
      "entranceId": "entrance_abc", // Actualizar existente
      "name": "Accesos Principales Renovados",
      "capacity": 45000,
      "categories": [
        {
          "entranceCategoryId": "cat_xyz", // Actualizar existente
          "name": "Puerta Norte VIP",
          "type": "vip",
          "capacity": 5000
        },
        {
          // Sin entranceCategoryId → Crear nueva categoría
          "name": "Puerta Oeste Nueva",
          "type": "standard",
          "capacity": 10000
        }
      ]
    },
    {
      // Sin entranceId → Crear nuevo entrance
      "name": "Acceso de Emergencia",
      "type": "emergency",
      "capacity": 1000,
      "categories": [
        {
          "name": "Salida de Emergencia 1",
          "type": "standard",
          "capacity": 500
        }
      ]
    }
  ]
}
```

**Response:**

```json
{
  "message": "Venue updated successfully",
  "venueId": "venue_123",
  "entrancesProcessed": 2,
  "entrances": [
    {
      "entranceId": "entrance_abc",
      "name": "Accesos Principales Renovados",
      "categoryCount": 2,
      "categories": [...]
    },
    {
      "entranceId": "entrance_new",
      "name": "Acceso de Emergencia",
      "categoryCount": 1,
      "categories": [...]
    }
  ]
}
```

---

### 3. Obtener Venue con Entrances

**Endpoint:** `GET /venues/{venueId}`

**Response:**

```json
{
  "venue": {
    "venue_id": "venue_123",
    "name": "Estadio Nacional",
    "capacity": 50000,
    "floors": [...],
    "entrances": [
      {
        "entranceId": "entrance_abc",
        "venueId": "venue_123",
        "name": "Accesos Principales",
        "type": "general",
        "capacity": 40000,
        "availableCapacity": 38500,
        "isActive": true,
        "categories": [
          {
            "entranceCategoryId": "cat_xyz",
            "name": "Puerta Norte",
            "type": "standard",
            "capacity": 15000,
            "availableCapacity": 14200,
            "allowedDays": ["saturday", "sunday"],
            "isActive": true
          }
        ]
      }
    ]
  }
}
```

---

### 4. Clonar Venue (Clone for Event)

**Endpoint:** `POST /venues/clone-for-event`

Al clonar un venue base para un evento, **automáticamente se clonan todas las entrances y sus categorías** asociadas.

**Request Body:**

```json
{
  "baseVenueId": "venue_base_123",
  "eventId": "event_456",
  "name": "Estadio Nacional - Concierto 2025"
}
```

**Response:**

```json
{
  "message": "Venue cloned successfully for event",
  "venue": {
    "venueId": "venue_event_789",
    "eventId": "event_456",
    "baseVenueId": "venue_base_123",
    "floorsCloned": 3,
    "categoriesCloned": 12,
    "entrancesCloned": 2,
    "entranceCategoriesCloned": 5
  }
}
```

---

## Tablas DynamoDB

### Venue_Entrance

- **Primary Key:** `entranceId`
- **GSI:** `venueIdIndex` (venueId)

### Venue_Entrance_Category

- **Primary Key:** `entranceCategoryId`
- **GSI:** `venueIdIndex` (venueId)
- **GSI:** `entranceIdIndex` (entranceId)

---

## Casos de Uso

### Crear venue con control de accesos por tipo

```json
{
  "name": "Auditorio",
  "entrances": [
    {
      "name": "Entrada General",
      "type": "general",
      "categories": [
        { "name": "Puerta A", "type": "standard", "capacity": 1000 },
        { "name": "Puerta B", "type": "standard", "capacity": 1000 }
      ]
    },
    {
      "name": "Entrada VIP",
      "type": "vip",
      "requiresReservation": true,
      "categories": [
        {
          "name": "Lounge VIP",
          "type": "vip",
          "capacity": 200,
          "requiresDocumentation": true
        }
      ]
    }
  ]
}
```

### Actualizar capacidades de puertas existentes

```json
{
  "entrances": [
    {
      "entranceId": "entrance_123",
      "capacity": 5000,
      "categories": [
        {
          "entranceCategoryId": "cat_abc",
          "capacity": 2500
        }
      ]
    }
  ]
}
```

### Agregar nueva puerta de emergencia

```json
{
  "entrances": [
    {
      "name": "Salida de Emergencia",
      "type": "emergency",
      "capacity": 500,
      "isActive": true,
      "categories": [
        {
          "name": "Salida Este",
          "type": "standard",
          "capacity": 500
        }
      ]
    }
  ]
}
```

---

## Notas Importantes

1. **Creación Automática:** Al crear un venue con entrances, se crean automáticamente todos los registros en `Venue_Entrance` y `Venue_Entrance_Category`.

2. **Actualización Inteligente:**

   - Con `entranceId` → Actualiza
   - Sin `entranceId` → Crea nuevo

3. **Clonación Completa:** El handler `cloneVenueForEventHandler` clona automáticamente todas las entrances del venue base.

4. **Consulta Integrada:** El handler `getVenueHandler` devuelve el venue con todos sus entrances y categorías anidadas.

5. **Separación de Tablas:** Aunque las entrances se manejan como arrays en los requests/responses, se almacenan en tablas separadas para mejor escalabilidad y consultas.

6. **No hay eliminación automática:** Los handlers de actualización NO eliminan entrances existentes, solo crean o actualizan. Para eliminar, usar los endpoints dedicados de entrances (`DELETE /venues/{venueId}/entrances/{entranceId}`).

---

## Diferencia con Endpoints Dedicados

### Endpoints de Venues (Integrados)

- **Propósito:** Gestionar entrances junto con la creación/actualización del venue
- **Ventaja:** Operación atómica, todo en un request
- **Limitación:** No elimina entrances existentes

### Endpoints Dedicados de Entrances

- **Propósito:** CRUD completo y detallado de entrances
- **Ventaja:** Mayor control, incluye DELETE
- **Endpoints:**
  - `POST /venues/{venueId}/entrances` - Crear entrance
  - `GET /venues/{venueId}/entrances` - Listar entrances
  - `GET /venues/{venueId}/entrances/{entranceId}` - Obtener entrance
  - `PUT /venues/{venueId}/entrances/{entranceId}` - Actualizar entrance
  - `DELETE /venues/{venueId}/entrances/{entranceId}` - Eliminar entrance

**Recomendación:** Usar endpoints de venues para creación inicial, y endpoints dedicados para gestión detallada posterior.
