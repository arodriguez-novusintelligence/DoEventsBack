# ✅ Implementación: Generación Automática de Boletas en TicketsDistribution

## 📅 Fecha: Enero 9, 2026

---

## 🎯 Objetivo

Implementar la generación automática de boletas individuales en la tabla `TicketsDistribution` cuando se crea o actualiza un venue asociado a un evento, alineado con la lógica de compra de boletas en `managetickets` y `orders-manageTickets`.

---

## 📊 Flujo Completo del Sistema

### 1. Creación de Venue con Evento

```
┌─────────────────────────────────────────────┐
│  POST /venues                                │
│  {                                           │
│    eventId: "event123",                      │
│    hasSeating: true,                         │
│    categories: [...]                         │
│  }                                           │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  1. Crear Venue en tabla Venues              │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  2. Crear Floors y Categorías                │
│     - Venue_Floor                            │
│     - Venue_Category                         │
│     - Venue_Seat (si hasSeating)             │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  3. Generar Registro en Tickets             │
│     {                                        │
│       id: "ticketId123",                     │
│       eventId: "event123",                   │
│       venueId: "venue456",                   │
│       boletas: [                             │
│         {                                    │
│           categoria: "VIP",                  │
│           id: "cat1",                        │
│           cantidadTickets: 100,              │
│           distributionId: "dist1",           │
│           distributionCreateDate: "2026-..." │
│         }                                    │
│       ]                                      │
│     }                                        │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  🆕 4. Generar TicketsDistribution          │
│                                              │
│  Para cada categoría:                        │
│  {                                           │
│    id: "dist1",              (PK)            │
│    createDate: "2026-...",   (SK)            │
│    ticketId: "ticketId123",                  │
│    eventId: "event123",                      │
│    venueId: "venue456",                      │
│    boletaId: "cat1",                         │
│    categoryName: "VIP",                      │
│    tickets: [                                │
│      {                                       │
│        ticketInstanceId: "uuid-1",           │
│        category: "VIP",                      │
│        categoryId: "cat1",                   │
│        ticketStatus: "AVAILABLE",            │
│        qrCodeKey: "qr-uuid-1",               │
│        purchasePrice: 200000,                │
│        ownerId: null,                        │
│        orderId: null                         │
│      },                                      │
│      ... (100 tickets individuales)          │
│    ]                                         │
│  }                                           │
└─────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Actualización de Venue

```
┌─────────────────────────────────────────────┐
│  PUT /venues/{venueId}                       │
│  {                                           │
│    eventId: "event123",                      │
│    categories: [...]                         │
│  }                                           │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  1. Actualizar Venue                         │
│  2. Sincronizar Floors/Categories            │
│  3. Auto-eliminar elementos obsoletos        │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  4. Sincronizar con Tickets                  │
│     - Preservar soldTickets                  │
│     - Preservar reservedTickets              │
│     - Actualizar cantidadTickets             │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────┐
│  🆕 5. Sincronizar TicketsDistribution      │
│                                              │
│  Para cada categoría:                        │
│  - Si es nueva → crear distribución          │
│  - Si existe → actualizar cantidad           │
│    • Si aumenta → agregar tickets AVAILABLE  │
│    • Si disminuye → eliminar solo AVAILABLE  │
│                                              │
│  ⚠️ NO se eliminan tickets:                 │
│     - RESERVED                               │
│     - SOLD                                   │
│     - USED                                   │
└─────────────────────────────────────────────┘
```

---

## 💡 Lógica de Compra de Boletas

### Paso 1: Crear Orden (createOrder)

```javascript
// Usuario selecciona tickets
POST /orders/create
{
  metadata: {
    eventId: "event123",
    userID: "user456",
    tickets: [
      {
        category: "VIP",
        quantity: 2,
        ticketsDistId: "dist1",      // ← distributionId
        createDate: "2026-01-09..."  // ← distributionCreateDate
      }
    ]
  }
}
```

**Proceso:**

1. Query `TicketsDistribution` con clave compuesta `(id, createDate)`
2. Buscar tickets con `ticketStatus: "AVAILABLE"`
3. Cambiar estado a `ticketStatus: "RESERVED"`
4. Crear orden con TTL de 15 minutos
5. Generar QR codes

### Paso 2: Procesar Pago (processPayment)

```javascript
// Pago exitoso
POST / orders / { orderId } / payment;
{
  status: "APPROVED";
}
```

**Proceso:**

1. Cambiar orden de `PENDING` a `COMPLETED`
2. Actualizar `TicketsDistribution`:
   - `ticketStatus: "RESERVED"` → `ticketStatus: "SOLD"`
   - Asignar `ownerId: userId`
3. Actualizar `Tickets`:
   - Incrementar `soldTickets`
   - Decrementar `avaliableCapacity`

---

## 🔑 Estructura de Clave Compuesta

### TicketsDistribution

```javascript
// Clave Primaria
{
  id: "distributionId",      // PK (Partition Key)
  createDate: "2026-01-09"   // SK (Sort Key)
}

