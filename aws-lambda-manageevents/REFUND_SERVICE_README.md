# 💰 Servicio de Reembolso de Boletas

## 📋 Descripción

Este servicio procesa reembolsos de boletas para órdenes de eventos. Permite reembolsar una, varias o todas las boletas de una orden, actualizando el estado de la orden y liberando las boletas para que vuelvan a estar disponibles.

**✨ IMPORTANTE**: Utiliza la tabla existente `ticketsCancelation` para mantener consistencia con el sistema de cancelación de eventos.

## 🎯 Características

### ✅ Funcionalidades Implementadas

1. **Reembolso Total**: Cuando se reembolsan todas las boletas de una orden
   - El estado de la orden cambia a `CANCELLED`
   - Se marca con `refund_status: PENDING`
   - Se registra el monto total reembolsado

2. **Reembolso Parcial**: Cuando se reembolsan algunas boletas de una orden
   - Se actualiza la cantidad de boletas en la orden
   - Se mantiene registro de reembolsos parciales
   - Se acumula el monto de reembolsos parciales

3. **Liberación de Boletas**: Las boletas reembolsadas vuelven a estado `AVAILABLE` en `TicketsDistribution`
   - Se eliminan los datos de owner y orderId
   - Se limpia el QR asociado
   - Quedan disponibles para nueva compra

4. **Trazabilidad**: Cada reembolso genera un registro en la tabla `ticketsCancelation`
   - ID único del reembolso (UUID)
   - Tipo (FULL/PARTIAL)
   - Estado (PENDING → COMPLETED/REJECTED)
   - Detalles de tickets y montos
   - Timestamps de creación y ejecución
   - Compatible con cancelaciones de eventos

## 🔄 Flujo del Proceso

```
1. Usuario solicita reembolso
   ↓
2. Validar orden (existe, pertenece al usuario, está APPROVED)
   ↓
3. Verificar idempotencia (¿ya existe reembolso para estos tickets?)
   ├─ SI → Devolver resultado existente (sin procesar nuevamente)
   └─ NO → Continuar
   ↓
4. Buscar tickets en TicketsDistribution
   ↓
5. Validar tickets (estado SOLD, pertenecen a la orden)
   ↓
6. Determinar tipo de reembolso (FULL/PARTIAL)
   ↓
7. Verificación final de idempotencia (protección contra concurrencia)
   ├─ SI → Devolver resultado existente
   └─ NO → Continuar
   ↓
8. Calcular monto a reembolsar
   ↓
9. Liberar tickets → Estado AVAILABLE
   ↓
10. Crear registro de trazabilidad (ticketsCancelation) ← CRÍTICO para idempotencia
   ↓
11. Actualizar estado de la orden
   ↓
12. Retornar respuesta con detalles del reembolso
```

## 📡 API Endpoints

### POST `/processRefund`

Procesa el reembolso de boletas de una orden.

#### Request Body

```json
{
  "userId": "user-123",
  "orderId": "order-abc-456",
  "ticketInstanceIds": ["ticket-1", "ticket-2"], // Opcional: si no se proporciona, reembolsa TODOS
  "reason": "Usuario solicitó cancelación" // Opcional
}
```

#### Parámetros

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `userId` | String | ✅ | ID del usuario que solicita el reembolso |
| `orderId` | String | ✅ | ID de la orden a reembolsar |
| `ticketInstanceIds` | Array | ❌ | IDs específicos de tickets a reembolsar. Si no se proporciona, reembolsa todos los tickets de la orden |
| `reason` | String | ❌ | Razón del reembolso (por defecto: "Usuario solicitó reembolso") |

#### Response (Success - 200)

```json
{
  "success": true,
  "message": "Reembolso total procesado exitosamente",
  "duplicate": false, // true si es un reembolso duplicado/idempotente
  "data": {
    "refundId": "REFUND-1737312000000-abc123",
    "orderId": "order-abc-456",
    "refundType": "FULL", // o "PARTIAL"
    "refundStatus": "PENDING",
    "ticketsRefunded": 3,
    "refundAmount": 150000,
    "currency": "COP",
    "orderNewStatus": "CANCELLED", // o "PARTIALLY_REFUNDED"
    "ticketDetails": [
      {
        "ticketInstanceId": "ticket-1",
        "category": "VIP",
        "seat": "A-10",
        "price": 50000
      },
      {
        "ticketInstanceId": "ticket-2",
        "category": "VIP",
        "seat": "A-11",
        "price": 50000
      },
      {
        "ticketInstanceId": "ticket-3",
        "category": "VIP",
        "seat": "A-12",
        "price": 50000
      }
    ],
    "processedAt": "2026-01-19T14:30:00.000Z"
  }
}
```

