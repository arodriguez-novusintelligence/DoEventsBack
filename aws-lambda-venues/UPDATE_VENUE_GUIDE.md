# Update Venue Handler - Guía de Uso

## Características Principales

El nuevo `updateVenueHandler` incluye:

1. ✅ **Comparación inteligente** - Solo actualiza campos que han cambiado
2. ✅ **Eliminaciones en batch** - Elimina múltiples elementos a la vez
3. ✅ **Operaciones masivas** - Procesa floors, categorías y asientos en batch
4. ✅ **Sincronización automática** - Actualiza tabla Tickets automáticamente
5. ✅ **Soporte de venues clonados** - Funciona con venues base Y venues de eventos
6. ✅ **Auto-sincronización de arrays** - Elimina automáticamente elementos que ya no están en los arrays

---

## ⚠️ IMPORTANTE: Comportamiento de Arrays

### Sincronización Automática

Cuando envías un array (floors, categories, seats, elements), el sistema **SINCRONIZA** automáticamente:

```javascript
// ANTES: Venue tiene 3 floors
// Floors existentes: [floor-1, floor-2, floor-3]

// ENVÍAS: Solo 2 floors
PUT /venues/venue-123
{
  "floors": [
    { "floorId": "floor-1", "name": "Planta Baja" },
    { "floorId": "floor-2", "name": "Segundo Piso" }
  ]
}

// RESULTADO: floor-3 se ELIMINA automáticamente
// ✅ floor-1: actualizado
// ✅ floor-2: actualizado
// 🗑️ floor-3: ELIMINADO (ya no está en el array)
```

### Reglas de Sincronización

| Acción              | Array Enviado            | Comportamiento                         |
| ------------------- | ------------------------ | -------------------------------------- |
| **No enviar array** | Campo ausente            | ✅ Mantiene elementos existentes       |
| **Array vacío**     | `[]`                     | 🗑️ ELIMINA todos los elementos         |
| **Array con IDs**   | `[{id: "1"}, {id: "2"}]` | ✅ Actualiza estos + 🗑️ Elimina demás  |
| **Array sin IDs**   | `[{name: "New"}]`        | ✅ Crea nuevos + 🗑️ Elimina existentes |

### Ejemplos Prácticos

#### ✅ Mantener elementos existentes

```json
PUT /venues/venue-123
{
  "name": "Nuevo nombre"
  // NO enviar "floors" = mantiene floors existentes
}
```

#### 🗑️ Eliminar todos los floors

```json
{
  "floors": [] // Array vacío = elimina todos
}
```

#### ✏️ Reducir de 5 a 2 floors

```json
{
  "floors": [
    { "floorId": "floor-1", "name": "Keep 1" },
    { "floorId": "floor-2", "name": "Keep 2" }
    // floors 3,4,5 eliminados automáticamente
  ]
}
```

### ⚠️ Cascada de Eliminaciones

```
🗑️ Floor eliminado
  └─ 🗑️ Todas sus Categories
      └─ 🗑️ Todos sus Seats
  └─ 🗑️ Todos sus Elements
```

---

## Estructura del Request

### Endpoint

```
PUT /venues/{venueId}
```

**Funciona con**:

- ✅ Venues base (`isEventVenue: false`)
- ✅ Venues clonados (`isEventVenue: true`)

El `venueId` puede ser:

- ID de venue base (ej: `venue-base-123`)
- ID de venue clonado (ej: `cloned-venue-456`)

---

## Diferencia: Venue Base vs Venue Clonado

### Venue Base

```json
{
  "venue_id": "venue-base-123",
  "name": "Estadio Olímpico",
  "isEventVenue": false,
  "eventId": null,
  "baseVenueId": null,
  "isTemplate": true
}
```

- **Propósito**: Template reutilizable
- **Uso**: Se clona para cada evento
- **Tickets**: NO tiene tabla Tickets asociada
- **Actualización**: Afecta el template para futuros eventos

### Venue Clonado

```json
{
  "venue_id": "cloned-venue-456",
  "name": "Estadio Olímpico - Concierto Rock 2025",
  "isEventVenue": true,
  "eventId": "event-789",
  "baseVenueId": "venue-base-123",
  "isTemplate": false
}
```