// Índices Secundarios Globales (GSI)
{
  eventIdIndex: "eventId"    // Para queries por evento
}
```

**Ejemplo de Get:**

```javascript
await dynamodb
  .get({
    TableName: "TicketsDistribution",
    Key: {
      id: "dist1",
      createDate: "2026-01-09T12:00:00Z",
    },
  })
  .promise();
```

**Ejemplo de Query por Evento:**

```javascript
await dynamodb
  .query({
    TableName: "TicketsDistribution",
    IndexName: "eventIdIndex",
    KeyConditionExpression: "eventId = :eventId",
    ExpressionAttributeValues: {
      ":eventId": "event123",
    },
  })
  .promise();
```

---

## 📦 Estructura de Datos

### Tickets (Registro de Categorías)

```json
{
  "id": "ticket123",
  "eventId": "event123",
  "venueId": "venue456",
  "hasSeating": true,
  "createDate": "2026-01-09T12:00:00Z",
  "boletas": [
    {
      "categoria": "VIP",
      "id": "cat1",
      "cantidadTickets": 100,
      "avaliableCapacity": 80,
      "reservedTickets": 15,
      "soldTickets": 5,
      "valor": 200000,
      "moneda": "COP",
      "distributionId": "dist1",
      "distributionCreateDate": "2026-01-09T12:00:00Z"
    }
  ]
}
```

### TicketsDistribution (Tickets Individuales)

```json
{
  "id": "dist1",
  "createDate": "2026-01-09T12:00:00Z",
  "ticketId": "ticket123",
  "eventId": "event123",
  "venueId": "venue456",
  "boletaId": "cat1",
  "categoryName": "VIP",
  "tickets": [
    {
      "ticketInstanceId": "uuid-1",
      "category": "VIP",
      "categoryId": "cat1",
      "location": {},
      "ticketStatus": "AVAILABLE", // AVAILABLE | RESERVED | SOLD | USED
      "qrCodeKey": "qr-uuid-1",
      "ownerId": null, // userId cuando se vende
      "orderId": null, // orderId cuando se reserva/vende
      "entityType": "TICKET",
      "purchasePrice": 200000,
      "distributionId": "dist1",
      "createDate": "2026-01-09T12:00:00Z"
    }
    // ... 99 tickets más
  ]
}
```

---

## 🆕 Funciones Implementadas

### 1. `generateTicketsDistribution()`

**Ubicación:** `createVenueHandler.js`, `updateVenueHandler.js`

**Propósito:** Generar tickets individuales en TicketsDistribution al crear un venue

**Parámetros:**

- `eventId`: ID del evento
- `venueId`: ID del venue
- `ticketId`: ID del registro en tabla Tickets
- `categories`: Array de categorías con distributionId
- `now`: Timestamp actual

**Retorna:** Cantidad de distribuciones creadas

**Ejemplo:**

```javascript
const distributionsCreated = await generateTicketsDistribution(
  "event123",
  "venue456",
  "ticket789",
  [
    {
      categoria: "VIP",
      id: "cat1",
      cantidadTickets: 100,
      valor: 200000,
      distributionId: "dist1",
      distributionCreateDate: "2026-01-09T12:00:00Z",
    },
  ],
  new Date().toISOString()
);
// distributionsCreated = 1 (100 tickets individuales creados)
```

---

### 2. `syncTicketsDistribution()`

**Ubicación:** `updateVenueHandler.js`

**Propósito:** Sincronizar TicketsDistribution con cambios en categorías

**Características:**

- ✅ Crea nuevas distribuciones para categorías nuevas
- ✅ Actualiza cantidades si cambian
- ✅ Preserva tickets RESERVED, SOLD, USED
- ✅ Solo modifica tickets AVAILABLE

**Lógica de Sincronización:**

```javascript
// Si aumenta la cantidad
if (nuevaCantidad > cantidadActual) {
  // Agregar nuevos tickets AVAILABLE
  for (let i = 0; i < diferencia; i++) {
    tickets.push({
      ticketInstanceId: uuidv4(),
      ticketStatus: "AVAILABLE",
      // ...
    });
  }
}