#### Response (Error - 400/403/404/500)

```json
{
  "success": false,
  "message": "Descripción del error"
}
```

### Códigos de Error

| Código | Descripción |
|--------|-------------|
| 400 | Parámetros faltantes o inválidos |
| 403 | La orden no pertenece al usuario |
| 404 | Orden no encontrada o tickets no encontrados |
| 500 | Error interno del servidor |

## 🗄️ Estructura de Datos

### Tabla: Orders

**Actualización en Reembolso Total:**
```javascript
{
  order_id: "order-abc-456",
  payment_status: "CANCELLED",        // ← Actualizado
  refund_status: "PENDING",           // ← Nuevo
  refund_amount: 150000,              // ← Nuevo
  refunded_at: "2026-01-19T14:30:00Z" // ← Nuevo
}
```

**Actualización en Reembolso Parcial:**
```javascript
{
  order_id: "order-abc-456",
  quantity: 2,                        // ← Reducido (original: 5, reembolsados: 3)
  partial_refund_status: "PENDING",   // ← Nuevo
  partial_refund_amount: 150000,      // ← Acumulado
  partial_refund_count: 3,            // ← Contador de tickets reembolsados
  last_refund_at: "2026-01-19T14:30:00Z" // ← Última actualización
}
```

### Tabla: TicketsDistribution

**Estado del Ticket ANTES del Reembolso:**
```javascript
{
  ticketInstanceId: "ticket-1",
  ticketStatus: "SOLD",
  orderId: "order-abc-456",
  ownerId: "user-123",
  qrUrl: "https://...",
  reservationExpiry: 1737312000
}
```

**Estado del Ticket DESPUÉS del Reembolso:**
```javascript
{
  ticketInstanceId: "ticket-1",
  ticketStatus: "AVAILABLE",    // ← Cambiado a AVAILABLE
  orderId: null,                // ← Limpiado
  ownerId: null,                // ← Limpiado
  qrUrl: null,                  // ← Limpiado
  reservationExpiry: null       // ← Limpiado
}
```

### Tabla: ticketsCancelation (Trazabilidad)

Estructura del registro de trazabilidad compatible con cancelaciones de eventos:

```javascript
{
  id: "uuid-v4",                          // PK: ID único del reembolso
  orderId: "order-abc-456",               // GSI: orderIdIndex  
  eventId: "event-789",                   // GSI: eventIdIndex
  userId: "user-123",
  refund_type: "FULL",                    // "FULL" | "PARTIAL"
  refundStatus: "PENDING",                // "PENDING" | "COMPLETED" | "REJECTED"
  ticket_instances: [                     // Array de tickets reembolsados
    "ticket-1",
    "ticket-2",
    "ticket-3"
  ],
  quantity: 3,
  refund_amount: 150000,
  original_total: 150000,
  payment_method: "credit_card",
  reason: "Solicitud de usuario",
  createdAt: "2026-01-19T14:30:00.000Z",
  executionDate: "2026-01-19T14:30:00.000Z",
  eventName: "Concierto Rock 2026",
  eventStartDate: "20260315",
  originalStatus: "APPROVED"
}
```

**🔍 Índices Globales:**
- `orderIdIndex`: Permite buscar todos los reembolsos de una orden
- `eventIdIndex`: Permite buscar todos los reembolsos de un evento (útil para cancelaciones masivas)

## 🔐 Validaciones

El servicio realiza las siguientes validaciones:

1. ✅ **Usuario autenticado**: El `userId` es requerido
2. ✅ **Orden válida**: La orden debe existir en la base de datos
3. ✅ **Propiedad**: La orden debe pertenecer al usuario solicitante
5. ✅ **Idempotencia**: Verifica si ya existe un reembolso para los mismos tickets
   - Si existe con estado `PENDING` o `COMPLETED`, devuelve el resultado existente
   - Si existe con estado `REJECTED`, permite reintento
6. ✅ **Tickets válidos**: Los tickets deben:
   - Pertenecer a la orden especificada
   - Estar en estado `SOLD`
   - Existir en `TicketsDistribution`
