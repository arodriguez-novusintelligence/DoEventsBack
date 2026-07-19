# 📘 Guía de Consumo: API de Transferencia de Boletas

## 🎯 Introducción

Esta guía te enseña cómo consumir correctamente la API de transferencia de boletas para permitir que tus usuarios transfieran tickets de un usuario a otro de manera segura y eficiente.

---

## 📡 Información del Endpoint

### URL Base
```
https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com
```

### Endpoint de Transferencia
```
POST /tickets/transfer
```

### URL Completa
```
https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer
```

---

## 🔧 Configuración Inicial

### Headers Requeridos

```javascript
{
  "Content-Type": "application/json"
}
```

### Autenticación (Recomendada)

Aunque actualmente no está implementada en el endpoint, se recomienda agregar un header de autenticación:

```javascript
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_JWT_TOKEN"
}
```

---

## 📋 Parámetros del Request

### Parámetros Obligatorios

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `fromUserId` | String | ID del usuario que transfiere | `"user-abc-123"` |
| `toUserId` | String | ID del usuario que recibe | `"user-xyz-789"` |
| `orderId` | String | ID de la orden con los tickets | `"order-456"` |

### Parámetros Condicionales

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `ticketInstanceIds` | Array[String] | IDs de tickets específicos (requerido si `transferAll` es false) | `["ticket-1", "ticket-2"]` |
| `transferAll` | Boolean | Transferir todos los tickets (default: false) | `true` |

---

## 💻 Ejemplos de Consumo

### 1. JavaScript / Fetch API

#### Transferencia Parcial

```javascript
async function transferirBoletasParcial(fromUserId, toUserId, orderId, ticketIds) {
  const url = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer';
  
  const payload = {
    fromUserId: fromUserId,
    toUserId: toUserId,
    orderId: orderId,
    ticketInstanceIds: ticketIds,
    transferAll: false
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en la transferencia');
    }

    return data;
  } catch (error) {
    console.error('Error transferring tickets:', error);
    throw error;
  }
}

// Uso
const resultado = await transferirBoletasParcial(
  'user123',
  'user456',
  'order-abc-123',
  ['ticket-uuid-1', 'ticket-uuid-2']
);

console.log('Transferencia exitosa:', resultado);
```

#### Transferencia Total

```javascript
async function transferirBoletasTotal(fromUserId, toUserId, orderId) {
  const url = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer';
  
  const payload = {
    fromUserId: fromUserId,
    toUserId: toUserId,
    orderId: orderId,
    transferAll: true
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error en la transferencia');
    }

    return await response.json();
  } catch (error) {
    console.error('Error transferring all tickets:', error);
    throw error;
  }
}

// Uso
const resultado = await transferirBoletasTotal('user123', 'user456', 'order-abc-123');
console.log('Nueva orden creada:', resultado.newOrder.orderId);
```

---

### 2. React / TypeScript

#### Hook Personalizado

```typescript
import { useState } from 'react';

interface TransferTicketsParams {
  fromUserId: string;
  toUserId: string;
  orderId: string;
  ticketInstanceIds?: string[];
  transferAll?: boolean;
}

interface TransferTicketsResponse {
  success: boolean;
  message: string;
  transferType: 'FULL' | 'PARTIAL';
  transferredCount: number;
  originalOrder: {
    orderId: string;
    status: string;
    remainingTickets: number;
  };
  newOrder?: {
    orderId: string;
    userId: string;
    ticketsCount: number;
  };
}

export const useTransferTickets = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transferTickets = async (
    params: TransferTicketsParams
  ): Promise<TransferTicketsResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al transferir boletas');
      }

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { transferTickets, loading, error };
};

// Componente de ejemplo
export const TransferTicketsButton: React.FC<{
  fromUserId: string;
  toUserId: string;
  orderId: string;
  ticketIds: string[];
}> = ({ fromUserId, toUserId, orderId, ticketIds }) => {
  const { transferTickets, loading, error } = useTransferTickets();

  const handleTransfer = async () => {
    const result = await transferTickets({
      fromUserId,
      toUserId,
      orderId,
      ticketInstanceIds: ticketIds,
      transferAll: false,
    });

    if (result) {
      alert(`✅ ${result.transferredCount} boletas transferidas exitosamente`);
    }
  };

  return (
    <div>
      <button onClick={handleTransfer} disabled={loading}>
        {loading ? 'Transfiriendo...' : 'Transferir Boletas'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};
```