// Si disminuye la cantidad
if (nuevaCantidad < cantidadActual) {
  // Solo eliminar si hay suficientes AVAILABLE
  const disponibles = tickets.filter((t) => t.ticketStatus === "AVAILABLE");

  if (disponibles.length >= diferencia) {
    // Eliminar solo tickets AVAILABLE
    tickets = tickets.filter((t) => {
      if (t.ticketStatus === "AVAILABLE" && removed < diferencia) {
        removed++;
        return false; // Eliminar
      }
      return true; // Mantener
    });
  } else {
    console.log("⚠️ No se puede reducir - tickets ya vendidos/reservados");
  }
}
```

---

## 🔄 Integración con Sistema de Órdenes

### Flujo Completo de Compra

```
1️⃣ Usuario selecciona tickets en frontend
   ↓
2️⃣ Frontend obtiene distributionId y createDate de Tickets.boletas
   ↓
3️⃣ POST /orders/create con ticketsDistId y createDate
   ↓
4️⃣ manageOrders.createOrder():
   - Query TicketsDistribution con (id, createDate)
   - Filtra tickets AVAILABLE
   - Cambia a RESERVED
   - Genera QR codes
   - Crea orden con TTL 15 min
   ↓
5️⃣ Usuario completa pago
   ↓
6️⃣ POST /orders/{orderId}/payment
   ↓
7️⃣ manageOrders.processPayment():
   - Cambia tickets de RESERVED a SOLD
   - Asigna ownerId
   - Actualiza Tickets (soldTickets++)
   ↓
8️⃣ Usuario recibe tickets con QR codes
```

---

## 📝 Cambios en Archivos

### ✅ createVenueHandler.js

**Función Agregada:**

```javascript
async function generateTicketsDistribution(
  eventId,
  venueId,
  ticketId,
  categories,
  now
)
```

**Modificación en Handler:**

```javascript
// Después de crear registro en Tickets
if (allTicketCategories.length > 0) {
  // ... crear registro en Tickets

  // 🆕 GENERAR TICKETS DISTRIBUTION
  const distributionsCreated = await generateTicketsDistribution(
    eventId,
    venueId,
    ticketId,
    allTicketCategories,
    now
  );

  console.log(`✅ ${distributionsCreated} distribuciones creadas`);
}
```

---

### ✅ updateVenueHandler.js

**Funciones Agregadas:**

```javascript
async function generateTicketsDistribution(...)
async function syncTicketsDistribution(...)
```

**Modificación en syncAllCategoriesToTickets:**

```javascript
// Después de actualizar Tickets
const result = await updateTicketsTable(...);

// 🆕 SINCRONIZAR TICKETS DISTRIBUTION
const distributionSync = await syncTicketsDistribution(
  eventId,
  venueId,
  result.ticketId,
  ticketCategories,
  now
);

