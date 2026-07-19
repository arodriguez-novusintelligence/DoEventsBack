# 🎫 API: Transferir Boletas entre Usuarios

## 📋 Descripción

API para transferir boletas de un usuario a otro. Soporta transferencias **parciales** (algunos tickets) o **totales** (todos los tickets de una orden). Valida que ambos usuarios existen y están activos antes de realizar la transferencia.

---

## 🎯 Endpoint

```
POST /tickets/transfer
```

---

## 📥 Request

### Headers
```json
{
  "Content-Type": "application/json"
}
```

### Body Parameters

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `fromUserId` | String | ✅ | ID del usuario que transfiere las boletas |
| `toUserId` | String | ✅ | ID del usuario que recibe las boletas |
| `orderId` | String | ✅ | ID de la orden que contiene las boletas |
| `ticketInstanceIds` | Array[String] | ⚠️ | IDs de los tickets a transferir (requerido si `transferAll` es false) |
| `transferAll` | Boolean | ❌ | Si es `true`, transfiere todos los tickets de la orden (default: false) |

### Request Example - Transferencia Parcial

```json
{
  "fromUserId": "user123",
  "toUserId": "user456",
  "orderId": "order-abc-123",
  "ticketInstanceIds": [
    "ticket-uuid-1",
    "ticket-uuid-2"
  ],
  "transferAll": false
}
```

### Request Example - Transferencia Total

```json
{
  "fromUserId": "user123",
  "toUserId": "user456",
  "orderId": "order-abc-123",
  "transferAll": true
}
```

---

## 📤 Response

### Success Response (200 OK)

#### Transferencia Parcial

```json
{
  "success": true,
  "message": "Transferencia parcial completada exitosamente",
  "transferType": "PARTIAL",
  "fromUser": {
    "userId": "user123",
    "name": "Juan Pérez",
    "email": "juan@mail.com"
  },
  "toUser": {
    "userId": "user456",
    "name": "María García",
    "email": "maria@mail.com"
  },
  "originalOrder": {
    "orderId": "order-abc-123",
    "status": "PARTIALLY_TRANSFERRED",
    "remainingTickets": 3
  },
  "newOrder": null,
  "transferredTickets": [
    {
      "ticketInstanceId": "ticket-uuid-1",
      "category": "VIP",
      "previousOwner": "user123",
      "newOwner": "user456"
    },
    {
      "ticketInstanceId": "ticket-uuid-2",
      "category": "VIP",
      "previousOwner": "user123",
      "newOwner": "user456"
    }
  ],
  "transferredCount": 2
}
```

#### Transferencia Total

```json
{
  "success": true,
  "message": "Transferencia total completada exitosamente",
  "transferType": "FULL",
  "fromUser": {
    "userId": "user123",
    "name": "Juan Pérez",
    "email": "juan@mail.com"
  },
  "toUser": {
    "userId": "user456",
    "name": "María García",
    "email": "maria@mail.com"
  },
  "originalOrder": {
    "orderId": "order-abc-123",
    "status": "TRANSFERRED",
    "remainingTickets": 0
  },
  "newOrder": {
    "orderId": "new-order-uuid-789",
    "userId": "user456",
    "ticketsCount": 5
  },
  "transferredTickets": [
    {
      "ticketInstanceId": "ticket-uuid-1",
      "category": "VIP",
      "previousOwner": "user123",
      "newOwner": "user456"
    },
    {
      "ticketInstanceId": "ticket-uuid-2",
      "category": "General",
      "previousOwner": "user123",
      "newOwner": "user456"
    },
    {
      "ticketInstanceId": "ticket-uuid-3",
      "category": "General",
      "previousOwner": "user123",
      "newOwner": "user456"
    },
    {
      "ticketInstanceId": "ticket-uuid-4",
      "category": "General",
      "previousOwner": "user123",
      "newOwner": "user456"
    },
    {
      "ticketInstanceId": "ticket-uuid-5",
      "category": "General",
      "previousOwner": "user123",
      "newOwner": "user456"
    }
  ],
  "transferredCount": 5
}
```

### Error Responses

