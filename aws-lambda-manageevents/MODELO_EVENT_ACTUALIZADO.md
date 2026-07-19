# Modelo EVENT Actualizado - Integración Completa

## 📋 Resumen de Cambios

Se han actualizado los handlers `createEvent.js`, `updateEvent.js` y `publishEvent.js` para incluir los campos del modelo EVENT propuesto, manteniendo compatibilidad con campos existentes.

## 🔄 Mapeo de Campos

### Campos Mantenidos (Español)

| Campo Actual   | Modelo EVENT      | Tipo   | Descripción                         |
| -------------- | ----------------- | ------ | ----------------------------------- |
| `id`           | `eventId`         | string | ID único del evento (UUID)          |
| `nombre`       | `name`            | string | Nombre del evento                   |
| `descripcion`  | `description`     | string | Descripción del evento              |
| `fechaIni`     | `startDate`       | string | Fecha inicio (formato: YYYYMMDD)    |
| `fechaFin`     | `endDate`         | string | Fecha fin (formato: YYYYMMDD)       |
| `userId`       | `organizerUserId` | string | ID del organizador                  |
| `tipoEvento`   | `type`            | string | Tipo de evento                      |
| `Categoria`    | `category`        | string | Categoría del evento                |
| `aforo`        | `capacityPlan`    | number | Capacidad planificada               |
| `pais`         | `country`         | string | País (desde ubicacion.country)      |
| `ciudad`       | `city`            | string | Ciudad (desde ubicacion.city)       |
| `direccion`    | `address`         | string | Dirección (desde ubicacion.address) |
| `createDate`   | `createdAt`       | string | Fecha de creación (ISO)             |
| `estatus`      | `status`          | string | Estado del evento                   |
| `Hashtags`     | -                 | string | Hashtags (mantenido)                |
| `modalidadEvt` | `visibility`      | string | Visibilidad del evento              |

### Campos Nuevos Agregados

| Campo          | Tipo    | Descripción                           | Valor por Defecto          |
| -------------- | ------- | ------------------------------------- | -------------------------- |
| `slug`         | string  | URL amigable (auto-generado)          | `{nombre-slug}-{id-corto}` |
| `tags`         | string  | Etiquetas (sincronizado con Hashtags) | `Hashtags`                 |
| `timezone`     | string  | Zona horaria del evento               | `America/Bogota`           |
| `skipVenue`    | boolean | Si el evento no requiere venue físico | `false`                    |
| `venueId`      | string  | ID del venue (FK a Venues)            | `null` si skipVenue=true   |
| `layoutId`     | string  | ID del layout del evento              | `null`                     |
| `currency`     | string  | Moneda del evento                     | `COP`                      |
| `media`        | string  | JSON con medios (imágenes/videos)     | `null`                     |
| `faq`          | array   | Preguntas frecuentes (Array de {question, answer}) | `null`                     |
| `policies`     | string  | Políticas del evento                  | `null`                     |
| `salesStartAt` | string  | Fecha inicio ventas (ISO)             | `null`                     |
| `salesEndAt`   | string  | Fecha fin ventas (ISO)                | `null`                     |
| `publishAt`    | string  | Fecha publicación programada (ISO)    | `null`                     |
| `itinerary`    | array   | Array de actividades simples          | `null`                     |
| `eventDays`    | array   | Agenda estructurada por días con actividades | `null`                     |
| `updatedAt`    | string  | Fecha última actualización (ISO)      | `createDate`               |
| `createdBy`    | string  | Usuario que creó                      | `userId`                   |
| `updatedBy`    | string  | Usuario que actualizó                 | `userId`                   |

### Campo Especial: `ubicacion`

El campo `ubicacion` es un objeto JSON que contiene:

```json
{
  "country": "Colombia",
  "address": "Cl. 80 # 8-55, Barrios Unidos, Bogotá, D.C.",
  "city": "Bogotá, D.C.",
  "street": "Calle 80",
  "latitude": 4.667,
  "postalCode": "110231",
  "state": "Bogotá, D.C.",
  "longitude": -74.071,
  "timezone": "America/Bogota"
}
```

