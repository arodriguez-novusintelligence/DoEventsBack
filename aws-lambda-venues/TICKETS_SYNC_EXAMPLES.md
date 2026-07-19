# Ejemplos Prácticos de Sincronización con Tickets

## 📋 Escenarios Reales de Sincronización

---

## Ejemplo 1: Crear Venue para Evento con Categorías

### Request Inicial

```http
POST /venues

{
  "name": "Estadio Nacional",
  "hasSeating": true,
  "eventId": "event-2026-01",
  "capacity": 500,
  "floors": [
    {
      "name": "Planta Principal",
      "categories": [
        {
          "name": "VIP",
          "ticketPrice": 200000,
          "currency": "COP",
          "rows": 5,
          "seatsPerRow": 10,
          "seats": [
            { "rowLabel": "A", "colNumber": 1 },
            { "rowLabel": "A", "colNumber": 2 },
            // ... 50 asientos total
          ]
        },
        {
          "name": "General",
          "ticketPrice": 50000,
          "currency": "COP",
          "rows": 20,
          "seatsPerRow": 20,
          "seats": [
            { "rowLabel": "A", "colNumber": 1 },
            // ... 400 asientos total
          ]
        }
      ]
    }
  ]
}
```

### Resultado en Venue_Category

```json
[
  {
    "categoryId": "cat-vip-001",
    "name": "VIP",
    "ticketPrice": 200000,
    "totalSeats": 50,
    "venueId": "venue123",
    "eventId": "event-2026-01"
  },
  {
    "categoryId": "cat-gen-001",
    "name": "General",
    "ticketPrice": 50000,
    "totalSeats": 400,
    "venueId": "venue123",
    "eventId": "event-2026-01"
  }
]
```

### Resultado Automático en Tickets

```json
{
  "id": "ticket123",
  "eventId": "event-2026-01",
  "venueId": "venue123",
  "hasSeating": true,
  "boletas": [
    {
      "id": "cat-vip-001",
      "categoria": "VIP",
      "cantidadTickets": 50,
      "avaliableCapacity": 50,
      "reservedTickets": 0,
      "soldTickets": 0,
      "valor": 200000,
      "moneda": "COP"
    },
    {
      "id": "cat-gen-001",
      "categoria": "General",
      "cantidadTickets": 400,
      "avaliableCapacity": 400,
      "reservedTickets": 0,
      "soldTickets": 0,
      "valor": 50000,
      "moneda": "COP"
    }
  ]
}
```

---

## Ejemplo 2: Agregar Asientos a Categoría Existente

### Situación Inicial

**En Tickets:**

```json
{
  "id": "cat-vip-001",
  "categoria": "VIP",
  "cantidadTickets": 50,
  "avaliableCapacity": 30,
  "reservedTickets": 10,
  "soldTickets": 10,
  "valor": 200000
}
```

### Request de Actualización

```http
PUT /venues/venue123

{
  "eventId": "event-2026-01",
  "floors": [
    {
      "floorId": "floor1",
      "name": "Planta Principal",
      "categories": [
        {
          "categoryId": "cat-vip-001",
          "name": "VIP",
          "ticketPrice": 200000,
          "seats": [
            // 50 asientos existentes
            { "seatId": "seat1", "rowLabel": "A", "colNumber": 1 },
            // ...
            { "seatId": "seat50", "rowLabel": "E", "colNumber": 10 },

            // + 30 asientos nuevos
            { "rowLabel": "F", "colNumber": 1 },
            { "rowLabel": "F", "colNumber": 2 },
            // ...
            { "rowLabel": "H", "colNumber": 10 }
          ]
        }
      ]
    }
  ]
}
```

### Resultado Automático

**Sincronización en Tickets:**

```json
{
  "id": "cat-vip-001",
  "categoria": "VIP",
  "cantidadTickets": 80, // ✅ Actualizado: 50 + 30
  "avaliableCapacity": 60, // ✅ Recalculado: 80 - 10 - 10
  "reservedTickets": 10, // ✅ Preservado
  "soldTickets": 10, // ✅ Preservado
  "valor": 200000
}
```

**Logs:**

```
🔄 Preservando datos para VIP: 10 vendidos, 10 reservados
🎫 Actualizando capacidad: 50 → 80 asientos
✅ Sincronización completada
```

---

## Ejemplo 3: Cambiar Precio de Categoría

### Situación Inicial

```json
{
  "id": "cat-vip-001",
  "categoria": "VIP",
  "valor": 200000,
  "soldTickets": 25
}
```

### Request

```http
PUT /venues/venue123

{
  "eventId": "event-2026-01",
  "floors": [
    {
      "floorId": "floor1",
      "categories": [
        {
          "categoryId": "cat-vip-001",
          "name": "VIP",
          "ticketPrice": 250000  // ⬆️ Precio aumentado
        }
      ]
    }
  ]
}
```