---

### 3. Axios

```javascript
import axios from 'axios';

const API_BASE_URL = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com';

// Instancia de Axios configurada
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Transferencia Parcial
export const transferirBoletasParcial = async (fromUserId, toUserId, orderId, ticketIds) => {
  try {
    const response = await api.post('/tickets/transfer', {
      fromUserId,
      toUserId,
      orderId,
      ticketInstanceIds: ticketIds,
      transferAll: false,
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      // Error del servidor
      throw new Error(error.response.data.error || 'Error en la transferencia');
    } else if (error.request) {
      // Error de red
      throw new Error('No se pudo conectar con el servidor');
    } else {
      throw error;
    }
  }
};

// Transferencia Total
export const transferirBoletasTotal = async (fromUserId, toUserId, orderId) => {
  try {
    const { data } = await api.post('/tickets/transfer', {
      fromUserId,
      toUserId,
      orderId,
      transferAll: true,
    });

    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

// Uso
(async () => {
  try {
    const resultado = await transferirBoletasParcial(
      'user123',
      'user456',
      'order-abc-123',
      ['ticket-1', 'ticket-2']
    );
    
    console.log('Tickets transferidos:', resultado.transferredCount);
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
```

---

### 4. Python / Requests

```python
import requests
import json

API_BASE_URL = "https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com"

def transferir_boletas_parcial(from_user_id, to_user_id, order_id, ticket_ids):
    """Transferir boletas específicas"""
    url = f"{API_BASE_URL}/tickets/transfer"
    
    payload = {
        "fromUserId": from_user_id,
        "toUserId": to_user_id,
        "orderId": order_id,
        "ticketInstanceIds": ticket_ids,
        "transferAll": False
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        print(f"✅ Transferidos {data['transferredCount']} tickets")
        return data
        
    except requests.exceptions.HTTPError as err:
        error_data = err.response.json()
        print(f"❌ Error: {error_data.get('error', 'Error desconocido')}")
        raise
    except Exception as err:
        print(f"❌ Error de conexión: {str(err)}")
        raise

def transferir_boletas_total(from_user_id, to_user_id, order_id):
    """Transferir todas las boletas de una orden"""
    url = f"{API_BASE_URL}/tickets/transfer"
    
    payload = {
        "fromUserId": from_user_id,
        "toUserId": to_user_id,
        "orderId": order_id,
        "transferAll": True
    }
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        
        data = response.json()
        print(f"✅ Orden transferida. Nueva orden: {data['newOrder']['orderId']}")
        return data
        
    except requests.exceptions.RequestException as err:
        print(f"❌ Error: {str(err)}")
        raise

# Uso
if __name__ == "__main__":
    try:
        resultado = transferir_boletas_parcial(
            "user123",
            "user456",
            "order-abc-123",
            ["ticket-uuid-1", "ticket-uuid-2"]
        )
        print(json.dumps(resultado, indent=2))
    except Exception as e:
        print(f"Error: {e}")
```

---

### 5. cURL

#### Transferencia Parcial

```bash
curl -X POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user123",
    "toUserId": "user456",
    "orderId": "order-abc-123",
    "ticketInstanceIds": ["ticket-uuid-1", "ticket-uuid-2"],
    "transferAll": false
  }'
```

#### Transferencia Total

```bash
curl -X POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user123",
    "toUserId": "user456",
    "orderId": "order-abc-123",
    "transferAll": true
  }'
```

---

## 🎨 Manejo de Respuestas

### Response Exitoso (200)

```javascript
{
  success: true,
  message: "Transferencia parcial completada exitosamente",
  transferType: "PARTIAL",
  fromUser: {
    userId: "user123",
    name: "Juan Pérez",
    email: "juan@mail.com"
  },
  toUser: {
    userId: "user456",
    name: "María García",
    email: "maria@mail.com"
  },
  originalOrder: {
    orderId: "order-abc-123",
    status: "PARTIALLY_TRANSFERRED",
    remainingTickets: 3
  },
  newOrder: null,
  transferredTickets: [...],
  transferredCount: 2
}
```

