# Solución Completa - Transferencia de Tickets Frontend

## 🚨 Problemas Identificados

Basado en el log proporcionado:
```
userId: ""  ❌ VACÍO
recipient.name: ""  ❌ VACÍO (solo tiene username: 'Jeix753688')
recipient.id: "42c2e4a4-2"  ✅ OK
```

---

## 🔧 Solución 1: Obtener userId Correctamente

### Opción A: Desde localStorage/sessionStorage

```typescript
// utils/auth.ts
export const getCurrentUserId = (): string | null => {
  // Intentar múltiples fuentes
  const sources = [
    localStorage.getItem('userId'),
    localStorage.getItem('user_id'),
    sessionStorage.getItem('userId'),
    sessionStorage.getItem('user_id')
  ];

  // Buscar el primer valor no nulo
  const userId = sources.find(id => id && id !== 'undefined' && id !== 'null');
  
  if (!userId) {
    console.error('❌ No se encontró userId en storage');
    return null;
  }

  return userId;
};

// Alternativa: Desde objeto user completo
export const getUserIdFromStorage = (): string | null => {
  try {
    // Intentar obtener de objeto user
    const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.userId || user.user_id || user.id || null;
    }

    // Intentar obtener directamente
    return getCurrentUserId();
    
  } catch (error) {
    console.error('Error obteniendo userId:', error);
    return null;
  }
};

// Obtener usuario completo
export const getCurrentUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
};
```

### Opción B: Desde Context/Hook de Autenticación

```typescript
// hooks/useAuth.ts
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  
  return {
    userId: context.user?.user_id || context.user?.userId || '',
    user: context.user,
    isAuthenticated: !!context.user
  };
};

// Uso en componente:
const { userId, user } = useAuth();
```

### Opción C: Desde Redux/Store

```typescript
// Si usas Redux
import { useSelector } from 'react-redux';

export const useUserId = () => {
  return useSelector((state: RootState) => state.auth.userId || state.auth.user?.user_id);
};

// Si usas Zustand
import { useAuthStore } from '../store/authStore';

export const useUserId = () => {
  return useAuthStore(state => state.userId || state.user?.user_id);
};
```

---

## 🔧 Solución 2: Componente Completo de Transferencia

