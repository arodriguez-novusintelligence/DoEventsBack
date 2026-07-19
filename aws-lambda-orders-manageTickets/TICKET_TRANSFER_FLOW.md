# Flujo de Transferencia de Boletas - Documentación

## Resumen del Cambio

Se ha implementado un nuevo flujo de transferencia de boletas que requiere la aceptación explícita del receptor antes de completar la transferencia. Anteriormente, la transferencia era automática e inmediata.

## Estados de Ticket

### Nuevos Estados
- **`ACTIVE`**: Estado normal de un ticket activo
- **`PENDING_TRANSFER`**: Ticket en proceso de transferencia, esperando aceptación/rechazo
- **`TRANSFERRED`**: Se registra en el historial cuando se completa una transferencia

### Campos Adicionales en Ticket
```javascript
{
  ticket_id: "uuid",
  user_id: "current_owner_id",
  status: "PENDING_TRANSFER",
  
  // Nuevo: Información de transferencia pendiente
  pending_transfer: {
    from_user_id: "original_owner_id",
    to_user_id: "recipient_user_id",
    requested_at: "2026-01-14T10:00:00.000Z"
  },
  transfer_requested_at: "timestamp",
  
  // Nuevo: Historial de transferencias
  transfer_history: [
    {
      from_user_id: "user1",
      to_user_id: "user2",
      transferred_at: "timestamp",
      action: "ACCEPTED" // o "REJECTED"
    }
  ]
}
```

## Flujo de Transferencia

### 1. Iniciar Transferencia
**Endpoint**: `POST /tickets/transfer`

**Payload**:
```json
{
  "ticketID": "uuid-del-ticket",
  "newUserID": "uuid-del-receptor",
  "currentUserID": "uuid-del-propietario"
}
```

**Proceso**:
1. Valida que el ticket existe y pertenece a `currentUserID`
2. Valida que el ticket está en estado `ACTIVE`
3. Cambia el estado del ticket a `PENDING_TRANSFER`
4. Guarda información de transferencia en `pending_transfer`
5. Envía notificaciones al receptor (in-app, push, email, WhatsApp)

**Respuesta exitosa**:
```json
{
  "message": "Solicitud de transferencia enviada exitosamente",
  "ticketID": "uuid",
  "status": "PENDING_TRANSFER",
  "recipient": "uuid-del-receptor"
}
```

### 2. Aceptar Transferencia
**Endpoint**: `POST /tickets/transfer/accept`

**Payload**:
```json
{
  "ticketID": "uuid-del-ticket",
  "userID": "uuid-del-receptor"
}
```

**Proceso**:
1. Valida que el ticket está en estado `PENDING_TRANSFER`
2. Valida que `userID` coincide con `pending_transfer.to_user_id`
3. Cambia `user_id` del ticket al nuevo propietario
4. Cambia estado a `ACTIVE`
5. Registra la transferencia en `transfer_history`
6. Elimina campo `pending_transfer`
7. Notifica al propietario original (in-app, push)

**Respuesta exitosa**:
```json
{
  "message": "Transferencia aceptada exitosamente",
  "ticketID": "uuid",
  "newOwner": "uuid-del-receptor",
  "status": "ACTIVE"
}
```

### 3. Rechazar Transferencia
**Endpoint**: `POST /tickets/transfer/reject`

**Payload**:
```json
{
  "ticketID": "uuid-del-ticket",
  "userID": "uuid-del-receptor"
}
```

**Proceso**:
1. Valida que el ticket está en estado `PENDING_TRANSFER`
2. Valida que `userID` coincide con `pending_transfer.to_user_id`
3. Cambia estado a `ACTIVE` (mantiene propietario original)
4. Registra el rechazo en `transfer_history`
5. Elimina campo `pending_transfer`
6. Notifica al propietario original (in-app, push)

**Respuesta exitosa**:
```json
{
  "message": "Transferencia rechazada exitosamente",
  "ticketID": "uuid",
  "returnedTo": "uuid-del-propietario-original",
  "status": "ACTIVE"
}
```

## Notificaciones

### TICKET_TRANSFER_REQUEST
Enviada al receptor cuando alguien le transfiere un ticket.

**Canales**: in-app, push, email, whatsapp

**Metadata requerida**:
```javascript
{
  userId: "receptor_id",
  ticketId: "uuid",
  eventName: "Nombre del evento",
  eventDate: "2026-01-20",
  eventLocation: "Lugar del evento",
  senderName: "Nombre del remitente",
  senderUserId: "remitente_id",
  eventId: "event_uuid",
  eventImage: "url_imagen"
}
```

**Notificación in-app incluye acciones**:
```javascript
actions: [
  {
    type: "accept",
    label: "Aceptar",
    action: "ACCEPT_TICKET_TRANSFER",
    data: { ticketId: "uuid" }
  },
  {
    type: "reject",
    label: "Rechazar",
    action: "REJECT_TICKET_TRANSFER",
    data: { ticketId: "uuid" }
  }
]
```

### TICKET_TRANSFER_ACCEPTED
Enviada al propietario original cuando el receptor acepta.

**Canales**: in-app, push

**Metadata requerida**:
```javascript
{
  userId: "propietario_original_id",
  ticketId: "uuid",
  eventName: "Nombre del evento",
  receiverName: "Nombre del receptor",
  eventId: "event_uuid"
}
```

