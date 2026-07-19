# 🔄 Migración a Tabla ticketsCancelation

## 📋 Resumen

El servicio de reembolsos (`processRefund`) ha sido actualizado para utilizar la tabla existente **`ticketsCancelation`** en lugar de crear una nueva tabla `Refunds`.

**Fecha:** Enero 19, 2026  
**Motivo:** Mantener consistencia con el sistema de cancelación de eventos y aprovechar infraestructura existente.

---

## ✅ Cambios Realizados

### 1. **src/processRefund.js**

#### Antes:
```javascript
const REFUNDS_TABLE = process.env.REFUNDS_TABLE || "Refunds";

// Búsqueda con Scan
await dynamodb.send(
  new ScanCommand({
    TableName: process.env.REFUNDS_TABLE || "Refunds",
    FilterExpression: "order_id = :orderId",
    //...
  })
);

// Estructura de datos
{
  refund_id: "REFUND-timestamp-random",
  order_id: "...",
  user_id: "...",
  refund_status: "PENDING",
  //...
}
```

#### Después:
```javascript
const TICKETS_CANCELATION_TABLE = process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation";

// Búsqueda con Query usando GSI
await dynamodb.send(
  new QueryCommand({
    TableName: process.env.TICKETS_CANCELATION_TABLE || "ticketsCancelation",
    IndexName: "orderIdIndex",
    KeyConditionExpression: "orderId = :orderId",
    //...
  })
);

// Estructura de datos compatible
{
  id: "uuid-v4",
  orderId: "...",
  eventId: "...",
  userId: "...",
  refundStatus: "PENDING",
  ticket_instances: [...],
  refund_type: "FULL",
  refund_amount: 150000,
  //...
}
```

**Mejoras:**
- ✅ Uso de Query en lugar de Scan (más eficiente)
- ✅ Campos compatibles con cancelaciones de eventos
- ✅ UUID en lugar de timestamp+random
- ✅ Nombres de campos snake_case/camelCase según estándar

---

### 2. **serverless.yml**

#### Cambios:
```yaml
# ANTES
environment:
  REFUNDS_TABLE: Refunds

iamRoleStatements:
  Resource:
    - arn:aws:dynamodb:us-east-1:519010577666:table/Refunds
    - arn:aws:dynamodb:us-east-1:519010577666:table/Refunds/index/*
```

```yaml
# DESPUÉS
environment:
  TICKETS_CANCELATION_TABLE: ticketsCancelation

iamRoleStatements:
  Resource:
    - arn:aws:dynamodb:us-east-1:519010577666:table/ticketsCancelation
    - arn:aws:dynamodb:us-east-1:519010577666:table/ticketsCancelation/index/*
```

**Permisos eliminados:**
- ❌ Tabla `Refunds` (ya no se usa)

---

### 3. **REFUND_SERVICE_README.md**

Actualizada la documentación completa:
- ✅ Referencias a tabla `ticketsCancelation`
- ✅ Estructura de datos actualizada
- ✅ Explicación de índices GSI existentes
- ✅ Ventajas de la integración

---

### 4. **test-refund-service.js**

- ✅ Comentario agregado indicando uso de `ticketsCancelation`

---

### 5. **create-refunds-table.js**

- ⚠️ Renombrado a `create-refunds-table.js.OBSOLETO`
- ✅ Header agregado explicando que ya no se usa
- 📝 Archivo mantenido como referencia histórica

---

## 🗄️ Estructura de Tabla ticketsCancelation

### Esquema Actual

```javascript
{
  // Primary Key
  id: String (UUID),
  
  // Campos compartidos entre cancelaciones y reembolsos
  orderId: String,              // GSI: orderIdIndex
  eventId: String,              // GSI: eventIdIndex
  userId: String,
  refundStatus: String,         // "PENDING" | "COMPLETED" | "REJECTED"
  reason: String,
  createdAt: String (ISO),
  executionDate: String (ISO),
  
  // Campos específicos de reembolsos (nuevos)
  refund_type: String,          // "FULL" | "PARTIAL"
  ticket_instances: Array,      // ["ticket-1", "ticket-2", ...]
  quantity: Number,
  refund_amount: Number,
  original_total: Number,
  payment_method: String,
  
  // Campos específicos de eventos (existentes)
  eventName: String,
  eventStartDate: String,
  eventEndDate: String,
  originalStatus: String
}
```

### Índices GSI

1. **orderIdIndex**
   - Partition Key: `orderId`
   - Uso: Buscar todos los reembolsos de una orden

2. **eventIdIndex**
   - Partition Key: `eventId`
   - Uso: Buscar todos los reembolsos/cancelaciones de un evento

