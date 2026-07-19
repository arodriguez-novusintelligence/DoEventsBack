# 🔌 Integración WebSocket - Transferencia de Boletas

## ✅ Implementación Completada

Se ha integrado exitosamente el sistema de notificaciones WebSocket en tiempo real para el flujo de transferencia de boletas.

---

## 📋 Archivos Creados/Modificados

### ✅ Nuevos Archivos

#### 1. **`src/helpers/websocketHelper.js`**
Helper centralizado para gestión de WebSocket con las siguientes funciones:

- **`getUserConnectionId(userId)`** - Obtiene el connectionId de DynamoDB (tabla UserChannels)
- **`sendWebSocketMessage(userId, message)`** - Envía mensaje WebSocket a usuario específico
- **`buildTransferAcceptedMessage(params)`** - Construye mensaje formateado para aceptación
- **`buildTransferRejectedMessage(params)`** - Construye mensaje formateado para rechazo

**Características**:
- ✅ Manejo automático de conexiones obsoletas (410 Gone)
- ✅ Logging detallado para debugging
- ✅ Limpieza automática de conexiones inválidas en DynamoDB
- ✅ No falla el flujo principal si WebSocket falla

---

### ✅ Archivos Modificados

#### 2. **`src/ticket/acceptTransfer.js`**
**Cambios**:
- ✅ Importa `websocketHelper`
- ✅ Obtiene datos adicionales del receptor (username, avatar)
- ✅ **Envía WebSocket al remitente** cuando se acepta la transferencia
- ✅ Mensaje incluye toda la información del evento y receptor
- ✅ Logs detallados del envío

**Flujo**:
1. Valida transferencia pendiente
2. Actualiza ticket (cambia owner a receptor)
3. **🔥 Envía WebSocket al remitente** ← NUEVO
4. Envía notificación push/email (respaldo)
5. Responde con éxito

---

#### 3. **`src/ticket/rejectTransfer.js`**
**Cambios**:
- ✅ Importa `websocketHelper`
- ✅ Obtiene datos adicionales del receptor (username, avatar)
- ✅ **Envía WebSocket al remitente** cuando se rechaza la transferencia
- ✅ Mantiene el ticket con el propietario original
- ✅ Logs detallados del envío

**Flujo**:
1. Valida transferencia pendiente
2. Restaura ticket a estado ACTIVE (mantiene owner original)
3. **🔥 Envía WebSocket al remitente** ← NUEVO
4. Envía notificación push/email (respaldo)
5. Responde con éxito

---

#### 4. **`serverless.yml`**
**Cambios**:
- ✅ Agregada variable de entorno: `WEBSOCKET_ENDPOINT`
- ✅ Permisos DynamoDB para tabla `UserChannels`
- ✅ Permisos DynamoDB para tabla `usuarios`
- ✅ Permisos `execute-api:ManageConnections` para WebSocket
- ✅ Permisos `execute-api:Invoke` para API Gateway WebSocket

---

## 🔔 Formato del Mensaje WebSocket

### Aceptación de Transferencia
```json
{
  "channel": "notification",
  "action": "transfer-accepted",
  "type": "TICKET_TRANSFER_ACCEPTED",
  "status": "transfer-accepted",
  "recipientId": "user-456",
  "recipientName": "Juan Pérez",
  "recipientUsername": "juanperez",
  "recipientAvatar": "https://avatar-url.jpg",
  "ticketCount": 1,
  "eventName": "Concierto Rock 2026",
  "eventImage": "https://event-image.jpg",
  "eventDate": "2026-03-15T20:00:00Z",
  "transferId": "ticket-123",
  "ticketId": "ticket-123",
  "timestamp": "2026-01-14T10:30:00.000Z"
}
```

### Rechazo de Transferencia
```json
{
  "channel": "notification",
  "action": "transfer-rejected",
  "type": "TICKET_TRANSFER_REJECTED",
  "status": "transfer-rejected",
  "recipientId": "user-456",
  "recipientName": "Juan Pérez",
  "recipientUsername": "juanperez",
  "recipientAvatar": "https://avatar-url.jpg",
  "ticketCount": 1,
  "eventName": "Concierto Rock 2026",
  "eventImage": "https://event-image.jpg",
  "eventDate": "2026-03-15T20:00:00Z",
  "transferId": "ticket-123",
  "ticketId": "ticket-123",
  "timestamp": "2026-01-14T10:30:00.000Z"
}
```

---

## 🔄 Flujo Completo

### Escenario: Usuario B acepta transferencia de Usuario A

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario B llama: POST /tickets/transfer/accept          │
│    Body: { ticketID, userID }                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Backend valida transferencia pendiente                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Actualiza ticket en DynamoDB                              │
│    - user_id: B                                              │
│    - status: ACTIVE                                          │
│    - transfer_history: registro                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 🔥 ENVÍA WEBSOCKET A USUARIO A (remitente)               │
│    - Busca connectionId en UserChannels                     │
│    - Envía mensaje via API Gateway                          │
│    - Log: ✅ WebSocket enviado exitosamente                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Usuario A (si está online) recibe mensaje en tiempo real │
│    - Frontend detecta mensaje                                │
│    - Navega a TransferSuccess screen                         │
│    - Actualiza lista de tickets                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Envía notificación push/email como respaldo              │
│    (por si usuario estaba offline)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Testing