El `timezone` se extrae automáticamente de `ubicacion.timezone` si no se proporciona explícitamente.

## 📝 Ejemplos de Uso

### 1. Crear Evento con Venue Físico

```json
POST /events
{
  "nombre": "Concierto Rock en Vivo",
  "descripcion": "Gran concierto de rock con bandas locales",
  "fechaIni": "15/12/2025",
  "fechaFin": "15/12/2025",
  "horaIni": "20:00",
  "horaFin": "23:00",
  "ubicacion": {
    "country": "Colombia",
    "city": "Bogotá",
    "address": "Calle 80 # 8-55",
    "postalCode": "110231",
    "latitude": 4.667,
    "longitude": -74.071,
    "timezone": "America/Bogota"
  },
  "userId": "user-123",
  "organizerName": "Rock Eventos SAS",
  "email": "contacto@rockeventos.com",
  "tipoEvento": "Concierto",
  "Categoria": "Música",
  "aforo": 5000,
  "modalidadEvt": "public",
  "Hashtags": "#rock #musica #bogota",
  "skipVenue": false,
  "venueId": "venue-estadio-campin-001",
  "currency": "COP",
  "salesStartAt": "2025-11-01T00:00:00Z",
  "salesEndAt": "2025-12-15T20:00:00Z",
  "publishAt": "2025-11-01T10:00:00Z"
}
```

**Respuesta:**

```json
{
  "success": true,
  "message": "exitoso",
  "data": {
    "statusDesc": "Evento creado exitosamente",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "concierto-rock-en-vivo-550e8400",
    "createDate": "2025-11-17T10:30:00.000Z"
  }
}
```

### 2. Crear Evento Virtual (sin venue)

```json
POST /events
{
  "nombre": "Webinar Marketing Digital",
  "descripcion": "Aprende las mejores estrategias de marketing",
  "fechaIni": "20/12/2025",
  "fechaFin": "20/12/2025",
  "horaIni": "15:00",
  "horaFin": "17:00",
  "userId": "user-456",
  "organizerName": "Academia Digital",
  "email": "info@academiadigital.com",
  "tipoEvento": "Webinar",
  "Categoria": "Educación",
  "aforo": 1000,
  "modalidadEvt": "public",
  "skipVenue": true,
  "currency": "USD",
  "timezone": "America/New_York",
  "video": "https://zoom.us/meeting/123456"
}
```

### 3. Actualizar Evento

```json
PUT /events/{eventId}
{
  "nombre": "Concierto Rock en Vivo - NUEVA FECHA",
  "fechaIni": "20/12/2025",
  "fechaFin": "20/12/2025",
  "publishAt": "2025-11-20T10:00:00Z",
  "updatedBy": "user-123"
}
```

### 4. Publicar Evento Inmediatamente

```json
POST /publish-event
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "publishNow": true
}
```

**Respuesta:**

```json
{
  "success": true,
  "message": "exitoso",
  "data": {
    "message": "Evento publicado y chat creado exitosamente",
    "createDate": "2025-11-17T10:30:00.000Z",
    "publishedNow": true,
    "publishAt": "2025-11-17T10:30:00.000Z",
    "chatRoomId": "chat-room-event-abc123xyz"
  }
}
```

### 5. Programar Publicación Futura

```json
POST /publish-event
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "publishNow": false
}
```

**Respuesta:**

```json
{
  "success": true,
  "message": "exitoso",
  "data": {
    "message": "Evento programado para publicación el 2025-11-20T10:00:00Z",
    "createDate": "2025-11-17T10:30:00.000Z",
    "publishedNow": false,
    "publishAt": "2025-11-20T10:00:00.000Z",
    "chatRoomId": "chat-room-event-abc123xyz"
  }
}
```

## 🔔 Integración con Notificaciones

### Eventos que Disparan Notificaciones

1. **Publicación de Evento** (`publishEvent.js`)

   - Canal: Email, Push, In-App
   - Destinatario: Organizador
   - Template: `event_published`