7. ✅ **Tickets especificados**: Si se proporcionan IDs específicos, todos deben existir y ser válidos
8. ✅ **Protección contra concurrencia**: Doble verificación antes de modificar datos
6. ✅ **Tickets especificados**: Si se proporcionan IDs específicos, todos deben existir y ser válidos

## 📊 Casos de Uso

### Caso 1: Reembolso Total (todas las boletas)

**Request:**
```json
{
  "userId": "user-123",
  "orderId": "order-abc-456"
  // No se especifica ticketInstanceIds = reembolso total
}
```

**Resultado:**
- ✅ Todas las boletas de la orden vuelven a `AVAILABLE`
- ✅ Orden cambia a estado `CANCELLED`
- ✅ Se registra `refund_status: PENDING`

### Caso 2: Reembolso Parcial (boletas específicas)

**Request:**
```json
{
  "userId": "user-123",
  "orderId": "order-abc-456",
  "ticketInstanceIds": ["ticket-1", "ticket-2"]
}
```

**Resultado:**
- ✅ Solo las boletas especificadas vuelven a `AVAILABLE`
- ✅ Orden mantiene estado `APPROVED` o cambia a `PARTIALLY_REFUNDED`
- ✅ Se actualiza `quantity` en la orden (original - reembolsados)
- ✅ Se registra `partial_refund_status: PENDING`

### Caso 3: Error - Orden no pertenece al usuario

**Request:**
```json
{
  "userId": "user-456",  // Usuario diferente
  "orderId": "order-abc-456"
}
```

**Resultado:**
```json
{
  "success": false,
  "message": "La orden no pertenece al usuario especificado"
}
```
Status: `403 Forbidden`

### Caso 4: Idempotencia - Solicitud Duplicada

**Request (segunda llamada con mismos datos):**
```json
{
  "userId": "user-123",
  "orderId": "order-abc-456",
  "ticketInstanceIds": ["ticket-1", "ticket-2"]
}
```

**Resultado:**
```json
{
  "success": true,
  "message": "Reembolso ya procesado previamente (PENDING)",
  "duplicate": true,
  "data": {
    "refundId": "REFUND-1737312000000-abc123",
    "orderId": "order-abc-456",
    "refundStatus": "PENDING",
    "processedAt": "2026-01-19T14:30:00.000Z"
  }
}
```
Status: `200 OK`

**Beneficio:** La segunda llamada no duplica el reembolso, solo devuelve el resultado existente.

#### Diagrama de Flujo de Idempotencia

```
┌─────────────────────────────────────────────────────────────┐
│                    REQUEST: Procesar Reembolso              │
│  { orderId: "order-123", ticketInstanceIds: ["t1", "t2"] } │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
              ┌──────────────────────┐
              │ ¿Existe reembolso    │
              │ para estos tickets?  │
              └──────────┬───────────┘
                         │
          ┌──────────────┴──────────────┐
          │ NO                           │ SÍ
          ↓                              ↓
┌─────────────────────┐      ┌──────────────────────────┐
│  Procesar nuevo     │      │ Verificar estado del     │
│  reembolso          │      │ reembolso existente      │
│                     │      └──────────┬───────────────┘
│  1. Liberar tickets │                 │
│  2. Crear registro  │      ┌──────────┴──────────┐
│  3. Actualizar orden│      │                     │
│  4. Retornar nuevo  │      │ PENDING/COMPLETED   │ REJECTED
│     resultado       │      │                     │
└─────────┬───────────┘      ↓                     ↓
          │           ┌──────────────┐    ┌─────────────────┐
          │           │ Retornar     │    │ Permitir nuevo  │
          │           │ resultado    │    │ intento (no es  │
          │           │ existente    │    │ duplicado real) │
          │           │ SIN procesar │    └────────┬────────┘
          │           │ duplicate:   │             │
          │           │ true         │             │
          │           └──────┬───────┘             │
          │                  │                     │
          └──────────────────┴─────────────────────┘
                             │
                             ↓
                    ┌────────────────┐
                    │    RESPONSE    │
                    └────────────────┘
```

## 🧪 Testing

### Prueba Manual con cURL