---

## 🎯 Ventajas de la Migración

### 1. **Consistencia del Sistema**
- ✅ Un solo lugar para toda la trazabilidad de reembolsos
- ✅ Compatible con cancelaciones masivas de eventos
- ✅ Consultas unificadas

### 2. **Performance**
- ✅ Uso de Query (GSI) en lugar de Scan
- ✅ Índices ya configurados y optimizados
- ✅ Sin necesidad de crear nueva infraestructura

### 3. **Mantenimiento**
- ✅ Menos tablas que gestionar
- ✅ Menos costos de DynamoDB
- ✅ Administración simplificada

### 4. **Idempotencia Mejorada**
- ✅ Verificaciones más rápidas con Query
- ✅ Protección contra duplicados optimizada

---

## 🔄 Compatibilidad

### Registros Existentes

Los registros existentes de cancelaciones de eventos en `ticketsCancelation` **NO SE VEN AFECTADOS**:

```javascript
// Cancelación de evento (registro existente)
{
  id: "uuid",
  orderId: "order-123",
  eventId: "event-456",
  refundStatus: "PENDING",
  reason: "Cancelación del evento",
  eventName: "Concierto 2026",
  // NO tiene: ticket_instances, refund_type, etc.
}

// Reembolso individual (registro nuevo)
{
  id: "uuid",
  orderId: "order-789",
  eventId: "event-456",
  refundStatus: "PENDING",
  reason: "Solicitud de usuario",
  refund_type: "PARTIAL",           // ← Campo adicional
  ticket_instances: ["t1", "t2"],   // ← Campo adicional
  refund_amount: 50000,             // ← Campo adicional
  // ...otros campos...
}
```

**Diferenciación:**
- Cancelaciones de eventos: Sin campos `ticket_instances` ni `refund_type`
- Reembolsos individuales: Incluyen campos adicionales específicos

---

## 🚀 Despliegue

### Pasos para Desplegar

1. **No se requiere crear tabla nueva** ✅
   ```bash
   # La tabla ticketsCancelation ya existe
   ```

2. **Desplegar el servicio**
   ```bash
   cd aws-lambda-manageevents
   serverless deploy --force
   ```

3. **Verificar variables de entorno**
   ```bash
   aws lambda get-function-configuration \
     --function-name aws-lambda-manageevent-dev-processRefund \
     --query 'Environment.Variables.TICKETS_CANCELATION_TABLE'
   ```

   **Resultado esperado:** `"ticketsCancelation"`

4. **Probar el endpoint**
   ```bash
   curl -X POST https://API_ID.execute-api.us-east-1.amazonaws.com/processRefund \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "user-123",
       "orderId": "order-456"
     }'
   ```

---

## 📊 Testing

### Verificar Registros en DynamoDB

```bash
# Buscar reembolsos por orden
aws dynamodb query \
  --table-name ticketsCancelation \
  --index-name orderIdIndex \
  --key-condition-expression "orderId = :oid" \
  --expression-attribute-values '{":oid":{"S":"order-123"}}'

# Buscar reembolsos por evento
aws dynamodb query \
  --table-name ticketsCancelation \
  --index-name eventIdIndex \
  --key-condition-expression "eventId = :eid" \
  --expression-attribute-values '{":eid":{"S":"event-456"}}'
```

---

## 🔍 Monitoreo

### Queries de CloudWatch Insights

```sql
-- Reembolsos procesados hoy
fields @timestamp, orderId, refundStatus, refund_amount
| filter @message like /Registro de trazabilidad creado/
| sort @timestamp desc

-- Reembolsos duplicados detectados (idempotencia)
fields @timestamp, orderId, refundId
| filter @message like /Reembolso duplicado detectado/
| count()

-- Errores en reembolsos
fields @timestamp, @message
| filter @message like /Error/ and @message like /reembolso/
| sort @timestamp desc
```

---

## ✅ Checklist Post-Migración

- [x] Código actualizado (`processRefund.js`)
- [x] Configuración actualizada (`serverless.yml`)
- [x] Documentación actualizada (`REFUND_SERVICE_README.md`)
- [x] Tests actualizados (`test-refund-service.js`)
- [x] Script obsoleto marcado (`create-refunds-table.js.OBSOLETO`)
- [ ] Despliegue a producción
- [ ] Pruebas en ambiente productivo
- [ ] Verificación de logs
- [ ] Actualización de monitoreo/alarmas

---

## 📞 Soporte

**Equipo:** DoEvents Backend Team  
**Fecha de implementación:** Enero 19, 2026  
**Versión del servicio:** 2.0.0

