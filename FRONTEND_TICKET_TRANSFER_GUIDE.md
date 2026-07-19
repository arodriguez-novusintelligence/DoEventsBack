# Guía de Implementación Frontend - Transferencia de Boletas

## 📋 Índice
1. [Información del Endpoint](#información-del-endpoint)
2. [Formato del Request](#formato-del-request)
3. [Respuestas del Backend](#respuestas-del-backend)
4. [Implementación Frontend Paso a Paso](#implementación-frontend-paso-a-paso)
5. [Manejo de Errores](#manejo-de-errores)
6. [Integración WebSocket](#integración-websocket)
7. [Ejemplos de Código Completos](#ejemplos-de-código-completos)
8. [Casos de Uso](#casos-de-uso)
9. [Testing](#testing)

---

## Información del Endpoint

### Endpoint URL
```
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer
```

### Headers Requeridos
```javascript
{
  "Content-Type": "application/json",
  // Incluir token de autenticación si aplica
  "Authorization": "Bearer YOUR_TOKEN"
}
```

---

## Formato del Request

### Parámetros Requeridos

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `ticketID` o `ticketIDs` | string o string[] | ✅ Sí | ID del ticket o array de IDs |
| `newUserID` | string | ✅ Sí | ID del usuario que recibirá las boletas |
| `currentUserID` | string | ✅ Sí | ID del usuario que está transfiriendo |
| `orderID` | string | ❌ No | ID de la orden (opcional, se obtiene del ticket) |

### Ejemplos de Payload Válidos

#### Opción 1: Transferir UN solo ticket (singular)
```json
{
  "ticketID": "TICKET_abc123xyz",
  "newUserID": "user_receptor_789",
  "currentUserID": "user_remitente_456"
}
```

#### Opción 2: Transferir UN solo ticket (array)
```json
{
  "ticketIDs": ["TICKET_abc123xyz"],
  "newUserID": "user_receptor_789",
  "currentUserID": "user_remitente_456"
}
```

#### Opción 3: Transferir MÚLTIPLES tickets
```json
{
  "ticketIDs": ["TICKET_001", "TICKET_002", "TICKET_003"],
  "newUserID": "user_receptor_789",
  "currentUserID": "user_remitente_456"
}
```

#### Opción 4: Con orderID explícito (opcional)
```json
{
  "ticketID": "TICKET_abc123xyz",
  "newUserID": "user_receptor_789",
  "currentUserID": "user_remitente_456",
  "orderID": "ORD_original_123"
}
```

---

## Respuestas del Backend

### ✅ Respuesta Exitosa (200)

```json
{
  "message": "Boletas transferidas exitosamente",
  "transferredTickets": 2,
  "originalOrderID": "ORD_remitente_123",
  "newOrderID": "ORD_receptor_456",
  "recipient": {
    "userId": "user_receptor_789",
    "name": "Juan Pérez"
  }
}
```

### ❌ Respuestas de Error

#### Error 400: Parámetros faltantes
```json
{
  "message": "ticketIDs debe ser un array con al menos un ticket, o enviar ticketID"
}
```

#### Error 400: Orden no aprobada
```json
{
  "message": "No se pueden transferir boletas de una orden no aprobada. Estado actual: pending",
  "currentStatus": "pending"
}
```

#### Error 403: Sin permisos
```json
{
  "message": "No tienes permiso para transferir el ticket TICKET_123"
}
```

#### Error 404: Ticket no encontrado
```json
{
  "message": "Ticket TICKET_123 no encontrado"
}
```

#### Error 404: Usuario receptor no existe
```json
{
  "message": "El usuario receptor con ID user_999 no existe",
  "receiverUserId": "user_999"
}
```

#### Error 500: Error interno
```json
{
  "message": "Error interno",
  "detail": "Descripción técnica del error"
}
```

---

## Implementación Frontend Paso a Paso

### 1. Función Base de Transferencia

```javascript
/**
 * Transfiere tickets a otro usuario
 * @param {string|string[]} ticketIDs - ID del ticket o array de IDs
 * @param {string} newUserID - ID del usuario receptor
 * @param {string} currentUserID - ID del usuario actual (remitente)
 * @param {string} [orderID] - ID de la orden (opcional)
 * @returns {Promise<Object>} Resultado de la transferencia
 */
async function transferTickets(ticketIDs, newUserID, currentUserID, orderID = null) {
  const endpoint = 'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer';
  
  // Normalizar ticketIDs - aceptar string o array
  const payload = {
    currentUserID,
    newUserID
  };
  
  // Decidir si enviar ticketID (singular) o ticketIDs (array)
  if (Array.isArray(ticketIDs)) {
    payload.ticketIDs = ticketIDs;
  } else {
    payload.ticketID = ticketIDs; // Enviar como singular si es un string
  }
  
  // Agregar orderID si fue proporcionado
  if (orderID) {
    payload.orderID = orderID;
  }
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Agregar token de autenticación si aplica
        // 'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw {
        status: response.status,
        ...data
      };
    }
    
    return {
      success: true,
      data
    };
    
  } catch (error) {
    console.error('Error al transferir tickets:', error);
    return {
      success: false,
      error
    };
  }
}
```

### 2. Componente React de Transferencia

```jsx
import React, { useState } from 'react';

function TicketTransferModal({ ticket, onClose, onSuccess }) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleTransfer = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. Buscar usuario receptor por email (endpoint separado)
      const recipientUser = await findUserByEmail(recipientEmail);
      
      if (!recipientUser) {
        setError('Usuario no encontrado. Verifica el email.');
        setIsLoading(false);
        return;
      }
      
      // 2. Ejecutar transferencia
      const result = await transferTickets(
        ticket.ticket_id,           // ticketID singular
        recipientUser.user_id,      // newUserID
        getCurrentUserId()          // currentUserID
      );
      
      if (result.success) {
        // 3. Mostrar mensaje de éxito
        showSuccessNotification(
          `Has transferido ${result.data.transferredTickets} boleta(s) a ${result.data.recipient.name}`
        );
        
        // 4. Llamar callback de éxito
        onSuccess(result.data);
        
        // 5. Cerrar modal
        onClose();
        
      } else {
        // Manejar error
        handleTransferError(result.error);
      }
      
    } catch (err) {
      setError('Error inesperado al transferir');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleTransferError = (error) => {
    switch (error.status) {
      case 400:
        if (error.currentStatus) {
          setError(`No se puede transferir. La orden está en estado: ${error.currentStatus}`);
        } else {
          setError(error.message || 'Datos inválidos');
        }
        break;
        
      case 403:
        setError('No tienes permiso para transferir esta boleta');
        break;
        
      case 404:
        if (error.receiverUserId) {
          setError('El usuario receptor no existe en el sistema');
        } else {
          setError('Boleta no encontrada');
        }
        break;
        
      case 500:
        setError('Error del servidor. Intenta nuevamente');
        break;
        
      default:
        setError(error.message || 'Error al transferir');
    }
  };
  
  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Transferir Boleta</h2>
        
        <div className="ticket-info">
          <p><strong>Evento:</strong> {ticket.event_name}</p>
          <p><strong>Ticket ID:</strong> {ticket.ticket_id}</p>
        </div>
        
        <div className="form-group">
          <label>Email del receptor:</label>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="ejemplo@email.com"
            disabled={isLoading}
          />
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="modal-actions">
          <button 
            onClick={handleTransfer}
            disabled={isLoading || !recipientEmail}
            className="btn-primary"
          >
            {isLoading ? 'Transfiriendo...' : 'Transferir Boleta'}
          </button>
          
          <button 
            onClick={onClose}
            disabled={isLoading}
            className="btn-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default TicketTransferModal;
```

### 3. Transferencia Múltiple (seleccionar varios tickets)

```jsx
function MultiTicketTransfer({ tickets, onSuccess }) {
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const handleSelectTicket = (ticketId) => {
    setSelectedTickets(prev => {
      if (prev.includes(ticketId)) {
        return prev.filter(id => id !== ticketId);
      }
      return [...prev, ticketId];
    });
  };
  
  const handleTransferMultiple = async () => {
    if (selectedTickets.length === 0) {
      alert('Selecciona al menos una boleta');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const recipientUser = await findUserByEmail(recipientEmail);
      
      if (!recipientUser) {
        alert('Usuario no encontrado');
        setIsLoading(false);
        return;
      }
      
      // Transferir múltiples tickets
      const result = await transferTickets(
        selectedTickets,            // Array de ticket IDs
        recipientUser.user_id,
        getCurrentUserId()
      );
      
      if (result.success) {
        alert(`${result.data.transferredTickets} boletas transferidas exitosamente`);
        onSuccess(result.data);
      } else {
        alert(`Error: ${result.error.message}`);
      }
      
    } catch (err) {
      alert('Error al transferir boletas');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="multi-transfer">
      <h3>Selecciona las boletas a transferir</h3>
      
      <div className="ticket-list">
        {tickets.map(ticket => (
          <div key={ticket.ticket_id} className="ticket-item">
            <input
              type="checkbox"
              checked={selectedTickets.includes(ticket.ticket_id)}
              onChange={() => handleSelectTicket(ticket.ticket_id)}
            />
            <span>{ticket.event_name} - {ticket.seat_number}</span>
          </div>
        ))}
      </div>
      
      <input
        type="email"
        placeholder="Email del receptor"
        value={recipientEmail}
        onChange={(e) => setRecipientEmail(e.target.value)}
      />
      
      <button 
        onClick={handleTransferMultiple}
        disabled={isLoading || selectedTickets.length === 0}
      >
        Transferir {selectedTickets.length} boleta(s)
      </button>
    </div>
  );
}
```

---

## Manejo de Errores

### Matriz de Errores y Soluciones

| Código | Causa | Mensaje Usuario | Acción Recomendada |
|--------|-------|-----------------|-------------------|
| 400 | Falta ticketID | "Selecciona una boleta" | Validar antes de enviar |
| 400 | Orden no aprobada | "Orden pendiente de pago" | Mostrar estado de orden |
| 400 | Ticket inactivo | "Boleta no disponible" | Refrescar lista |
| 403 | No es propietario | "No tienes permiso" | Ocultar botón transferir |
| 404 | Ticket no existe | "Boleta no encontrada" | Refrescar lista |
| 404 | Usuario no existe | "Usuario receptor no encontrado" | Validar email |
| 500 | Error servidor | "Error temporal, intenta de nuevo" | Reintentar |

### Función Helper de Manejo de Errores

```javascript
function getErrorMessage(error) {
  const errorMap = {
    400: {
      default: 'Datos inválidos para la transferencia',
      currentStatus: (status) => `La orden está ${status}. Solo puedes transferir órdenes aprobadas.`
    },
    403: 'No tienes permiso para realizar esta transferencia',
    404: {
      receiverUserId: 'El usuario receptor no existe en DoEvents',
      default: 'Boleta o usuario no encontrado'
    },
    500: 'Error del servidor. Por favor intenta nuevamente en unos minutos'
  };
  
  const statusError = errorMap[error.status];
  
  if (!statusError) {
    return error.message || 'Error desconocido';
  }
  
  if (typeof statusError === 'string') {
    return statusError;
  }
  
  // Manejo especial de currentStatus (orden no aprobada)
  if (error.currentStatus && statusError.currentStatus) {
    return statusError.currentStatus(error.currentStatus);
  }
  
  // Manejo especial de receiverUserId (usuario no existe)
  if (error.receiverUserId && statusError.receiverUserId) {
    return statusError.receiverUserId;
  }
  
  return statusError.default || error.message;
}

// Uso:
const result = await transferTickets(...);
if (!result.success) {
  const userMessage = getErrorMessage(result.error);
  showToast(userMessage, 'error');
}
```

---

## Integración WebSocket

### Recibir Notificaciones en Tiempo Real

```javascript
// Configuración del WebSocket
const wsUrl = 'wss://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev';
let websocket = null;

function connectWebSocket(userId) {
  websocket = new WebSocket(`${wsUrl}?userId=${userId}`);
  
  websocket.onopen = () => {
    console.log('WebSocket conectado');
  };
  
  websocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleWebSocketNotification(message);
  };
  
  websocket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  websocket.onclose = () => {
    console.log('WebSocket desconectado');
    // Reconectar después de 3 segundos
    setTimeout(() => connectWebSocket(userId), 3000);
  };
}

function handleWebSocketNotification(message) {
  if (message.channel !== 'notification') return;
  
  switch (message.type) {
    case 'TICKET_TRANSFERRED_RECEIVED':
      // Usuario RECIBIÓ boletas
      showNotification({
        title: '🎫 Boletas recibidas',
        message: `${message.senderName} te ha transferido ${message.ticketCount} boleta(s) para ${message.eventName}`,
        action: {
          label: 'Ver boletas',
          onClick: () => navigateToOrder(message.orderID)
        }
      });
      
      // Actualizar contador de boletas
      refreshTicketCount();
      break;
      
    case 'TICKET_TRANSFERRED_SENT':
      // Usuario ENVIÓ boletas
      showNotification({
        title: '✅ Transferencia completada',
        message: `Has transferido ${message.ticketCount} boleta(s) a ${message.receiverName}`,
      });
      
      // Actualizar lista de boletas
      refreshTicketList();
      break;
  }
}

// Inicializar en el componente principal
useEffect(() => {
  const userId = getCurrentUserId();
  if (userId) {
    connectWebSocket(userId);
  }
  
  return () => {
    if (websocket) {
      websocket.close();
    }
  };
}, []);
```

### Sistema de Notificaciones Toast

```javascript
function showNotification({ title, message, action, duration = 5000 }) {
  // Crear elemento de notificación
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div class="toast-content">
      <h4>${title}</h4>
      <p>${message}</p>
      ${action ? `<button class="toast-action">${action.label}</button>` : ''}
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Agregar evento al botón de acción
  if (action) {
    const button = toast.querySelector('.toast-action');
    button.onclick = () => {
      action.onClick();
      removeToast(toast);
    };
  }
  
  // Auto-remover después del tiempo especificado
  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.add('fade-out');
  setTimeout(() => toast.remove(), 300);
}
```

---

## Ejemplos de Código Completos

### Ejemplo Completo con Axios

```javascript
import axios from 'axios';

class TicketTransferService {
  constructor() {
    this.baseURL = 'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev';
    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  
  /**
   * Transferir uno o más tickets
   */
  async transfer({ ticketIDs, newUserID, currentUserID, orderID }) {
    try {
      const payload = { newUserID, currentUserID };
      
      // Normalizar ticketIDs
      if (Array.isArray(ticketIDs)) {
        payload.ticketIDs = ticketIDs;
      } else {
        payload.ticketID = ticketIDs;
      }
      
      if (orderID) {
        payload.orderID = orderID;
      }
      
      const response = await this.api.post('/tickets/transfer', payload);
      
      return {
        success: true,
        data: response.data
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
          ...error.response?.data
        }
      };
    }
  }
  
  /**
   * Verificar si un ticket puede ser transferido
   */
  async canTransfer(ticketId, userId) {
    try {
      // Obtener detalles del ticket
      const response = await this.api.get(`/tickets/${ticketId}`);
      const ticket = response.data;
      
      // Validaciones locales
      if (ticket.user_id !== userId) {
        return { canTransfer: false, reason: 'No eres el propietario' };
      }
      
      if (ticket.status !== 'ACTIVE') {
        return { canTransfer: false, reason: `Estado: ${ticket.status}` };
      }
      
      // Verificar estado de la orden
      const orderResponse = await this.api.get(`/orders/${ticket.order_id}`);
      const order = orderResponse.data;
      
      if (order.status !== 'approved') {
        return { canTransfer: false, reason: `Orden ${order.status}` };
      }
      
      return { canTransfer: true };
      
    } catch (error) {
      return { 
        canTransfer: false, 
        reason: 'Error al verificar' 
      };
    }
  }
}

// Uso:
const transferService = new TicketTransferService();

async function handleTicketTransfer(ticketId, recipientEmail) {
  // 1. Buscar usuario por email
  const recipient = await findUserByEmail(recipientEmail);
  if (!recipient) {
    alert('Usuario no encontrado');
    return;
  }
  
  // 2. Verificar si se puede transferir
  const check = await transferService.canTransfer(ticketId, getCurrentUserId());
  if (!check.canTransfer) {
    alert(`No se puede transferir: ${check.reason}`);
    return;
  }
  
  // 3. Confirmar con el usuario
  const confirmed = confirm(`¿Transferir boleta a ${recipient.name}?`);
  if (!confirmed) return;
  
  // 4. Ejecutar transferencia
  const result = await transferService.transfer({
    ticketIDs: ticketId,
    newUserID: recipient.user_id,
    currentUserID: getCurrentUserId()
  });
  
  // 5. Manejar resultado
  if (result.success) {
    alert('Boleta transferida exitosamente');
    window.location.reload(); // O actualizar lista
  } else {
    alert(`Error: ${result.error.message}`);
  }
}
```

### Ejemplo con React Hook Personalizado

```javascript
import { useState, useCallback } from 'react';

function useTicketTransfer() {
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [transferSuccess, setTransferSuccess] = useState(null);
  
  const transfer = useCallback(async ({ ticketIDs, recipientId, currentUserId }) => {
    setIsTransferring(true);
    setTransferError(null);
    setTransferSuccess(null);
    
    try {
      const response = await fetch(
        'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketIDs: Array.isArray(ticketIDs) ? ticketIDs : [ticketIDs],
            newUserID: recipientId,
            currentUserID: currentUserId
          })
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw data;
      }
      
      setTransferSuccess(data);
      return { success: true, data };
      
    } catch (error) {
      setTransferError(error);
      return { success: false, error };
      
    } finally {
      setIsTransferring(false);
    }
  }, []);
  
  const reset = useCallback(() => {
    setTransferError(null);
    setTransferSuccess(null);
  }, []);
  
  return {
    transfer,
    isTransferring,
    transferError,
    transferSuccess,
    reset
  };
}

// Uso en componente:
function TicketCard({ ticket }) {
  const { transfer, isTransferring, transferError, transferSuccess } = useTicketTransfer();
  const [showTransferModal, setShowTransferModal] = useState(false);
  
  const handleTransfer = async (recipientEmail) => {
    const recipient = await findUserByEmail(recipientEmail);
    
    const result = await transfer({
      ticketIDs: ticket.ticket_id,
      recipientId: recipient.user_id,
      currentUserId: getCurrentUserId()
    });
    
    if (result.success) {
      setShowTransferModal(false);
      alert('Boleta transferida exitosamente');
    }
  };
  
  return (
    <div className="ticket-card">
      <h3>{ticket.event_name}</h3>
      
      <button onClick={() => setShowTransferModal(true)}>
        Transferir
      </button>
      
      {showTransferModal && (
        <TransferModal
          onTransfer={handleTransfer}
          onClose={() => setShowTransferModal(false)}
          isLoading={isTransferring}
          error={transferError}
        />
      )}
    </div>
  );
}
```

---

## Casos de Uso

### Caso 1: Transferir una boleta desde detalle de ticket

```javascript
// En la página de detalles del ticket
function TicketDetailPage({ ticketId }) {
  const [ticket, setTicket] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  
  // Cargar ticket
  useEffect(() => {
    loadTicket(ticketId).then(setTicket);
  }, [ticketId]);
  
  const handleTransferClick = () => {
    // Verificar que la orden esté aprobada antes de mostrar modal
    if (ticket.order_status !== 'approved') {
      alert('Solo puedes transferir boletas de órdenes aprobadas');
      return;
    }
    setShowTransferModal(true);
  };
  
  return (
    <div>
      <h1>{ticket?.event_name}</h1>
      
      {ticket?.order_status === 'approved' && (
        <button onClick={handleTransferClick}>
          Transferir Boleta
        </button>
      )}
      
      {ticket?.order_status !== 'approved' && (
        <p className="warning">
          Esta boleta no puede ser transferida (orden {ticket?.order_status})
        </p>
      )}
    </div>
  );
}
```

### Caso 2: Transferir múltiples boletas desde "Mis Boletas"

```javascript
function MyTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [isTransferMode, setIsTransferMode] = useState(false);
  
  const toggleTicketSelection = (ticketId) => {
    setSelectedTickets(prev => 
      prev.includes(ticketId) 
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };
  
  const handleBulkTransfer = async (recipientEmail) => {
    if (selectedTickets.length === 0) {
      alert('Selecciona al menos una boleta');
      return;
    }
    
    const recipient = await findUserByEmail(recipientEmail);
    
    const result = await transferTickets(
      selectedTickets,
      recipient.user_id,
      getCurrentUserId()
    );
    
    if (result.success) {
      alert(`${result.data.transferredTickets} boletas transferidas`);
      setSelectedTickets([]);
      setIsTransferMode(false);
      refreshTickets();
    } else {
      alert(getErrorMessage(result.error));
    }
  };
  
  return (
    <div>
      <div className="header">
        <h1>Mis Boletas</h1>
        {tickets.length > 0 && (
          <button onClick={() => setIsTransferMode(!isTransferMode)}>
            {isTransferMode ? 'Cancelar' : 'Transferir Múltiples'}
          </button>
        )}
      </div>
      
      {isTransferMode && (
        <div className="transfer-info">
          <p>{selectedTickets.length} boletas seleccionadas</p>
          <button onClick={() => handleBulkTransfer(prompt('Email del receptor:'))}>
            Transferir Seleccionadas
          </button>
        </div>
      )}
      
      <div className="ticket-grid">
        {tickets.map(ticket => (
          <TicketCard
            key={ticket.ticket_id}
            ticket={ticket}
            isSelectable={isTransferMode}
            isSelected={selectedTickets.includes(ticket.ticket_id)}
            onSelect={() => toggleTicketSelection(ticket.ticket_id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### Caso 3: Transferir desde un botón de acción rápida

```javascript
function QuickTransferButton({ ticket }) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleQuickTransfer = async () => {
    if (!recipientEmail) {
      alert('Ingresa un email');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const recipient = await findUserByEmail(recipientEmail);
      
      if (!recipient) {
        alert('Usuario no encontrado');
        return;
      }
      
      const result = await transferTickets(
        ticket.ticket_id,
        recipient.user_id,
        getCurrentUserId()
      );
      
      if (result.success) {
        alert('Boleta transferida');
        setShowInput(false);
        setRecipientEmail('');
        window.location.reload();
      } else {
        alert(getErrorMessage(result.error));
      }
      
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!showInput) {
    return (
      <button 
        className="quick-transfer-btn"
        onClick={() => setShowInput(true)}
      >
        Transferir
      </button>
    );
  }
  
  return (
    <div className="quick-transfer-input">
      <input
        type="email"
        placeholder="Email del receptor"
        value={recipientEmail}
        onChange={(e) => setRecipientEmail(e.target.value)}
        autoFocus
      />
      <button 
        onClick={handleQuickTransfer}
        disabled={isLoading}
      >
        {isLoading ? '...' : 'Enviar'}
      </button>
      <button onClick={() => setShowInput(false)}>
        ✕
      </button>
    </div>
  );
}
```

---

## Testing

### Test Manual con cURL

```bash
# Test 1: Transferir un ticket
curl -X POST \
  https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer \
  -H 'Content-Type: application/json' \
  -d '{
    "ticketID": "TICKET_abc123",
    "newUserID": "user_receptor_789",
    "currentUserID": "user_actual_456"
  }'

# Test 2: Transferir múltiples tickets
curl -X POST \
  https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer \
  -H 'Content-Type: application/json' \
  -d '{
    "ticketIDs": ["TICKET_001", "TICKET_002"],
    "newUserID": "user_receptor_789",
    "currentUserID": "user_actual_456"
  }'

# Test 3: Error - ticket no encontrado
curl -X POST \
  https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer \
  -H 'Content-Type: application/json' \
  -d '{
    "ticketID": "TICKET_NOEXISTE",
    "newUserID": "user_receptor_789",
    "currentUserID": "user_actual_456"
  }'
```

### Test con Postman

```javascript
// Pre-request Script
pm.environment.set("currentUserId", "user_actual_123");
pm.environment.set("recipientUserId", "user_receptor_456");

// Request Body
{
  "ticketID": "{{ticketId}}",
  "newUserID": "{{recipientUserId}}",
  "currentUserID": "{{currentUserId}}"
}

// Tests
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has success message", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.eql("Boletas transferidas exitosamente");
});

pm.test("Transferred tickets count matches", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.transferredTickets).to.be.above(0);
});
```

### Unit Tests (Jest)

```javascript
import { transferTickets } from './ticketService';

describe('transferTickets', () => {
  it('should transfer a single ticket successfully', async () => {
    const result = await transferTickets(
      'TICKET_123',
      'user_recipient',
      'user_sender'
    );
    
    expect(result.success).toBe(true);
    expect(result.data.transferredTickets).toBe(1);
  });
  
  it('should transfer multiple tickets', async () => {
    const result = await transferTickets(
      ['TICKET_001', 'TICKET_002'],
      'user_recipient',
      'user_sender'
    );
    
    expect(result.success).toBe(true);
    expect(result.data.transferredTickets).toBe(2);
  });
  
  it('should handle non-approved order error', async () => {
    const result = await transferTickets(
      'TICKET_PENDING',
      'user_recipient',
      'user_sender'
    );
    
    expect(result.success).toBe(false);
    expect(result.error.status).toBe(400);
    expect(result.error.currentStatus).toBe('pending');
  });
  
  it('should handle non-existent ticket', async () => {
    const result = await transferTickets(
      'TICKET_NOEXISTE',
      'user_recipient',
      'user_sender'
    );
    
    expect(result.success).toBe(false);
    expect(result.error.status).toBe(404);
  });
});
```

---

## Checklist de Implementación

### Backend (Ya implementado ✅)
- [x] Endpoint POST /tickets/transfer
- [x] Validación de orden aprobada
- [x] Soporte para ticketID singular y ticketIDs array
- [x] orderID opcional (se obtiene del ticket)
- [x] Crear nueva orden para receptor
- [x] Actualizar propiedad de tickets
- [x] Notificaciones a ambos usuarios (remitente y receptor)
- [x] WebSocket en tiempo real
- [x] Historial de transferencias

### Frontend (Por implementar)
- [ ] Función `transferTickets()` base
- [ ] Componente modal de transferencia
- [ ] Búsqueda de usuario por email
- [ ] Validación pre-transferencia (orden aprobada)
- [ ] Manejo de errores con mensajes amigables
- [ ] Sistema de notificaciones toast
- [ ] Integración WebSocket para notificaciones en tiempo real
- [ ] Actualización de UI después de transferencia
- [ ] Opción de transferencia múltiple
- [ ] Botón de acción rápida
- [ ] Tests unitarios

### Recomendaciones Adicionales
- [ ] Agregar confirmación antes de transferir
- [ ] Mostrar preview del receptor (nombre, foto)
- [ ] Historial de transferencias en perfil
- [ ] Notificación por email (ya implementado en backend)
- [ ] Límite de transferencias por día (opcional)
- [ ] Log de auditoría de transferencias

---

## Soporte y Contacto

**Endpoint:** `https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer`

**WebSocket:** `wss://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev`

**Región:** us-east-1

**Stage:** dev

**Última actualización:** 2026-01-19

---

## Resumen Rápido

### Lo Mínimo Necesario

```javascript
// 1. Función de transferencia
async function transferTicket(ticketId, recipientUserId, currentUserId) {
  const response = await fetch(
    'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketID: ticketId,
        newUserID: recipientUserId,
        currentUserID: currentUserId
      })
    }
  );
  return response.json();
}

// 2. Usar en componente
const result = await transferTicket(
  'TICKET_123',
  recipientUser.user_id,
  getCurrentUser().user_id
);

if (result.message === 'Boletas transferidas exitosamente') {
  alert('Transferencia exitosa');
  window.location.reload();
} else {
  alert('Error: ' + result.message);
}
```

Esto es todo lo que necesitas para implementar la transferencia de boletas en tu frontend! 🚀