- **Propósito**: Venue específico para UN evento
- **Uso**: Se usa para ese evento únicamente
- **Tickets**: Tiene registro en tabla Tickets con `eventId`
- **Actualización**: Solo afecta a este evento específico

---

### Body Structure

```json
{
  // CAMPOS BÁSICOS DEL VENUE (se comparan con existentes)
  "name": "Nombre del Venue",
  "capacity": 5000,
  "city": "Bogotá",
  "address": "Calle 123",
  "hasSeating": true,
  "eventId": "event-123",

  // FLOORS (pisos)
  "floors": [
    {
      "floorId": "floor-existing-id", // Si existe, actualiza; si no, crea
      "name": "Planta Baja",
      "description": "Primer piso",
      "image": "https://...",

      // ELEMENTOS DECORATIVOS
      "elements": [
        {
          "elementId": "elem-123", // Opcional
          "name": "Escenario",
          "type": "stage",
          "relX": 100,
          "relY": 200
        }
      ],

      // CATEGORÍAS DEL FLOOR
      "categories": [
        {
          "categoryId": "cat-123", // Opcional
          "name": "VIP",
          "color": "#FFD700",
          "totalSeats": 100,

          // ASIENTOS DE LA CATEGORÍA
          "seats": [
            {
              "seatId": "seat-123", // Opcional
              "rowLabel": "A",
              "colNumber": 1,
              "seatCode": "A1",
              "status": "AVAILABLE"
            }
          ]
        }
      ]
    }
  ],

  // CATEGORÍAS INDEPENDIENTES (sin floor específico)
  "categories": [
    {
      "categoryId": "cat-456", // Opcional
      "name": "General",
      "cantidadTickets": 500,
      "valor": 50000,
      "moneda": "COP",
      "floorId": "floor-123" // Si hasSeating=true, vincular con floor
    }
  ],

  // ELIMINACIONES EN BATCH
  "deletions": {
    "floors": ["floor-id-1", "floor-id-2"], // Elimina floor y todo su contenido
    "categories": ["cat-id-1", "cat-id-2"],
    "seats": ["seat-id-1", "seat-id-2", "seat-id-3"],
    "elements": ["elem-id-1"]
  }
}
```

## Ejemplos de Uso

### 1. Actualizar Solo Campos Básicos

```json
PUT /venues/venue-123
{
  "name": "Nuevo Nombre",
  "capacity": 6000,
  "city": "Medellín"
}
```

**Resultado**: Solo actualiza los campos que cambiaron.

---

### 2. Agregar Nuevo Floor con Categorías

```json
PUT /venues/venue-123
{
  "hasSeating": true,
  "floors": [
    {
      "name": "Planta Alta",
      "categories": [
        {
          "name": "Palco A",
          "color": "#FF0000",
          "totalSeats": 50,
          "seats": [
            { "rowLabel": "PA", "colNumber": 1, "seatCode": "PA1" },
            { "rowLabel": "PA", "colNumber": 2, "seatCode": "PA2" }
          ]
        }
      ]
    }
  ]
}
```

**Resultado**: Crea nuevo floor con categoría y 2 asientos.

---

### 3. Actualizar Floor Existente

```json
PUT /venues/venue-123
{
  "floors": [
    {
      "floorId": "existing-floor-123",
      "name": "Planta Baja (Actualizada)",
      "categories": [
        {
          "categoryId": "existing-cat-456",
          "name": "VIP Premium",
          "color": "#FFD700"
        }
      ]
    }
  ]
}
```

**Resultado**: Actualiza floor y categoría existentes.

---

### 4. Eliminar Múltiples Elementos

```json
PUT /venues/venue-123
{
  "deletions": {
    "floors": ["floor-obsolete-1"],
    "categories": ["cat-old-1", "cat-old-2"],
    "seats": ["seat-disabled-1", "seat-disabled-2", "seat-disabled-3"]
  }
}
```

**Resultado**:

- Elimina 1 floor completo (con sus categorías y asientos)
- Elimina 2 categorías específicas
- Elimina 3 asientos específicos

---

### 5. Operación Completa: Actualizar + Agregar + Eliminar

