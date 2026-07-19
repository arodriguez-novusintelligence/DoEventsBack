# Ejemplos de Uso - AWS Lambda Venues

## 🚀 API Base URL

```
https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev
```

## 🏗️ Nueva Estructura Jerárquica

```
Venue
  ├─ Gate (Puertas) [0:N]
  └─ Floor (Piso) [1:N]
      ├─ Element (Elemento: baño, escalera, entrada, etc.) [0:N]
      └─ Category (Categoría de asientos) [0:N]
          └─ Seat (Asiento) [0:N]
```

**IMPORTANTE:** Las Sections han sido eliminadas. Ahora los asientos están directamente bajo las categorías. Las entrances complejas se han simplificado a Gates (puertas simples).

## 📋 Endpoints Disponibles

### Venue CRUD

| Método     | Endpoint                   | Descripción                                                            |
| ---------- | -------------------------- | ---------------------------------------------------------------------- |
| **POST**   | `/venues`                  | Crear venue completo con floors, elements, categories, seats y gates   |
| **GET**    | `/venues/{venueId}`        | Obtener venue completo con toda la jerarquía (incluye gates)           |
| **GET**    | `/venues`                  | Listar venues (con filtros de ubicación, distancia y paginación)       |
| **PUT**    | `/venues/{venueId}`        | Actualizar venue (incluye gates)                                       |
| **DELETE** | `/venues/{venueId}`        | Eliminar venue (cascada: floors → elements/categories → seats → gates) |
| **POST**   | `/venues/{venueId}/images` | Subir imagen al venue                                                  |
| **POST**   | `/venues/clone-for-event`  | Clonar venue base para evento (incluye gates)                          |

### Floor CRUD

| Método   | Endpoint                   | Descripción                    |
| -------- | -------------------------- | ------------------------------ |
| **POST** | `/venues/{venueId}/floors` | Crear floor en venue existente |

### Element CRUD

| Método   | Endpoint                                      | Descripción            |
| -------- | --------------------------------------------- | ---------------------- |
| **POST** | `/venues/{venueId}/floors/{floorId}/elements` | Crear element en floor |

### Category CRUD

| Método     | Endpoint                                                     | Descripción              |
| ---------- | ------------------------------------------------------------ | ------------------------ |
| **POST**   | `/venues/{venueId}/floors/{floorId}/categories`              | Crear categoría en floor |
| **PUT**    | `/venues/{venueId}/floors/{floorId}/categories/{categoryId}` | Actualizar categoría     |
| **DELETE** | `/venues/{venueId}/floors/{floorId}/categories/{categoryId}` | Eliminar categoría       |

### Seat CRUD

| Método     | Endpoint                                                           | Descripción                 |
| ---------- | ------------------------------------------------------------------ | --------------------------- |
| **POST**   | `/venues/{venueId}/floors/{floorId}/categories/{categoryId}/seats` | Crear asientos en categoría |
| **PUT**    | `/venues/{venueId}/seats/{seatId}`                                 | Actualizar asiento          |
| **DELETE** | `/venues/{venueId}/seats/{seatId}`                                 | Eliminar asiento            |

---

## 1. Crear un Venue Completo con Floors, Elements, Categories, Seats y Gates