### Resultado

```json
{
  "id": "cat-vip-001",
  "categoria": "VIP",
  "valor": 250000, // ✅ Actualizado
  "soldTickets": 25 // ✅ Preservado
}
```

---

## Ejemplo 4: Eliminar una Categoría

### Situación Inicial

**Venue_Category:**

```json
[
  { "categoryId": "cat-vip-001", "name": "VIP" },
  { "categoryId": "cat-gen-001", "name": "General" },
  { "categoryId": "cat-bal-001", "name": "Balcón" }
]
```

**Tickets:**

```json
{
  "boletas": [
    { "id": "cat-vip-001", "categoria": "VIP", "soldTickets": 10 },
    { "id": "cat-gen-001", "categoria": "General", "soldTickets": 50 },
    { "id": "cat-bal-001", "categoria": "Balcón", "soldTickets": 0 }
  ]
}
```

### Request (Sin categoría Balcón)

```http
PUT /venues/venue123

{
  "eventId": "event-2026-01",
  "floors": [
    {
      "floorId": "floor1",
      "categories": [
        { "categoryId": "cat-vip-001", "name": "VIP" },
        { "categoryId": "cat-gen-001", "name": "General" }
        // ❌ Balcón no se incluye
      ]
    }
  ]
}
```

### Resultado Automático

**Venue_Category:**

```json
[
  { "categoryId": "cat-vip-001", "name": "VIP" },
  { "categoryId": "cat-gen-001", "name": "General" }
  // ✅ cat-bal-001 eliminado
]
```

**Tickets (Sincronizado):**

```json
{
  "boletas": [
    { "id": "cat-vip-001", "categoria": "VIP", "soldTickets": 10 },
    { "id": "cat-gen-001", "categoria": "General", "soldTickets": 50 }
    // ✅ cat-bal-001 eliminado automáticamente
  ]
}
```

**Logs:**

```
🗑️ Auto-eliminando 1 categorías del floor floor1
🗑️ Eliminando 30 asientos de categoría cat-bal-001
🔄 Sincronizando 2 categorías con Tickets
✅ Tickets actualizados correctamente
```

---

## Ejemplo 5: Eliminar Asientos Específicos

### Situación Inicial

```json
{
  "id": "cat-vip-001",
  "categoria": "VIP",
  "cantidadTickets": 100,
  "soldTickets": 20,
  "reservedTickets": 10,
  "avaliableCapacity": 70
}
```

### Request (Eliminar 20 asientos)

```http
PUT /venues/venue123

{
  "eventId": "event-2026-01",
  "floors": [
    {
      "floorId": "floor1",
      "categories": [
        {
          "categoryId": "cat-vip-001",
          "name": "VIP",
          "seats": [
            // Solo 80 asientos (antes eran 100)
            { "seatId": "seat1", "rowLabel": "A", "colNumber": 1 },
            // ...
            { "seatId": "seat80", "rowLabel": "H", "colNumber": 10 }
            // ❌ seat81-seat100 no se incluyen
          ]
        }
      ]
    }
  ]
}
```

### Resultado Automático

```json
{
  "id": "cat-vip-001",
  "categoria": "VIP",
  "cantidadTickets": 80, // ✅ Actualizado: 100 → 80
  "soldTickets": 20, // ✅ Preservado
  "reservedTickets": 10, // ✅ Preservado
  "avaliableCapacity": 50 // ✅ Recalculado: 80 - 20 - 10
}
```

**Logs:**

```
🗑️ Auto-eliminando 20 asientos de la categoría cat-vip-001
🔄 Preservando datos para VIP: 20 vendidos, 10 reservados
🎫 Actualizando capacidad: 100 → 80 asientos
✅ Capacidad disponible: 50
```

---

## Ejemplo 6: Mover Categoría a Otro Floor

### Request

```http
PUT /venues/venue123

{
  "eventId": "event-2026-01",
  "floors": [
    {
      "floorId": "floor1",
      "name": "Planta Baja",
      "categories": [
        { "categoryId": "cat-gen-001", "name": "General" }
      ]
    },
    {
      "floorId": "floor2",
      "name": "Planta Alta",
      "categories": [
        {
          "categoryId": "cat-vip-001",  // ⬅️ Movida desde floor1
          "name": "VIP",
          "seats": [...]
        }
      ]
    }
  ]
}
```

### Resultado

**Venue_Category:**

```json
[
  {
    "categoryId": "cat-vip-001",
    "floorId": "floor2", // ✅ Actualizado
    "name": "VIP"
  },
  {
    "categoryId": "cat-gen-001",
    "floorId": "floor1",
    "name": "General"
  }
]
```

**Tickets (No Afectado):**

