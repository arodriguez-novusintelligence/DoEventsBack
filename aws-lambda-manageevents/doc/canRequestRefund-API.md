# 🔄 Validación de Reembolsos - canRequestRefund

## 📋 Descripción

Servicio que valida si un usuario puede solicitar reembolso para un evento basándose en:

- La fecha actual proporcionada
- La fecha de inicio del evento (`fechaIni`)
- La categoría de reembolso del evento (`categoriaReembolso`)

## 🎯 Endpoint

```
POST /canRequestRefund/{eventId}
```

## 📥 Parámetros

### Path Parameters

- `eventId` (string, requerido): ID del evento

### Body Parameters

```json
{
  "currentDate": "20251101" // Formato YYYYMMDD
}
```

## 📊 Categorías de Reembolso

| Categoría | Descripción             | Comportamiento                        |
| --------- | ----------------------- | ------------------------------------- |
| `30`      | 30 días de anticipación | Permite reembolso si faltan ≥ 30 días |
| `7`       | 7 días de anticipación  | Permite reembolso si faltan ≥ 7 días  |
| `1`       | 1 día de anticipación   | Permite reembolso si faltan ≥ 1 día   |
| `0`       | Evaluación caso a caso  | Requiere revisión manual              |
| `N`       | No permite reembolsos   | Rechaza todas las solicitudes         |

## 📤 Respuestas

### ✅ Éxito (200)

```json
{
  "success": true,
  "data": {
    "eventId": "3adf210f-716b-43fb-84b4-ece5e2119af2",
    "eventName": "Conferencia Tech 2025",
    "eventDate": "20251215",
    "currentDate": "20251101",
    "daysUntilEvent": 44,
    "refundCategory": "30",
    "canRequestRefund": true,
    "requiresManualReview": false,
    "reason": "Puedes solicitar reembolso. Faltan 44 días para el evento (mínimo requerido: 30 días)"
  }
}
```

### ❌ Error 400 - Parámetros inválidos

```json
{
  "success": false,
  "message": "El formato de currentDate debe ser YYYYMMDD"
}
```

### ❌ Error 404 - Evento no encontrado

```json
{
  "success": false,
  "message": "Evento no encontrado"
}
```

## 🧪 Ejemplos de Uso

### Ejemplo 1: Puede solicitar reembolso (30 días)

**Request:**

```bash
curl -X POST https://API_URL/canRequestRefund/3adf210f-716b-43fb-84b4-ece5e2119af2 \
  -H "Content-Type: application/json" \
  -d '{
    "currentDate": "20251101"
  }'
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "eventId": "3adf210f-716b-43fb-84b4-ece5e2119af2",
    "eventName": "Conferencia Tech 2025",
    "eventDate": "20251215",
    "currentDate": "20251101",
    "daysUntilEvent": 44,
    "refundCategory": "30",
    "canRequestRefund": true,
    "requiresManualReview": false,
    "reason": "Puedes solicitar reembolso. Faltan 44 días para el evento (mínimo requerido: 30 días)"
  }
}
```

### Ejemplo 2: No puede solicitar (insuficiente anticipación)

**Request:**

```bash
curl -X POST https://API_URL/canRequestRefund/3adf210f-716b-43fb-84b4-ece5e2119af2 \
  -H "Content-Type: application/json" \
  -d '{
    "currentDate": "20251210"
  }'
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "eventId": "3adf210f-716b-43fb-84b4-ece5e2119af2",
    "eventName": "Conferencia Tech 2025",
    "eventDate": "20251215",
    "currentDate": "20251210",
    "daysUntilEvent": 5,
    "refundCategory": "30",
    "canRequestRefund": false,
    "requiresManualReview": false,
    "reason": "No puedes solicitar reembolso. Faltan 5 días para el evento (mínimo requerido: 30 días de anticipación)"
  }
}
```

### Ejemplo 3: Requiere evaluación manual

**Request:**

```bash
curl -X POST https://API_URL/canRequestRefund/evento-categoria-0 \
  -H "Content-Type: application/json" \
  -d '{
    "currentDate": "20251201"
  }'
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "eventId": "evento-categoria-0",
    "eventName": "Evento Especial",
    "eventDate": "20251215",
    "currentDate": "20251201",
    "daysUntilEvent": 14,
    "refundCategory": "0",
    "canRequestRefund": false,
    "requiresManualReview": true,
    "reason": "Las solicitudes de reembolso para este evento se evalúan caso a caso. Por favor contacta al organizador"
  }
}
```