**IMPORTANTE:** Puedes enviar IDs personalizados desde el frontend para `floorId`, `elementId`, `categoryId`, `seatId` y `gateId`. Si no los envías, se generarán automáticamente con UUID v4.

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues
Content-Type: application/json
```

```json
{
  "name": "Estadio El Campín",
  "ownerUserId": "user_123",
  "address": "Carrera 30 # 57-60",
  "city": "Bogotá",
  "latitude": 4.6536,
  "longitude": -74.0574,
  "capacity": 36000,
  "description": "Estadio de fútbol con capacidad para 36,000 personas",
  "isCertified": true,
  "hasSeating": true,
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "gates": [
    {
      "gateId": "gate-001",
      "gateNumber": 1,
      "name": "Puerta Norte",
      "description": "Entrada principal sector norte"
    },
    {
      "gateId": "gate-002",
      "gateNumber": 2,
      "name": "Puerta Sur",
      "description": "Entrada principal sector sur"
    },
    {
      "gateId": "gate-003",
      "gateNumber": 3,
      "name": "Puerta VIP",
      "description": "Acceso exclusivo VIP"
    },
    {
      "gateId": "gate-004",
      "gateNumber": 4,
      "name": "Puerta Accesible",
      "description": "Acceso para personas con movilidad reducida"
    }
  ],
  "floors": [
    {
      "floorId": "floor-planta-baja-001",
      "name": "Planta Baja",
      "description": "Nivel principal del estadio",
      "elements": [
        {
          "elementId": "element-bathroom-norte-001",
          "name": "Baño Principal Norte",
          "type": "bathroom",
          "position": "Norte",
          "relX": 10,
          "relY": 5,
          "width": 8,
          "height": 6,
          "notes": "Baño con 10 cabinas"
        },
        {
          "elementId": "element-entrance-principal-001",
          "name": "Entrada Principal",
          "type": "entrance",
          "position": "Sur",
          "relX": 45,
          "relY": 90,
          "width": 10,
          "height": 5,
          "notes": "Entrada principal con control de acceso"
        },
        {
          "elementId": "element-stairs-este-001",
          "name": "Escalera Este",
          "type": "stairs",
          "position": "Este",
          "relX": 85,
          "relY": 45,
          "width": 5,
          "height": 10,
          "notes": "Acceso a nivel superior"
        }
      ],
      "categories": [
        {
          "categoryId": "cat-vip-001",
          "name": "Tribuna VIP",
          "description": "Asientos VIP con mejor vista",
          "color": "#FFD700",
          "relX": 20,
          "relY": 20,
          "width": 60,
          "height": 30,
          "seats": [
            {
              "seatId": "seat-vip-a1",
              "row": "A",
              "number": "1",
              "status": "available"
            },
            {
              "seatId": "seat-vip-a2",
              "row": "A",
              "number": "2",
              "status": "available"
            },
            {
              "seatId": "seat-vip-a3",
              "row": "A",
              "number": "3",
              "status": "reserved"
            },
            {
              "seatId": "seat-vip-b1",
              "row": "B",
              "number": "1",
              "status": "available"
            }
          ]
        },
        {
          "categoryId": "cat-general-001",
          "name": "Tribuna General",
          "description": "Asientos generales",
          "color": "#4169E1",
          "relX": 20,
          "relY": 55,
          "width": 60,
          "height": 25,
          "seats": [
            {
              "seatId": "seat-gen-c1",
              "row": "C",
              "number": "1",
              "status": "available"
            },
            {
              "seatId": "seat-gen-c2",
              "row": "C",
              "number": "2",
              "status": "available"
            }
          ]
        }
      ]
    },
    {
      "floorId": "floor-nivel-superior-001",
      "name": "Nivel Superior",
      "description": "Segundo nivel del estadio",
      "elements": [
        {
          "elementId": "element-bathroom-sur-001",
          "name": "Baño Superior Sur",
          "type": "bathroom",
          "position": "Sur",
          "relX": 45,
          "relY": 85,
          "width": 6,
          "height": 5
        },
        {
          "elementId": "element-exit-oeste-001",
          "name": "Salida de Emergencia",
          "type": "exit",
          "position": "Oeste",
          "relX": 5,
          "relY": 50,
          "width": 4,
          "height": 8
        }
      ],
      "categories": [
        {
          "categoryId": "cat-palco-presidencial-001",
          "name": "Palco Presidencial",
          "description": "Palcos exclusivos",
          "color": "#32CD32",
          "relX": 30,
          "relY": 15,
          "width": 40,
          "height": 20,
          "seats": [
            {
              "seatId": "seat-palco-vip1",
              "row": "VIP",
              "number": "1",
              "status": "available"
            },
            {
              "seatId": "seat-palco-vip2",
              "row": "VIP",
              "number": "2",
              "status": "available"
            }
          ]
        }
      ]
    }
  ]
}
```

**Respuesta (201 Created):**

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Estadio El Campín",
    "type": "stadium",
    "capacity": 36000,
    "eventId": null,
    "isEventVenue": false,
    "hasSeating": true,
    "baseVenueId": null,
    "floorCount": 2,
    "floors": [
      {
        "floorId": "floor-planta-baja-001",
        "name": "Planta Baja",
        "categoryCount": 2,
        "elementCount": 3,
        "categories": [
          {
            "categoryId": "cat-vip-001",
            "name": "Tribuna VIP",
            "seatCount": 4
          }
        ]
      },
      {
        "floorId": "floor-nivel-superior-001",
        "name": "Nivel Superior",
        "categoryCount": 1,
        "elementCount": 2,
        "categories": [
          {
            "categoryId": "cat-palco-presidencial-001",
            "name": "Palco Presidencial",
            "seatCount": 2
          }
        ]
      }
    ],
    "gateCount": 4,
    "gates": [
      {
        "gateId": "gate-001",
        "gateNumber": 1,
        "name": "Puerta Norte",
        "description": "Entrada principal sector norte"
      },
      {
        "gateId": "gate-002",
        "gateNumber": 2,
        "name": "Puerta Sur",
        "description": "Entrada principal sector sur"
      },
      {
        "gateId": "gate-003",
        "gateNumber": 3,
        "name": "Puerta VIP",
        "description": "Acceso exclusivo VIP"
      },
      {
        "gateId": "gate-004",
        "gateNumber": 4,
        "name": "Puerta Accesible",
        "description": "Acceso para personas con movilidad reducida"
      }
    ],
    "ticketRecord": null
  }
}
```

## 2. Crear un Venue Simple (estructura mínima)

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues
Content-Type: application/json
```

```json
{
  "name": "Teatro Colón",
  "ownerUserId": "user_456",
  "address": "Calle 10 # 5-32",
  "city": "Bogotá",
  "latitude": 4.5981,
  "longitude": -74.0758,
  "capacity": 500,
  "description": "Teatro histórico",
  "isCertified": false,
  "hasSeating": true,
  "floors": [
    {
      "name": "Planta Única",
      "description": "Nivel principal",
      "categories": [
        {
          "name": "Platea",
          "description": "Platea central",
          "color": "#FF6347",
          "relX": 25,
          "relY": 30,
          "width": 50,
          "height": 40,
          "seats": []
        }
      ]
    }
  ]
}
```

**Respuesta (201 Created):**

```json
{
  "message": "Venue created successfully with all floors, elements, categories, and seats",
  "venue": {
    "venueId": "770e8400-e29b-41d4-a716-446655440003",
    "name": "Teatro Colón",
    "address": "Calle 10 # 5-32",
    "city": "Bogotá",
    "capacity": 500,
    "isCertified": false,
    "createdAt": "2024-11-12T11:00:00.000Z"
  },
  "summary": {
    "floorsCreated": 1,
    "elementsCreated": 0,
    "categoriesCreated": 1,
    "seatsCreated": 0
  }
}
```

## 3. Obtener Venue Completo con toda la jerarquía

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000
```

**Respuesta (200 OK):**

```json
{
  "venue": {
    "venue_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Estadio El Campín",
    "address": "Carrera 30 # 57-60",
    "city": "Bogotá",
    "capacity": 36000,
    "description": "Estadio de fútbol con capacidad para 36,000 personas",
    "image": "https://doevent-venue-images.s3.amazonaws.com/550e8400-e29b-41d4-a716-446655440000.png",
    "isCertified": true,
    "createdAt": "2024-11-12T10:30:00.000Z",
    "floors": [
      {
        "floorId": "660e8400-e29b-41d4-a716-446655440001",
        "venueId": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Planta Baja",
        "description": "Nivel principal del estadio",
        "elements": [
          {
            "elementId": "880e8400-e29b-41d4-a716-446655440004",
            "floorId": "660e8400-e29b-41d4-a716-446655440001",
            "venueId": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Baño Principal Norte",
            "type": "bathroom",
            "position": "Norte",
            "relX": 10,
            "relY": 5,
            "width": 8,
            "height": 6,
            "notes": "Baño con 10 cabinas"
          }
        ],
        "categories": [
          {
            "categoryId": "990e8400-e29b-41d4-a716-446655440005",
            "floorId": "660e8400-e29b-41d4-a716-446655440001",
            "venueId": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Tribuna VIP",
            "description": "Asientos VIP con mejor vista",
            "color": "#FFD700",
            "relX": 20,
            "relY": 20,
            "width": 60,
            "height": 30,
            "seats": [
              {
                "seatId": "aa0e8400-e29b-41d4-a716-446655440006",
                "categoryId": "990e8400-e29b-41d4-a716-446655440005",
                "floorId": "660e8400-e29b-41d4-a716-446655440001",
                "venueId": "550e8400-e29b-41d4-a716-446655440000",
                "row": "A",
                "number": "1",
                "status": "available"
              }
            ]
          }
        ]
      }
    ],
    "entrances": [
      {
        "entranceId": "entrance-principal-001",
        "venueId": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Accesos Principales",
        "type": "general",
        "capacity": 30000,
        "availableCapacity": 28500,
        "isActive": true,
        "categories": [
          {
            "entranceCategoryId": "entrance-cat-norte-001",
            "name": "Puerta Norte",
            "type": "standard",
            "capacity": 12000,
            "availableCapacity": 11500,
            "allowedDays": ["saturday", "sunday"],
            "isActive": true
          },
          {
            "entranceCategoryId": "entrance-cat-vip-001",
            "name": "Acceso VIP",
            "type": "vip",
            "capacity": 2000,
            "availableCapacity": 1800,
            "requiresDocumentation": true,
            "isActive": true
          }
        ]
      }
    ]
  }
}
```

