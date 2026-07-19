# 🎯 Endpoint: canRequestRefund (Validación de Reembolso)

## 📍 Información del Endpoint

**URL Base**: `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`

**Endpoint**: `POST /canRequestRefund/{eventId}`

**URL Completa**:

```
https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/{eventId}
```

**Método**: `POST`

**Ambiente**: `dev`

---

## 📋 Parámetros del Request

### Path Parameters

| Parámetro | Tipo   | Requerido | Descripción                                                         |
| --------- | ------ | --------- | ------------------------------------------------------------------- |
| `eventId` | string | ✅ Sí     | ID del evento para el cual se consulta la elegibilidad de reembolso |

### Body Parameters (JSON)

| Parámetro     | Tipo   | Requerido | Descripción                                      | Ejemplo           |
| ------------- | ------ | --------- | ------------------------------------------------ | ----------------- |
| `userId`      | string | ✅ Sí     | ID del usuario que solicita validar el reembolso | `"user123"`       |
| `orderId`     | string | ✅ Sí     | ID de la orden de compra del ticket              | `"order-abc-123"` |
| `currentDate` | string | ✅ Sí     | Fecha actual en formato YYYYMMDD                 | `"20251020"`      |

---

## 🔐 Validaciones de Seguridad

El servicio valida en orden:

1. **Parámetros requeridos**: userId, orderId, currentDate
2. **Formato de fecha**: currentDate debe ser YYYYMMDD
3. **Existencia de la orden**: Busca el orderId en la tabla Orders
4. **Propiedad del usuario**: Valida que `order.user_id === userId`
5. **Propiedad del evento**: Valida que `order.event_id === eventId`
6. **Estado de pago**: Valida que `order.payment_status === "APPROVED"`
7. **Política de reembolso**: Evalúa `categoriaReembolso` del evento según días faltantes

---

## 📤 Ejemplo de Request

### Request con cURL

```bash
curl -X POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/3adf210f-716b-43fb-84b4-ece5e2119af2 \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "orderId": "order-abc-123",
    "currentDate": "20251020"
  }'
```

### Request con JavaScript (Fetch)

```javascript
const eventId = "3adf210f-716b-43fb-84b4-ece5e2119af2";
const userId = "user123";
const orderId = "order-abc-123";
const currentDate = "20251020";

const response = await fetch(
  `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/${eventId}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: userId,
      orderId: orderId,
      currentDate: currentDate,
    }),
  }
);

const result = await response.json();
console.log(result);
```

### Request con Axios

```javascript
const axios = require("axios");

const eventId = "3adf210f-716b-43fb-84b4-ece5e2119af2";

const response = await axios.post(
  `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/${eventId}`,
  {
    userId: "user123",
    orderId: "order-abc-123",
    currentDate: "20251020",
  }
);

console.log(response.data);
```

### Request con Postman

```
Method: POST
URL: https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/3adf210f-716b-43fb-84b4-ece5e2119af2

Headers:
  Content-Type: application/json

Body (raw JSON):
{
  "userId": "user123",
  "orderId": "order-abc-123",
  "currentDate": "20251020"
}
```

---

## ✅ Respuestas de Éxito

### 200 OK - Puede solicitar reembolso

```json
{
  "success": true,
  "message": "Consulta exitosa",
  "data": {
    "eventId": "3adf210f-716b-43fb-84b4-ece5e2119af2",
    "eventName": "Concierto Rock Fest 2025",
    "eventDate": "20251215",
    "currentDate": "20251020",
    "daysUntilEvent": 56,
    "refundCategory": "30",
    "canRequestRefund": true,
    "requiresManualReview": false,
    "reason": "El evento permite reembolso con 30 días de anticipación y faltan 56 días",
    "orderInfo": {
      "orderId": "order-abc-123",
      "userId": "user123",
      "amount": 90000,
      "currency": "COP",
      "paymentStatus": "APPROVED",
      "createdAt": "2025-10-01T15:30:00.000Z"
    }
  }
}
```

### 200 OK - NO puede solicitar reembolso (sin anticipación suficiente)

```json
{
  "success": true,
  "message": "Consulta exitosa",
  "data": {
    "eventId": "3adf210f-716b-43fb-84b4-ece5e2119af2",
    "eventName": "Concierto Rock Fest 2025",
    "eventDate": "20251215",
    "currentDate": "20251205",
    "daysUntilEvent": 10,
    "refundCategory": "30",
    "canRequestRefund": false,
    "requiresManualReview": false,
    "reason": "El evento requiere 30 días de anticipación pero solo faltan 10 días",
    "orderInfo": {
      "orderId": "order-abc-123",
      "userId": "user123",
      "amount": 90000,
      "currency": "COP",
      "paymentStatus": "APPROVED",
      "createdAt": "2025-10-01T15:30:00.000Z"
    }
  }
}
```

### 200 OK - Requiere revisión manual (categoría "0")

```json
{
  "success": true,
  "message": "Consulta exitosa",
  "data": {
    "eventId": "3adf210f-716b-43fb-84b4-ece5e2119af2",
    "eventName": "Concierto VIP Premium",
    "eventDate": "20251215",
    "currentDate": "20251020",
    "daysUntilEvent": 56,
    "refundCategory": "0",
    "canRequestRefund": true,
    "requiresManualReview": true,
    "reason": "El evento requiere evaluación manual. Por favor contacta al administrador",
    "orderInfo": {
      "orderId": "order-abc-123",
      "userId": "user123",
      "amount": 150000,
      "currency": "COP",
      "paymentStatus": "APPROVED",
      "createdAt": "2025-10-01T15:30:00.000Z"
    }
  }
}
```

---

## ❌ Respuestas de Error

### 400 Bad Request - Parámetro faltante

```json
{
  "success": false,
  "message": "El parámetro userId es requerido en el body"
}
```

```json
{
  "success": false,
  "message": "El parámetro orderId es requerido en el body"
}
```

```json
{
  "success": false,
  "message": "El parámetro currentDate es requerido en el body (formato YYYYMMDD)"
}
```

### 400 Bad Request - Formato de fecha inválido

```json
{
  "success": false,
  "message": "El formato de currentDate debe ser YYYYMMDD"
}
```

### 400 Bad Request - Orden no aprobada

```json
{
  "success": false,
  "message": "No se puede solicitar reembolso para una orden con estado: PENDING"
}
```

### 403 Forbidden - La orden no pertenece al usuario

```json
{
  "success": false,
  "message": "La orden no pertenece al usuario especificado"
}
```

### 403 Forbidden - La orden no pertenece al evento

```json
{
  "success": false,
  "message": "La orden no pertenece al evento especificado"
}
```

### 404 Not Found - Orden no encontrada

```json
{
  "success": false,
  "message": "Orden no encontrada"
}
```

### 404 Not Found - Evento no encontrado

```json
{
  "success": false,
  "message": "Evento no encontrado"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Error al consultar elegibilidad de reembolso",
  "error": "Detalles del error"
}
```

---

## 🎯 Reglas de Negocio: categoriaReembolso

El campo `categoriaReembolso` del evento determina la política de reembolso:

| Categoría | Significado             | Comportamiento                                  |
| --------- | ----------------------- | ----------------------------------------------- |
| `"30"`    | 30 días de anticipación | ✅ Permite reembolso si faltan ≥30 días         |
| `"7"`     | 7 días de anticipación  | ✅ Permite reembolso si faltan ≥7 días          |
| `"1"`     | 1 día de anticipación   | ✅ Permite reembolso si falta ≥1 día            |
| `"0"`     | Evaluación manual       | ⚠️ Requiere aprobación manual del administrador |
| `"N"`     | No permite reembolsos   | ❌ Nunca permite reembolso                      |

---

## 🔍 Flujo de Validación

```
1. Usuario envía request con userId, orderId, currentDate
    ↓
