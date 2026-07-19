# Análisis de Estructura de Tickets

## Problema Identificado

Existen **MÚLTIPLES** estructuras de tickets en el sistema que causan conflictos en la transferencia:

### 1. Tabla Tickets (Sistema de Órdenes)
- **Clave primaria DynamoDB**: `id`
- **Campo de datos**: `ticket_id` (mismo valor que `id`)
- **Creado por**: `createOrder.js`, `generateTickets.js`
- **Uso**: Tickets comprados a través de órdenes

**Ejemplo:**
```json
{
  "id": "3ef317f7-5683-4c4c-92c3-6d2bdeb64ad4",
  "ticket_id": "3ef317f7-5683-4c4c-92c3-6d2bdeb64ad4",
  "order_id": "test_yqD71A",
  "user_id": "42c2e4a4-0",
  "event_id": "fbe79f21-...",
  "status": "ACTIVE"
}
```

### 2. Tabla TicketsDistribution (Sistema de Distribución)
- **Clave primaria DynamoDB**: `id` (ID del distribution batch)
- **Campo anidado**: `tickets[].ticketInstanceId`
- **Estructura**: Array de tickets dentro de un documento
- **Uso**: Pre-generación de tickets para eventos con venue

**Ejemplo:**
```json
{
  "id": "53399387-3b3c-4a16-a341-8617f6c2fe51",
  "eventId": "3adf210f-...",
  "tickets": [
    {
      "ticketInstanceId": "06af2432-09fb-45f3-91e4-15d06d7073dc",
      "orderId": null,
      "entityType": "TICKET",
      "qrCodeKey": "4a8b53b3-...",
      "ticketStatus": "AVAILABLE",
      "purchasePrice": "300",
      "category": "Categoria prueba",
      "ownerId": null
    }
  ]
}
```

### 3. Tabla Tickets (Configuración de Evento - VIEJA)
- **Clave primaria DynamoDB**: `id`
- **Estructura**: Configuración de boletas del evento (NO tickets individuales)
- **Campo**: `boleta[]` con categorías y capacidades
- **Uso**: Definición de tipos de boletas disponibles

**Ejemplo:**
```json
{
  "id": "cf0f7283-d6",
  "eventId": "fbe79f21-...",
  "boleta": [
    {
      "categoria": "Platea",
      "valor": "250000.00",
      "cantidadTickets": "150"
    }
  ]
}
```

## Problema en transferTicket.js

El código actual intenta buscar en tabla "Tickets" con clave `id`, pero:

❌ **Frontend envía**: ID del ticket (puede ser `ticket_id` o `ticketInstanceId`)
❌ **Backend busca**: En tabla Tickets con clave `id`
❌ **Resultado**: "Ticket no encontrado"

## Escenarios de Transferencia

### Escenario A: Ticket de Orden Normal
- Frontend envía: `ticket_id` = "3ef317f7-5683..."
- Backend debe buscar en: `Tickets` tabla con clave `id` = "3ef317f7-5683..."
- **Status**: ✅ Funciona con el código actual

### Escenario B: Ticket de TicketsDistribution
- Frontend envía: `ticketInstanceId` = "06af2432-09fb..."
- Backend debe buscar en: `TicketsDistribution` (estructura compleja)
- **Status**: ❌ NO SOPORTADO - Requiere lógica adicional

### Escenario C: Evento Viejo (sin sistema nuevo)
- Frontend envía: ID de ticket viejo
- Backend debe buscar en: Sistema legacy
- **Status**: ❌ NO SOPORTADO

## Solución Propuesta

### Opción 1: Migración de Datos
Cuando se compra un ticket de TicketsDistribution, copiarlo también a tabla Tickets con estructura estándar.

**Pros**:
- Código de transferencia simple
- Compatibilidad con todo el sistema

**Contras**:
- Duplicación de datos
- Requiere sincronización

### Opción 2: Lógica Dual en transferTicket.js
Buscar primero en Tickets, luego en TicketsDistribution si no encuentra.

**Pros**:
- No duplica datos
- Soporta ambos sistemas

**Contras**:
- Código más complejo
- Más consultas a DynamoDB

### Opción 3: Campo Unificado
Agregar `id` Y `ticket_id` a TODOS los tickets, sin importar el origen.

**Pros**:
- Acceso consistente
- Retrocompatibilidad

**Contras**:
- Requiere migración de datos existentes

## Recomendación Inmediata

**PASO 1**: Verificar qué envía realmente el frontend
```javascript
console.log('📦 ticketIDs recibidos:', ticketIDs);
console.log('📦 Tipo:', Array.isArray(ticketIDs) ? 'array' : typeof ticketIDs);
console.log('📦 Primer elemento:', ticketIDs[0]);
```

**PASO 2**: Agregar log en el backend para ver qué tickets existen
```javascript
// En transferTicket.js antes del .get()
console.log('🔍 Buscando ticket con ID:', ticketIDs[0]);
console.log('🔍 En tabla:', TICKETS_TABLE);
console.log('🔍 Con clave: id');
```

**PASO 3**: Implementar búsqueda híbrida si es necesario

## Pregunta para el Usuario

¿Los tickets que se están intentando transferir vienen de:
- ✅ Una orden normal creada con `createOrder.js`?
- ✅ El sistema de TicketsDistribution?
- ✅ Un evento viejo creado antes del nuevo sistema?

La respuesta determinará la solución correcta.
