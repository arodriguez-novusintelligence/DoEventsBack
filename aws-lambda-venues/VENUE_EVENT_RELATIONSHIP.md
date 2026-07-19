# Relación Bidireccional: Venues ↔ Eventos

## 📋 Resumen

Se implementó una relación bidireccional entre las tablas `Venues` y `Eventos` para mantener sincronizados los IDs cuando un venue se crea o clona específicamente para un evento.

---

## 🔄 Flujo de Relación

### Caso 1: Crear Venue para Evento Específico

**Endpoint:** `POST /venues`

**Request Body:**

```json
{
  "name": "Estadio El Campín - Concierto Rock 2025",
  "eventId": "uuid-del-evento",
  "ownerUserId": "user-123",
  "type": "stadium",
  "capacity": 50000,
  "hasSeating": true,
  ...
}
```

**Proceso:**

1. Se crea el venue en la tabla `Venues` con:

   - `venueId`: UUID generado
   - `eventId`: UUID del evento (del request)
   - `isEventVenue`: `true`
   - `baseVenueId`: `null` o ID del venue original si fue clonado

2. **Automáticamente** se actualiza el evento en la tabla `Eventos`:
   ```javascript
   UPDATE Eventos
   SET venueId = :venueId, updatedAt = :updatedAt
   WHERE id = :eventId
   ```

**Resultado:**

- ✅ Venue creado con referencia al evento (`eventId`)
- ✅ Evento actualizado con referencia al venue (`venueId`)
- ✅ Relación bidireccional establecida

---

### Caso 2: Clonar Venue Base para Evento

**Endpoint:** `POST /venues/clone-for-event`

**Request Body:**

```json
{
  "baseVenueId": "uuid-del-venue-template",
  "eventId": "uuid-del-evento",
  "name": "Estadio El Campín - Evento Específico",
  "hasSeating": true,
  "overrides": {
    "capacity": 45000
  }
}
```

**Proceso:**

1. Se clona el venue base completo (venue, floors, categories, seats, gates)
2. Se crea el nuevo venue en `Venues` con:

   - `venueId`: UUID nuevo
   - `eventId`: UUID del evento
   - `isEventVenue`: `true`
   - `baseVenueId`: UUID del venue template

3. **Automáticamente** se actualiza el evento en `Eventos`:
   ```javascript
   UPDATE Eventos
   SET venueId = :newVenueId, updatedAt = :updatedAt
   WHERE id = :eventId
   ```

**Resultado:**

- ✅ Venue clonado con todas sus estructuras
- ✅ Evento actualizado con el nuevo `venueId`
- ✅ Relación bidireccional establecida
- ✅ Contador `usageCount` del venue base incrementado

---

## 🗂️ Estructura de Datos

### Tabla: Venues

```javascript
{
  "venue_id": "venue-uuid-123",
  "venueId": "venue-uuid-123", // Duplicado para compatibilidad
  "name": "Estadio El Campín - Rock 2025",
  "eventId": "event-uuid-456", // ← Referencia al evento
  "isEventVenue": true,
  "hasSeating": true,
  "baseVenueId": "venue-template-789", // Opcional
  "capacity": 50000,
  ...
}
```

**GSI:** `eventId-index` (KeyConditionExpression: `eventId = :eventId`)

---

### Tabla: Eventos

```javascript
{
  "id": "event-uuid-456",
  "nombre": "Concierto Rock 2025",
  "venueId": "venue-uuid-123", // ← Referencia al venue
  "skipVenue": false,
  "layoutId": "layout-uuid-000",
  ...
}
```

**GSI:** `venueId-index` (KeyConditionExpression: `venueId = :venueId`)

**⚠️ Importante:** Si `venueId` es `null`, el campo **no se incluye** en el item para evitar errores con el GSI.

---

## 🔍 Consultas Disponibles

### 1. Obtener todos los eventos de un venue específico

```javascript
const params = {
  TableName: "Eventos",
  IndexName: "venueId-index",
  KeyConditionExpression: "venueId = :venueId",
  ExpressionAttributeValues: {
    ":venueId": "venue-uuid-123",
  },
};
```

### 2. Obtener el venue de un evento específico