2. ¿Están todos los parámetros requeridos?
    ├─ NO → 400 "Parámetro X es requerido"
    └─ SÍ → Continuar
    ↓
3. ¿El formato de fecha es YYYYMMDD?
    ├─ NO → 400 "Formato debe ser YYYYMMDD"
    └─ SÍ → Continuar
    ↓
4. ¿Existe la orden en DynamoDB?
    ├─ NO → 404 "Orden no encontrada"
    └─ SÍ → Continuar
    ↓
5. ¿order.user_id === userId?
    ├─ NO → 403 "La orden no pertenece al usuario"
    └─ SÍ → Continuar
    ↓
6. ¿order.event_id === eventId?
    ├─ NO → 403 "La orden no pertenece al evento"
    └─ SÍ → Continuar
    ↓
7. ¿order.payment_status === "APPROVED"?
    ├─ NO → 400 "No se puede solicitar reembolso para orden con estado: X"
    └─ SÍ → Continuar
    ↓
8. ¿Existe el evento en DynamoDB?
    ├─ NO → 404 "Evento no encontrado"
    └─ SÍ → Continuar
    ↓
9. Evaluar política de reembolso (categoriaReembolso)
    ↓
10. 200 OK con resultado (canRequestRefund: true/false)
```

---

## 🧪 Testing

### Probar con datos reales de tu DynamoDB

Asegúrate de tener:

1. **Un evento** en la tabla `Eventos-dev` con:

   - `id`: (cualquier ID válido)
   - `categoriaReembolso`: `"30"`, `"7"`, `"1"`, `"0"`, o `"N"`
   - `fecha`: formato `YYYYMMDD`

2. **Una orden** en la tabla `Orders-dev` con:
   - `orderId`: (cualquier ID válido)
   - `user_id`: (ID del usuario propietario)
   - `event_id`: (debe coincidir con el evento)
   - `payment_status`: `"APPROVED"`
   - `amount`: monto de la compra
   - `currency`: moneda (ej: `"COP"`)

### Ejemplo de Test Real

```bash
# Reemplaza con IDs reales de tu DynamoDB
curl -X POST https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com/canRequestRefund/TU_EVENT_ID_REAL \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "TU_USER_ID_REAL",
    "orderId": "TU_ORDER_ID_REAL",
    "currentDate": "20251020"
  }'
```

---

## 📊 Logs y Monitoreo

Los logs se encuentran en CloudWatch:

**Log Group**: `/aws/lambda/aws-lambda-manageevent-dev-canRequestRefund`

**Región**: `us-east-1`

Para ver logs en tiempo real:

```bash
serverless logs -f canRequestRefund --stage dev --tail
```

---

## 🚀 Resumen

- ✅ **Endpoint desplegado** y funcionando
- ✅ **Validaciones de seguridad** implementadas (orden pertenece a usuario y evento)
- ✅ **Política de reembolso** basada en categorías y días de anticipación
- ✅ **Respuestas detalladas** con información de la orden
- ✅ **Manejo de errores** completo (400, 403, 404, 500)

**Fecha de despliegue**: 20 de octubre de 2025  
**Función Lambda**: `aws-lambda-manageevent-dev-canRequestRefund`  
**ARN**: `arn:aws:lambda:us-east-1:519010577666:function:aws-lambda-manageevent-dev-canRequestRefund:1`