```json
{
  "boletas": [
    {
      "id": "cat-vip-001",
      "categoria": "VIP",
      "soldTickets": 15 // ✅ Preservado
    }
  ]
}
```

---

## Ejemplo 7: Actualización Masiva con Múltiples Cambios

### Request Complejo

```http
PUT /venues/venue123

{
  "eventId": "event-2026-01",
  "name": "Estadio Nacional - Renovado",  // Cambio de nombre
  "hasSeating": true,
  "floors": [
    {
      "floorId": "floor1",
      "categories": [
        {
          "categoryId": "cat-vip-001",
          "name": "VIP Premium",          // Cambio de nombre
          "ticketPrice": 250000,          // Cambio de precio
          "seats": [/* 120 asientos */]   // +20 asientos
        },
        {
          "categoryId": "cat-gen-001",
          "name": "General",
          "ticketPrice": 60000,           // Cambio de precio
          "seats": [/* 400 asientos */]   // Sin cambios
        }
      ]
    }
    // ❌ floor2 eliminado (con cat-bal-001)
  ]
}
```

### Resultado Completo

**Cambios en Venues:**

- ✅ name actualizado
- ✅ floor2 eliminado
- ✅ cat-bal-001 eliminada (con sus asientos)

**Cambios en Venue_Category:**

- ✅ cat-vip-001: nombre y precio actualizados
- ✅ cat-vip-001: 20 asientos agregados
- ✅ cat-gen-001: precio actualizado
- ✅ cat-bal-001: eliminada

**Sincronización Automática en Tickets:**

```json
{
  "id": "ticket123",
  "eventId": "event-2026-01",
  "venueId": "venue123",
  "boletas": [
    {
      "id": "cat-vip-001",
      "categoria": "VIP Premium", // ✅ Actualizado
      "cantidadTickets": 120, // ✅ Actualizado (+20)
      "valor": 250000, // ✅ Actualizado
      "soldTickets": 15, // ✅ Preservado
      "reservedTickets": 5, // ✅ Preservado
      "avaliableCapacity": 100 // ✅ Recalculado
    },
    {
      "id": "cat-gen-001",
      "categoria": "General",
      "cantidadTickets": 400,
      "valor": 60000, // ✅ Actualizado
      "soldTickets": 120, // ✅ Preservado
      "avaliableCapacity": 280
    }
    // ✅ cat-bal-001 eliminada automáticamente
  ]
}
```

**Response:**

```json
{
  "message": "Venue updated successfully",
  "venueId": "venue123",
  "floorsResult": {
    "floorsProcessed": 1,
    "categoriesProcessed": 2,
    "seatsProcessed": 520,
    "floorsDeleted": 1
  },
  "deletions": {
    "floors": 0,
    "categories": 1,
    "seats": 30
  },
  "ticketSync": {
    "action": "updated",
    "categoriesCount": 2,
    "ticketId": "ticket123",
    "message": "Categorías sincronizadas automáticamente con Tickets"
  }
}
```

---

## 📊 Resumen de Sincronización

| Operación          | Venue_Category    | Tickets                 | Datos Preservados |
| ------------------ | ----------------- | ----------------------- | ----------------- |
| Agregar categoría  | ✅ Creada         | ✅ Agregada             | N/A               |
| Eliminar categoría | ✅ Eliminada      | ✅ Eliminada            | N/A               |
| Agregar asientos   | ✅ Creados        | ✅ Cantidad actualizada | ✅ Ventas         |
| Eliminar asientos  | ✅ Eliminados     | ✅ Cantidad actualizada | ✅ Ventas         |
| Cambiar precio     | ✅ Actualizado    | ✅ Actualizado          | ✅ Ventas         |
| Cambiar nombre     | ✅ Actualizado    | ✅ Actualizado          | ✅ Ventas         |
| Mover a otro floor | ✅ floorId cambia | ⚪ No afecta            | ✅ Ventas         |

---

## 🎯 Validaciones Automáticas

### ✅ Verificación de Consistencia

```javascript
// El sistema siempre verifica:
assert(avaliableCapacity >= 0);
assert(cantidadTickets >= soldTickets + reservedTickets);
assert(avaliableCapacity === cantidadTickets - soldTickets - reservedTickets);
```

### ⚠️ Advertencias

Si se detectan inconsistencias:

```
⚠️ ADVERTENCIA: Categoría VIP
   - Total asientos: 50
   - Vendidos: 30
   - Reservados: 25
   - Total comprometido: 55 > 50
   ❌ No se puede reducir capacidad por debajo de compromisos
```

---

## 📚 Referencias

- [TICKETS_SYNC_GUIDE.md](TICKETS_SYNC_GUIDE.md) - Guía completa de sincronización
- [UPDATE_VENUE_GUIDE.md](UPDATE_VENUE_GUIDE.md) - Guía de actualización de venues