```bash
# Reembolso total
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/processRefund \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "orderId": "order-abc-456",
    "reason": "Evento cancelado"
  }'

# Reembolso parcial
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/processRefund \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "orderId": "order-abc-456",
    "ticketInstanceIds": ["ticket-1", "ticket-2"],
    "reason": "Usuario no puede asistir"
  }'
```

### Logs de CloudWatch

El servicio genera logs detallados en cada paso:

```
🔄 Iniciando proceso de reembolso
📦 Orden encontrada: order-abc-456
✅ Orden validada correctamente
🔍 Buscando tickets de la orden: order-abc-456
✅ Encontrados 3 tickets para reembolsar
📊 Tipo de reembolso: TOTAL
💰 Monto total a reembolsar: 150000 COP
🔄 Liberando 3 tickets en 1 distribuciones...
  ✓ Liberando ticket: ticket-1 (VIP)
  ✓ Liberando ticket: ticket-2 (VIP)
  ✓ Liberando ticket: ticket-3 (VIP)
✅ Todos los tickets liberados exitosamente
📝 Creando registro de trazabilidad del reembolso...
✅ Registro de trazabilidad creado: REFUND-1737312000000-abc123
🔄 Actualizando orden order-abc-456 (FULL refund)...
✅ Orden marcada como CANCELLED con reembolso PENDING
✅ Reembolso procesado exitosamente
```

## 🔗 Integración con Otros Servicios

### 1. Servicio de Validación (`canRequestRefund`)

Antes de llamar a `processRefund`, se debe validar si el usuario puede solicitar el reembolso:

```javascript
// 1. Primero validar con canRequestRefund
const validationResponse = await fetch(
  '/canRequestRefund/event-789',
  {
    method: 'POST',
    body: JSON.stringify({
      userId: 'user-123',
      orderId: 'order-abc-456',
      currentDate: '20260119'
    })
  }
);

const validation = await validationResponse.json();

// 2. Si puede solicitar reembolso, procesar
if (validation.data.canRequestRefund) {
  const refundResponse = await fetch('/processRefund', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'user-123',
      orderId: 'order-abc-456'
    })
  });
}
```

### 2. Servicio de Notificaciones (Futuro)

Una vez procesado el reembolso, se puede integrar con el servicio de notificaciones:

```javaIdempotencia Implementada ✅

El servicio **ES IDEMPOTENTE**. Características:

- **Verificación doble**: Al inicio y antes de modificar datos (protección contra concurrencia)
- **Comparación exacta**: Valida orden + conjunto exacto de tickets
- **Estados considerados**:
  - `PENDING` o `COMPLETED`: Devuelve resultado existente sin procesar
  - `REJECTED`: Permite reintento
- **Respuesta idempotente**: Incluye campo `duplicate: true` cuando detecta duplicación
- **Sin efectos secundarios**: Llamadas repetidas no crean múltiples reembolsos

**Ejemplo de comportamiento idempotente:**
```javascript
// Primera llamada
POST /processRefund { orderId: "order-123", ticketInstanceIds: ["t1", "t2"] }
→ Procesa reembolso, crea REFUND-001

// Segunda llamada (idéntica)
POST /processRefund { orderId: "order-123", ticketInstanceIds: ["t1", "t2"] }
→ Detecta REFUND-001 existente, devuelve resultado sin procesar

// Tercera llamada (tickets diferentes)
POST /processRefund { orderId: "order-123", ticketInstanceIds: ["t3"] }
→ Procesa nuevo reembolso parcial, crea REFUND-002
```

### 2. script
// Enviar notificación de reembolso procesado
await notifyUser({
  userId: 'user-123',
  type: 'refund_processed',
  data: {
    refundId: 'REFUND-1737312000000-abc123',
    amount: 150000,
    currency: 'COP'
  }
});
```

## 🚀 Deployment

```bash
# Desplegar el servicio
cd aws-lambda-manageevents
serverless deploy --force

# Verificar el despliegue
serverless info

# Ver logs en tiempo real
serverless logs -f processRefund --tail
```

## ⚠️ Consideraciones Importantes

### 1. Estado de la Tabla Refunds

**La tabla `Refunds` debe ser creada manualmente en DynamoDB** antes de desplegar el servicio:

```javascript
// Estructura de la tabla Refunds
{
  TableName: "Refunds",
  KeySchema: [
    { AttributeName: "refund_id", KeyType: "HASH" }  // Partition key
  ],
  AttributeDefinitions: [
    { AttributeName: "refund_id", AttributeType: "S" },
    { AttributeName: "order_id", AttributeType: "S" },
    { AttributeName: "user_id", AttributeType: "S" }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: "order_id-index",
      KeySchema: [
        { AttributeName: "order_id", KeyType: "HASH" }
      ],
      Projection: { ProjectionType: "ALL" }
    },
    {
      IndexName: "user_id-index",
      KeySchema: [
        { AttributeName: "user_id", KeyType: "HASH" }
      ],
      Projection: { ProjectionType: "ALL" }
    }
  ],
  BillingMode: "PAY_PER_REQUEST"
}
```

### 2. Búsqueda de Tickets

El servicio intenta usar un índice `orderId-index` en `TicketsDistribution` para mejor performance. Si no existe, hace un scan completo (menos eficiente).

**Recomendación:** Crear el índice GSI en DynamoDB:

```javascript
{
  IndexName: "orderId-index",
  KeySchema: [
    { AttributeName: "orderId", KeyType: "HASH" }
  ],
  Projection: { ProjectionType: "ALL" }
}
```

### 3. Procesamiento de Pagos

Este servicio marca el reembolso como `PENDING`. El procesamiento real del reembolso con la pasarela de pagos debe ser manejado por otro servicio.

### 4. Múltiples Reembolsos Parciales

El servicio soporta múltiples reembolsos parciales sobre la misma orden:
- Se acumula `partial_refund_amount`
- Se cuenta `partial_refund_count`
- Se actualiza `last_refund_at` en cada operación

### 5. Manejo de Concurrencia

El servicio incluye verificación de idempotencia **antes y después** de validar tickets para proteger contra solicitudes concurrentes que podrían crear duplicados.

## 📝 Notas Adicionales

1. **Idempotencia**: ✅ El servicio ES IDEMPOTENTE. Llamadas múltiples con los mismos datos devolverán el resultado existente sin procesar duplicados.

2. **Transaccionalidad**: El servicio no usa transacciones DynamoDB. En caso de fallo parcial:
   - Si falla antes de crear el registro en Refunds: Se puede reintentar de forma segura
   - Si falla después: La idempotencia previene duplicados en reintentos

3. **Performance**: Para órdenes con muchos tickets, el proceso puede tardar. Considerar optimización o procesamiento asíncrono.

4. **Auditoría**: Todos los pasos generan logs detallados en CloudWatch para auditoría y troubleshooting.

## 📚 Archivos Relacionados

- `src/processRefund.js` - Función principal de reembolso
- `src/canRequestRefund.js` - Validación previa de políticas
- `serverless.yml` - Configuración del servicio
- `REFUND_SERVICE_README.md` - Esta documentación

## 🆘 Troubleshooting

### Error: "No se encontraron tickets válidos para reembolsar"

**Posibles causas:**
- Los tickets ya fueron reembolsados anteriormente
- Los ticketInstanceIds proporcionados son incorrectos
- Los tickets no están en estado `SOLD`

**Solución:** Verificar el estado actual de los tickets en `TicketsDistribution`

### Error: "Error al liberar los tickets"

**Posibles causas:**
- Problemas de permisos IAM
- Tabla `TicketsDistribution` no accesible
- Timeout en la operación

**Solución:** Revisar permisos IAM y logs de CloudWatch

### Error: "Error al actualizar el estado de la orden"

**Posibles causas:**
- Problemas de permisos IAM
- Tabla `Orders` no accesible
- Conflicto de concurrencia

**Solución:** Verificar permisos y estado de la tabla `Orders`

---

## 🔗 Integración con Sistema Existente

Este servicio utiliza la tabla **`ticketsCancelation`** existente para:
1. Mantener consistencia con cancelaciones de eventos
2. Aprovechar índices ya configurados (`orderIdIndex`, `eventIdIndex`)
3. Unificar toda la trazabilidad de reembolsos en un solo lugar
4. Evitar duplicación de infraestructura

**Compatibilidad:** Los registros de reembolsos individuales coexisten con los de cancelaciones de eventos en la misma tabla, diferenciándose por sus campos adicionales (`refund_type`, `ticket_instances`, `refund_amount`, etc.).

---

**Versión:** 2.0.0 - Migrado a ticketsCancelation  
**Fecha:** Enero 19, 2026  
**Autor:** DoEvents Team
