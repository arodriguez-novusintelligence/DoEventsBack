# Guía de Sincronización Automática con Tickets

## 📋 Descripción General

El `updateVenueHandler.js` ahora incluye **sincronización automática bidireccional** entre las categorías del venue (`Venue_Category`) y la tabla `Tickets`. Esto garantiza que ambas tablas estén siempre consistentes.

---

## 🔄 Flujo de Sincronización

### Proceso Automático (5 Partes)

```
1️⃣ Actualizar campos básicos del Venue
2️⃣ Procesar Floors con sincronización
3️⃣ Procesar Categorías independientes
4️⃣ Procesar eliminaciones en batch
5️⃣ ✨ SINCRONIZACIÓN AUTOMÁTICA CON TICKETS ✨
```

### Parte 5: Sincronización Automática

Después de procesar todas las modificaciones, el sistema:

1. **Recolecta** todas las categorías finales de `Venue_Category`
2. **Obtiene** datos existentes de `Tickets` para preservar ventas
3. **Calcula** conteo real de asientos desde `Venue_Seat`
4. **Combina** datos nuevos con existentes
5. **Actualiza** la tabla `Tickets` automáticamente

---

## 💾 Datos Preservados

Al sincronizar, se **preservan** estos campos importantes:

| Campo                    | Descripción                 | Fuente             |
| ------------------------ | --------------------------- | ------------------ |
| `soldTickets`            | Tickets vendidos            | Tickets existentes |
| `reservedTickets`        | Tickets reservados          | Tickets existentes |
| `distributionId`         | ID de distribución          | Tickets existentes |
| `distributionCreateDate` | Fecha creación distribución | Tickets existentes |
| `costo`                  | Costo del ticket            | Tickets existentes |
| `imgboleta`              | Imagen del ticket           | Tickets existentes |

---

## 🆕 Datos Actualizados

Estos campos se **actualizan** desde `Venue_Category`:

| Campo               | Descripción            | Fuente                        |
| ------------------- | ---------------------- | ----------------------------- |
| `categoria`         | Nombre de la categoría | `Venue_Category.name`         |
| `id`                | ID de la categoría     | `Venue_Category.categoryId`   |
| `cantidadTickets`   | Total de asientos      | Conteo de `Venue_Seat`        |
| `avaliableCapacity` | Capacidad disponible   | Total - vendidos - reservados |
| `valor`             | Precio del ticket      | `Venue_Category.ticketPrice`  |
| `moneda`            | Moneda                 | `Venue_Category.currency`     |
| `descripcion`       | Descripción            | `Venue_Category.description`  |
| `gateId`            | ID de puerta           | `Venue_Category.gateId`       |

---

## 📊 Cálculo de Capacidad Disponible

```javascript
avaliableCapacity = Math.max(
  0,
  cantidadTickets - reservedTickets - soldTickets
);
```

**Ejemplo:**

- Total de asientos: 100
- Vendidos: 30
- Reservados: 20
- **Disponibles: 50**

---

## 🎯 Casos de Uso

### Caso 1: Agregar Asientos a una Categoría

**Antes:**

```json
{
  "categoria": "VIP",
  "cantidadTickets": 50,
  "soldTickets": 20,
  "reservedTickets": 10,
  "avaliableCapacity": 20
}
```

**Operación:** Se agregan 30 asientos más en `Venue_Seat`

**Después (automático):**

```json
{
  "categoria": "VIP",
  "cantidadTickets": 80,
  "soldTickets": 20, // ✅ Preservado
  "reservedTickets": 10, // ✅ Preservado
  "avaliableCapacity": 50 // ✅ Recalculado: 80 - 20 - 10
}
```

---

### Caso 2: Eliminar una Categoría

**Antes en Tickets:**

```json
{
  "boletas": [
    { "id": "cat1", "categoria": "VIP" },
    { "id": "cat2", "categoria": "General" }
  ]
}
```

**Operación:** Se elimina categoría "General" del venue

**Después (automático):**

```json
{
  "boletas": [{ "id": "cat1", "categoria": "VIP" }]
}
```

---

### Caso 3: Modificar Precio de Categoría

**Antes:**

```json
{
  "categoria": "VIP",
  "valor": 100000,
  "soldTickets": 15
}
```

**Operación:** Se actualiza `ticketPrice` en `Venue_Category` a 120000

**Después (automático):**

```json
{
  "categoria": "VIP",
  "valor": 120000, // ✅ Actualizado
  "soldTickets": 15 // ✅ Preservado
}
```

---

## 🔧 Funciones Principales

### 1. `syncAllCategoriesToTickets()`

Función principal de sincronización automática.

**Parámetros:**

- `venueId`: ID del venue
- `eventId`: ID del evento
- `hasSeating`: Si tiene asientos numerados
- `userId`: Usuario que hace el cambio
- `now`: Timestamp actual
- `body`: Datos adicionales del request

**Retorna:**

