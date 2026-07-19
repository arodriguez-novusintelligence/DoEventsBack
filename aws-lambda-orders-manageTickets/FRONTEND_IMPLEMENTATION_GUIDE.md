# Guía de Implementación Frontend - Transferencia de Boletas

## Resumen
El nuevo flujo de transferencia de boletas requiere que el receptor acepte o rechace explícitamente la transferencia antes de completarse.

## 📡 Endpoints API

**Base URL**: `https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev`

### 1. Iniciar Transferencia
```http
POST /tickets/transfer
Content-Type: application/json

{
  "ticketID": "uuid-del-ticket",
  "newUserID": "uuid-del-receptor",
  "currentUserID": "uuid-del-propietario-actual"
}
```

**Respuesta exitosa (200)**:
```json
{
  "message": "Solicitud de transferencia enviada exitosamente",
  "ticketID": "abc-123",
  "status": "PENDING_TRANSFER",
  "recipient": "user-456"
}
```

**Errores comunes**:
- `400`: Faltan parámetros requeridos
- `403`: El usuario no es el propietario del ticket
- `404`: Ticket no encontrado

---

### 2. Aceptar Transferencia
```http
POST /tickets/transfer/accept
Content-Type: application/json

{
  "ticketID": "uuid-del-ticket",
  "userID": "uuid-del-receptor"
}
```

**Respuesta exitosa (200)**:
```json
{
  "message": "Transferencia aceptada exitosamente",
  "ticketID": "abc-123",
  "newOwner": "user-456",
  "status": "ACTIVE"
}
```

**Errores comunes**:
- `400`: El ticket no está en estado PENDING_TRANSFER
- `403`: El usuario no es el destinatario de la transferencia
- `404`: Ticket no encontrado

---

### 3. Rechazar Transferencia
```http
POST /tickets/transfer/reject
Content-Type: application/json

{
  "ticketID": "uuid-del-ticket",
  "userID": "uuid-del-receptor"
}
```

**Respuesta exitosa (200)**:
```json
{
  "message": "Transferencia rechazada exitosamente",
  "ticketID": "abc-123",
  "returnedTo": "user-123",
  "status": "ACTIVE"
}
```

---

## 🎨 UI/UX Sugerido

### 1. Vista de Mis Tickets
Agregar indicador visual para tickets con estado `PENDING_TRANSFER`:

```jsx
// Ejemplo de componente React
function TicketCard({ ticket }) {
  if (ticket.status === 'PENDING_TRANSFER') {
    return (
      <div className="ticket-card pending">
        <div className="status-badge">⏳ Transferencia Pendiente</div>
        <p>Esperando respuesta de {ticket.pending_transfer.to_user_name}</p>
      </div>
    );
  }
  
  return <div className="ticket-card active">...</div>;
}
```

### 2. Notificaciones In-App
Las notificaciones de tipo `TICKET_TRANSFER_REQUEST` incluyen acciones interactivas:

```javascript
// Estructura de la notificación in-app
{
  "notification_id": "notif-123",
  "type": "ticket_transfer",
  "title": "Transferencia de boleta: Concierto XYZ",
  "body": "Juan Pérez quiere transferirte una boleta para este evento",
  "metadata": {
    "ticketId": "ticket-456",
    "eventId": "event-789",
    "eventName": "Concierto XYZ",
    "senderName": "Juan Pérez",
    "actions": [
      {
        "type": "accept",
        "label": "Aceptar",
        "action": "ACCEPT_TICKET_TRANSFER",
        "data": { "ticketId": "ticket-456" }
      },
      {
        "type": "reject",
        "label": "Rechazar",
        "action": "REJECT_TICKET_TRANSFER",
        "data": { "ticketId": "ticket-456" }
      }
    ]
  },
  "created_at": "2026-01-14T10:00:00Z",
  "read": false
}
```

**Componente de notificación sugerido**:

```jsx
function TransferNotification({ notification }) {
  const [loading, setLoading] = useState(false);
  
  const handleAccept = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer/accept', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          ticketID: notification.metadata.ticketId,
          userID: currentUserId
        })
      });
      
      if (response.ok) {
        showSuccess('¡Boleta aceptada exitosamente!');
        // Actualizar lista de tickets
        refreshTickets();
        // Marcar notificación como leída
        markAsRead(notification.notification_id);
      }
    } catch (error) {
      showError('Error al aceptar la transferencia');
    } finally {
      setLoading(false);
    }
  };
  
  const handleReject = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer/reject', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          ticketID: notification.metadata.ticketId,
          userID: currentUserId
        })
      });
      
      if (response.ok) {
        showSuccess('Transferencia rechazada');
        markAsRead(notification.notification_id);
      }
    } catch (error) {
      showError('Error al rechazar la transferencia');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="notification transfer-request">
      <div className="notification-icon">🎫</div>
      <div className="notification-content">
        <h4>{notification.title}</h4>
        <p>{notification.body}</p>
        <div className="notification-actions">
          <button 
            onClick={handleAccept} 
            disabled={loading}
            className="btn-accept"
          >
            ✓ Aceptar
          </button>
          <button 
            onClick={handleReject} 
            disabled={loading}
            className="btn-reject"
          >
            ✗ Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 3. Modal de Confirmación para Transferir

```jsx
function TransferTicketModal({ ticket, onClose, onSuccess }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const handleTransfer = async () => {
    if (!selectedUser) {
      showError('Selecciona un usuario');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch('https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          ticketID: ticket.ticket_id,
          newUserID: selectedUser.user_id,
          currentUserID: currentUserId
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        showSuccess(`Solicitud enviada a ${selectedUser.name}`);
        onSuccess(data);
        onClose();
      } else {
        showError(data.message || 'Error al transferir');
      }
    } catch (error) {
      showError('Error al transferir la boleta');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Modal onClose={onClose}>
      <h2>Transferir Boleta</h2>
      <div className="event-info">
        <h3>{ticket.event_name}</h3>
        <p>Ticket ID: {ticket.ticket_id}</p>
      </div>
      
      <div className="user-selector">
        <label>Seleccionar destinatario:</label>
        <UserSearch 
          onSelect={setSelectedUser}
          placeholder="Buscar usuario..."
        />
        {selectedUser && (
          <div className="selected-user">
            <img src={selectedUser.avatar} alt={selectedUser.name} />
            <span>{selectedUser.name}</span>
          </div>
        )}
      </div>
      
      <div className="info-box">
        <p>ℹ️ El usuario recibirá una notificación y deberá aceptar la transferencia.</p>
        <p>Tu boleta quedará en estado pendiente hasta que el usuario responda.</p>
      </div>
      
      <div className="modal-actions">
        <button onClick={onClose} disabled={loading}>
          Cancelar
        </button>
        <button 
          onClick={handleTransfer} 
          disabled={loading || !selectedUser}
          className="btn-primary"
        >
          {loading ? 'Enviando...' : 'Transferir'}
        </button>
      </div>
    </Modal>
  );
}
```

### 4. Vista de Transferencias Pendientes

```jsx
function PendingTransfers() {
  const [pendingTransfers, setPendingTransfers] = useState([]);
  
  useEffect(() => {
    // Filtrar tickets con estado PENDING_TRANSFER
    const pending = tickets.filter(t => t.status === 'PENDING_TRANSFER');
    setPendingTransfers(pending);
  }, [tickets]);
  
  if (pendingTransfers.length === 0) {
    return null;
  }
  
  return (
    <div className="pending-transfers-section">
      <h3>⏳ Transferencias Pendientes ({pendingTransfers.length})</h3>
      <p className="subtitle">Esperando respuesta del destinatario</p>
      
      {pendingTransfers.map(ticket => (
        <div key={ticket.ticket_id} className="pending-transfer-card">
          <div className="event-thumbnail">
            <img src={ticket.event_image} alt={ticket.event_name} />
          </div>
          <div className="transfer-info">
            <h4>{ticket.event_name}</h4>
            <p>Enviado a: <strong>{ticket.pending_transfer.to_user_name}</strong></p>
            <p className="timestamp">
              {formatRelativeTime(ticket.transfer_requested_at)}
            </p>
          </div>
          <div className="transfer-status">
            <span className="status-badge pending">Pendiente</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔔 Manejo de Notificaciones Push

Cuando el usuario recibe una notificación push y hace tap:

```javascript
// Ejemplo con Firebase Cloud Messaging (FCM)
messaging.onMessage((payload) => {
  const notification = payload.data;
  
  if (notification.type === 'ticket_transfer') {
    // Mostrar notificación local con acciones
    showLocalNotification({
      title: notification.title,
      body: notification.body,
      actions: [
        { action: 'accept', title: 'Aceptar' },
        { action: 'reject', title: 'Rechazar' },
        { action: 'view', title: 'Ver detalles' }
      ],
      data: notification
    });
  }
});

// Manejar acciones de la notificación
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const notification = event.notification.data;
  
  if (action === 'accept') {
    // Llamar endpoint de aceptar
    acceptTransfer(notification.ticketId);
  } else if (action === 'reject') {
    // Llamar endpoint de rechazar
    rejectTransfer(notification.ticketId);
  } else {
    // Abrir la app en la sección de notificaciones
    clients.openWindow('/notifications');
  }
  
  event.notification.close();
});
```

---

## 📱 Estados del Ticket en UI

### Badges de Estado
```jsx
function TicketStatusBadge({ status }) {
  const statusConfig = {
    'ACTIVE': {
      label: 'Activo',
      color: 'green',
      icon: '✓'
    },
    'PENDING_TRANSFER': {
      label: 'Transferencia Pendiente',
      color: 'orange',
      icon: '⏳'
    },
    'CANCELLED': {
      label: 'Cancelado',
      color: 'red',
      icon: '✗'
    }
  };
  
  const config = statusConfig[status] || statusConfig['ACTIVE'];
  
  return (
    <span className={`badge badge-${config.color}`}>
      {config.icon} {config.label}
    </span>
  );
}
```

---

## 🎯 Flujo Completo en UI

### 1. Usuario A quiere transferir
```
Mis Tickets → [Ticket Card] → [Botón "Transferir"] 
  → Modal de selección de usuario 
  → Confirmar transferencia
  → Mostrar "Transferencia pendiente"
```

### 2. Usuario B recibe notificación
```
[Notificación Push/In-App] → "Juan te envió una boleta"
  → Botones: [Aceptar] [Rechazar]
  → Al hacer clic → Llamada al API
  → Actualizar lista de tickets
  → Mostrar confirmación
```

### 3. Usuario A recibe respuesta
```
[Notificación] → "María aceptó/rechazó tu transferencia"
  → Actualizar estado del ticket en la UI
  → Si aceptó: Remover de "Mis Tickets"
  → Si rechazó: Volver a estado "Activo"
```

---

## 🎨 CSS Sugerido

```css
/* Notificación de transferencia */
.notification.transfer-request {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.notification-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn-accept {
  background: #10b981;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  flex: 1;
}

.btn-accept:hover {
  background: #059669;
}

.btn-reject {
  background: #ef4444;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  flex: 1;
}

.btn-reject:hover {
  background: #dc2626;
}

/* Ticket pendiente */
.ticket-card.pending {
  border: 2px dashed #f59e0b;
  background: #fffbeb;
  position: relative;
}

.status-badge.pending {
  background: #f59e0b;
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

/* Transferencias pendientes */
.pending-transfers-section {
  background: #fef3c7;
  border-left: 4px solid #f59e0b;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.pending-transfer-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  padding: 12px;
  border-radius: 8px;
  margin-top: 12px;
}

.event-thumbnail {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.event-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.transfer-info {
  flex: 1;
}

.transfer-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
}

.transfer-info p {
  margin: 2px 0;
  font-size: 14px;
  color: #6b7280;
}

.timestamp {
  font-size: 12px;
  color: #9ca3af;
}
```

---

## 🔐 Consideraciones de Seguridad

1. **Validación de Usuario**: Siempre enviar el `currentUserID` o `userID` desde el token de autenticación, no confiar en el cliente
2. **Tokens JWT**: Incluir token de autorización en todas las peticiones
3. **Rate Limiting**: Implementar límite de transferencias por día/usuario
4. **Confirmación**: Mostrar modal de confirmación antes de aceptar/rechazar

---

## 📊 Analytics Sugeridos

Eventos a trackear:
```javascript
// Cuando se inicia una transferencia
analytics.track('ticket_transfer_initiated', {
  ticket_id: ticketId,
  event_id: eventId,
  recipient_id: recipientId
});

// Cuando se acepta
analytics.track('ticket_transfer_accepted', {
  ticket_id: ticketId,
  time_to_accept: timeInSeconds
});

// Cuando se rechaza
analytics.track('ticket_transfer_rejected', {
  ticket_id: ticketId,
  time_to_reject: timeInSeconds
});
```

---

## 🧪 Testing

### Test Cases Mínimos

1. ✅ Iniciar transferencia con usuario válido
2. ✅ Mostrar notificación al receptor
3. ✅ Aceptar transferencia exitosamente
4. ✅ Rechazar transferencia exitosamente
5. ✅ Validar que solo el receptor puede aceptar/rechazar
6. ✅ Actualizar UI después de cada acción
7. ✅ Manejo de errores de red
8. ✅ Estados de carga (loading states)

---

## 🚀 Checklist de Implementación

- [ ] Crear modal/componente para transferir ticket
- [ ] Implementar selector de usuario (búsqueda)
- [ ] Agregar badge de estado "PENDING_TRANSFER" en tickets
- [ ] Crear sección de "Transferencias Pendientes"
- [ ] Implementar componente de notificación in-app con botones
- [ ] Conectar botones de aceptar/rechazar a endpoints
- [ ] Agregar manejo de notificaciones push
- [ ] Implementar actualización automática de lista de tickets
- [ ] Agregar animaciones y transiciones
- [ ] Testing en diferentes dispositivos
- [ ] Manejo de errores y mensajes de feedback
- [ ] Analytics y tracking de eventos

---

## 📞 Soporte

Para más detalles técnicos, consultar:
- [TICKET_TRANSFER_FLOW.md](TICKET_TRANSFER_FLOW.md) - Documentación técnica completa
- Endpoint de notificaciones: `https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev`
- Endpoint de tickets: `https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev`