#### 400 Bad Request - Parámetros Faltantes

```json
{
  "error": "Faltan parámetros requeridos: fromUserId, toUserId, orderId"
}
```

#### 400 Bad Request - Usuario No Activo

```json
{
  "error": "Usuario receptor: Usuario user456 no está activo (status: inactive)"
}
```

#### 400 Bad Request - Orden No Encontrada

```json
{
  "error": "Orden order-abc-123 no encontrada"
}
```

#### 400 Bad Request - Orden No Pertenece al Usuario

```json
{
  "error": "La orden order-abc-123 no pertenece al usuario user123"
}
```

#### 400 Bad Request - Orden No Pagada

```json
{
  "error": "La orden order-abc-123 no está pagada (status: PENDING)"
}
```

#### 400 Bad Request - Orden Ya Transferida

```json
{
  "error": "La orden order-abc-123 ya fue transferida completamente"
}
```

#### 400 Bad Request - Tickets No Válidos

```json
{
  "error": "Los siguientes tickets no pertenecen a la orden: ticket-xyz-999, ticket-abc-888"
}
```

#### 400 Bad Request - Transferencia a Sí Mismo

```json
{
  "error": "No puedes transferir boletas a ti mismo"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Error interno del servidor al transferir boletas",
  "message": "Detalles del error"
}
```

---

## 🔄 Flujo de Transferencia

### Transferencia Parcial

```
1. POST /tickets/transfer
   {
     "fromUserId": "user123",
     "toUserId": "user456",
     "orderId": "order-abc-123",
     "ticketInstanceIds": ["ticket-1", "ticket-2"]
   }
   ↓
2. Validar usuarios activos
   ✅ user123: active
   ✅ user456: active
   ↓
3. Validar orden
   ✅ Orden pertenece a user123
   ✅ Orden está pagada (APPROVED/SOLD)
   ✅ Orden no está transferida
   ↓
4. Validar tickets
   ✅ ticket-1 pertenece a orden
   ✅ ticket-2 pertenece a orden
   ↓
5. Actualizar TicketsDistribution
   ├─ ticket-1: ownerId → user456
   ├─ ticket-2: ownerId → user456
   ├─ ticketStatus → SOLD (mantener)
   └─ transferredFrom → user123
   ↓
6. Actualizar Orders
   ├─ transfer_status → PARTIALLY_TRANSFERRED
   ├─ tickets → [ticket-3, ticket-4, ticket-5]
   └─ transfer_history → [{...}]
   ↓
7. Retornar respuesta
   ✅ 2 tickets transferidos
   ✅ 3 tickets restantes en orden original
```

### Transferencia Total

```
1. POST /tickets/transfer
   {
     "fromUserId": "user123",
     "toUserId": "user456",
     "orderId": "order-abc-123",
     "transferAll": true
   }
   ↓
2. Validar usuarios activos
   ✅ user123: active
   ✅ user456: active
   ↓
3. Validar orden
   ✅ Orden pertenece a user123
   ✅ Orden está pagada (APPROVED/SOLD)
   ↓
4. Actualizar TicketsDistribution
   ├─ TODOS los tickets:
   │  ├─ ownerId → user456
   │  ├─ orderId → new-order-uuid
   │  └─ transferredFrom → user123
   ↓
5. Crear Nueva Orden
   ├─ order_id → new-order-uuid
   ├─ user_id → user456
   ├─ payment_status → SOLD
   ├─ transfer_status → RECEIVED
   └─ metadata.transferredFrom → user123
   ↓
6. Actualizar Orden Original
   ├─ transfer_status → TRANSFERRED
   ├─ transferred_to → user456
   └─ new_order_id → new-order-uuid
   ↓
7. Retornar respuesta
   ✅ Todos los tickets transferidos
   ✅ Nueva orden creada para user456
   ✅ Orden original marcada como TRANSFERRED
```

---

## 📊 Estados de Orden

| Estado | Descripción |
|--------|-------------|
| `PENDING` | Orden pendiente de pago |
| `APPROVED` | Orden aprobada y pagada |
| `SOLD` | Tickets vendidos y confirmados |
| `PARTIALLY_TRANSFERRED` | Algunos tickets fueron transferidos |
| `TRANSFERRED` | Todos los tickets fueron transferidos |
| `RECEIVED` | Orden recibida por transferencia |