```json
{
  "action": "updated",
  "categoriesCount": 5,
  "ticketId": "abc123",
  "message": "Categorías sincronizadas automáticamente con Tickets"
}
```

---

### 2. `updateTicketsTable()`

Actualiza o crea el registro en la tabla Tickets con preservación de datos.

**Mejoras:**

- ✅ Preserva `soldTickets` y `reservedTickets`
- ✅ Recalcula `avaliableCapacity`
- ✅ Mantiene `distributionId` existente
- ✅ Combina categorías nuevas con existentes

---

## 📝 Respuesta del Endpoint

El endpoint ahora retorna información adicional sobre la sincronización:

```json
{
  "message": "Venue updated successfully",
  "venueId": "venue123",
  "hasSeating": true,
  "eventId": "event456",
  "floorsResult": {
    "floorsProcessed": 2,
    "categoriesProcessed": 5,
    "seatsProcessed": 150
  },
  "ticketUpdate": null,
  "deletions": {
    "floors": 0,
    "categories": 1,
    "seats": 0,
    "elements": 0
  },
  "ticketSync": {
    "action": "updated",
    "categoriesCount": 5,
    "ticketId": "abc123",
    "message": "Categorías sincronizadas automáticamente con Tickets"
  }
}
```

---

## ⚠️ Consideraciones Importantes

### 1. Sincronización Solo con EventId

La sincronización **solo ocurre** si existe un `eventId`:

```javascript
if (eventId) {
  finalTicketSync = await syncAllCategoriesToTickets(...);
}
```

### 2. Venues Base vs Event Venues

- **Venue Base** (sin eventId): No sincroniza con Tickets
- **Event Venue** (con eventId): Sincroniza automáticamente

### 3. Preservación de Ventas

Si hay tickets vendidos o reservados, estos datos **NUNCA** se pierden durante actualizaciones del venue.

### 4. Categorías sin Floors

Las categorías pueden existir:

1. Asociadas a un floor (`floorId` presente)
2. Independientes (sin `floorId`)

Ambas se sincronizan con Tickets.

---

## 🚀 Ejemplo Completo de Request

### Actualizar Venue con Sincronización Automática

```json
PUT /venues/{venueId}

{
  "eventId": "event123",
  "hasSeating": true,
  "floors": [
    {
      "floorId": "floor1",
      "name": "Planta Baja",
      "categories": [
        {
          "categoryId": "cat1",
          "name": "VIP",
          "ticketPrice": 150000,
          "currency": "COP",
          "seats": [
            { "rowLabel": "A", "colNumber": 1, "status": "AVAILABLE" },
            { "rowLabel": "A", "colNumber": 2, "status": "AVAILABLE" }
          ]
        }
      ]
    }
  ]
}
```

### Resultado Automático

1. ✅ Actualiza campos del venue
2. ✅ Crea/actualiza floor "Planta Baja"
3. ✅ Crea/actualiza categoría "VIP"
4. ✅ Crea/actualiza 2 asientos
5. ✅ **Sincroniza automáticamente con Tickets:**
   - Busca tickets vendidos/reservados de "VIP"
   - Calcula capacidad disponible
   - Actualiza registro en tabla Tickets

---

## 🔍 Logs de Ejemplo

```
📝 Actualizando campos básicos del venue...
✅ Actualizando 3 campos del venue
🏢 Procesando 1 floors con sincronización...
📦 Procesando 1 categorías para floor floor1
💺 Procesando 2 asientos para categoría cat1
✅ 2 asientos procesados
🔄 Iniciando sincronización automática con tabla Tickets...
🔍 Obteniendo todas las categorías del venue...
📦 Encontradas 1 categorías en Venue_Category
🔄 Preservando datos para VIP: 15 vendidos, 5 reservados
🎫 Preparadas 1 categorías para Tickets
🎫 Actualizando tabla Tickets con 1 categorías
📝 Actualizando registro existente de tickets: abc123
🔄 Preservando datos de ventas para categoría: VIP
✅ Tickets actualizados correctamente con datos preservados
✅ Sincronización con Tickets completada
```

---

## 📚 Documentos Relacionados

- [UPDATE_VENUE_GUIDE.md](UPDATE_VENUE_GUIDE.md) - Guía completa de actualización de venues
- [VENUE_CATEGORIES_UPDATE_SUMMARY.md](VENUE_CATEGORIES_UPDATE_SUMMARY.md) - Resumen de categorías
- [ARRAY_SYNC_GUIDE.md](ARRAY_SYNC_GUIDE.md) - Guía de sincronización de arrays

---

## 🎯 Conclusión

La sincronización automática garantiza que:

✅ **Venue_Category** y **Tickets** estén siempre consistentes  
✅ Los datos de ventas nunca se pierdan  
✅ Las capacidades se calculen correctamente  
✅ No se requiera sincronización manual  
✅ Las actualizaciones sean atómicas y confiables