### Manejo en Frontend

```javascript
async function manejarTransferencia(data) {
  const resultado = await transferirBoletas(data);
  
  if (resultado.success) {
    // Transferencia exitosa
    if (resultado.transferType === 'FULL') {
      // Transferencia total
      mostrarMensaje(
        `✅ Todas las boletas transferidas exitosamente a ${resultado.toUser.name}`,
        'success'
      );
      
      // Redirigir o actualizar UI
      actualizarListaOrdenes();
      
    } else {
      // Transferencia parcial
      mostrarMensaje(
        `✅ ${resultado.transferredCount} boletas transferidas. Quedan ${resultado.originalOrder.remainingTickets} en tu orden`,
        'success'
      );
      
      // Actualizar vista de la orden
      actualizarOrden(resultado.originalOrder.orderId);
    }
  }
}
```

---

## ⚠️ Manejo de Errores

### Códigos de Error Comunes

| Código | Significado | Ejemplo |
|--------|-------------|---------|
| `400` | Bad Request - Parámetros inválidos | Falta `fromUserId` |
| `400` | Usuario no activo | Usuario inactivo o suspendido |
| `400` | Orden no válida | Orden no pagada o ya transferida |
| `500` | Internal Server Error | Error del servidor |

### Manejo de Errores en Frontend

```javascript
async function transferirConManejoDeErrores(params) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok) {
      // Manejar errores específicos
      switch (response.status) {
        case 400:
          if (data.error.includes('no está activo')) {
            mostrarError('El usuario receptor no está activo en la plataforma');
          } else if (data.error.includes('no pertenece')) {
            mostrarError('Esta orden no te pertenece');
          } else if (data.error.includes('no está pagada')) {
            mostrarError('Solo puedes transferir boletas de órdenes pagadas');
          } else {
            mostrarError(data.error);
          }
          break;
          
        case 500:
          mostrarError('Error del servidor. Por favor intenta más tarde');
          break;
          
        default:
          mostrarError('Error desconocido en la transferencia');
      }
      
      return null;
    }

    return data;

  } catch (error) {
    // Error de red
    mostrarError('No se pudo conectar con el servidor. Verifica tu conexión a internet');
    console.error('Error de red:', error);
    return null;
  }
}
```

---

## 🎯 Flujos de Usuario Recomendados

### Flujo 1: Transferencia Parcial

```javascript
// 1. Usuario selecciona boletas a transferir
const boletasSeleccionadas = ['ticket-1', 'ticket-2'];

// 2. Usuario ingresa email o busca destinatario
const destinatario = await buscarUsuario('maria@mail.com');

if (!destinatario) {
  mostrarError('Usuario no encontrado');
  return;
}

// 3. Confirmar transferencia
const confirmado = await mostrarDialogoConfirmacion(
  `¿Transferir ${boletasSeleccionadas.length} boletas a ${destinatario.name}?`
);

if (!confirmado) return;

// 4. Ejecutar transferencia
mostrarLoading(true);

const resultado = await transferirBoletasParcial(
  usuarioActual.id,
  destinatario.id,
  ordenActual.id,
  boletasSeleccionadas
);

mostrarLoading(false);

// 5. Mostrar resultado
if (resultado.success) {
  mostrarExito(`Boletas transferidas a ${destinatario.name}`);
  actualizarVista();
}
```

### Flujo 2: Transferencia Total

```javascript
// 1. Usuario selecciona "Transferir todas"
const confirmado = await mostrarDialogoConfirmacion(
  `¿Transferir TODAS las ${orden.tickets.length} boletas?`,
  'Esta acción no se puede deshacer'
);

if (!confirmado) return;

// 2. Usuario ingresa destinatario
const destinatario = await buscarUsuario(emailIngresado);

// 3. Ejecutar transferencia
const resultado = await transferirBoletasTotal(
  usuarioActual.id,
  destinatario.id,
  orden.id
);

// 4. Mostrar resultado
if (resultado.success) {
  mostrarExito(
    `Orden transferida completamente. Nueva orden: ${resultado.newOrder.orderId}`
  );
  
  // Redirigir a vista de órdenes
  window.location.href = '/mis-ordenes';
}
```