### Ejemplo 4: No permite reembolsos

**Request:**

```bash
curl -X POST https://API_URL/canRequestRefund/evento-sin-reembolso \
  -H "Content-Type: application/json" \
  -d '{
    "currentDate": "20251101"
  }'
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "eventId": "evento-sin-reembolso",
    "eventName": "Evento sin reembolso",
    "eventDate": "20251215",
    "currentDate": "20251101",
    "daysUntilEvent": 44,
    "refundCategory": "N",
    "canRequestRefund": false,
    "requiresManualReview": false,
    "reason": "Este evento no permite solicitudes de reembolso"
  }
}
```

## 🧪 Pruebas

Para ejecutar las pruebas del servicio:

```bash
cd aws-lambda-manageevents
node test-canRequestRefund.js
```

El script de prueba validará diferentes escenarios:

1. Categoría 30 días - Con suficiente anticipación
2. Categoría 30 días - Sin suficiente anticipación
3. Categoría 7 días - Con suficiente anticipación
4. Categoría 1 día - Al límite
5. Evento ya pasado
6. Formato de fecha incorrecto
7. Evento no encontrado

## 🚀 Despliegue

Para desplegar el servicio:

```bash
cd aws-lambda-manageevents
serverless deploy --stage dev
```

## 🔧 Configuración en DynamoDB

Asegúrate de que los eventos en la tabla `Eventos` tengan el campo `categoriaReembolso` configurado con uno de estos valores:

- `"30"` - Requiere 30 días de anticipación
- `"7"` - Requiere 7 días de anticipación
- `"1"` - Requiere 1 día de anticipación
- `"0"` - Evaluación manual
- `"N"` - No permite reembolsos

### Ejemplo de actualización en DynamoDB:

```javascript
// Actualizar evento con categoría de reembolso
{
  "id": "3adf210f-716b-43fb-84b4-ece5e2119af2",
  "nombre": "Conferencia Tech 2025",
  "fechaIni": "20251215",
  "categoriaReembolso": "30",  // <- Campo requerido
  // ... otros campos
}
```

## 📝 Notas Técnicas

### Cálculo de Días

El servicio calcula la diferencia en días entre `currentDate` y `fechaIni` del evento usando la siguiente lógica:

```javascript
// Diferencia en días (resultado positivo = evento en el futuro)
daysUntilEvent = (fechaIni - currentDate) / (1000 * 60 * 60 * 24);
```

### Validaciones

1. **Formato de fecha**: Debe ser YYYYMMDD (8 dígitos)
2. **Evento existente**: El eventId debe existir en la tabla Eventos
3. **Campos requeridos**: fechaIni y categoriaReembolso deben estar definidos
4. **Categoría válida**: Solo se aceptan valores: 30, 7, 1, 0, N

### Logs

El servicio genera logs detallados en CloudWatch:

```
🔍 Iniciando validación de reembolso
📅 Validando reembolso para evento: {eventId}
📅 Fecha actual: {currentDate}
✅ Evento encontrado: {...}
📊 Días faltantes para el evento: {days}
🔍 Categoría de reembolso: {categoria}
✅ Categoría {X}: Puede/No puede solicitar reembolso
```

## 🔒 Seguridad

- CORS habilitado para todas las origins (`*`)
- Validación estricta de parámetros de entrada
- Manejo de errores robusto
- Logs detallados para auditoría

## 🐛 Troubleshooting

### Error: "El formato de currentDate debe ser YYYYMMDD"

**Solución**: Asegúrate de enviar la fecha en formato correcto: `"20251101"` (sin guiones ni separadores)

### Error: "Evento no encontrado"

**Solución**: Verifica que el eventId exista en la tabla Eventos de DynamoDB

### Error: "Categoría de reembolso no válida"

**Solución**: El evento debe tener `categoriaReembolso` con valor: 30, 7, 1, 0, o N

## 📚 Referencias

- [Documentación Swagger](./doc/swagger-manageevents.yml)
- [Código fuente](./src/canRequestRefund.js)
- [Tests](./test-canRequestRefund.js)
