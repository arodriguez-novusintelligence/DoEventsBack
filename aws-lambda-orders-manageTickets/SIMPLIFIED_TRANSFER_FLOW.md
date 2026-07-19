# 🎫 Flujo Simplificado de Transferencia de Boletas

## ✅ Cambios Implementados

Se ha simplificado completamente el flujo de transferencia de boletas, eliminando estados pendientes y procesos de aceptación/rechazo. Ahora la transferencia es **inmediata y automática**.

---

## 📋 Nuevo Flujo

### **Antes (Sistema Anterior - Eliminado)**
❌ Usuario A inicia transferencia → Estado PENDING_TRANSFER → Usuario B acepta/rechaza → Transferencia completa

### **Ahora (Sistema Nuevo - Implementado)**
✅ Usuario A selecciona boletas → Usuario A selecciona Usuario B → **Transferencia INMEDIATA** → Usuario B recibe notificación

---

## 🔄 Proceso Detallado

### 1. Usuario A Selecciona Boletas
- Puede seleccionar **1, varias o todas** las boletas de una orden
- Todas las boletas deben ser de la **misma orden**

### 2. Usuario A Selecciona Receptor
- Busca y selecciona Usuario B mediante el servicio de búsqueda (sin modificar)

### 3. Transferencia Inmediata
Al confirmar, el backend ejecuta automáticamente:

#### Para Usuario A (Remitente):
- **Si transfiere todas las boletas**: La orden cambia a estado `"transferred"`
- **Si transfiere algunas boletas**: La orden actualiza `quantity` y registra en `partial_transfers`
- **Trazabilidad**: Se registra a quién se transfirió (`to_user_id`, `to_user_name`) y la fecha (`transferred_at`)

#### Para Usuario B (Receptor):
- **Nueva orden creada** con estado `"approved"`
- **`payment_status`**: `"transferred"`
- **Trazabilidad**: Se registra de quién viene (`from_user_id`, `from_user_name`, `original_order_id`) y la fecha

#### Para los Tickets:
- **`user_id`**: Cambia a Usuario B
- **`order_id`**: Cambia a la nueva orden de Usuario B
- **`status`**: Se mantiene `"ACTIVE"`
- **`transfer_history`**: Se agrega un registro completo de la transferencia

---

## 📊 Estructura de Datos

### Orden del Remitente (Usuario A)

#### Transferencia Total:
```json
{
  "order_id": "order-abc-123",
  "user_id": "user-a",
  "status": "transferred",
  "quantity": 0,
  "transferred_to": {
    "user_id": "user-b",
    "user_name": "Juan Pérez",
    "new_order_id": "order-xyz-789",
    "ticket_count": 2,
    "transferred_at": "2026-01-16T10:00:00Z"
  }
}
```

#### Transferencia Parcial:
```json
{
  "order_id": "order-abc-123",
  "user_id": "user-a",
  "status": "approved",
  "quantity": 3,
  "partial_transfers": [
    {
      "to_user_id": "user-b",
      "to_user_name": "Juan Pérez",
      "new_order_id": "order-xyz-789",
      "ticket_count": 2,
      "ticket_ids": ["ticket-1", "ticket-2"],
      "transferred_at": "2026-01-16T10:00:00Z"
    }
  ]
}
```

### Nueva Orden del Receptor (Usuario B)

```json
{
  "order_id": "order-xyz-789",
  "user_id": "user-b",
  "event_id": "event-456",
  "quantity": 2,
  "status": "approved",
  "payment_status": "transferred",
  "created_at": "2026-01-16T10:00:00Z",
  "transferred_from": {
    "user_id": "user-a",
    "user_name": "María González",
    "original_order_id": "order-abc-123",
    "transferred_at": "2026-01-16T10:00:00Z"
  },
  "total_amount": 50000,
  "currency": "USD"
}
```

### Tickets Transferidos

```json
{
  "ticket_id": "ticket-1",
  "order_id": "order-xyz-789",
  "user_id": "user-b",
  "event_id": "event-456",
  "status": "ACTIVE",
  "updated_at": "2026-01-16T10:00:00Z",
  "transfer_history": [
    {
      "from_user_id": "user-a",
      "from_user_name": "María González",
      "to_user_id": "user-b",
      "to_user_name": "Juan Pérez",
      "original_order_id": "order-abc-123",
      "new_order_id": "order-xyz-789",
      "transferred_at": "2026-01-16T10:00:00Z"
    }
  ]
}
```

---

## 🔌 Endpoint API

### POST `/tickets/transfer`

**Request:**
```json
{
  "ticketIDs": ["ticket-1", "ticket-2"],
  "newUserID": "user-b",
  "currentUserID": "user-a",
  "orderID": "order-abc-123"
}
```

**Response Exitosa (200):**
```json
{
  "message": "Boletas transferidas exitosamente",
  "transferredTickets": 2,
  "originalOrderID": "order-abc-123",
  "newOrderID": "order-xyz-789",
  "recipient": {
    "userId": "user-b",
    "name": "Juan Pérez"
  }
}
```

**Errores:**
- `400`: Faltan parámetros o datos inválidos
- `403`: Sin permisos para transferir
- `404`: Orden o tickets no encontrados

---

## 🔔 Notificaciones

### Usuario B (Receptor) Recibe:

#### In-App:
```json
{
  "title": "Has recibido 2 boleta(s)",
  "body": "María González te ha transferido boletas para Concierto Rock 2026"
}
```

#### Push:
```json
{
  "title": "🎫 Boletas recibidas",
  "body": "María González te transfirió 2 boleta(s) para Concierto Rock 2026"
}
```

#### Email:
- Template: `ticket_transferred_received.hbs`
- Incluye: Información del evento, nombre del remitente, cantidad de boletas
- Botón: "Ver Mis Boletas"