## 4. Listar Venues con Filtros de Ubicación, Distancia y Paginación

### 4.1. Listar todos los venues (básico)

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues
```

**Respuesta (200 OK):**

```json
{
  "venues": [
    {
      "venue_id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Estadio El Campín",
      "city": "Bogotá",
      "latitude": 4.6536,
      "longitude": -74.0574,
      "capacity": 36000,
      "isCertified": true
    },
    {
      "venue_id": "770e8400-e29b-41d4-a716-446655440003",
      "name": "Teatro Colón",
      "city": "Bogotá",
      "latitude": 4.5981,
      "longitude": -74.0758,
      "capacity": 500,
      "isCertified": false
    }
  ],
  "count": 2,
  "lastEvaluatedKey": null,
  "hasMore": false
}
```

### 4.2. Buscar venues cercanos a una ubicación (10km)

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?latitude=4.6097&longitude=-74.0817&maxDistance=10
```

**Respuesta (200 OK):**

```json
{
  "venues": [
    {
      "venue_id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Estadio El Campín",
      "city": "Bogotá",
      "latitude": 4.6536,
      "longitude": -74.0574,
      "capacity": 36000,
      "distance": 5.23,
      "isCertified": true
    },
    {
      "venue_id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Movistar Arena",
      "city": "Bogotá",
      "latitude": 4.6285,
      "longitude": -74.0725,
      "capacity": 14000,
      "distance": 7.85,
      "isCertified": true
    }
  ],
  "count": 2,
  "lastEvaluatedKey": null,
  "hasMore": false
}
```

**Nota:** Los resultados se ordenan automáticamente por distancia (más cercanos primero). El campo `distance` aparece en kilómetros con 2 decimales.

### 4.3. Listar con paginación (20 items por página)

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?limit=20
```

**Respuesta (200 OK):**

```json
{
  "venues": [...],
  "count": 20,
  "lastEvaluatedKey": "eyJ2ZW51ZV9pZCI6InZlbnVlXzIwIn0%3D",
  "hasMore": true
}
```

### 4.4. Obtener siguiente página

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?limit=20&lastEvaluatedKey=eyJ2ZW51ZV9pZCI6InZlbnVlXzIwIn0%3D
```

### 4.5. Buscar venues de un propietario cercanos a ubicación

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?ownerUserId=user_123&latitude=4.6097&longitude=-74.0817&maxDistance=15
```

### 4.6. Buscar solo templates cercanos

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?isTemplate=true&latitude=4.6097&longitude=-74.0817&maxDistance=20&limit=10
```

### 4.7. Venues activos cercanos

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?status=active&latitude=4.6097&longitude=-74.0817&maxDistance=5
```

## 5. Actualizar Venue con Entrances

```bash
PUT https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

```json
{
  "name": "Estadio El Campín - Renovado",
  "capacity": 40000,
  "latitude": 4.6536,
  "longitude": -74.0574,
  "description": "Estadio renovado con nuevas instalaciones",
  "isCertified": true,
  "entrances": [
    {
      "entranceId": "entrance-principal-001",
      "name": "Accesos Principales Renovados",
      "capacity": 35000,
      "categories": [
        {
          "entranceCategoryId": "entrance-cat-norte-001",
          "name": "Puerta Norte VIP",
          "type": "vip",
          "capacity": 5000
        },
        {
          "name": "Puerta Oeste Nueva",
          "type": "standard",
          "capacity": 10000
        }
      ]
    },
    {
      "name": "Acceso de Emergencia",
      "type": "emergency",
      "capacity": 1000,
      "categories": [
        {
          "name": "Salida de Emergencia 1",
          "type": "standard",
          "capacity": 500
        }
      ]
    }
  ]
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Venue updated successfully",
  "venueId": "550e8400-e29b-41d4-a716-446655440000",
  "entrancesProcessed": 2,
  "entrances": [
    {
      "entranceId": "entrance-principal-001",
      "name": "Accesos Principales Renovados",
      "categoryCount": 2,
      "categories": [
        {
          "entranceCategoryId": "entrance-cat-norte-001",
          "name": "Puerta Norte VIP"
        },
        {
          "entranceCategoryId": "entrance-cat-new-001",
          "name": "Puerta Oeste Nueva"
        }
      ]
    },
    {
      "entranceId": "entrance-emergency-001",
      "name": "Acceso de Emergencia",
      "categoryCount": 1,
      "categories": [
        {
          "entranceCategoryId": "entrance-cat-emergency-001",
          "name": "Salida de Emergencia 1"
        }
      ]
    }
  ]
}
```

**Nota:** Si el entrance tiene `entranceId` se actualiza, si no se crea uno nuevo. Lo mismo aplica para `entranceCategoryId`.