```typescript
// components/TicketTransfer/TransferConfirmation.tsx
import React, { useState, useEffect } from 'react';

interface Ticket {
  ticket_id: string;
  event_name: string;
  seat_number?: string;
  status: string;
  order_id: string;
}

interface Recipient {
  id: string;
  name?: string;
  username?: string;
  email: string;
  avatar?: string;
}

interface TransferConfirmationProps {
  tickets: Ticket[];
  orderId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TransferConfirmation: React.FC<TransferConfirmationProps> = ({
  tickets,
  orderId,
  onSuccess,
  onCancel
}) => {
  // Estados
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [recipientEmail, setRecipientEmail] = useState<string>('');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [searchError, setSearchError] = useState<string>('');
  const [transferError, setTransferError] = useState<string>('');

  // ============================================
  // 1. OBTENER USERID AL MONTAR COMPONENTE
  // ============================================
  useEffect(() => {
    const getUserId = (): string => {
      // Método 1: Desde localStorage directo
      let userId = localStorage.getItem('userId') || 
                   localStorage.getItem('user_id') ||
                   sessionStorage.getItem('userId');

      if (userId && userId !== 'undefined' && userId !== 'null') {
        return userId;
      }

      // Método 2: Desde objeto user
      try {
        const userStr = localStorage.getItem('user') || 
                       sessionStorage.getItem('user');
        
        if (userStr) {
          const user = JSON.parse(userStr);
          userId = user.userId || user.user_id || user.id;
          
          if (userId) {
            return userId;
          }
        }
      } catch (e) {
        console.error('Error parseando user:', e);
      }

      // Método 3: Desde token JWT (si aplica)
      try {
        const token = localStorage.getItem('token') || 
                     sessionStorage.getItem('token');
        
        if (token) {
          // Decodificar JWT (sin librerías)
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.userId || payload.user_id || payload.sub;
          
          if (userId) {
            return userId;
          }
        }
      } catch (e) {
        console.error('Error decodificando token:', e);
      }

      return '';
    };

    const id = getUserId();
    setCurrentUserId(id);

    if (!id) {
      console.error('❌ No se pudo obtener userId');
      alert('Error: No se pudo identificar tu usuario. Por favor inicia sesión nuevamente.');
    } else {
      console.log('✅ userId obtenido:', id);
    }
  }, []);

  // ============================================
  // 2. BUSCAR USUARIO RECEPTOR POR EMAIL
  // ============================================
  const handleSearchUser = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setSearchError('Ingresa un email válido');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setRecipient(null);

    try {
      // TODO: Reemplazar con tu endpoint de búsqueda de usuarios
      // Ejemplo: const response = await fetch(`https://tu-api.com/users/search?email=${recipientEmail}`);
      
      // SIMULACIÓN - REEMPLAZAR CON TU API
      const response = await fetch(
        `https://your-api.execute-api.us-east-1.amazonaws.com/dev/users/search?email=${encodeURIComponent(recipientEmail)}`,
        {
          headers: {
            'Content-Type': 'application/json',
            // Agregar token si es necesario
            // 'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Usuario no encontrado');
        }
        throw new Error('Error al buscar usuario');
      }

      const userData = await response.json();
      console.log('👤 Usuario encontrado:', userData);

      // Mapear correctamente los campos
      const mappedRecipient: Recipient = {
        id: userData.user_id || userData.userId || userData.id,
        name: userData.name || userData.username || '', // ⚠️ IMPORTANTE: usar username si name no existe
        username: userData.username || '',
        email: userData.email,
        avatar: userData.avatar || userData.profile_image || userData.profileImage || ''
      };

      setRecipient(mappedRecipient);
      console.log('✅ Receptor mapeado:', mappedRecipient);

    } catch (error: any) {
      console.error('Error buscando usuario:', error);
      setSearchError(error.message || 'No se pudo encontrar el usuario');
    } finally {
      setIsSearching(false);
    }
  };

  // ============================================
  // 3. CONFIRMAR Y EJECUTAR TRANSFERENCIA
  // ============================================
  const handleConfirmTransfer = async () => {
    console.log('🔥 handleConfirmTransfer EJECUTADO');
    
    // VALIDACIONES
    const errors: string[] = [];

    if (!currentUserId || currentUserId === '') {
      errors.push('Tu ID de usuario no está disponible');
    }

    if (!recipient?.id) {
      errors.push('Debes buscar y seleccionar un destinatario');
    }

    if (!tickets || tickets.length === 0) {
      errors.push('No hay tickets seleccionados');
    }

    if (!orderId) {
      errors.push('ID de orden no encontrado');
    }

    if (errors.length > 0) {
      console.error('❌ Errores de validación:', errors);
      alert('Errores:\n' + errors.join('\n'));
      return;
    }

    // Log del estado completo
    console.log('📊 Estado completo:', {
      currentUserId,
      recipient,
      tickets: tickets.map(t => ({ id: t.ticket_id, name: t.event_name })),
      orderId
    });

    // Confirmación del usuario
    const recipientName = recipient!.name || recipient!.username || recipient!.email;
    const confirmMessage = `¿Confirmas la transferencia de ${tickets.length} boleta(s) a ${recipientName}?`;
    
    if (!confirm(confirmMessage)) {
      console.log('🚫 Transferencia cancelada por el usuario');
      return;
    }

    setIsTransferring(true);
    setTransferError('');

    try {
      // Preparar payload
      const payload = {
        ticketIDs: tickets.map(t => t.ticket_id),
        newUserID: recipient!.id,
        currentUserID: currentUserId,
        orderID: orderId
      };

      console.log('📤 Enviando payload:', payload);

      // Ejecutar transferencia
      const response = await fetch(
        'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Agregar token si es necesario
            // 'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();
      console.log('📥 Respuesta:', data);

      if (!response.ok) {
        console.error('❌ Error en respuesta:', response.status, data);
        throw new Error(data.message || `Error ${response.status}`);
      }

      // Éxito
      console.log('✅ Transferencia exitosa:', data);
      alert(`¡Transferencia exitosa!\n${data.transferredTickets} boleta(s) transferidas a ${recipientName}`);
      
      // Callback de éxito
      onSuccess();

    } catch (error: any) {
      console.error('❌ Error en transferencia:', error);
      const errorMessage = error.message || 'Error desconocido al transferir';
      setTransferError(errorMessage);
      alert(`Error al transferir:\n${errorMessage}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="transfer-confirmation">
      <h2>Transferir Tickets</h2>

      {/* Información de tickets */}
      <div className="tickets-info">
        <h3>Tickets a transferir ({tickets.length})</h3>
        {tickets.map(ticket => (
          <div key={ticket.ticket_id} className="ticket-item">
            <span>{ticket.event_name}</span>
            {ticket.seat_number && <span> - Asiento {ticket.seat_number}</span>}
          </div>
        ))}
      </div>

      {/* Búsqueda de receptor */}
      <div className="recipient-search">
        <h3>Destinatario</h3>
        
        {!recipient ? (
          <div>
            <div className="search-input">
              <input
                type="email"
                placeholder="Email del destinatario"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchUser()}
                disabled={isSearching}
              />
              <button 
                onClick={handleSearchUser}
                disabled={isSearching || !recipientEmail}
              >
                {isSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            
            {searchError && (
              <div className="error-message">{searchError}</div>
            )}
          </div>
        ) : (
          <div className="recipient-info">
            {recipient.avatar && (
              <img src={recipient.avatar} alt={recipient.name || recipient.username} />
            )}
            <div className="recipient-details">
              <p><strong>{recipient.name || recipient.username}</strong></p>
              <p>{recipient.email}</p>
            </div>
            <button onClick={() => setRecipient(null)}>Cambiar</button>
          </div>
        )}
      </div>

      {/* Error de transferencia */}
      {transferError && (
        <div className="error-message">{transferError}</div>
      )}

      {/* Debugging info (remover en producción) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info" style={{ fontSize: '10px', color: '#666', marginTop: '10px' }}>
          <p>Debug: currentUserId = {currentUserId || 'VACÍO ❌'}</p>
          <p>Debug: recipient.id = {recipient?.id || 'NO SELECCIONADO'}</p>
          <p>Debug: tickets.length = {tickets.length}</p>
          <p>Debug: orderId = {orderId}</p>
        </div>
      )}

      {/* Botones de acción */}
      <div className="actions">
        <button
          className="btn-cancel"
          onClick={onCancel}
          disabled={isTransferring}
        >
          Cancelar
        </button>
        
        <button
          className="btn-confirm"
          onClick={handleConfirmTransfer}
          disabled={!recipient || isTransferring || !currentUserId}
        >
          {isTransferring ? 'Transfiriendo...' : 'Confirmar Transferencia'}
        </button>
      </div>
    </div>
  );
};

export default TransferConfirmation;
```

---

## 🎨 Estilos CSS

```css
/* styles/TransferConfirmation.css */
.transfer-confirmation {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.transfer-confirmation h2 {
  margin-top: 0;
  color: #333;
}

.tickets-info {
  margin: 20px 0;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
}

.ticket-item {
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;
}

.ticket-item:last-child {
  border-bottom: none;
}

.recipient-search {
  margin: 20px 0;
}

.search-input {
  display: flex;
  gap: 10px;
  margin: 10px 0;
}

.search-input input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-input button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.search-input button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.recipient-info {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: #e8f5e9;
  border-radius: 4px;
  border: 2px solid #4caf50;
}

.recipient-info img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
}

.recipient-details {
  flex: 1;
}

.recipient-details p {
  margin: 5px 0;
}

.error-message {
  padding: 10px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
  margin: 10px 0;
}

.debug-info {
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
  font-family: monospace;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel,
.btn-confirm {
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f5f5f5;
  color: #333;
}

.btn-cancel:hover {
  background: #e0e0e0;
}

.btn-confirm {
  background: #4caf50;
  color: white;
}

.btn-confirm:hover:not(:disabled) {
  background: #45a049;
}

.btn-confirm:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

---

## 🔧 Solución 3: Helper de Búsqueda de Usuarios

```typescript
// services/userService.ts

interface UserSearchResult {
  user_id: string;
  name?: string;
  username?: string;
  email: string;
  avatar?: string;
  profile_image?: string;
}

export class UserService {
  private baseURL = 'https://your-api.execute-api.us-east-1.amazonaws.com/dev';

  async searchUserByEmail(email: string): Promise<UserSearchResult | null> {
    try {
      const response = await fetch(
        `${this.baseURL}/users/search?email=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // Agregar autenticación si es necesaria
            // 'Authorization': `Bearer ${this.getToken()}`
          }
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const user = await response.json();
      return user;

    } catch (error) {
      console.error('Error buscando usuario:', error);
      throw error;
    }
  }

  async searchUserByUsername(username: string): Promise<UserSearchResult | null> {
    try {
      const response = await fetch(
        `${this.baseURL}/users/search?username=${encodeURIComponent(username)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Error buscando usuario:', error);
      throw error;
    }
  }

  private getToken(): string | null {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }
}

// Instancia singleton
export const userService = new UserService();
```

---

## 🔧 Solución 4: Service de Transferencia

```typescript
// services/transferService.ts

interface TransferPayload {
  ticketIDs: string[];
  newUserID: string;
  currentUserID: string;
  orderID?: string;
}

interface TransferResponse {
  message: string;
  transferredTickets: number;
  originalOrderID: string;
  newOrderID: string;
  recipient: {
    userId: string;
    name: string;
  };
}

export class TransferService {
  private endpoint = 'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer';

  async transferTickets(payload: TransferPayload): Promise<TransferResponse> {
    console.log('📤 Transfiriendo tickets:', payload);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Agregar autenticación si es necesaria
          // 'Authorization': `Bearer ${this.getToken()}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Error en transferencia:', data);
        throw new Error(data.message || `Error ${response.status}`);
      }

      console.log('✅ Transferencia exitosa:', data);
      return data;

    } catch (error) {
      console.error('❌ Error en transferService:', error);
      throw error;
    }
  }

  private getToken(): string | null {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }
}

// Instancia singleton
export const transferService = new TransferService();
```

---

## 📝 Ejemplo de Uso Completo

```typescript
// pages/TicketTransferPage.tsx
import React, { useState } from 'react';
import TransferConfirmation from '../components/TicketTransfer/TransferConfirmation';

function TicketTransferPage() {
  const [showTransferModal, setShowTransferModal] = useState(false);
  
  // Datos de ejemplo - Reemplazar con tus datos reales
  const selectedTickets = [
    {
      ticket_id: 'TICKET_001',
      event_name: 'Concierto Rock 2026',
      seat_number: 'A-15',
      status: 'ACTIVE',
      order_id: 'test-cf0f7283-31'
    },
    {
      ticket_id: 'TICKET_002',
      event_name: 'Concierto Rock 2026',
      seat_number: 'A-16',
      status: 'ACTIVE',
      order_id: 'test-cf0f7283-31'
    }
  ];

  const orderId = 'test-cf0f7283-31';

  const handleTransferSuccess = () => {
    setShowTransferModal(false);
    // Recargar tickets o redirigir
    window.location.reload();
  };

  return (
    <div>
      <h1>Mis Tickets</h1>
      
      <button onClick={() => setShowTransferModal(true)}>
        Transferir Tickets Seleccionados
      </button>

      {showTransferModal && (
        <div className="modal-overlay">
          <TransferConfirmation
            tickets={selectedTickets}
            orderId={orderId}
            onSuccess={handleTransferSuccess}
            onCancel={() => setShowTransferModal(false)}
          />
        </div>
      )}
    </div>
  );
}

export default TicketTransferPage;
```

---

## ✅ Checklist de Implementación

### 1. Configuración Inicial
- [ ] Instalar dependencias si es necesario
- [ ] Copiar archivos de utilidades (auth.ts, userService.ts, transferService.ts)
- [ ] Actualizar URLs de API con tus endpoints reales

### 2. Componente Principal
- [ ] Copiar componente TransferConfirmation.tsx
- [ ] Copiar estilos CSS
- [ ] Verificar que se obtiene correctamente el userId
- [ ] Probar búsqueda de usuarios

### 3. Integración
- [ ] Agregar el componente a tu página de tickets
- [ ] Pasar props correctamente (tickets, orderId)
- [ ] Implementar callbacks (onSuccess, onCancel)

### 4. Testing
- [ ] Verificar que userId se obtiene correctamente (revisar consola)
- [ ] Buscar un usuario y verificar que recipient.id y recipient.name estén completos
- [ ] Ejecutar transferencia y verificar respuesta
- [ ] Verificar que las notificaciones funcionan

### 5. Producción
- [ ] Remover console.logs innecesarios
- [ ] Remover sección de debug-info
- [ ] Agregar loading states
- [ ] Agregar manejo de errores más robusto

---

## 🐛 Debugging: Comandos de Consola

```javascript
// En la consola del navegador, ejecutar para verificar:

// 1. Verificar userId
console.log('userId:', localStorage.getItem('userId'));
console.log('user_id:', localStorage.getItem('user_id'));
console.log('user object:', JSON.parse(localStorage.getItem('user') || '{}'));

// 2. Verificar token (si aplica)
const token = localStorage.getItem('token');
if (token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('Token payload:', payload);
}

// 3. Limpiar storage si es necesario
// localStorage.clear();
// sessionStorage.clear();
```

---

## 🚀 Solución Rápida (Si tienes prisa)

Si necesitas algo que funcione YA, usa este código mínimo:

```typescript
// QuickTransfer.tsx
import React, { useState, useEffect } from 'react';

export default function QuickTransfer({ tickets, orderId }) {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [recipientId, setRecipientId] = useState('');
  
  useEffect(() => {
    // CAMBIAR ESTO según tu app
    const id = localStorage.getItem('userId') || 
               JSON.parse(localStorage.getItem('user') || '{}').user_id;
    setUserId(id);
    if (!id) alert('ERROR: userId no encontrado');
  }, []);

  const buscar = async () => {
    // CAMBIAR URL según tu API
    const res = await fetch(`YOUR_API/users/search?email=${email}`);
    const user = await res.json();
    setRecipientId(user.user_id || user.id);
    alert(`Usuario encontrado: ${user.name || user.username}`);
  };

  const transferir = async () => {
    if (!userId || !recipientId) {
      alert('Faltan datos');
      return;
    }

    const res = await fetch(
      'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketIDs: tickets.map(t => t.ticket_id),
          newUserID: recipientId,
          currentUserID: userId,
          orderID: orderId
        })
      }
    );

    const data = await res.json();
    alert(data.message);
  };

  return (
    <div>
      <input 
        type="email" 
        value={email} 
        onChange={e => setEmail(e.target.value)} 
        placeholder="Email" 
      />
      <button onClick={buscar}>Buscar</button>
      <button onClick={transferir}>Transferir</button>
      <p>userId: {userId || '❌ VACÍO'}</p>
      <p>recipientId: {recipientId || 'No buscado'}</p>
    </div>
  );
}
```

Con esto deberías poder resolver el problema! 🎯