```json
PUT /venues/venue-123
{
  "name": "Estadio Actualizado",
  "capacity": 8000,
  "hasSeating": true,
  "eventId": "event-456",

  "floors": [
    {
      "floorId": "floor-existing",
      "name": "Tribuna Principal",
      "categories": [
        {
          "name": "Nueva Categoría VIP",
          "totalSeats": 100
        }
      ]
    }
  ],

  "categories": [
    {
      "name": "General",
      "cantidadTickets": 1000,
      "valor": 30000,
      "floorId": "floor-existing"
    }
  ],

  "deletions": {
    "floors": ["floor-old-1"],
    "seats": ["seat-broken-1", "seat-broken-2"]
  }
}
```

**Resultado**:

- Actualiza nombre y capacidad del venue
- Actualiza floor existente y agrega nueva categoría
- Agrega categoría "General" vinculada al floor
- Elimina 1 floor viejo completo
- Elimina 2 asientos específicos
- Actualiza tabla Tickets con todas las categorías

---

## Respuesta del Endpoint

```json
{
  "message": "Venue updated successfully",
  "venueId": "venue-123",
  "hasSeating": true,
  "eventId": "event-456",
  "floorsResult": {
    "floorsProcessed": 1,
    "categoriesProcessed": 2,
    "seatsProcessed": 100,
    "floors": [
      {
        "floorId": "floor-existing",
        "name": "Tribuna Principal",
        "action": "updated",
        "categoriesProcessed": 2,
        "seatsProcessed": 100
      }
    ]
  },
  "ticketUpdate": {
    "ticketId": "abc123",
    "action": "updated",
    "categoriesCount": 2,
    "categoriesProcessed": 1,
    "seatsProcessed": 0
  },
  "deletions": {
    "floors": 1,
    "categories": 0,
    "seats": 2,
    "elements": 0
  }
}
```

---

## Ventajas del Nuevo Sistema

### 1. Comparación Inteligente

- ✅ Solo actualiza lo que cambió
- ✅ Reduce escrituras innecesarias en DynamoDB
- ✅ Logs detallados de qué se modificó

### 2. Eliminaciones en Batch

```json
{
  "deletions": {
    "seats": ["id1", "id2", "id3", "id4", "id5"] // Elimina 5 asientos en una sola operación
  }
}
```

### 3. Operaciones Masivas

- Procesa hasta 25 elementos por batch (límite de DynamoDB)
- Divide automáticamente arrays grandes
- Maneja miles de asientos eficientemente

### 4. Sincronización Automática

- Actualiza tabla `Tickets` automáticamente
- Mantiene consistencia entre `Venue_Category` y `Tickets`
- Actualiza `hasSeating` y `venueId` en tickets

---

## Notas Importantes

### IDs Automáticos

Si no provees un ID, se genera automáticamente:

- `floorId` → UUID
- `categoryId` → UUID
- `seatId` → UUID
- `elementId` → UUID

### Eliminación de Floors

Al eliminar un floor, se eliminan **automáticamente**:

- Todas las categorías del floor
- Todos los asientos de esas categorías
- Todos los elementos del floor

### hasSeating

- Si `hasSeating=true`: Guarda en `Venue_Category` y procesa seats
- Si `hasSeating=false`: Solo actualiza `Tickets`, no crea en `Venue_Category`

### Tabla Tickets

Siempre se actualiza si:

- Existe `eventId`
- Existe array `categories` con al menos 1 elemento

---

---

## Venues Clonados (Event Venues)

El handler funciona **exactamente igual** para venues clonados. Los venues clonados tienen:

- `isEventVenue: true`
- `eventId: "event-123"` (vinculado a un evento específico)
- `baseVenueId: "base-venue-id"` (referencia al venue original)

### Actualizar Venue Clonado

```json
PUT /venues/cloned-venue-456
{
  "name": "Estadio Olímpico - Concierto Rock",
  "capacity": 7000,
  "hasSeating": true,

  "floors": [{
    "floorId": "existing-floor",
    "categories": [{
      "categoryId": "existing-cat",
      "name": "VIP Platinum",
      "ticketPrice": 150000
    }]
  }],

  "categories": [
    {
      "name": "General",
      "cantidadTickets": 2000,
      "valor": 50000
    }
  ]
}
```

**Importante**:

### Cambiar precio de categoría

```json
{
  "categories": [
    {
      "categoryId": "existing-cat",
      "valor": 80000 // Nuevo precio
    }
  ]
}
```

**Resultado**: Actualiza precio en `Tickets` y (si hasSeating=true) en `Venue_Category`.

### Actualizar venue clonado para evento específico

```json
PUT /venues/cloned-venue-789
{
  "name": "Movistar Arena - Festival 2025",
  "capacity": 15000,

  "categories": [
    {
      "categoryId": "cat-general",
      "cantidadTickets": 10000,
      "valor": 80000
    },
    {
      "categoryId": "cat-vip",
      "cantidadTickets": 2000,
      "valor": 250000
    }
  ]
}
```

**Resultado**:

- Actualiza nombre y capacidad del venue clonado
- Actualiza precios y cantidades en las categorías existentes
- Sincroniza con `Tickets` usando el `eventId` del venue clonado
- El venue base NO se modifica
  "deletions": {
  "categories": ["cat-old-1"],
  "seats": ["seat-1", "seat-2"]
  }
  }

```

**Resultado**: Solo afecta al venue clonado, el venue base queda intacto.

---

## Flujo de Trabajo: Base → Clonado → Update

```

1. CREAR VENUE BASE
   POST /venues
   {
   "name": "Estadio Nacional",
   "capacity": 50000,
   "isTemplate": true
   }
   → venue_id: "base-123"
   → isEventVenue: false
   → eventId: null

2. CLONAR PARA EVENTO
   POST /venues/clone-for-event
   {
   "baseVenueId": "base-123",
   "eventId": "event-456"
   }
   → venue_id: "cloned-789"
   → isEventVenue: true
   → eventId: "event-456"
   → baseVenueId: "base-123"
   → Copia floors, categories, seats del base

3. ACTUALIZAR VENUE CLONADO
   PUT /venues/cloned-789
   {
   "capacity": 45000,
   "categories": [...]
   }
   → Actualiza SOLO el venue clonado
   → Actualiza Tickets para eventId "event-456"
   → El venue base "base-123" NO cambia

4. (OPCIONAL) ACTUALIZAR VENUE BASE
   PUT /venues/base-123
   {
   "capacity": 55000
   }
   → Actualiza el template base
   → Futuros clones usarán la nueva capacidad
   → Venues clonados existentes NO se afectan

````

---

## Casos de Uso Comunes

### Agregar 500 asientos nuevos
```json
{
  "floors": [{
    "floorId": "existing-floor",
    "categories": [{
      "categoryId": "existing-category",
      "seats": [
        /* Array de 500 objetos seat */
      ]
    }]
  }]
}
````

**Procesamiento**: Batch de 25 asientos a la vez (20 operaciones).

### Eliminar categoría completa

```json
{
  "deletions": {
    "categories": ["category-to-delete"]
  }
}
```

**Resultado**: Elimina categoría pero NO elimina sus asientos automáticamente.

### Eliminar floor completo

```json
{
  "deletions": {
    "floors": ["floor-to-delete"]
  }
}
```

**Resultado**: Elimina floor, categorías, asientos y elementos relacionados.

### Cambiar precio de categoría

```json
{
  "categories": [
    {
      "categoryId": "existing-cat",
      "valor": 80000 // Nuevo precio
    }
  ]
}
```

**Resultado**: Actualiza precio en `Tickets` y (si hasSeating=true) en `Venue_Category`.

---

## Ejemplo Completo: Gestión de Venue Clonado

### Paso 1: Clonar Venue Base

```bash
POST /venues/clone-for-event
{
  "baseVenueId": "estadio-nacional-base",
  "eventId": "concierto-rock-2025",
  "name": "Estadio Nacional - Rock Festival 2025"
}