---

## 🔒 Validaciones Recomendadas en Frontend

### Antes de Llamar a la API

```javascript
function validarTransferencia(fromUserId, toUserId, orderId, ticketIds, transferAll) {
  const errores = [];

  // 1. Validar usuarios
  if (!fromUserId || fromUserId.trim() === '') {
    errores.push('ID del usuario emisor es requerido');
  }

  if (!toUserId || toUserId.trim() === '') {
    errores.push('ID del usuario receptor es requerido');
  }

  if (fromUserId === toUserId) {
    errores.push('No puedes transferir boletas a ti mismo');
  }

  // 2. Validar orden
  if (!orderId || orderId.trim() === '') {
    errores.push('ID de la orden es requerido');
  }

  // 3. Validar tickets
  if (!transferAll) {
    if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
      errores.push('Debes seleccionar al menos una boleta para transferir');
    }
  }

  return {
    valido: errores.length === 0,
    errores
  };
}

// Uso
const validacion = validarTransferencia(fromUserId, toUserId, orderId, ticketIds, false);

if (!validacion.valido) {
  mostrarErrores(validacion.errores);
  return;
}

// Proceder con la transferencia
await transferirBoletas(params);
```

---

## 📊 Ejemplos de UI

### Componente de Selección de Boletas

```jsx
import React, { useState } from 'react';

const TicketTransferSelector = ({ tickets, orderId, currentUserId }) => {
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleTicket = (ticketId) => {
    setSelectedTickets(prev =>
      prev.includes(ticketId)
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const handleTransfer = async () => {
    if (selectedTickets.length === 0) {
      alert('Selecciona al menos una boleta');
      return;
    }

    if (!recipientEmail) {
      alert('Ingresa el email del destinatario');
      return;
    }

    setLoading(true);

    try {
      // 1. Buscar usuario por email
      const recipient = await buscarUsuarioPorEmail(recipientEmail);

      if (!recipient) {
        alert('Usuario no encontrado');
        return;
      }

      // 2. Transferir boletas
      const result = await transferirBoletasParcial(
        currentUserId,
        recipient.id,
        orderId,
        selectedTickets
      );

      if (result.success) {
        alert(`✅ ${result.transferredCount} boletas transferidas`);
        // Recargar datos
        window.location.reload();
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="transfer-container">
      <h2>Transferir Boletas</h2>

      <div className="tickets-list">
        {tickets.map(ticket => (
          <div
            key={ticket.ticketInstanceId}
            className={`ticket-item ${
              selectedTickets.includes(ticket.ticketInstanceId) ? 'selected' : ''
            }`}
            onClick={() => toggleTicket(ticket.ticketInstanceId)}
          >
            <input
              type="checkbox"
              checked={selectedTickets.includes(ticket.ticketInstanceId)}
              readOnly
            />
            <span>{ticket.category}</span>
            <span>Asiento: {ticket.seatLabel || 'General'}</span>
          </div>
        ))}
      </div>

      <div className="recipient-input">
        <label>Email del destinatario:</label>
        <input
          type="email"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="ejemplo@mail.com"
        />
      </div>

      <button onClick={handleTransfer} disabled={loading}>
        {loading ? 'Transfiriendo...' : `Transferir ${selectedTickets.length} boletas`}
      </button>

      <button onClick={() => setSelectedTickets(tickets.map(t => t.ticketInstanceId))}>
        Seleccionar Todas
      </button>
    </div>
  );
};

export default TicketTransferSelector;
```

---

## 🧪 Testing

### Prueba en Postman

1. **Crear una nueva request:**
   - Method: `POST`
   - URL: `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer`

2. **Headers:**
   ```
   Content-Type: application/json
   ```

3. **Body (raw JSON):**
   ```json
   {
     "fromUserId": "user123",
     "toUserId": "user456",
     "orderId": "order-abc-123",
     "ticketInstanceIds": ["ticket-1", "ticket-2"],
     "transferAll": false
   }
   ```