### TICKET_TRANSFER_REJECTED
Enviada al propietario original cuando el receptor rechaza.

**Canales**: in-app, push

**Metadata requerida**:
```javascript
{
  userId: "propietario_original_id",
  ticketId: "uuid",
  eventName: "Nombre del evento",
  receiverName: "Nombre del receptor",
  eventId: "event_uuid"
}
```

## Templates de Notificación

### Email
**Archivo**: `email/ticket_transfer_request.hbs`

Incluye:
- Información del evento
- Nombre del remitente
- Botones de aceptar/rechazar con enlaces directos

### WhatsApp
**Archivo**: `whatsapp/ticket_transfer_request.js`

**Template en Meta Business Suite**: `ticket_transfer_request`

**Estructura**:
- Header: Imagen del evento
- Body: "Hola {{userName}}! {{senderName}} quiere transferirte una boleta para el evento {{eventName}}. Ingresa a la app para aceptar o rechazar esta transferencia."
- Button: "Ver transferencia" → `https://doevents.com/tickets/transfer/{{ticketId}}`

## Diagrama de Flujo

```
┌─────────────────┐
│ Usuario A tiene │
│   ticket ACTIVE │
└────────┬────────┘
         │
         ▼
┌────────────────────────────┐
│ POST /tickets/transfer     │
│ ticketID, newUserID        │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│ Ticket → PENDING_TRANSFER  │
│ pending_transfer guardado  │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│ Notificaciones a Usuario B │
│ (in-app, push, email, WA)  │
└─────────┬──────────────────┘
          │
          ├──────────────┬──────────────┐
          ▼              ▼              ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │ Usuario │    │ Usuario │    │ Timeout │
    │ acepta  │    │ rechaza │    │ (futuro)│
    └────┬────┘    └────┬────┘    └─────────┘
         │              │
         ▼              ▼
┌──────────────┐  ┌──────────────┐
│ user_id → B  │  │ Mantiene     │
│ status:ACTIVE│  │ user_id = A  │
│ Notifica a A │  │ status:ACTIVE│
└──────────────┘  │ Notifica a A │
                  └──────────────┘
```

## Validaciones Implementadas

### En transferTicket:
- ✓ Ticket existe
- ✓ Ticket pertenece a currentUserID
- ✓ Ticket está en estado ACTIVE
- ✓ ticketID, newUserID y currentUserID son requeridos

### En acceptTransfer:
- ✓ Ticket existe
- ✓ Ticket está en estado PENDING_TRANSFER
- ✓ userID coincide con pending_transfer.to_user_id
- ✓ ticketID y userID son requeridos

### En rejectTransfer:
- ✓ Ticket existe
- ✓ Ticket está en estado PENDING_TRANSFER
- ✓ userID coincide con pending_transfer.to_user_id
- ✓ ticketID y userID son requeridos

## Archivos Modificados/Creados

### Servicio de Tickets (aws-lambda-orders-manageTickets)
1. **Modificado**: `src/ticket/transferTicket.js` - Nuevo flujo con estado pendiente
2. **Creado**: `src/ticket/acceptTransfer.js` - Endpoint para aceptar
3. **Creado**: `src/ticket/rejectTransfer.js` - Endpoint para rechazar
4. **Modificado**: `serverless.yml` - Agregados nuevos endpoints y variable NOTIFICATIONS_API
5. **Modificado**: `package.json` - Agregada dependencia axios

### Servicio de Notificaciones (aws-lambda-notifications)
1. **Creado**: `src/templates/email/ticket_transfer_request.hbs` - Template email
2. **Creado**: `src/templates/whatsapp/ticket_transfer_request.js` - Template WhatsApp
3. **Modificado**: `src/templates/index.js` - Agregados 3 templates:
   - `TICKET_TRANSFER_REQUEST`
   - `TICKET_TRANSFER_ACCEPTED`
   - `TICKET_TRANSFER_REJECTED`

## Próximos Pasos Sugeridos

1. **Frontend**: Implementar UI para:
   - Mostrar notificaciones in-app con botones de aceptar/rechazar
   - Vista de tickets pendientes de transferencia
   - Historial de transferencias

2. **Timeout automático**: Implementar lógica para:
   - Auto-rechazar transferencias después de X días
   - Notificar al propietario original cuando expire

3. **Tests**: Crear tests para:
   - Flujo completo de transferencia
   - Casos de error
   - Notificaciones

4. **Configuración WhatsApp**: 
   - Crear template `ticket_transfer_request` en Meta Business Suite
   - Configurar parámetros según especificación en el archivo .js

5. **Monitoring**: Agregar métricas para:
   - Tasas de aceptación/rechazo
   - Tiempo promedio de respuesta
   - Tickets en estado pending por mucho tiempo

## URLs de Ejemplo

- **Aceptar**: `https://app.doevents.com/tickets/transfer/{ticketId}/accept`
- **Rechazar**: `https://app.doevents.com/tickets/transfer/{ticketId}/reject`
- **Ver ticket**: `https://doevents.com/tickets/transfer/{ticketId}`

## Seguridad

- Todas las validaciones verifican que el usuario tiene permisos para realizar la acción
- Los IDs de usuarios se validan contra la base de datos
- Las notificaciones solo se envían a usuarios involucrados en la transferencia
- El historial de transferencias mantiene un audit trail completo
