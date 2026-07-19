# List Venues - Ejemplos de Uso

## Endpoint

`GET /venues`

## Parámetros de Query

### Filtros Básicos

- `ownerUserId` (string): Filtra venues por propietario (más eficiente, usa índice)
- `isTemplate` (boolean): Filtra por templates (true) o venues de eventos (false)
- `status` (string): Filtra por estado (active, inactive, etc.)

### Filtros de Ubicación

- `latitude` (number): Latitud de la ubicación del usuario
- `longitude` (number): Longitud de la ubicación del usuario
- `maxDistance` (number): Distancia máxima en kilómetros desde la ubicación del usuario

### Paginación

- `limit` (number): Número máximo de resultados por página (default: 50)
- `lastEvaluatedKey` (string): Token para obtener la siguiente página (URL encoded)

## Ejemplos de Requests

### 1. Listar todos los venues (básico)

```
GET /venues
```

**Response:**

```json
{
  "venues": [...],
  "count": 25,
  "lastEvaluatedKey": "eyJ2ZW51ZV9pZCI6InZlbnVlXzEyMyJ9",
  "hasMore": true
}
```

### 2. Listar venues de un propietario específico

```
GET /venues?ownerUserId=user_123
```

### 3. Listar solo templates (venues base)

```
GET /venues?isTemplate=true
```

### 4. Buscar venues cerca de una ubicación (dentro de 10km)

```
GET /venues?latitude=4.6097&longitude=-74.0817&maxDistance=10
```

**Response:**

```json
{
  "venues": [
    {
      "venue_id": "venue_123",
      "name": "Movistar Arena",
      "latitude": 4.6536,
      "longitude": -74.0574,
      "distance": 5.23,
      ...
    },
    {
      "venue_id": "venue_456",
      "name": "Coliseo El Campín",
      "latitude": 4.6483,
      "longitude": -74.0775,
      "distance": 7.85,
      ...
    }
  ],
  "count": 2,
  "lastEvaluatedKey": null,
  "hasMore": false
}
```

### 5. Buscar venues cercanos ordenados por distancia (sin límite de distancia)

```
GET /venues?latitude=4.6097&longitude=-74.0817
```

### 6. Paginación - Primera página (20 items)

```
GET /venues?limit=20
```

**Response:**

```json
{
  "venues": [...],
  "count": 20,
  "lastEvaluatedKey": "eyJ2ZW51ZV9pZCI6InZlbnVlXzIwIn0%3D",
  "hasMore": true
}
```

### 7. Paginación - Segunda página

```
GET /venues?limit=20&lastEvaluatedKey=eyJ2ZW51ZV9pZCI6InZlbnVlXzIwIn0%3D
```

### 8. Combinando filtros: venues cercanos de un propietario

```
GET /venues?ownerUserId=user_123&latitude=4.6097&longitude=-74.0817&maxDistance=15
```

### 9. Combinando filtros: templates cercanos con paginación

```
GET /venues?isTemplate=true&latitude=4.6097&longitude=-74.0817&maxDistance=20&limit=10
```

### 10. Venues activos cerca de una ubicación

```
GET /venues?status=active&latitude=4.6097&longitude=-74.0817&maxDistance=5
```

## Notas Importantes

### Fórmula de Distancia

- Se utiliza la fórmula de Haversine para calcular distancias precisas entre coordenadas
- Las distancias se devuelven en kilómetros con 2 decimales de precisión
- El campo `distance` solo aparece cuando se proporcionan `latitude` y `longitude`

### Ordenamiento

- Cuando se usa filtro de ubicación, los resultados se ordenan automáticamente por distancia (más cercanos primero)
- Venues sin coordenadas se colocan al final de la lista

### Paginación

- `limit`: Controla cuántos items se devuelven por página
- `lastEvaluatedKey`: Token para obtener la siguiente página (viene URL encoded en el response)
- `hasMore`: Indica si hay más páginas disponibles
- Para la siguiente página, pasa el `lastEvaluatedKey` del response anterior

### Performance

- Usar `ownerUserId` es más eficiente (usa índice GSI)
- Sin `ownerUserId` se hace un scan completo de la tabla (más lento)
- El filtro de distancia se aplica después de obtener los datos de DynamoDB (no en la query)
- Considera usar límites razonables para evitar timeouts con grandes datasets

### Casos de Uso Comunes

#### Buscar venues para un evento

```
GET /venues?latitude=4.6097&longitude=-74.0817&maxDistance=10&status=active&limit=20
```

#### Ver mis templates de venues

```
GET /venues?ownerUserId=user_123&isTemplate=true
```

#### Explorar todos los venues cercanos

```
GET /venues?latitude=4.6097&longitude=-74.0817&limit=50
```

## Estructura del Response

```json
{
  "venues": [
    {
      "venue_id": "string",
      "name": "string",
      "description": "string",
      "capacity": number,
      "latitude": number,
      "longitude": number,
      "distance": number,  // Solo si se filtra por ubicación
      "ownerUserId": "string",
      "isTemplate": boolean,
      "status": "string",
      "address": "string",
      "city": "string",
      "country": "string",
      "createdAt": "string",
      "updatedAt": "string",
      ...
    }
  ],
  "count": number,
  "lastEvaluatedKey": "string",  // null si no hay más páginas
  "hasMore": boolean
}
```