---

## 🔐 Validaciones

### Pre-Transferencia

1. ✅ `fromUserId` y `toUserId` son diferentes
2. ✅ `fromUserId` existe en tabla `Client`
3. ✅ `fromUserId` tiene `userStatus = "active"`
4. ✅ `toUserId` existe en tabla `Client`
5. ✅ `toUserId` tiene `userStatus = "active"`
6. ✅ `orderId` existe en tabla `Orders`
7. ✅ Orden pertenece a `fromUserId`
8. ✅ Orden está pagada (`APPROVED` o `SOLD`)
9. ✅ Orden no está completamente transferida
10. ✅ `ticketInstanceIds` existen en la orden (si no es `transferAll`)

### Post-Transferencia

1. ✅ Tickets actualizados en `TicketsDistribution`
2. ✅ `ownerId` cambiado a `toUserId`
3. ✅ `orderId` actualizado (si es total)
4. ✅ Orden original actualizada correctamente
5. ✅ Nueva orden creada (si es total)

---

## 📦 Tablas Actualizadas

### 1. TicketsDistribution

**Campos actualizados por ticket transferido:**

```javascript
{
  ticketInstanceId: "uuid-1",
  ownerId: "user456",           // ← Cambió de user123
  orderId: "new-order-uuid",    // ← Cambió (si es total)
  ticketStatus: "SOLD",          // ← Mantiene SOLD
  transferredFrom: "user123",    // ← Nuevo campo
  transferredAt: "2026-01-10T...", // ← Nuevo campo
  previousOrderId: "order-abc-123" // ← Nuevo campo
}
```

### 2. Orders (Transferencia Parcial)

**Orden Original:**

```javascript
{
  order_id: "order-abc-123",
  user_id: "user123",
  transfer_status: "PARTIALLY_TRANSFERRED", // ← Nuevo estado
  tickets: [...], // Solo tickets restantes
  modified_at: "2026-01-10T...",
  transfer_history: [
    {
      transferredAt: "2026-01-10T...",
      ticketsCount: 2,
      transferredTicketIds: ["ticket-1", "ticket-2"]
    }
  ]
}
```

### 3. Orders (Transferencia Total)

**Orden Original:**

```javascript
{
  order_id: "order-abc-123",
  user_id: "user123",
  transfer_status: "TRANSFERRED",    // ← Nuevo estado
  transferred_to: "user456",          // ← Nuevo campo
  new_order_id: "new-order-uuid",     // ← Nuevo campo
  transferred_at: "2026-01-10T..."    // ← Nuevo campo
}
```

**Nueva Orden:**

```javascript
{
  order_id: "new-order-uuid",
  user_id: "user456",
  event_id: "event-123",
  payment_status: "SOLD",
  transfer_status: "RECEIVED",        // ← Indica recibida por transferencia
  tickets: [...], // Todos los tickets transferidos
  metadata: {
    transferredFrom: "user123",       // ← Origen de la transferencia
    originalOrderId: "order-abc-123", // ← Orden original
    transferredAt: "2026-01-10T..."
  },
  reference: "TRANSFER-order-abc-123"
}
```

---

## 💡 Casos de Uso

### Caso 1: Transferir 2 de 5 Boletas

```javascript
// Usuario A tiene 5 boletas VIP
// Transfiere 2 boletas a Usuario B

POST /tickets/transfer
{
  "fromUserId": "userA",
  "toUserId": "userB",
  "orderId": "order-123",
  "ticketInstanceIds": ["ticket-1", "ticket-2"]
}

// Resultado:
// ✅ Usuario A conserva 3 boletas en order-123
// ✅ Usuario B recibe 2 boletas (aún en order-123)
// ✅ Orden marcada como PARTIALLY_TRANSFERRED
```

### Caso 2: Transferir Todas las Boletas