#### WebSocket (Tiempo Real):
```json
{
  "channel": "notification",
  "action": "tickets-received",
  "type": "TICKET_TRANSFERRED_RECEIVED",
  "senderName": "María González",
  "ticketCount": 2,
  "eventName": "Concierto Rock 2026",
  "orderID": "order-xyz-789",
  "timestamp": "2026-01-16T10:00:00Z"
}
```

---

## 🗑️ Archivos/Funciones Eliminados

### Backend:
- ❌ `src/ticket/acceptTransfer.js`
- ❌ `src/ticket/rejectTransfer.js`
- ❌ Endpoints: `/tickets/transfer/accept` y `/tickets/transfer/reject`
- ❌ Templates de notificación: `TICKET_TRANSFER_REQUEST`, `TICKET_TRANSFER_ACCEPTED`, `TICKET_TRANSFER_REJECTED`
- ❌ Email template: `ticket_transfer_request.hbs` → Reemplazado por `ticket_transferred_received.hbs`
- ❌ WhatsApp template: `ticket_transfer_request.js`

### Estados Eliminados:
- ❌ `PENDING_TRANSFER`
- ❌ Campo `pending_transfer` en tickets
- ❌ Campo `transfer_requested_at` en tickets

---

## ✅ Validaciones Implementadas

1. ✅ `ticketIDs` debe ser array no vacío
2. ✅ Todos los tickets deben existir
3. ✅ Todos los tickets deben pertenecer al usuario actual
4. ✅ Todos los tickets deben ser de la misma orden
5. ✅ Todos los tickets deben estar en estado `ACTIVE`
6. ✅ La orden debe pertenecer al usuario actual

---

## 🎯 Ventajas del Nuevo Flujo

✅ **Más Simple**: Sin estados intermedios  
✅ **Más Rápido**: Transferencia inmediata  
✅ **Menos Código**: Eliminados 2 endpoints y múltiples templates  
✅ **Mejor UX**: Usuario no debe esperar aceptación  
✅ **Trazabilidad Completa**: Historial detallado en tickets y órdenes  
✅ **Soporte Multi-Ticket**: Transferir varias boletas a la vez  
✅ **Transferencias Parciales**: Se puede transferir solo algunas boletas de una orden  

---

## 📱 Cambios Necesarios en Frontend

### Eliminar/Actualizar:
1. ❌ Pantallas de aceptar/rechazar transferencia
2. ❌ Estados `PENDING_TRANSFER` en la UI
3. ❌ Notificaciones con botones de aceptar/rechazar
4. ❌ Listeners de WebSocket para `transfer-accepted` y `transfer-rejected`

### Implementar/Mantener:
1. ✅ Modal de selección de múltiples boletas
2. ✅ Búsqueda de usuarios (sin cambios)
3. ✅ Confirmación de transferencia
4. ✅ Notificación de "Boletas recibidas" (Usuario B)
5. ✅ Listener de WebSocket para `tickets-received`
6. ✅ Actualizar lista de tickets inmediatamente

### Ejemplo de Request Frontend:
```javascript
const transferTickets = async (selectedTickets, recipientUserId) => {
  const response = await fetch(`${API_URL}/tickets/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      ticketIDs: selectedTickets.map(t => t.ticket_id),
      newUserID: recipientUserId,
      currentUserID: currentUser.id,
      orderID: selectedTickets[0].order_id
    })
  });
  
  if (response.ok) {
    const data = await response.json();
    showSuccess(`${data.transferredTickets} boletas transferidas a ${data.recipient.name}`);
    refreshTickets();
  }
};
```

---

## 🚀 Deployment Completado

### ✅ Servicios Desplegados:

1. **aws-lambda-orders-manageTickets** (105s)
   - ✅ `transferTicket` actualizado
   - ✅ Endpoints `/accept` y `/reject` eliminados
   - ✅ Funciones `acceptTransfer` y `rejectTransfer` eliminadas

2. **aws-lambda-notifications** (119s)
   - ✅ Template `TICKET_TRANSFERRED_RECEIVED` agregado
   - ✅ Templates antiguos eliminados
   - ✅ Email template actualizado

### 📡 Endpoints Activos:
- ✅ `POST /tickets/transfer` - Transferencia inmediata

### 🔌 WebSocket:
- ✅ `wss://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev`

---

## 🧪 Testing

### Ejemplo de Prueba:

```bash
# 1. Usuario A transfiere 2 boletas a Usuario B
curl -X POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "ticketIDs": ["ticket-1", "ticket-2"],
    "newUserID": "user-b-456",
    "currentUserID": "user-a-123",
    "orderID": "order-abc-789"
  }'

# Respuesta esperada:
{
  "message": "Boletas transferidas exitosamente",
  "transferredTickets": 2,
  "originalOrderID": "order-abc-789",
  "newOrderID": "order-xyz-new",
  "recipient": {
    "userId": "user-b-456",
    "name": "Juan Pérez"
  }
}

# 2. Verificar que Usuario B tiene nueva orden
# GET /users/user-b-456/tickets

# 3. Verificar que Usuario A ya no tiene esas boletas
# GET /users/user-a-123/tickets
```

---

## 📝 Resumen

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Estados | ACTIVE, PENDING_TRANSFER | Solo ACTIVE |
| Endpoints | 3 (transfer, accept, reject) | 1 (transfer) |
| Tiempo de transferencia | Depende de Usuario B | Inmediato |
| Tickets por transferencia | 1 | 1 o más |
| Notificaciones | 3 tipos | 1 tipo |
| Complejidad | Alta | Baja |

---

**🎉 Implementación completa y desplegada exitosamente!**