2. **Cancelación de Evento** (`cancelEvent.js` - existente)

   - Canal: Email, Push, WhatsApp
   - Destinatarios: Todos los usuarios con tickets
   - Template: `event_cancelled`

3. **Reprogramación de Evento** (`rescheduleEvent.js` - existente)
   - Canal: Email, Push, WhatsApp
   - Destinatarios: Todos los usuarios con tickets
   - Template: `event_rescheduled`

### Payload de Notificación

```javascript
const notificationPayload = {
  templateType: "event_published",
  userId: organizerUserId,
  eventId: eventId,
  channels: ["email", "push", "inApp"],
  data: {
    eventName: "Concierto Rock en Vivo",
    eventSlug: "concierto-rock-en-vivo-550e8400",
    eventDate: "20251215",
    eventLocation: "Bogotá",
    organizerName: "Rock Eventos SAS",
  },
};
```

### Variables de Entorno Requeridas

Agregar en `serverless.yml`:

```yaml
environment:
  NOTIFICATIONS_LAMBDA: aws-lambda-notifications-dev-triggerNotification
```

## ✅ Validaciones Implementadas

### createEvent.js

1. ✅ Si `skipVenue = false`, `venueId` es obligatorio
2. ✅ Auto-generación de `slug` desde `nombre` si no se proporciona
3. ✅ Extracción de `timezone` desde `ubicacion.timezone` si existe
4. ✅ `tags` sincronizado con `Hashtags` automáticamente
5. ✅ `currency` por defecto es `COP`
6. ✅ `venueId` se establece en `null` si `skipVenue = true`

### updateEvent.js

1. ✅ Si `skipVenue = false`, `venueId` es obligatorio
2. ✅ `tags` sincronizado con `Hashtags` si se actualiza
3. ✅ `venueId` se establece en `null` automáticamente si `skipVenue = true`
4. ✅ `updatedAt` y `updatedBy` se actualizan automáticamente
5. ✅ Validación de fechas en formato `DD/MM/YYYY`

### publishEvent.js

1. ✅ Validación de `eventId` obligatorio
2. ✅ Verificación de existencia del evento antes de publicar
3. ✅ Publicación inmediata o programada según `publishNow` y `publishAt`
4. ✅ Creación automática de chat room para el evento
5. ✅ Envío de notificación si se publica inmediatamente
6. ✅ La notificación no bloquea la publicación si falla

## 🔗 Relaciones con Otras Tablas

### Con Venues (aws-lambda-venues)

```javascript
// Si skipVenue = false
{
  "venueId": "venue-estadio-campin-001", // FK a Venue_Id
  "skipVenue": false
}

// Si skipVenue = true (evento virtual)
{
  "venueId": null,
  "skipVenue": true,
  "layoutId": "layout-custom-001" // Layout ad-hoc
}
```

### Con Tickets

```javascript
// Los campos salesStartAt y salesEndAt controlan las ventas
{
  "salesStartAt": "2025-11-01T00:00:00Z",
  "salesEndAt": "2025-12-15T20:00:00Z",
  "currency": "COP"
}
```

### Con Notifications

```javascript
// Eventos disparan notificaciones automáticas
// Ver templates en aws-lambda-notifications/src/templates/
```

## 📦 Próximos Pasos

1. ✅ Agregar variables de entorno en `serverless.yml`
2. ⏳ Crear índices GSI para `slug` (búsqueda por URL amigable)
3. ⏳ Crear índices GSI para `venueId` (búsqueda de eventos por venue)
4. ⏳ Implementar scheduler para publicación programada (EventBridge)
5. ⏳ Crear template de notificación `event_published` en lambda de notificaciones
6. ⏳ Agregar validación de duplicidad de `slug`
7. ⏳ Implementar endpoint para obtener evento por `slug` además de `id`

## 🧪 Testing

Agregar tests para:

- Creación de evento con venue
- Creación de evento sin venue (virtual)
- Validación de `venueId` cuando `skipVenue = false`
- Auto-generación de `slug`
- Publicación inmediata vs programada
- Envío de notificaciones