```javascript
// Usuario A tiene 5 boletas VIP
// Transfiere TODAS a Usuario B

POST /tickets/transfer
{
  "fromUserId": "userA",
  "toUserId": "userB",
  "orderId": "order-123",
  "transferAll": true
}

// Resultado:
// ✅ Usuario A: order-123 marcada como TRANSFERRED
// ✅ Usuario B: nueva orden "new-order-xyz" con 5 boletas
// ✅ Los 5 tickets apuntan a la nueva orden
```

### Caso 3: Transferir a Usuario Inactivo (Error)

```javascript
POST /tickets/transfer
{
  "fromUserId": "userA",
  "toUserId": "userB", // userB.userStatus = "inactive"
  "orderId": "order-123",
  "transferAll": true
}

// Response: 400 Bad Request
{
  "error": "Usuario receptor: Usuario userB no está activo (status: inactive)"
}
```

---

## 🧪 Testing

### Test 1: Transferencia Parcial Exitosa

```bash
curl -X POST https://api.doevent.com/tickets/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user123",
    "toUserId": "user456",
    "orderId": "order-abc-123",
    "ticketInstanceIds": ["ticket-1", "ticket-2"]
  }'

# Verificar:
# ✅ Response 200
# ✅ transferType = "PARTIAL"
# ✅ transferredCount = 2
# ✅ originalOrder.remainingTickets = 3
```

### Test 2: Transferencia Total Exitosa

```bash
curl -X POST https://api.doevent.com/tickets/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user123",
    "toUserId": "user456",
    "orderId": "order-abc-123",
    "transferAll": true
  }'

# Verificar:
# ✅ Response 200
# ✅ transferType = "FULL"
# ✅ newOrder.orderId existe
# ✅ originalOrder.status = "TRANSFERRED"
```

### Test 3: Usuario Inactivo (Error)

```bash
curl -X POST https://api.doevent.com/tickets/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user123",
    "toUserId": "user-inactive",
    "orderId": "order-abc-123",
    "transferAll": true
  }'

# Verificar:
# ✅ Response 400
# ✅ error contiene "no está activo"
```

---

## 📈 Performance

| Operación | Tiempo Estimado |
|-----------|-----------------|
| Validar usuario (x2) | ~100ms |
| Obtener orden | ~50ms |
| Actualizar TicketsDistribution | ~200ms (2-3 distributions) |
| Crear nueva orden | ~100ms (solo si es total) |
| Actualizar orden original | ~100ms |
| **TOTAL** | **~550ms - 650ms** |

---

## 🔗 Integración con Otros Servicios

### Notificaciones (Futuro)

```javascript
// Después de transferencia exitosa, notificar:
// 1. Usuario emisor: "Has transferido X boletas a [nombre]"
// 2. Usuario receptor: "Has recibido X boletas de [nombre]"
```

### Email (Futuro)

```javascript
// Enviar emails con:
// 1. Confirmación de transferencia
// 2. QR codes actualizados
// 3. Detalles de los tickets transferidos
```

---

## 🚨 Consideraciones Importantes

### QR Codes

Los QR codes **NO se regeneran** durante la transferencia. Los tickets mantienen sus `qrCodeKey` y `qr_url` originales. El cambio de propiedad se refleja solo en `ownerId` y `orderId`.

### Reembolsos

Si una orden tiene boletas transferidas parcialmente y el evento se cancela:
- Usuario original puede solicitar reembolso por sus boletas restantes
- Usuario receptor puede solicitar reembolso por las boletas recibidas

### Historial

Las transferencias parciales se guardan en `transfer_history[]` en la orden original, permitiendo rastrear todas las transferencias realizadas.

---

## 📝 Archivos del Proyecto

| Archivo | Descripción |
|---------|-------------|
| [src/transferTickets.js](../src/transferTickets.js) | Handler principal de la API |
| [serverless.yml](../serverless.yml) | Configuración del endpoint |
| [TRANSFER_TICKETS_API.md](TRANSFER_TICKETS_API.md) | Este documento |

---

**Fecha:** Enero 10, 2026  
**Módulo:** aws-lambda-manageevents  
**Endpoint:** `POST /tickets/transfer`  
**Status:** ✅ Implementado y Listo para Testing
