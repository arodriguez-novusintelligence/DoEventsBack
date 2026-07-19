# API Documentation - ManageEvents Service

**Servicio:** aws-lambda-manageevent  
**Región:** us-east-1  
**Base URL:** `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`

---

## 📋 Índice

1. [Estructura de Datos del Evento](#estructura-de-datos-del-evento)
2. [Endpoints](#endpoints)
   - [Crear Evento](#1-crear-evento)
   - [Obtener Evento por ID](#2-obtener-evento-por-id)
   - [Obtener Evento por Slug](#3-obtener-evento-por-slug)
   - [Obtener Eventos de Usuario](#4-obtener-eventos-de-usuario)
   - [Obtener Estadísticas de Eventos de Usuario](#5-obtener-estadísticas-de-eventos-de-usuario)
   - [Actualizar Evento](#6-actualizar-evento)
   - [Publicar Evento](#7-publicar-evento)
   - [Filtrar Eventos](#8-filtrar-eventos)
   - [Duplicar Evento](#9-duplicar-evento)
   - [Eliminar Evento](#10-eliminar-evento)
   - [Cancelar Evento](#11-cancelar-evento)
   - [Reprogramar Evento](#12-reprogramar-evento)
   - [Eventos por Venue](#13-eventos-por-venue)
   - [Event Likes](#14-event-likes)
   - [Eventos Favoritos de Usuario](#15-eventos-favoritos-de-usuario)
   - [Calificaciones](#16-calificaciones)
   - [Lista de Órdenes](#17-lista-de-órdenes)
   - [Validar Reembolso](#18-validar-reembolso)
3. [Campos Eliminados](#campos-eliminados)
4. [Notas Importantes](#notas-importantes)

---

## 🗂️ Estructura de Datos del Evento

### Tabla DynamoDB: `Eventos`

**Clave primaria:**

- `id` (String) - UUID del evento

**GSI (Global Secondary Indexes):**

- `slug-index` - Clave: `slug`
- `userId-index` - Clave: `userId`
- `fechaIni-index` - Clave: `fechaIni`

### Campos del Evento

#### ✅ Campos Obligatorios

```typescript
{
  // Identificación
  id: string; // UUID generado automáticamente
  slug: string; // URL-friendly identifier (auto-generado si no se provee)
  nombre: string; // Nombre del evento
  descripcion: string; // Descripción del evento

  // Fechas y Horarios
  fechaIni: string; // Formato: YYYYMMDD (ej: "20250515")
  fechaFin: string; // Formato: YYYYMMDD
  horaIni: string; // Formato: "HH:MM" (ej: "19:00")
  horaFin: string; // Formato: "HH:MM"
  timezone: string; // IANA timezone (ej: "America/Bogota")

  // Organizador
  organizerName: string; // Nombre del organizador
  email: string; // Email del organizador
  TelPrin: string; // Teléfono principal
  IndicativoTelPrinOrg: string; // Código de país (ej: "+57")

  // Usuario y Categorización
  userId: string; // ID del usuario creador
  tipoEvento: string; // ID del tipo de evento
  Categoria: string; // ID de categoría (preference_id)

  // Capacidad
  aforo: number; // Capacidad total
  avaliableCapacity: number; // Capacidad disponible

  // Ubicación Básica
  pais: string; // País del evento
  ciudad: string; // Ciudad
  departamento: string; // Departamento/Estado
  direccion: string; // Dirección física
  tipoLugar: string; // ID del tipo de lugar

  // Estado
  estatus: string; // "inactivo" | "activo" | "cancelado" | "reprogramado" | "ejecucion" | "finalizado"
  calificacion: number; // Calificación promedio (0-5)

  // Venue (Nuevo modelo)
  skipVenue: boolean; // Si es true, no requiere venueId
  venueId: string | null; // ID del venue (obligatorio si skipVenue = false)
  layoutId: string | null; // ID del layout del venue

  // Moneda
  currency: string; // "COP" | "USD" | "EUR" | "MXN" (default: "COP")

  // Metadata
  createDate: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  createdBy: string; // User ID
  updatedBy: string; // User ID
}
```

#### 📝 Campos Opcionales

```typescript
{
  // Organizador Secundario
  TelSec?: string;               // Teléfono secundario
  IndicativoTelSecOrg?: string;  // Código de país secundario

  // Anfitrión
  anfitrioName?: string;         // Nombre del anfitrión
  TelPrinAnf?: string;           // Teléfono principal anfitrión
  IndicativoTelPrinAnf?: string; // Código de país
  TelSecAnf?: string;            // Teléfono secundario
  IndicativoTelSecAnf?: string;  // Código de país secundario
  emailAnf?: string;             // Email del anfitrión

  // Detalles del Evento
  clase?: string;                // Clase del evento
  video?: string;                // URL de video promocional
  Hashtags?: string[];           // Array de hashtags

  // Modalidad
  modalidadEvt?: string;         // "public" | "private" | "unlisted"

  // FAQ y Políticas (Opcionales)
  faq?: Array<{                  // Preguntas frecuentes
    question: string,
    answer: string
  }>,
  policies?: Array<{             // Políticas del evento
    title: string,
    description: string
  }>,

  // Itinerario (Opcional)
  itinerary?: Array<{            // Actividades del evento con horario
    time: string,                // Hora de la actividad (formato "HH:MM")
    description: string          // Descripción de la actividad
  }>,

  // Ventas
  salesStartAt?: string;         // ISO timestamp - inicio de ventas
  salesEndAt?: string;           // ISO timestamp - fin de ventas
  publishAt?: string;            // ISO timestamp - fecha de publicación
}
```

#### ⚠️ Campos Eliminados (Ya no usar)

Los siguientes campos fueron **REMOVIDOS** del modelo:

```typescript
// ❌ NO USAR - Campos eliminados
{
  ubicacion: {                   // ELIMINADO - usar campos básicos de ubicación
    latitude: number,
    longitude: number,
    timezone: string,
    address: string
  },
  tags: string[],                // ELIMINADO - usar Hashtags
  media: object,                 // ELIMINADO
  entranceData: object,          // ELIMINADO - Ver lambda de entradas independiente
}
```

**Nota:** Los campos `faq` y `policies` son **OPCIONALES** y se mantienen en el modelo.

---

## 📡 Endpoints

### 1. Crear Evento

**POST** `/createEvent`

Crea un nuevo evento en el sistema.

#### Request Body

```json
{
  "nombre": "Concierto Rock 2025",
  "descripcion": "Gran concierto de rock con bandas internacionales",
  "fechaIni": "15/05/2025",
  "fechaFin": "15/05/2025",
  "horaIni": "19:00",
  "horaFin": "23:00",
  "organizerName": "Eventos XYZ",
  "email": "contacto@eventosxyz.com",
  "TelPrin": "3001234567",
  "IndicativoTelPrinOrg": "+57",
  "userId": "user-uuid-123",
  "tipoEvento": "1",
  "Categoria": "5",
  "aforo": 5000,
  "pais": "Colombia",
  "ciudad": "Bogotá",
  "departamento": "Cundinamarca",
  "direccion": "Calle 100 #15-20",
  "tipoLugar": "1",
  "modalidadEvt": "public",
  "clase": "Música",
  "video": "https://youtube.com/watch?v=xxx",
  "Hashtags": ["rock", "concierto", "bogota"],
  "timezone": "America/Bogota",
  "skipVenue": false,
  "venueId": "venue-uuid-456",
  "layoutId": "layout-uuid-789",
  "currency": "COP",
  "salesStartAt": "2025-04-01T00:00:00Z",
  "salesEndAt": "2025-05-15T18:00:00Z",
  "faq": [
    {
      "question": "¿Hay parqueadero disponible?",
      "answer": "Sí, el venue cuenta con parqueadero gratuito"
    },
    {
      "question": "¿Se permiten menores de edad?",
      "answer": "Sí, menores de 12 años acompañados de un adulto"
    }
  ],
  "policies": [
    {
      "title": "Política de reembolso",
      "description": "Reembolso 100% hasta 7 días antes del evento"
    },
    {
      "title": "Política de acceso",
      "description": "Se requiere presentar documento de identidad"
    }
  ],
  "itinerary": [
    {
      "time": "19:00",
      "description": "Apertura de puertas"
    },
    {
      "time": "20:00",
      "description": "Banda telonera"
    },
    {
      "time": "21:30",
      "description": "Artista principal"
    },
    {
      "time": "23:00",
      "description": "Cierre del evento"
    }
  ]
}
```

#### Response 201 (Success)

```json
{
  "success": true,
  "message": "exitoso",
  "data": {
    "statusDesc": "Evento creado exitosamente",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "createDate": "2025-05-01T10:30:00.000Z"
  }
}
```

#### Response 400 (Error)

```json
{
  "success": false,
  "statusDesc": "venueId es obligatorio cuando skipVenue es false",
  "statusCode": 400
}
```

---

### 2. Obtener Evento por ID

**GET** `/getEvents/{id}`

Obtiene los detalles completos de un evento por su ID, incluyendo información del creador y estadísticas.

#### Path Parameters

- `id` (string, required): UUID del evento

#### Response 200 (Success)

```json
{
  "data": {
    "datosEvento": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "nombre": "Concierto Rock 2025",
      "slug": "concierto-rock-2025",
      "descripcion": "Gran concierto de rock...",
      "fechaIni": "15/05/2025",
      "fechaFin": "15/05/2025",
      "horaIni": "19:00",
      "horaFin": "23:00",
      "organizerName": "Eventos XYZ",
      "email": "contacto@eventosxyz.com",
      "userId": "user-uuid-123",
      "tipoEvento": "1",
      "Categoria": "5",
      "aforo": 5000,
      "avaliableCapacity": 4500,
      "estatus": "activo",
      "calificacion": 4,
      "pais": "Colombia",
      "ciudad": "Bogotá",
      "timezone": "America/Bogota",
      "skipVenue": false,
      "venueId": "venue-uuid-456",
      "currency": "COP",
      "createDate": "2025-04-01T10:00:00.000Z",
      "updatedAt": "2025-04-15T08:30:00.000Z"
    },
    "datosTipoEvento": {
      "id": "1",
      "nombre": "Concierto"
    },
    "datosCategoria": {
      "preference_id": 5,
      "name": "Música"
    },
    "datosTipoLugar": {
      "id": "1",
      "nombre": "Estadio"
    },
    "totalEventos": 15,
    "calificacionPromedio": 4,
    "fotoPerfilSignedUrl": "https://s3.amazonaws.com/...",
    "experiencia": 100
  }
}
```

#### Response 404 (Not Found)

```json
{
  "message": "Evento no encontrado"
}
```

---

### 3. Obtener Evento por Slug

**GET** `/events/slug/{slug}`

Obtiene un evento usando su slug (URL-friendly identifier).

#### Path Parameters

- `slug` (string, required): Slug del evento

#### Response 200 (Success)

```json
{
  "message": "Evento obtenido exitosamente",
  "evento": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "nombre": "Concierto Rock 2025",
    "slug": "concierto-rock-2025",
    "descripcion": "Gran concierto de rock...",
    "estatus": "activo",
    "...": "..."
  }
}
```

#### Response 404 (Not Found)

```json
{
  "error": "Evento no encontrado",
  "slug": "evento-inexistente"
}
```

---

### 4. Obtener Eventos de Usuario

**GET** `/getUserEvents/{userId}`

Obtiene todos los eventos creados por un usuario específico.

#### Path Parameters

- `userId` (string, required): ID del usuario

#### Query Parameters

- `fechaActual` (string, optional): Fecha en formato YYYYMMDD para filtrar eventos futuros
- `limit` (number, optional): Número máximo de eventos a retornar
- `allEvents` (boolean, optional): Si es "false", filtra solo eventos activos/ejecución/finalizados

#### Response 200 (Success)

```json
{
  "data": {
    "datosEvento": [
      {
        "id": "event-1",
        "nombre": "Evento 1",
        "fechaIni": "15/05/2025",
        "fechaFin": "15/05/2025",
        "estatus": "activo",
        "imagen": "https://s3.amazonaws.com/...",
        "liked": true,
        "calificacion": 4
      },
      {
        "id": "event-2",
        "nombre": "Evento 2",
        "fechaIni": "20/06/2025",
        "estatus": "inactivo",
        "imagen": "https://s3.amazonaws.com/...",
        "liked": false,
        "calificacion": 0
      }
    ]
  }
}
```

---

### 5. Obtener Estadísticas de Eventos de Usuario

**GET** `/getUserEventsStats/{userId}`

Obtiene estadísticas agregadas de todos los eventos de un usuario.

#### Path Parameters

- `userId` (string, required): ID del usuario

#### Response 200 (Success)

```json
{
  "data": {
    "totalEventos": 25,
    "eventosPorEstado": {
      "activo": 5,
      "ejecucion": 2,
      "finalizado": 18
    },
    "calificacionPromedio": 4,
    "experiencia": 100
  }
}
```

---

### 6. Actualizar Evento

**PUT** `/updateEvent/{id}`

Actualiza los datos de un evento existente.

#### Path Parameters

- `id` (string, required): UUID del evento

#### Request Body

```json
{
  "nombre": "Concierto Rock 2025 - Actualizado",
  "descripcion": "Descripción actualizada",
  "fechaIni": "16/05/2025",
  "fechaFin": "16/05/2025",
  "horaIni": "20:00",
  "horaFin": "00:00",
  "aforo": 6000,
  "estatus": "activo",
  "currency": "USD"
}
```

**Nota:** Solo se actualizan los campos enviados en el body. Los campos no enviados permanecen sin cambios.

#### Response 200 (Success)

```json
{
  "success": true,
  "message": "Datos de evento actualizados correctamente",
  "data": {
    "nombre": "Concierto Rock 2025 - Actualizado",
    "fechaIni": "20250516",
    "aforo": 6000,
    "updatedAt": "2025-05-02T14:20:00.000Z"
  }
}
```

#### Response 400 (Error)

```json
{
  "success": false,
  "error": "No se proporcionaron los campos para actualizar"
}
```

---

### 7. Publicar Evento

**POST** `/publishEvent`

Publica un evento y dispara notificaciones a los usuarios interesados.

#### Request Body

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-uuid-123"
}
```

#### Response 200 (Success)

```json
{
  "success": true,
  "message": "Evento publicado exitosamente y notificaciones enviadas",
  "data": {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "estatus": "activo",
    "notificationsSent": true
  }
}
```

---

### 8. Filtrar Eventos

**POST** `/getEventsByFilter`

Filtra eventos por múltiples criterios.

#### Request Body

```json
{
  "categorias": [5, 8],
  "tiposEvento": ["1", "3"],
  "fechaIni": "01/05/2025",
  "fechaFin": "31/12/2025",
  "limit": 20,
  "offset": 0,
  "userId": "user-uuid-123"
}
```

**Nota:** Los filtros de `latitude`, `longitude` y `distanciaMax` han sido **ELIMINADOS** ya que el campo `ubicacion` con coordenadas fue removido del modelo.

#### Response 200 (Success)

```json
{
  "data": [
    {
      "id": "event-1",
      "nombre": "Concierto Rock",
      "fechaIni": "15/05/2025",
      "fechaFin": "15/05/2025",
      "estatus": "activo",
      "Categoria": "5",
      "tipoEvento": "1",
      "imagen": "https://s3.amazonaws.com/...",
      "liked": true,
      "calificacion": 4
    }
  ],
  "total": 45,
  "offset": 0,
  "limit": 20,
  "nextOffset": 20
}
```

---

### 9. Duplicar Evento

**POST** `/duplicateEvent/{id}`

Crea una copia completa de un evento existente, incluyendo imágenes y tickets.

#### Path Parameters

- `id` (string, required): UUID del evento a duplicar

#### Response 200 (Success)

```json
{
  "message": "Event duplicated successfully",
  "newEventId": "660e8400-e29b-41d4-a716-446655440001"
}
```

#### Response 404 (Not Found)

```json
{
  "message": "Original event not found"
}
```

---

### 10. Eliminar Evento

**DELETE** `/deleteEvent/{id}`

Elimina un evento del sistema.

#### Path Parameters

- `id` (string, required): UUID del evento

#### Response 200 (Success)

```json
{
  "success": true,
  "message": "Evento eliminado correctamente"
}
```

---

### 11. Cancelar Evento

**POST** `/cancelEvent`

Cancela un evento y notifica a todos los usuarios afectados.

#### Request Body

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-uuid-123",
  "reason": "Problemas logísticos",
  "refundPolicy": "Reembolso completo disponible"
}
```

#### Response 200 (Success)

```json
{
  "success": true,
  "message": "Evento cancelado y notificaciones enviadas",
  "data": {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "estatus": "cancelado",
    "affectedUsers": 450,
    "notificationsSent": true
  }
}
```

---

### 12. Reprogramar Evento

**POST** `/rescheduleEvent`

Reprograma un evento a nuevas fechas y notifica a usuarios afectados.

#### Request Body

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-uuid-123",
  "newFechaIni": "20/06/2025",
  "newFechaFin": "20/06/2025",
  "newHoraIni": "19:00",
  "newHoraFin": "23:00",
  "reason": "Cambio de disponibilidad del venue"
}
```

#### Response 200 (Success)

```json
{
  "success": true,
  "message": "Evento reprogramado y notificaciones enviadas",
  "data": {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "estatus": "reprogramado",
    "oldDates": {
      "fechaIni": "15/05/2025",
      "fechaFin": "15/05/2025"
    },
    "newDates": {
      "fechaIni": "20/06/2025",
      "fechaFin": "20/06/2025"
    },
    "affectedUsers": 450,
    "notificationsSent": true
  }
}
```

---

### 13. Eventos por Venue

**GET** `/events/venue/{venueId}`

Obtiene todos los eventos asociados a un venue específico.

#### Path Parameters

- `venueId` (string, required): UUID del venue

#### Query Parameters

- `status` (string, optional): Filtrar por estatus ("activo", "inactivo", etc.)

#### Response 200 (Success)

```json
{
  "success": true,
  "data": [
    {
      "id": "event-1",
      "nombre": "Concierto Rock",
      "fechaIni": "15/05/2025",
      "venueId": "venue-uuid-456",
      "estatus": "activo"
    }
  ],
  "total": 12
}
```

---

### 14. Event Likes

**POST** `/eventLike`

Marca o desmarca un evento como favorito para un usuario.

#### Request Body

```json
{
  "userId": "user-uuid-123",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "action": "like"
}
```

**Actions:** `"like"` | `"unlike"`

#### Response 200 (Success)

```json
{
  "success": true,
  "message": "Evento marcado como favorito",
  "liked": true
}
```

---

### 15. Eventos Favoritos de Usuario

**GET** `/getFavoriteUserEvents/{userId}`

Obtiene todos los eventos marcados como favoritos por un usuario.

#### Path Parameters

- `userId` (string, required): ID del usuario

#### Response 200 (Success)

```json
{
  "data": [
    {
      "userId": "user-uuid-123",
      "eventId": "event-1",
      "nombre": "Concierto Rock",
      "imagen": "https://s3.amazonaws.com/...",
      "fechaIni": "15/05/2025",
      "calificacion": 4
    }
  ]
}
```

---

### 16. Calificaciones

#### 16.1. Agregar Calificación

**POST** `/events/{eventId}/calification`

Agrega una calificación a un evento.

##### Path Parameters

- `eventId` (string, required): UUID del evento

##### Request Body

```json
{
  "userId": "user-uuid-123",
  "rating": 5,
  "comment": "Excelente evento, muy bien organizado"
}
```

##### Response 201 (Success)

```json
{
  "success": true,
  "message": "Calificación agregada exitosamente",
  "data": {
    "calificationId": "cal-uuid-789",
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "rating": 5,
    "averageRating": 4.5
  }
}
```

#### 16.2. Obtener Calificaciones

**GET** `/events/{eventId}/califications`

Obtiene todas las calificaciones de un evento.

##### Path Parameters

- `eventId` (string, required): UUID del evento

##### Response 200 (Success)

```json
{
  "data": {
    "eventId": "550e8400-e29b-41d4-a716-446655440000",
    "averageRating": 4.5,
    "totalCalifications": 120,
    "califications": [
      {
        "userId": "user-1",
        "rating": 5,
        "comment": "Excelente",
        "createdAt": "2025-05-16T10:00:00.000Z"
      }
    ]
  }
}
```

---

### 17. Lista de Órdenes

**GET** `/ordersList/{userId}`

Obtiene la lista de órdenes de compra de un usuario para eventos.

#### Path Parameters

- `userId` (string, required): ID del usuario

#### Response 200 (Success)

```json
{
  "data": [
    {
      "orderId": "order-uuid-123",
      "eventId": "event-uuid-456",
      "eventName": "Concierto Rock 2025",
      "totalAmount": 150000,
      "currency": "COP",
      "status": "approved",
      "purchaseDate": "2025-04-20T15:30:00.000Z",
      "tickets": [
        {
          "ticketId": "ticket-1",
          "type": "VIP",
          "price": 75000,
          "quantity": 2
        }
      ]
    }
  ],
  "total": 5
}
```

---

### 18. Validar Reembolso

**POST** `/canRequestRefund/{eventId}`

Valida si un usuario puede solicitar reembolso para un evento.

#### Path Parameters

- `eventId` (string, required): UUID del evento

#### Request Body

```json
{
  "userId": "user-uuid-123"
}
```

#### Response 200 (Success)

```json
{
  "canRefund": true,
  "reason": "El evento fue cancelado",
  "refundPolicy": "Reembolso completo",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventStatus": "cancelado"
}
```

#### Response 200 (Cannot Refund)

```json
{
  "canRefund": false,
  "reason": "El evento ya ha finalizado",
  "eventId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 19. Endpoint Deprecado - Entradas del Evento

**GET** `/getEventsEntrance/{id}` ⚠️ **DEPRECADO**

Este endpoint retorna un error 410 Gone.

#### Response 410 (Gone)

```json
{
  "success": false,
  "error": "Este endpoint está deprecado. Las entradas del evento ahora se manejan en una lambda independiente.",
  "message": "Endpoint deprecado - usar nueva lambda de entradas"
}
```

**Nota:** Las entradas (`entranceData`) ahora se gestionan en una tabla y lambda independiente. Consultar documentación de la nueva lambda de entradas.

---

## ⚠️ Campos Eliminados

Los siguientes campos fueron **REMOVIDOS** del modelo de eventos y ya **NO** deben ser usados:

### 1. `ubicacion` (Objeto completo eliminado)

**Antes:**

```json
{
  "ubicacion": {
    "latitude": 4.6097,
    "longitude": -74.0817,
    "timezone": "America/Bogota",
    "address": "Calle 100 #15-20"
  }
}
```

**Ahora:** Usar campos individuales ya existentes:

```json
{
  "pais": "Colombia",
  "ciudad": "Bogotá",
  "departamento": "Cundinamarca",
  "direccion": "Calle 100 #15-20",
  "timezone": "America/Bogota"
}
```

**Razón:** Simplificación del modelo. La geolocalización precisa no es necesaria en este momento.

---

### 2. `tags` (Array eliminado)

**Antes:**

```json
{
  "tags": ["rock", "musica", "concierto"]
}
```

**Ahora:** Usar el campo `Hashtags` que ya existía:

```json
{
  "Hashtags": ["rock", "musica", "concierto"]
}
```

**Razón:** Duplicación innecesaria. `Hashtags` cumple la misma función.

---

### 3. `media` (Objeto eliminado)

**Antes:**

```json
{
  "media": {
    "images": ["url1", "url2"],
    "videos": ["url1"]
  }
}
```

**Ahora:** Las imágenes se gestionan en la tabla `imagenes` con GSI `eventIdIndex`. Los videos se almacenan en el campo `video` (string único).

```json
{
  "video": "https://youtube.com/watch?v=xxx"
}
```

**Razón:** Las imágenes ya tienen una tabla dedicada (`imagenes`) con relación `id_evento`. No es necesario duplicar esta información.

---

### 4. `entranceData` (Objeto eliminado)

**Antes:**

```json
{
  "entranceData": {
    "types": [
      {
        "name": "VIP",
        "price": 100000,
        "quantity": 50
      }
    ]
  }
}
```

**Ahora:** **Se debe crear una tabla y lambda independiente** para gestionar las entradas asociadas a un evento o venue.

**Tablas relacionadas existentes:**

- `Tickets` - Con GSI `eventIdIndex`
- `TicketsDistribution` - Con GSI `eventIdIndex`

**Endpoint deprecado:** `/getEventsEntrance/{id}` retorna 410 Gone.

**Razón:** Las entradas tienen lógica compleja (inventario, distribución, ventas) que merece un microservicio independiente.

---

### 5. `faq` (Ahora opcional)

**Antes (Obligatorio):**

```json
{
  "faq": [
    {
      "question": "¿Hay parqueadero?",
      "answer": "Sí, disponible"
    }
  ]
}
```

**Ahora:** Campo **OPCIONAL**. Puede incluirse o no en el request.

**Razón:** No todos los eventos requieren FAQ. Ahora es opcional y se puede omitir al crear/actualizar eventos.

---

### 6. `policies` (Ahora opcional)

**Antes (Obligatorio):**

```json
{
  "policies": [
    {
      "title": "Política de reembolso",
      "description": "Reembolso 100% hasta 7 días antes"
    }
  ]
}
```

**Ahora:** Campo **OPCIONAL**. Puede incluirse o no en el request.

**Razón:** Las políticas pueden ser estándar por tipo de evento o venue. Ahora es opcional y se puede omitir al crear/actualizar eventos.

---

## 📌 Notas Importantes

### Formatos de Fecha

- **En Request:** `"DD/MM/YYYY"` (ejemplo: `"15/05/2025"`)
- **En Base de Datos:** `"YYYYMMDD"` (ejemplo: `"20250515"`)
- **En Response:** `"DD/MM/YYYY"` (convertido automáticamente)

La conversión se hace automáticamente en los handlers.

### Formatos de Hora

- Formato: `"HH:MM"` (24 horas)
- Ejemplo: `"19:00"`, `"23:30"`

### Timezones

- Usar formato IANA: `"America/Bogota"`, `"America/New_York"`, etc.
- Default: `"America/Bogota"`

### Estados del Evento (estatus)

- `"inactivo"` - Evento creado pero no publicado
- `"activo"` - Evento publicado y visible
- `"cancelado"` - Evento cancelado
- `"reprogramado"` - Evento reprogramado a nuevas fechas
- `"ejecucion"` - Evento en curso
- `"finalizado"` - Evento finalizado

### Monedas Soportadas (currency)

- `"COP"` - Peso Colombiano (default)
- `"USD"` - Dólar Estadounidense
- `"EUR"` - Euro
- `"MXN"` - Peso Mexicano

### Relación con Venues

- Si `skipVenue = false`, el campo `venueId` es **OBLIGATORIO**
- Si `skipVenue = true`, `venueId` se establece como `null`
- El `layoutId` es opcional y depende de si el venue tiene layouts de asientos

### Imágenes del Evento

Las imágenes NO se almacenan en el evento directamente. Se gestionan en:

- **Tabla:** `imagenes`
- **GSI:** `eventIdIndex` (KeyConditionExpression: `id_evento = :eventId`)
- **Bucket S3:** `doeventimageeventbucket`

Para obtener imágenes de un evento, consultar la tabla `imagenes` con el `id_evento`.

### Autenticación

La mayoría de endpoints requieren autenticación mediante Cognito. El `userId` se extrae de:

```javascript
event.requestContext?.authorizer?.claims?.sub;
```

### CORS

Todos los endpoints tienen CORS habilitado para:

- Origins: `*`
- Methods: `GET, POST, PUT, DELETE, OPTIONS`
- Headers: `Content-Type, Authorization, X-Api-Key, etc.`

---

## 🔗 Endpoints Relacionados en Otros Servicios

### Servicio de Notificaciones

- `notifications-dev-triggerNotification` - Disparado al publicar/cancelar/reprogramar eventos

### Servicio de Imágenes

- `aws-lambda-imagenes-dev-getImageByEventId` - Obtener imágenes de un evento

### Servicio de Venues

- Consultar documentación del servicio de venues para `venueId` y `layoutId`

---

## 📝 Changelog

### v2.0.0 - Diciembre 2025

**Campos Eliminados:**

- ❌ `ubicacion` (objeto completo con lat/lng)
- ❌ `tags` (usar `Hashtags`)
- ❌ `media` (usar tabla `imagenes` y campo `video`)
- ❌ `entranceData` (crear lambda independiente)

**Campos Ahora Opcionales:**

- ✅ `faq` (antes obligatorio, ahora opcional)
- ✅ `policies` (antes obligatorio, ahora opcional)

**Endpoints Deprecados:**

- ⚠️ `GET /getEventsEntrance/{id}` - Retorna 410 Gone

**Filtros Eliminados:**

- ❌ `latitude`, `longitude`, `distanciaMax` en `/getEventsByFilter`

---

## 📋 Resumen de Endpoints Disponibles

### Base URL

`https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`

### Endpoints Activos

| Método     | Endpoint                          | Descripción                           |
| ---------- | --------------------------------- | ------------------------------------- |
| **POST**   | `/createEvent`                    | Crear nuevo evento                    |
| **GET**    | `/getEvents/{id}`                 | Obtener evento por ID                 |
| **GET**    | `/events/slug/{slug}`             | Obtener evento por slug               |
| **GET**    | `/getUserEvents/{userId}`         | Eventos de un usuario                 |
| **GET**    | `/getUserEventsStats/{userId}`    | Estadísticas de eventos de usuario    |
| **PUT**    | `/updateEvent/{id}`               | Actualizar evento                     |
| **POST**   | `/addEventData`                   | Agregar datos adicionales al evento   |
| **POST**   | `/publishEvent`                   | Publicar evento                       |
| **POST**   | `/eventLike`                      | Marcar/desmarcar evento como favorito |
| **GET**    | `/getFavoriteUserEvents/{userId}` | Eventos favoritos de usuario          |
| **POST**   | `/getEventsByFilter`              | Filtrar eventos por criterios         |
| **DELETE** | `/deleteEvent/{id}`               | Eliminar evento                       |
| **POST**   | `/duplicateEvent/{id}`            | Duplicar evento                       |
| **POST**   | `/events/{eventId}/calification`  | Agregar calificación                  |
| **GET**    | `/events/{eventId}/califications` | Obtener calificaciones                |
| **POST**   | `/rescheduleEvent`                | Reprogramar evento                    |
| **POST**   | `/cancelEvent`                    | Cancelar evento                       |
| **GET**    | `/ordersList/{userId}`            | Lista de órdenes de usuario           |
| **POST**   | `/canRequestRefund/{eventId}`     | Validar reembolso                     |
| **GET**    | `/events/venue/{venueId}`         | Eventos por venue                     |

### Endpoint Deprecado

| Método  | Endpoint                  | Estado       | Respuesta |
| ------- | ------------------------- | ------------ | --------- |
| **GET** | `/getEventsEntrance/{id}` | ⚠️ Deprecado | 410 Gone  |

---

## 📞 Soporte

Para consultas sobre este servicio, contactar al equipo de backend de DoEvents.

**Última actualización:** Diciembre 2025
