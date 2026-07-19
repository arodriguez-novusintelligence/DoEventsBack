# API de Calificaciones de Eventos

## Obtener Calificaciones de un Evento

### Endpoint

```
GET /events/{eventId}/califications
```

### Parámetros de Query (Opcionales)

- `limit`: Número de calificaciones por página (por defecto: 50, máximo: 100)
- `nextToken`: Token para paginación (obtenido de la respuesta anterior)

### Ejemplos de Uso

#### 1. Obtener las primeras 50 calificaciones

```bash
GET /events/event123/califications
```

#### 2. Obtener las primeras 20 calificaciones

```bash
GET /events/event123/califications?limit=20
```

#### 3. Obtener la siguiente página usando nextToken

```bash
GET /events/event123/califications?limit=20&nextToken=eyJpZCI6IjEyMyIsImNyZWF0ZWRBdCI6IjIwMjUtMDktMjZUMTc6NTM6MjMuNTg3WiJ9
```

### Respuesta Exitosa (200)

```json
{
  "success": true,
  "data": {
    "califications": [
      {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "eventId": "event123",
        "userId": "user456",
        "rating": 4.5,
        "comment": "Excelente evento, muy bien organizado",
        "createdAt": "2025-09-26T17:53:23.587Z",
        "updatedAt": "2025-09-26T17:53:23.587Z",
        "user": {
          "id": "user456",
          "name": "Juan Pérez",
          "profileImage": "https://bucket.s3.amazonaws.com/profile.jpg",
          "email": "juan@email.com"
        }
      }
    ],
    "pagination": {
      "count": 20,
      "limit": 20,
      "hasMore": true,
      "nextToken": "eyJpZCI6IjEyMyIsImNyZWF0ZWRBdCI6IjIwMjUtMDktMjZUMTc6NTM6MjMuNTg3WiJ9"
    },
    "stats": {
      "totalCalifications": 150,
      "averageRating": 4.2,
      "ratingDistribution": {
        "1": 5,
        "2": 10,
        "3": 25,
        "4": 60,
        "5": 50
      }
    }
  }
}
```

### Respuesta de Error (400)

```json
{
  "success": false,
  "message": "eventId es obligatorio."
}
```

### Respuesta de Error (500)

```json
{
  "success": false,
  "message": "Error interno del servidor.",
  "error": "Mensaje de error específico"
}
```

## Características

### 🔍 **Funcionalidades Principales**

- **Paginación**: Soporte para paginar resultados con tokens seguros
- **Información del Usuario**: Incluye nombre, imagen de perfil y email del usuario que calificó
- **Estadísticas**: Promedio de calificaciones y distribución por estrellas
- **Ordenamiento**: Calificaciones ordenadas por fecha (más recientes primero)
- **Límites Flexibles**: Configurable entre 1-100 elementos por página

### 📊 **Datos Incluidos**

- **Calificación completa**: ID, rating, comentario, fechas
- **Información del usuario**: Nombre, imagen de perfil, email
- **Estadísticas globales**: Total, promedio y distribución
- **Metadatos de paginación**: Contador, límite, hasMore, nextToken

### 🛡️ **Validaciones**

- `eventId` es obligatorio
- `limit` debe estar entre 1 y 100
- `nextToken` debe ser un token válido en base64

### 🚀 **Optimizaciones**

- Consulta eficiente usando índices de DynamoDB
- Paginación nativa de DynamoDB para performance
- Consulta separada para estadísticas (no afecta la paginación)
- Manejo de errores robusto sin fallar la respuesta principal

## Integración con la Función Existente

Esta función complementa perfectamente `addEventCalification.js`:

1. **Agregar calificación**: `POST /events/{eventId}/calification`
2. **Consultar calificaciones**: `GET /events/{eventId}/califications`

Ambas funciones trabajan con la misma tabla `EventCalification` y mantienen las estadísticas actualizadas.