4. **Enviar y verificar respuesta**

### Script de Testing

```javascript
// test-transfer-api.js
const API_URL = 'https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/tickets/transfer';

async function testTransferAPI() {
  const tests = [
    {
      name: 'Transferencia Parcial',
      payload: {
        fromUserId: 'user123',
        toUserId: 'user456',
        orderId: 'order-abc-123',
        ticketInstanceIds: ['ticket-1', 'ticket-2'],
        transferAll: false
      }
    },
    {
      name: 'Transferencia Total',
      payload: {
        fromUserId: 'user123',
        toUserId: 'user456',
        orderId: 'order-abc-123',
        transferAll: true
      }
    },
    {
      name: 'Error: Usuario Inactivo',
      payload: {
        fromUserId: 'user123',
        toUserId: 'user-inactive',
        orderId: 'order-abc-123',
        transferAll: true
      },
      expectError: true
    }
  ];

  for (const test of tests) {
    console.log(`\n🧪 Test: ${test.name}`);
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      });

      const data = await response.json();

      if (test.expectError) {
        console.log(response.ok ? '❌ FAIL' : '✅ PASS');
        console.log('Error esperado:', data.error);
      } else {
        console.log(response.ok ? '✅ PASS' : '❌ FAIL');
        console.log('Resultado:', data);
      }
    } catch (error) {
      console.log('❌ Error de red:', error.message);
    }
  }
}

testTransferAPI();
```

---

## 📌 Mejores Prácticas

### 1. **Validación Doble**
```javascript
// Cliente valida antes de enviar
if (!validarDatosLocalmente(params)) {
  return;
}

// Servidor valida nuevamente (ya implementado)
```

### 2. **Feedback al Usuario**
```javascript
// Mostrar loading
mostrarLoading(true);

// Realizar transferencia
const resultado = await transferir(params);

// Ocultar loading
mostrarLoading(false);

// Mostrar resultado
mostrarNotificacion(resultado.message);
```

### 3. **Manejo de Timeout**
```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

try {
  const response = await fetch(API_URL, {
    signal: controller.signal,
    // ... otros parámetros
  });
} catch (error) {
  if (error.name === 'AbortError') {
    mostrarError('La transferencia está tomando demasiado tiempo. Por favor intenta nuevamente.');
  }
} finally {
  clearTimeout(timeoutId);
}
```

### 4. **Retry en Caso de Error**
```javascript
async function transferirConReintento(params, maxReintentos = 3) {
  for (let i = 0; i < maxReintentos; i++) {
    try {
      return await transferirBoletas(params);
    } catch (error) {
      if (i === maxReintentos - 1) throw error;
      
      // Esperar antes de reintentar
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 5. **Logging y Analytics**
```javascript
async function transferirConTracking(params) {
  // Log inicio
  analytics.track('transfer_started', {
    fromUserId: params.fromUserId,
    ticketCount: params.ticketInstanceIds?.length || 'all'
  });

  try {
    const result = await transferirBoletas(params);
    
    // Log éxito
    analytics.track('transfer_success', {
      transferType: result.transferType,
      transferredCount: result.transferredCount
    });
    
    return result;
  } catch (error) {
    // Log error
    analytics.track('transfer_error', {
      error: error.message
    });
    
    throw error;
  }
}
```

---

## 🔗 Recursos Adicionales

- [Documentación Técnica de la API](TRANSFER_TICKETS_API.md)
- [Código Fuente](src/transferTickets.js)
- [Configuración Serverless](serverless.yml)

---

## 🆘 Soporte

Si encuentras problemas al consumir la API:

1. Verifica que los usuarios existan y estén activos
2. Confirma que la orden esté pagada
3. Valida que los IDs de tickets sean correctos
4. Revisa los logs del navegador para errores de red
5. Contacta al equipo de backend con el `orderId` problemático

---

**Fecha:** Enero 10, 2026  
**Versión API:** 1.0.0  
**Endpoint:** `POST /tickets/transfer`  
**Status:** ✅ Producción