## 6. Agregar Floor a Venue Existente

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/floors
Content-Type: application/json
```

```json
{
  "floorId": "floor-subterraneo-001",
  "name": "Nivel Subterráneo",
  "description": "Estacionamiento y servicios",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

**Nota:** El campo `floorId` es opcional. Si no se envía, se genera automáticamente.

**Respuesta (201 Created):**

```json
{
  "message": "Floor created successfully",
  "floor": {
    "floorId": "floor-subterraneo-001",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Nivel Subterráneo",
    "description": "Estacionamiento y servicios",
    "image": "https://doevent-venue-images.s3.amazonaws.com/floors/floor-subterraneo-001.jpeg",
    "createdAt": "2024-11-12T12:00:00.000Z"
  }
}
```

## 7. Agregar Element a Floor

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/floors/floor-planta-baja-001/elements
Content-Type: application/json
```

```json
{
  "elementId": "element-exit-oeste-002",
  "name": "Salida de Emergencia Oeste",
  "type": "exit",
  "position": "Oeste",
  "relX": 5,
  "relY": 50,
  "width": 4,
  "height": 8,
  "notes": "Salida de emergencia con barra antipánico"
}
```

**Nota:** El campo `elementId` es opcional. Si no se envía, se genera automáticamente.

**Tipos de elementos válidos:** `bathroom`, `stairs`, `entrance`, `exit`, `other`

**Respuesta (201 Created):**

```json
{
  "message": "Element created successfully",
  "element": {
    "elementId": "element-exit-oeste-002",
    "floorId": "floor-planta-baja-001",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Salida de Emergencia Oeste",
    "type": "exit",
    "position": "Oeste",
    "relX": 5,
    "relY": 50,
    "width": 4,
    "height": 8,
    "notes": "Salida de emergencia con barra antipánico",
    "createdAt": "2024-11-12T12:15:00.000Z"
  }
}
```

## 8. Agregar Category a Floor

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/floors/floor-planta-baja-001/categories
Content-Type: application/json
```

```json
{
  "categoryId": "cat-tribuna-norte-001",
  "name": "Tribuna Norte",
  "description": "Sección norte del estadio",
  "color": "#E91E63",
  "relX": 25,
  "relY": 10,
  "width": 50,
  "height": 35
}
```

**Nota:** El campo `categoryId` es opcional. Si no se envía, se genera automáticamente.

**Respuesta (201 Created):**

```json
{
  "message": "Category created successfully",
  "category": {
    "categoryId": "cat-tribuna-norte-001",
    "floorId": "floor-planta-baja-001",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Tribuna Norte",
    "description": "Sección norte del estadio",
    "color": "#E91E63",
    "relX": 25,
    "relY": 10,
    "width": 50,
    "height": 35,
    "createdAt": "2024-11-12T12:30:00.000Z"
  }
}
```

## 9. Actualizar Category

```bash
PUT https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/floors/floor-planta-baja-001/categories/cat-tribuna-norte-001
Content-Type: application/json
```

```json
{
  "name": "Tribuna Norte Premium",
  "color": "#9C27B0",
  "relX": 25,
  "relY": 10,
  "width": 55,
  "height": 35
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Category updated successfully",
  "categoryId": "dd0e8400-e29b-41d4-a716-446655440009"
}
```

## 10. Agregar Seats a Category

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/floors/floor-planta-baja-001/categories/cat-tribuna-norte-001/seats
Content-Type: application/json
```

```json
{
  "seats": [
    {
      "seatId": "seat-norte-a1",
      "row": "A",
      "number": "1",
      "status": "available"
    },
    {
      "seatId": "seat-norte-a2",
      "row": "A",
      "number": "2",
      "status": "available"
    },
    {
      "seatId": "seat-norte-a3",
      "row": "A",
      "number": "3",
      "status": "reserved"
    },
    {
      "seatId": "seat-norte-b1",
      "row": "B",
      "number": "1",
      "status": "available"
    },
    {
      "seatId": "seat-norte-b2",
      "row": "B",
      "number": "2",
      "status": "disabled"
    }
  ]
}
```

**Nota:** El campo `seatId` es opcional en cada seat. Si no se envía, se genera automáticamente.

**Estados válidos:** `available`, `occupied`, `reserved`, `disabled`

**Respuesta (201 Created):**

```json
{
  "message": "5 seats created successfully",
  "seats": [
    {
      "seatId": "seat-norte-a1",
      "categoryId": "cat-tribuna-norte-001",
      "floorId": "floor-planta-baja-001",
      "venueId": "550e8400-e29b-41d4-a716-446655440000",
      "row": "A",
      "number": "1",
      "status": "available",
      "createdAt": "2024-11-12T12:45:00.000Z"
    }
    // ... otros 4 asientos
  ]
}
```

## 11. Actualizar Seat

```bash
PUT https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/seats/seat-norte-a1
Content-Type: application/json
```

```json
{
  "status": "reserved",
  "row": "A",
  "number": "1"
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Seat updated successfully",
  "seatId": "ee0e8400-e29b-41d4-a716-446655440010"
}
```

## 12. Eliminar Seat

```bash
DELETE https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/seats/ee0e8400-e29b-41d4-a716-446655440010
```

**Respuesta (200 OK):**

```json
{
  "message": "Seat deleted successfully",
  "seatId": "ee0e8400-e29b-41d4-a716-446655440010"
}
```

## 13. Eliminar Category (elimina todos los seats)

```bash
DELETE https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/floors/660e8400-e29b-41d4-a716-446655440001/categories/dd0e8400-e29b-41d4-a716-446655440009
```

**Respuesta (200 OK):**

```json
{
  "message": "Category and all related seats deleted successfully",
  "categoryId": "dd0e8400-e29b-41d4-a716-446655440009"
}
```

## 14. Eliminar Venue Completo (cascade delete)

```bash
DELETE https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000
```

Elimina en cascada:

1. Todos los seats de todas las categorías
2. Todas las categorías de todos los floors
3. Todos los elements de todos los floors
4. Todos los floors del venue
5. El venue

**Respuesta (200 OK):**

```json
{
  "message": "Venue and all related data deleted successfully",
  "venueId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 15. Clonar Venue Base para Evento

Clona un venue base (template) y lo convierte en un venue específico para un evento. Copia automáticamente todos los floors, elements, categories, seats y entrances.

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/clone-for-event
Content-Type: application/json
```

```json
{
  "baseVenueId": "venue-base-123",
  "eventId": "event-456",
  "name": "Estadio El Campín - Concierto 2025",
  "hasSeating": true,
  "ticketCategories": [
    {
      "categoria": "VIP Premium",
      "cantidadTickets": 500,
      "moneda": "COP",
      "costo": 150000,
      "valor": 200000,
      "descripcion": "Acceso VIP con bar incluido"
    },
    {
      "categoria": "General",
      "cantidadTickets": 10000,
      "moneda": "COP",
      "costo": 50000,
      "valor": 80000,
      "descripcion": "Acceso general"
    }
  ],
  "fechaIniVent": "2025-06-01T00:00:00Z",
  "fechaFinVent": "2025-06-15T23:59:59Z",
  "horaIniVent": "08:00",
  "horaFinVent": "20:00",
  "overrides": {
    "capacity": 35000,
    "status": "active"
  }
}
```

**Respuesta (201 Created):**

```json
{
  "message": "Venue cloned successfully for event",
  "venue": {
    "venueId": "venue-event-789",
    "name": "Estadio El Campín - Concierto 2025",
    "eventId": "event-456",
    "baseVenueId": "venue-base-123",
    "isEventVenue": true,
    "hasSeating": true,
    "floorsCloned": 2,
    "categoriesCloned": 8,
    "entrancesCloned": 2,
    "entranceCategoriesCloned": 5,
    "ticketRecord": {
      "ticketId": "tick_abc123",
      "categoriesCount": 2,
      "totalCapacity": 10500
    }
  }
}
```

## 16. Crear Entrance Dedicada

Crear un entrance con sus categorías usando los endpoints dedicados.

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances
Content-Type: application/json
```

```json
{
  "name": "Accesos Norte",
  "description": "Entradas del sector norte",
  "type": "general",
  "capacity": 15000,
  "requiresReservation": false,
  "allowsGroupBooking": true,
  "minGroupSize": 1,
  "maxGroupSize": 20,
  "validFrom": "2025-01-01T00:00:00Z",
  "validUntil": "2025-12-31T23:59:59Z",
  "categories": [
    {
      "name": "Puerta 1 - VIP",
      "type": "vip",
      "capacity": 3000,
      "requiresDocumentation": true,
      "allowedDays": ["friday", "saturday", "sunday"],
      "allowedTimeRanges": [{ "start": "18:00", "end": "23:00" }],
      "priority": 1
    },
    {
      "name": "Puerta 2 - General",
      "type": "standard",
      "capacity": 8000,
      "allowedDays": [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
      ],
      "priority": 2
    },
    {
      "name": "Puerta 3 - Estudiantes",
      "type": "student",
      "capacity": 4000,
      "minAge": 18,
      "maxAge": 28,
      "requiresDocumentation": true,
      "priority": 3
    }
  ]
}
```

**Respuesta (201 Created):**

```json
{
  "message": "Entrance configuration created successfully",
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "venueId": "venue_123",
    "name": "Accesos Norte",
    "type": "general",
    "capacity": 15000,
    "categoryCount": 3,
    "categories": [
      {
        "entranceCategoryId": "category-uuid-789",
        "name": "Puerta 1 - VIP",
        "type": "vip",
        "capacity": 3000
      },
      {
        "entranceCategoryId": "category-uuid-790",
        "name": "Puerta 2 - General",
        "type": "standard",
        "capacity": 8000
      },
      {
        "entranceCategoryId": "category-uuid-791",
        "name": "Puerta 3 - Estudiantes",
        "type": "student",
        "capacity": 4000
      }
    ]
  }
}
```

## 17. Listar Entrances de un Venue

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances
```

**Respuesta (200 OK):**

```json
{
  "venueId": "venue_123",
  "entrances": [
    {
      "entranceId": "entrance-uuid-123",
      "venueId": "venue_123",
      "name": "Accesos Norte",
      "type": "general",
      "capacity": 15000,
      "availableCapacity": 14200,
      "isActive": true,
      "categories": [
        {
          "entranceCategoryId": "category-uuid-789",
          "name": "Puerta 1 - VIP",
          "type": "vip",
          "capacity": 3000,
          "availableCapacity": 2850
        }
      ]
    }
  ],
  "total": 1
}
```

## 18. Actualizar Entrance

```bash
PUT https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances/entrance-uuid-123
Content-Type: application/json
```

```json
{
  "name": "Accesos Norte - Renovados",
  "capacity": 18000,
  "isActive": true,
  "description": "Entradas renovadas con mejor flujo"
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Entrance configuration updated successfully",
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "name": "Accesos Norte - Renovados",
    "capacity": 18000,
    "updatedAt": "2025-12-04T10:30:00Z"
  }
}
```

## 19. Eliminar Entrance (elimina todas las categorías)

```bash
DELETE https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances/entrance-uuid-123
```

**Respuesta (200 OK):**

```json
{
  "message": "Entrance configuration deleted successfully",
  "deletedItems": {
    "entrance": 1,
    "categories": 3
  }
}
```

## 20. Crear Entrance Category

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances/entrance-uuid-123/categories
Content-Type: application/json
```

```json
{
  "name": "Puerta Este",
  "type": "standard",
  "capacity": 5000,
  "allowedDays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "allowedTimeRanges": [{ "start": "08:00", "end": "20:00" }],
  "priority": 2,
  "requiresDocumentation": false
}
```

**Respuesta (201 Created):**

```json
{
  "message": "Entrance category created successfully",
  "category": {
    "entranceCategoryId": "category-uuid-new-001",
    "entranceId": "entrance-uuid-123",
    "venueId": "venue_123",
    "name": "Puerta Este",
    "type": "standard",
    "capacity": 5000,
    "availableCapacity": 5000,
    "isActive": true,
    "createdAt": "2025-12-04T11:00:00Z"
  }
}
```

## 21. Actualizar Entrance Category

```bash
PUT https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances/entrance-uuid-123/categories/category-uuid-new-001
Content-Type: application/json
```

```json
{
  "name": "Puerta Este VIP",
  "type": "vip",
  "capacity": 3000,
  "requiresDocumentation": true,
  "priority": 1
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Entrance category updated successfully",
  "category": {
    "entranceCategoryId": "category-uuid-new-001",
    "name": "Puerta Este VIP",
    "type": "vip",
    "capacity": 3000,
    "updatedAt": "2025-12-04T11:15:00Z"
  }
}
```

## 22. Eliminar Entrance Category

```bash
DELETE https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances/entrance-uuid-123/categories/category-uuid-new-001
```

**Respuesta (200 OK):**

```json
{
  "message": "Entrance category deleted successfully",
  "entranceCategoryId": "category-uuid-new-001"
}
```

## 23. Obtener Entrance Específico

```bash
GET https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/venue_123/entrances/entrance-uuid-123
```

**Respuesta (200 OK):**

```json
{
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "venueId": "venue_123",
    "name": "Accesos Norte - Renovados",
    "description": "Entradas renovadas con mejor flujo",
    "type": "general",
    "capacity": 18000,
    "availableCapacity": 17200,
    "requiresReservation": false,
    "allowsGroupBooking": true,
    "minGroupSize": 1,
    "maxGroupSize": 20,
    "validFrom": "2025-01-01T00:00:00Z",
    "validUntil": "2025-12-31T23:59:59Z",
    "isActive": true,
    "createdAt": "2025-12-01T10:00:00Z",
    "updatedAt": "2025-12-04T10:30:00Z",
    "categories": [
      {
        "entranceCategoryId": "category-uuid-789",
        "name": "Puerta 1 - VIP",
        "type": "vip",
        "capacity": 3000,
        "availableCapacity": 2850,
        "requiresDocumentation": true,
        "priority": 1,
        "isActive": true
      },
      {
        "entranceCategoryId": "category-uuid-790",
        "name": "Puerta 2 - General",
        "type": "standard",
        "capacity": 8000,
        "availableCapacity": 7800,
        "allowedDays": [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday"
        ],
        "priority": 2,
        "isActive": true
      }
    ]
  }
}
```

## 24. Subir Imagen a Venue

```bash
POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/images
Content-Type: application/json
```

```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL...",
  "fileName": "estadio-nuevo.jpg"
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/550e8400-e29b-41d4-a716-446655440000/img_1733311200000.jpg",
  "metadata": {
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "uploadedAt": "2025-12-04T12:00:00.000Z",
    "originalFileName": "estadio-nuevo.jpg",
    "contentType": "image/jpeg",
    "size": 245678
  }
}
```

## 25. Actualizar Seat (cambiar estado)

```bash
PUT https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/550e8400-e29b-41d4-a716-446655440000/seats/seat-norte-a1
Content-Type: application/json
```

```json
{
  "status": "occupied",
  "row": "A",
  "number": "1",
  "notes": "Reservado para VIP"
}
```

**Respuesta (200 OK):**

```json
{
  "message": "Seat updated successfully",
  "seat": {
    "seatId": "seat-norte-a1",
    "categoryId": "cat-tribuna-norte-001",
    "floorId": "floor-planta-baja-001",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "row": "A",
    "number": "1",
    "status": "occupied",
    "notes": "Reservado para VIP",
    "updatedAt": "2025-12-04T12:30:00Z"
  }
}
```

## 📊 Campos de Posicionamiento

Los campos `relX`, `relY`, `width`, `height` son porcentajes (0-100) que permiten posicionar elementos y categorías:

- **relX**: Posición horizontal relativa (0 = izquierda, 100 = derecha)
- **relY**: Posición vertical relativa (0 = arriba, 100 = abajo)
- **width**: Ancho del elemento (0-100%)
- **height**: Alto del elemento (0-100%)

## 🎨 Estados y Tipos

### Estados de Asientos

- `available` - Disponible
- `occupied` - Ocupado
- `reserved` - Reservado
- `disabled` - Deshabilitado

### Tipos de Elementos

- `bathroom` - Baño
- `stairs` - Escaleras
- `entrance` - Entrada
- `exit` - Salida
- `other` - Otro

### Tipos de Entrances

- `general` - Acceso general
- `vip` - Acceso VIP
- `accessible` - Acceso para personas con movilidad reducida
- `emergency` - Salida de emergencia

### Tipos de Entrance Categories

- `standard` - Puerta estándar
- `vip` - Puerta VIP
- `student` - Puerta para estudiantes
- `senior` - Puerta para adultos mayores
- `child` - Puerta para niños
- `accessible` - Puerta accesible

## 🔑 IDs Personalizados desde el Frontend

Todos los handlers aceptan IDs personalizados desde el frontend para facilitar las referencias:

### Campos que aceptan IDs personalizados:

- **floorId**: ID del piso (opcional)
- **elementId**: ID del elemento (opcional)
- **categoryId**: ID de la categoría (opcional)
- **seatId**: ID del asiento (opcional)
- **entranceId**: ID del acceso/entrada (opcional)
- **entranceCategoryId**: ID de la categoría de entrada (opcional)

### Ventajas de usar IDs personalizados:

1. **Referencias Predecibles**: Puedes construir URLs y referencias antes de que se creen los recursos
2. **IDs Semánticos**: Usar IDs legibles como `cat-vip-001` o `floor-planta-baja-001`
3. **Integración Frontend**: El frontend puede mantener consistencia entre su estado y el backend
4. **Debugging**: IDs legibles facilitan la depuración y el seguimiento
5. **Idempotencia**: Reintentos con el mismo ID no crean duplicados si se implementa validación

### Ejemplo de estructura de IDs recomendada:

```javascript
// Floors
floorId: "floor-{nombre-descriptivo}-{numero}";
// Ejemplos: "floor-planta-baja-001", "floor-nivel-superior-002"

// Elements
elementId: "element-{tipo}-{ubicacion}-{numero}";
// Ejemplos: "element-bathroom-norte-001", "element-exit-oeste-002"

// Categories
categoryId: "cat-{nombre-categoria}-{numero}";
// Ejemplos: "cat-vip-001", "cat-general-002", "cat-palco-presidencial-001"

// Seats
seatId: "seat-{categoria}-{fila}{numero}";
// Ejemplos: "seat-vip-a1", "seat-general-c15", "seat-palco-vip2"

// Entrances
entranceId: "entrance-{tipo}-{numero}";
// Ejemplos: "entrance-principal-001", "entrance-accesible-001", "entrance-emergency-001"

// Entrance Categories
entranceCategoryId: "entrance-cat-{nombre}-{numero}";
// Ejemplos: "entrance-cat-norte-001", "entrance-cat-vip-001", "entrance-cat-accesible-001"
```

## 🔍 Parámetros de Query para List Venues

### Filtros Básicos

- `ownerUserId` (string): Filtra venues por propietario
- `isTemplate` (boolean): Filtra por templates (true) o venues de eventos (false)
- `status` (string): Filtra por estado (active, inactive, draft, etc.)

### Filtros de Ubicación

- `latitude` (number): Latitud de la ubicación del usuario
- `longitude` (number): Longitud de la ubicación del usuario
- `maxDistance` (number): Distancia máxima en kilómetros

### Paginación

- `limit` (number): Número máximo de resultados por página (default: 50)
- `lastEvaluatedKey` (string): Token para obtener la siguiente página (URL encoded)

### Ejemplo completo con IDs personalizados:

```json
{
  "name": "Teatro Municipal",
  "address": "Calle Principal 123",
  "city": "Bogotá",
  "capacity": 1000,
  "isCertified": true,
  "floors": [
    {
      "floorId": "floor-platea-001",
      "name": "Platea",
      "categories": [
        {
          "categoryId": "cat-platea-central-001",
          "name": "Platea Central",
          "color": "#FF6347",
          "relX": 25,
          "relY": 30,
          "width": 50,
          "height": 40,
          "seats": [
            {
              "seatId": "seat-platea-a1",
              "row": "A",
              "number": "1",
              "status": "available"
            },
            {
              "seatId": "seat-platea-a2",
              "row": "A",
              "number": "2",
              "status": "available"
            }
          ]
        }
      ]
    }
  ]
}
```

**Nota:** Si no envías un ID, el sistema generará automáticamente uno usando UUID v4 (formato: `550e8400-e29b-41d4-a716-446655440000`).

---

## 📖 Resumen Completo de Métodos HTTP

### 🏢 VENUES

| #   | Método | Endpoint                   | Descripción               | Ejemplo                                                                                      |
| --- | ------ | -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | POST   | `/venues`                  | Crear venue completo      | [Ver ejemplo 1](#1-crear-un-venue-completo-con-floors-elements-categories-seats-y-entrances) |
| 2   | GET    | `/venues/{venueId}`        | Obtener venue por ID      | [Ver ejemplo 3](#3-obtener-venue-completo-con-toda-la-jerarquía)                             |
| 3   | GET    | `/venues`                  | Listar venues con filtros | [Ver ejemplo 4](#4-listar-venues-con-filtros-de-ubicación-distancia-y-paginación)            |
| 4   | PUT    | `/venues/{venueId}`        | Actualizar venue          | [Ver ejemplo 5](#5-actualizar-venue-con-entrances)                                           |
| 5   | DELETE | `/venues/{venueId}`        | Eliminar venue            | [Ver ejemplo 14](#14-eliminar-venue-completo-cascade-delete)                                 |
| 6   | POST   | `/venues/clone-for-event`  | Clonar venue para evento  | [Ver ejemplo 15](#15-clonar-venue-base-para-evento)                                          |
| 7   | POST   | `/venues/{venueId}/images` | Subir imagen              | [Ver ejemplo 24](#24-subir-imagen-a-venue)                                                   |

### 🏗️ FLOORS

| #   | Método | Endpoint                   | Descripción | Ejemplo                                             |
| --- | ------ | -------------------------- | ----------- | --------------------------------------------------- |
| 8   | POST   | `/venues/{venueId}/floors` | Crear floor | [Ver ejemplo 6](#6-agregar-floor-a-venue-existente) |

### 📦 ELEMENTS

| #   | Método | Endpoint                                      | Descripción   | Ejemplo                                     |
| --- | ------ | --------------------------------------------- | ------------- | ------------------------------------------- |
| 9   | POST   | `/venues/{venueId}/floors/{floorId}/elements` | Crear element | [Ver ejemplo 7](#7-agregar-element-a-floor) |

### 🎨 CATEGORIES

| #   | Método | Endpoint                                                     | Descripción          | Ejemplo                                                         |
| --- | ------ | ------------------------------------------------------------ | -------------------- | --------------------------------------------------------------- |
| 10  | POST   | `/venues/{venueId}/floors/{floorId}/categories`              | Crear categoría      | [Ver ejemplo 8](#8-agregar-category-a-floor)                    |
| 11  | PUT    | `/venues/{venueId}/floors/{floorId}/categories/{categoryId}` | Actualizar categoría | [Ver ejemplo 9](#9-actualizar-category)                         |
| 12  | DELETE | `/venues/{venueId}/floors/{floorId}/categories/{categoryId}` | Eliminar categoría   | [Ver ejemplo 13](#13-eliminar-category-elimina-todos-los-seats) |

### 💺 SEATS

| #   | Método | Endpoint                                                           | Descripción     | Ejemplo                                              |
| --- | ------ | ------------------------------------------------------------------ | --------------- | ---------------------------------------------------- |
| 13  | POST   | `/venues/{venueId}/floors/{floorId}/categories/{categoryId}/seats` | Crear seats     | [Ver ejemplo 10](#10-agregar-seats-a-category)       |
| 14  | PUT    | `/venues/{venueId}/seats/{seatId}`                                 | Actualizar seat | [Ver ejemplo 25](#25-actualizar-seat-cambiar-estado) |
| 15  | DELETE | `/venues/{venueId}/seats/{seatId}`                                 | Eliminar seat   | [Ver ejemplo 12](#12-eliminar-seat)                  |

### 🚪 ENTRANCES

| #   | Método | Endpoint                                   | Descripción         | Ejemplo                                                              |
| --- | ------ | ------------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| 16  | POST   | `/venues/{venueId}/entrances`              | Crear entrance      | [Ver ejemplo 16](#16-crear-entrance-dedicada)                        |
| 17  | GET    | `/venues/{venueId}/entrances`              | Listar entrances    | [Ver ejemplo 17](#17-listar-entrances-de-un-venue)                   |
| 18  | GET    | `/venues/{venueId}/entrances/{entranceId}` | Obtener entrance    | [Ver ejemplo 23](#23-obtener-entrance-específico)                    |
| 19  | PUT    | `/venues/{venueId}/entrances/{entranceId}` | Actualizar entrance | [Ver ejemplo 18](#18-actualizar-entrance)                            |
| 20  | DELETE | `/venues/{venueId}/entrances/{entranceId}` | Eliminar entrance   | [Ver ejemplo 19](#19-eliminar-entrance-elimina-todas-las-categorías) |

### 🔖 ENTRANCE CATEGORIES

| #   | Método | Endpoint                                                           | Descripción          | Ejemplo                                            |
| --- | ------ | ------------------------------------------------------------------ | -------------------- | -------------------------------------------------- |
| 21  | POST   | `/venues/{venueId}/entrances/{entranceId}/categories`              | Crear categoría      | [Ver ejemplo 20](#20-crear-entrance-category)      |
| 22  | PUT    | `/venues/{venueId}/entrances/{entranceId}/categories/{categoryId}` | Actualizar categoría | [Ver ejemplo 21](#21-actualizar-entrance-category) |
| 23  | DELETE | `/venues/{venueId}/entrances/{entranceId}/categories/{categoryId}` | Eliminar categoría   | [Ver ejemplo 22](#22-eliminar-entrance-category)   |

---

## 🚀 Quick Start por Caso de Uso

### Caso 1: Crear un estadio completo desde cero

1. Usa `POST /venues` con toda la estructura ([Ejemplo 1](#1-crear-un-venue-completo-con-floors-elements-categories-seats-y-entrances))
2. Sube imágenes con `POST /venues/{venueId}/images` ([Ejemplo 24](#24-subir-imagen-a-venue))

### Caso 2: Agregar un nuevo piso a un venue existente

1. Usa `POST /venues/{venueId}/floors` ([Ejemplo 6](#6-agregar-floor-a-venue-existente))
2. Luego agrega categorías con `POST /venues/{venueId}/floors/{floorId}/categories` ([Ejemplo 8](#8-agregar-category-a-floor))
3. Finalmente agrega asientos con `POST /venues/{venueId}/floors/{floorId}/categories/{categoryId}/seats` ([Ejemplo 10](#10-agregar-seats-a-category))

### Caso 3: Configurar accesos para un evento

1. Crea entrances con `POST /venues/{venueId}/entrances` ([Ejemplo 16](#16-crear-entrance-dedicada))
2. Agrega categorías adicionales con `POST /venues/{venueId}/entrances/{entranceId}/categories` ([Ejemplo 20](#20-crear-entrance-category))

### Caso 4: Clonar venue para evento específico

1. Usa `POST /venues/clone-for-event` con el `baseVenueId` y `eventId` ([Ejemplo 15](#15-clonar-venue-base-para-evento))
2. Todo se clona automáticamente: floors, elements, categories, seats, entrances y entrance categories

### Caso 5: Buscar venues cercanos para una app móvil

1. Usa `GET /venues?latitude={lat}&longitude={lng}&maxDistance={km}` ([Ejemplo 4.2](#42-buscar-venues-cercanos-a-una-ubicación-10km))
2. Los resultados vienen ordenados por distancia con el campo `distance` en km

### Caso 6: Actualizar estado de asientos durante venta

1. Usa `PUT /venues/{venueId}/seats/{seatId}` para cambiar estado a `reserved` u `occupied` ([Ejemplo 25](#25-actualizar-seat-cambiar-estado))

---

## 📊 Códigos de Respuesta HTTP

| Código | Significado           | Cuándo se usa                    |
| ------ | --------------------- | -------------------------------- |
| 200    | OK                    | GET, PUT, DELETE exitosos        |
| 201    | Created               | POST exitoso (recurso creado)    |
| 400    | Bad Request           | Parámetros inválidos o faltantes |
| 404    | Not Found             | Recurso no encontrado            |
| 500    | Internal Server Error | Error del servidor               |

---

## 🔒 Headers Requeridos

Todos los endpoints POST y PUT requieren:

```http
Content-Type: application/json
```

Todos los endpoints devuelven CORS headers:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

---

## 💡 Tips de Integración

### 1. Manejo de Paginación

```javascript
async function getAllVenues() {
  let allVenues = [];
  let lastKey = null;

  do {
    const url = lastKey
      ? `/venues?limit=50&lastEvaluatedKey=${encodeURIComponent(lastKey)}`
      : `/venues?limit=50`;

    const response = await fetch(url);
    const data = await response.json();

    allVenues = [...allVenues, ...data.venues];
    lastKey = data.lastEvaluatedKey;
  } while (lastKey);

  return allVenues;
}
```

### 2. Cálculo de Distancia Local (validación)

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

### 3. Manejo de Imágenes en React

```javascript
function VenueImage({ venue }) {
  const mainImage =
    venue.mainImage || venue.imageUrls?.[0] || "/placeholder.jpg";

  return (
    <div>
      <img src={mainImage} alt={venue.name} />
      {venue.imageUrls?.length > 1 && (
        <div className="gallery">
          {venue.imageUrls.slice(1).map((url, idx) => (
            <img key={idx} src={url} alt={`${venue.name} ${idx + 2}`} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4. Filtrado Inteligente de Venues

```javascript
async function findNearbyVenues(userLat, userLng, filters = {}) {
  const params = new URLSearchParams({
    latitude: userLat,
    longitude: userLng,
    maxDistance: filters.maxDistance || 10,
    limit: filters.limit || 20,
  });

  if (filters.ownerUserId) params.append("ownerUserId", filters.ownerUserId);
  if (filters.isTemplate !== undefined)
    params.append("isTemplate", filters.isTemplate);
  if (filters.status) params.append("status", filters.status);

  const response = await fetch(`/venues?${params}`);
  return await response.json();
}
```

### 5. Batch Seat Updates

```javascript
async function updateSeatsStatus(venueId, seatIds, newStatus) {
  const promises = seatIds.map((seatId) =>
    fetch(`/venues/${venueId}/seats/${seatId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
  );

  return await Promise.all(promises);
}
```

---

## 📱 Ejemplo de Flujo Completo: App de Reservas

```javascript
// 1. Usuario abre la app y busca venues cercanos
const userLocation = await getUserLocation(); // { lat: 4.6097, lng: -74.0817 }
const nearbyVenues = await findNearbyVenues(
  userLocation.lat,
  userLocation.lng,
  { maxDistance: 5, status: "active" }
);

// 2. Usuario selecciona un venue
const selectedVenue = nearbyVenues.venues[0];
const venueDetails = await fetch(`/venues/${selectedVenue.venue_id}`).then(
  (r) => r.json()
);

// 3. Mostrar mapa de asientos disponibles
const availableSeats = venueDetails.venue.floors
  .flatMap((floor) => floor.categories)
  .flatMap((category) => category.seats)
  .filter((seat) => seat.status === "available");

// 4. Usuario selecciona asientos
const selectedSeats = ["seat-vip-a1", "seat-vip-a2"];

// 5. Reservar asientos
await updateSeatsStatus(selectedVenue.venue_id, selectedSeats, "reserved");

// 6. Confirmar reserva (después del pago)
await updateSeatsStatus(selectedVenue.venue_id, selectedSeats, "occupied");
```

---