### 1. Probar Aceptación

```bash
# Terminal 1: Conectar como Usuario A (remitente)
wscat -c "wss://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev?userId=user-a-123"

# Terminal 2: Hacer request como Usuario B (receptor)
curl -X POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer/accept \
  -H "Content-Type: application/json" \
  -d '{
    "ticketID": "test-ticket-123",
    "userID": "user-b-456"
  }'

# Terminal 1: Deberías ver el mensaje WebSocket
{
  "channel": "notification",
  "action": "transfer-accepted",
  "recipientName": "Usuario B",
  ...
}
```

### 2. Verificar Logs en CloudWatch

```bash
# Ver logs de acceptTransfer
aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-acceptTransfer --follow

# Deberías ver:
✅ WebSocket enviado exitosamente al usuario user-a-123
```

### 3. Verificar Tabla UserChannels

```bash
# Verificar que el usuario tiene connectionId activo
aws dynamodb get-item \
  --table-name UserChannels \
  --key '{"user_id": {"S": "user-a-123"}}'
```

---

## 📊 Variables de Entorno Configuradas

```yaml
WEBSOCKET_ENDPOINT: https://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev
NOTIFICATIONS_API: https://q4b7qzgxyi.execute-api.us-east-1.amazonaws.com/dev/notifications/trigger
```

---

## 🔐 Permisos IAM Agregados

```yaml
# DynamoDB - UserChannels (conexiones WebSocket)
- arn:aws:dynamodb:us-east-1:519010577666:table/UserChannels
- arn:aws:dynamodb:us-east-1:519010577666:table/UserChannels/index/*

# DynamoDB - usuarios (datos de usuarios)
- arn:aws:dynamodb:us-east-1:519010577666:table/usuarios

# API Gateway WebSocket
- Effect: Allow
  Action:
    - execute-api:ManageConnections
    - execute-api:Invoke
  Resource: arn:aws:execute-api:us-east-1:519010577666:cfd0fj86j9/*
```

---

## 📈 Ventajas de la Implementación

✅ **Notificación instantánea** - Usuario A recibe respuesta en < 1 segundo
✅ **No bloquea el flujo** - Si WebSocket falla, el ticket se transfiere igual
✅ **Fallback automático** - Notificaciones push/email como respaldo
✅ **Manejo de errores robusto** - Limpia conexiones obsoletas automáticamente
✅ **Debugging fácil** - Logs detallados en cada paso
✅ **Reutilizable** - Helper puede usarse para otras notificaciones

---

## 🎯 Resultado Final

### Antes (sin WebSocket)
```
Usuario B acepta → Backend actualiza → Usuario A NO se entera
└─ Debe refrescar manualmente o esperar notificación push (varios segundos)
```

### Ahora (con WebSocket)
```
Usuario B acepta → Backend actualiza → WebSocket → Usuario A recibe INSTANTÁNEAMENTE
└─ Navegación automática a pantalla de éxito en < 1 segundo
```

---

## 🚀 Deployment Exitoso

```bash
✔ Service deployed to stack aws-lambda-orders-manageTickets-dev (94s)

Functions actualizadas:
  ✅ acceptTransfer: aws-lambda-orders-manageTickets-dev-acceptTransfer (20 MB)
  ✅ rejectTransfer: aws-lambda-orders-manageTickets-dev-rejectTransfer (20 MB)

Endpoints activos:
  ✅ POST /tickets/transfer/accept
  ✅ POST /tickets/transfer/reject
```

---

## 📚 Documentación Relacionada

- **Frontend Implementation**: `FRONTEND_IMPLEMENTATION_GUIDE.md`
- **Technical Flow**: `TICKET_TRANSFER_FLOW.md`
- **WebSocket Guide**: Documentos adjuntos por el usuario

---

## ✅ Checklist de Verificación

- [x] Helper de WebSocket creado
- [x] acceptTransfer.js modificado con WebSocket
- [x] rejectTransfer.js modificado con WebSocket
- [x] Variables de entorno agregadas
- [x] Permisos IAM configurados
- [x] Código desplegado en AWS
- [x] Sin errores de compilación
- [x] Logs configurados para debugging

---

## 🎉 ¡Implementación Completa!

El sistema de transferencia de boletas ahora incluye:

1. ✅ **Notificaciones en tiempo real via WebSocket**
2. ✅ **Notificaciones push/email como respaldo**
3. ✅ **Actualización automática de estados**
4. ✅ **Historial de transferencias completo**
5. ✅ **Manejo robusto de errores**

**Todo listo para probar en el frontend** 🚀