return {
  ...result,
  distributionSync,
  message: "Sincronizado con Tickets y TicketsDistribution"
};
```

---

## 🧪 Casos de Prueba

### Caso 1: Crear Venue con Categorías

**Request:**

```json
POST /venues
{
  "name": "Estadio Nacional",
  "eventId": "event123",
  "hasSeating": true,
  "categories": [
    {
      "name": "VIP",
      "cantidadTickets": 50,
      "valor": 200000
    },
    {
      "name": "General",
      "cantidadTickets": 200,
      "valor": 50000
    }
  ]
}
```

**Resultado:**

- ✅ Venue creado
- ✅ 2 categorías en Venue_Category
- ✅ 1 registro en Tickets con 2 boletas
- ✅ 2 registros en TicketsDistribution
- ✅ 250 tickets individuales (50 VIP + 200 General)

---

### Caso 2: Aumentar Cantidad de Tickets

**Antes:**

- VIP: 50 tickets (40 AVAILABLE, 10 SOLD)

**Request:**

```json
PUT /venues/venue123
{
  "categories": [
    {
      "id": "cat-vip",
      "cantidadTickets": 80  // +30 tickets
    }
  ]
}
```

**Resultado:**

- ✅ 30 nuevos tickets AVAILABLE agregados
- ✅ Total: 80 tickets (70 AVAILABLE, 10 SOLD)
- ✅ 10 tickets SOLD preservados

---

### Caso 3: Reducir Cantidad de Tickets

**Antes:**

- General: 200 tickets (150 AVAILABLE, 30 RESERVED, 20 SOLD)

**Request:**

```json
PUT /venues/venue123
{
  "categories": [
    {
      "id": "cat-general",
      "cantidadTickets": 180  // -20 tickets
    }
  ]
}
```

**Resultado:**

- ✅ 20 tickets AVAILABLE eliminados
- ✅ Total: 180 tickets (130 AVAILABLE, 30 RESERVED, 20 SOLD)
- ✅ Tickets RESERVED y SOLD preservados

---

### Caso 4: Intentar Reducir Más de lo Disponible

**Antes:**

- VIP: 100 tickets (20 AVAILABLE, 80 SOLD)

**Request:**

```json
PUT /venues/venue123
{
  "categories": [
    {
      "id": "cat-vip",
      "cantidadTickets": 50  // -50 tickets (pero solo 20 disponibles)
    }
  ]
}
```

**Resultado:**

- ❌ No se puede reducir
- ⚠️ Log: "No se puede reducir: se requieren 50 disponibles pero solo hay 20"
- ✅ Cantidad mantiene en 100 tickets

---

## 📊 Métricas de Implementación

| Métrica                    | Valor                                            |
| -------------------------- | ------------------------------------------------ |
| Archivos modificados       | 2                                                |
| Funciones nuevas           | 2                                                |
| Líneas de código agregadas | ~450                                             |
| Tablas involucradas        | 3 (Tickets, TicketsDistribution, Venue_Category) |
| Sincronización automática  | ✅ Sí                                            |
| Preservación de datos      | ✅ Sí                                            |
| Clave compuesta soportada  | ✅ Sí                                            |

---

## ⚠️ Consideraciones Importantes

### 1. Clave Compuesta Obligatoria

TicketsDistribution SIEMPRE requiere ambas claves:

```javascript
Key: {
  id: "distributionId",
  createDate: "2026-01-09T12:00:00Z"
}
```

### 2. Preservación de Tickets Vendidos

Al reducir cantidad, el sistema:

- ✅ Solo elimina tickets AVAILABLE
- ❌ NUNCA elimina tickets RESERVED, SOLD o USED
- ⚠️ Rechaza reducción si no hay suficientes disponibles

### 3. Sincronización en Cadena

```
Venue Update
    ↓
Venue_Category sync
    ↓
Tickets sync (preserva ventas)
    ↓
TicketsDistribution sync (preserva estados)
```

### 4. Manejo de Errores

```javascript
try {
  distributionSync = await syncTicketsDistribution(...);
} catch (distError) {
  console.error("❌ Error sincronizando:", distError);
  // No falla toda la operación
}
```

---

## 🚀 Deployment

### Verificar Antes de Desplegar

```bash
# 1. Verificar sintaxis
npm run lint

# 2. Verificar tests (si existen)
npm test

# 3. Verificar índices en DynamoDB
aws dynamodb describe-table --table-name TicketsDistribution

# Verificar que existe eventIdIndex
```

### Desplegar

```bash
cd aws-lambda-venues
serverless deploy --stage prod
```

---

## 🎉 Beneficios

1. **Gestión Automática de Inventario**

   - Los tickets se crean automáticamente al crear el venue
   - No requiere paso manual adicional

2. **Consistencia de Datos**

   - Tickets siempre sincronizados con Venue_Category
   - TicketsDistribution siempre alineado con Tickets

3. **Protección de Datos**

   - Tickets vendidos nunca se eliminan
   - Tickets reservados se preservan

4. **Escalabilidad**

   - Batch operations para grandes cantidades
   - Operaciones paralelas

5. **Trazabilidad**
   - Logs detallados de cada operación
   - distributionId y createDate para seguimiento

---

## 📚 Referencias

- [Tickets.boletas](../aws-lambda-managetickets/src/createTicket.js) - Formato de categorías
- [createOrder](../aws-lambda-orders-manageTickets/src/orders/createOrder.js) - Flujo de compra
- [manageOrders](../aws-lambda-orders-manageTickets/src/orders/manageOrders.js) - Reserva de tickets
- [TICKETS_SYNC_GUIDE.md](TICKETS_SYNC_GUIDE.md) - Sincronización con Tickets

---

## ✅ Status

**Implementación:** ✅ COMPLETADA  
**Testing:** ⏳ PENDIENTE  
**Deployment:** ⏳ PENDIENTE  
**Errores de Sintaxis:** ✅ 0

---

## 👨‍💻 Próximos Pasos

1. ✅ Testing unitario de funciones
2. ✅ Testing de integración con createOrder
3. ✅ Verificar índices en DynamoDB production
4. ✅ Desplegar en staging
5. ✅ Pruebas end-to-end
6. ✅ Desplegar en production