# Respuesta
{
  "venueId": "venue-cloned-abc123",
  "eventId": "concierto-rock-2025",
  "isEventVenue": true,
  "baseVenueId": "estadio-nacional-base",
  "floorsCloned": 2,
  "categoriesCloned": 8,
  "seatsCloned": 5000
}
```

### Paso 2: Ajustar Capacidad y Precios

```bash
PUT /venues/venue-cloned-abc123
{
  "capacity": 45000,

  "categories": [
    {
      "categoryId": "cat-vip-001",
      "valor": 350000,
      "cantidadTickets": 500
    },
    {
      "categoryId": "cat-general-001",
      "valor": 120000,
      "cantidadTickets": 10000
    }
  ]
}
```

### Paso 3: Agregar Nueva Sección VIP Especial

```bash
PUT /venues/venue-cloned-abc123
{
  "floors": [{
    "floorId": "floor-tribuna-norte",
    "categories": [{
      "name": "VIP Golden Circle",
      "color": "#FFD700",
      "totalSeats": 200,
      "ticketPrice": 500000
    }]
  }]
}
```

### Paso 4: Deshabilitar Secciones por Producción

```bash
PUT /venues/venue-cloned-abc123
{
  "deletions": {
    "categories": ["cat-palco-sur"],
    "seats": ["seat-a1", "seat-a2"]
  }
}
```

**Resultado Final**:

- ✅ Venue clonado ajustado específicamente para el evento
- ✅ Precios y cantidades personalizados
- ✅ Nueva sección VIP agregada
- ✅ Secciones de producción removidas
- ✅ Tabla Tickets sincronizada automáticamente
- ✅ Venue base permanece sin cambios

---

## Logs de Debugging

El handler genera logs detallados:

```
📝 Actualizando campos básicos del venue...
✏️ Campo modificado: name
✏️ Campo modificado: capacity
✅ Actualizando 2 campos del venue

🏢 Procesando 1 floors...
➕ Creando nuevo floor: Planta Alta
📦 Procesando 2 categorías para floor floor-123
➕ Creando categoría: VIP
💺 Procesando 50 asientos para categoría cat-123
✅ 50 asientos procesados

🗑️ Procesando eliminaciones en batch...
🗑️ Eliminando 1 floors...
🗑️ Eliminando floor floor-old y sus elementos relacionados...
✅ Floor floor-old eliminado completamente

🎫 Actualizando tabla Tickets con 3 categorías
📝 Actualizando registro existente de tickets: ticket-123
✅ Tickets actualizados correctamente
```

---

## Troubleshooting

### Array sync issues - Ver ARRAY_SYNC_GUIDE.md

**Problema**: Elementos se eliminan cuando no quiero, o no se eliminan cuando sí quiero.  
**Solución**: Revisa `ARRAY_SYNC_GUIDE.md` para entender el comportamiento de sincronización automática.

### Error: "categoryIdIndex not found"

**Causa**: Falta crear GSI en tabla `Venue_Category` o `Venue_Seat`.  
**Solución**: Verificar que existan los índices:

- `Venue_Category`: `floorIdIndex` (floorId)
- `Venue_Seat`: `categoryIdIndex` (categoryId)
- `Venue_Element`: `floorIdIndex` (floorId)

### Error: "Venue not found"

**Causa**: `venueId` no existe.  
**Solución**: Crear venue primero con `POST /venues`.

### Asientos no se crean

**Causa**: `hasSeating=false`.  
**Solución**: Enviar `"hasSeating": true` en el body.

### Categorías no se vinculan con floor

**Causa**: Falta `floorId` en categoría.  
**Solución**: Agregar `"floorId": "floor-123"` en cada categoría.

### Tickets no se actualizan para venue clonado

**Causa**: El venue clonado no tiene `eventId`.  
**Solución**: Verificar que el venue tenga:

```json
{
  "isEventVenue": true,
  "eventId": "event-123"
}
```

### Actualización afecta venue base en vez de clonado

**Causa**: Usando `baseVenueId` en vez de `venue_id` del clonado.  
**Solución**: Usar el `venue_id` del venue clonado en el path:

```
PUT /venues/cloned-venue-456  ← ID del clonado
```

### Venue clonado no tiene floors/categories

**Causa**: El clone no copió los datos del base.  
**Solución**: Usar `POST /venues/clone-for-event` en vez de crear manualmente.

### Cambios en venue base no se reflejan en clonados existentes

**Causa**: Los clones son independientes del base.  
**Solución**: Esto es comportamiento esperado. Opciones:

1. Actualizar cada venue clonado individualmente
2. Crear nuevo clone del base actualizado
3. Actualizar el base ANTES de clonar