```javascript
const params = {
  TableName: "Venues",
  IndexName: "eventId-index",
  KeyConditionExpression: "eventId = :eventId",
  ExpressionAttributeValues: {
    ":eventId": "event-uuid-456",
  },
};
```

---

## 🛡️ Manejo de Errores

### En createVenueHandler.js

```javascript
if (isEventVenue && eventId) {
  try {
    await dynamodb
      .update({
        TableName: "Eventos",
        Key: { id: eventId },
        UpdateExpression: "SET venueId = :venueId, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":venueId": venueId,
          ":updatedAt": now,
        },
        ConditionExpression: "attribute_exists(id)",
      })
      .promise();
    console.log(`✅ Evento ${eventId} actualizado con venueId ${venueId}`);
  } catch (updateError) {
    console.error(`⚠️ Error actualizando evento ${eventId}:`, updateError);
    // No fallar la creación del venue si la actualización del evento falla
  }
}
```

**Comportamiento:**

- Si el evento **no existe**, se loguea el error pero el venue se crea correctamente
- Si hay un error de red o timeout, se loguea pero no falla la operación
- La creación del venue siempre tiene éxito, la actualización del evento es "best effort"

---

## 🔐 Permisos IAM

En `serverless.yml` de `aws-lambda-venues`:

```yaml
iam:
  role:
    statements:
      - Effect: Allow
        Action:
          - dynamodb:UpdateItem
          - dynamodb:GetItem
        Resource:
          - arn:aws:dynamodb:${self:provider.region}:*:table/Eventos
          - arn:aws:dynamodb:${self:provider.region}:*:table/Eventos/index/*
```

✅ Permisos agregados para actualizar la tabla `Eventos`

---

## 📊 Casos de Uso

### Venue Template (No atado a evento)

```json
{
  "venueId": "template-uuid-001",
  "name": "Estadio El Campín (Template)",
  "eventId": null, // ← Campo no incluido en el item
  "isEventVenue": false,
  "isTemplate": true,
  "usageCount": 25
}
```

### Venue de Evento Específico

```json
{
  "venueId": "event-venue-uuid-002",
  "name": "Estadio El Campín - Rock 2025",
  "eventId": "event-uuid-456",
  "isEventVenue": true,
  "baseVenueId": "template-uuid-001",
  "hasSeating": true
}
```

### Evento con Venue Asignado

```json
{
  "id": "event-uuid-456",
  "nombre": "Concierto Rock 2025",
  "venueId": "event-venue-uuid-002",
  "skipVenue": false,
  "layoutId": "layout-uuid-789"
}
```

### Evento sin Venue (skipVenue = true)

```json
{
  "id": "event-uuid-999",
  "nombre": "Evento Virtual Online",
  "skipVenue": true
  // venueId no existe en el item
}
```

---

## 🧪 Testing

### Crear Venue para Evento

```bash
curl -X POST https://api-url/venues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Venue Test",
    "eventId": "test-event-123",
    "ownerUserId": "user-456",
    "type": "stadium",
    "capacity": 10000,
    "hasSeating": true
  }'
```

### Verificar Relación Bidireccional

1. **Consultar el venue:**

```bash
GET /venues/{venueId}
```

Debe tener: `"eventId": "test-event-123"`

2. **Consultar el evento:**

```bash
GET /getEvents/{eventId}
```

Debe tener: `"venueId": "{venueId}"`

---

## 📝 Notas Importantes

1. **Campo `venueId` opcional en Eventos:**

   - Si el evento tiene `skipVenue = true`, el campo `venueId` **no se incluye** en el item
   - Esto evita errores con el GSI `venueId-index` (claves no pueden ser `null`)

2. **Actualización automática:**

   - Solo se actualiza el evento cuando `isEventVenue = true` y `eventId` tiene valor
   - La actualización es asíncrona y no bloquea la creación del venue

3. **Idempotencia:**

   - Si se llama múltiples veces con el mismo `eventId`, el evento se actualiza con el `venueId` más reciente

4. **Cleanup:**
   - Si se elimina un venue de evento, considerar actualizar el evento para quitar la referencia

---

## 🚀 Deployment

```bash
cd aws-lambda-venues
serverless deploy
```

Las funciones `createVenue` y `cloneVenueForEvent` ya tienen la lógica implementada.

---

**Última actualización:** Diciembre 8, 2025
