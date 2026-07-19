# Venue Management API - Ejemplos con Nueva Estructura

## Estructura de Datos

La nueva estructura jerárquica es:

```
Venue
  └─ Floors (Pisos) [1:N]
      ├─ Elements (Elementos: baños, escaleras, etc.) [0:N]
      └─ Categories (Categorías de asientos) [0:N]
          └─ Seats (Asientos) [0:N]
```

**NOTA:** Las **Sections** han sido eliminadas de la arquitectura. Ahora los asientos están directamente bajo las categorías.

## Interfaces TypeScript de Referencia

### VenueInterface

```typescript
interface VenueInterface {
  venueId: string;
  name: string;
  address: string;
  city: string;
  capacity: number;
  description?: string;
  image?: string;
  isCertified: boolean;
  floors: VenueFloorInterface[];
}
```

### VenueFloorInterface

```typescript
interface VenueFloorInterface {
  floorId: string;
  venueId: string;
  name: string;
  description?: string;
  image?: string;
  elements: VenueElementInterface[];
  categories: VenueCategoryInterface[];
}
```

### VenueElementInterface

```typescript
interface VenueElementInterface {
  elementId: string;
  floorId: string;
  venueId: string;
  name: string;
  type: "bathroom" | "stairs" | "entrance" | "exit" | "other";
  position?: string;
  relX: number; // 0-100 (porcentaje)
  relY: number; // 0-100 (porcentaje)
  width: number; // 0-100 (porcentaje)
  height: number; // 0-100 (porcentaje)
  notes?: string;
}
```

### VenueCategoryInterface

```typescript
interface VenueCategoryInterface {
  categoryId: string;
  floorId: string;
  venueId: string;
  name: string;
  description?: string;
  color?: string;
  relX: number; // 0-100 (porcentaje)
  relY: number; // 0-100 (porcentaje)
  width: number; // 0-100 (porcentaje)
  height: number; // 0-100 (porcentaje)
  seats: VenueSeatInterface[];
  ticketCategories?: TicketCategory[]; // Vinculación con categorías de tickets
}
```

### VenueSeatInterface

```typescript
interface VenueSeatInterface {
  seatId: string;
  categoryId: string;
  floorId: string;
  venueId: string;
  row: string;
  number: string;
  status: "available" | "occupied" | "reserved" | "disabled";
}
```

## 1. Crear Venue Completo (POST /venues)

### Request Body con Estructura Completa

```json
{
  "name": "Estadio Nacional",
  "address": "Av. Principal 123",
  "city": "Ciudad de México",
  "capacity": 50000,
  "description": "Estadio de fútbol con capacidad para 50,000 personas",
  "isCertified": true,
  "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "floors": [
    {
      "name": "Planta Baja",
      "description": "Nivel principal del estadio",
      "elements": [
        {
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
          "name": "Escalera Este",
          "type": "stairs",
          "position": "Este",
          "relX": 85,
          "relY": 45,
          "width": 5,
          "height": 10,
          "notes": "Acceso a nivel superior"
        },
        {
          "name": "Entrada Principal",
          "type": "entrance",
          "position": "Sur",
          "relX": 45,
          "relY": 90,
          "width": 10,
          "height": 5,
          "notes": "Entrada principal con control de acceso"
        }
      ],
      "categories": [
        {
          "name": "Preferente",
          "description": "Asientos preferenciales con mejor vista",
          "color": "#4CAF50",
          "relX": 20,
          "relY": 20,
          "width": 60,
          "height": 30,
          "seats": [
            { "row": "A", "number": "1", "status": "available" },
            { "row": "A", "number": "2", "status": "available" },
            { "row": "A", "number": "3", "status": "available" },
            { "row": "B", "number": "1", "status": "available" },
            { "row": "B", "number": "2", "status": "available" }
          ]
        },
        {
          "name": "General",
          "description": "Asientos generales",
          "color": "#2196F3",
          "relX": 20,
          "relY": 55,
          "width": 60,
          "height": 25,
          "seats": [
            { "row": "C", "number": "1", "status": "available" },
            { "row": "C", "number": "2", "status": "available" },
            { "row": "D", "number": "1", "status": "available" }
          ]
        }
      ]
    },
    {
      "name": "Nivel Superior",
      "description": "Segundo nivel del estadio",
      "elements": [
        {
          "name": "Baño Superior Sur",
          "type": "bathroom",
          "position": "Sur",
          "relX": 45,
          "relY": 85,
          "width": 6,
          "height": 5,
          "notes": "Baño nivel superior"
        }
      ],
      "categories": [
        {
          "name": "Palco VIP",
          "description": "Palcos exclusivos",
          "color": "#FFC107",
          "relX": 30,
          "relY": 15,
          "width": 40,
          "height": 20,
          "seats": [
            { "row": "VIP", "number": "1", "status": "available" },
            { "row": "VIP", "number": "2", "status": "available" }
          ]
        }
      ]
    }
  ]
}
```

### Response Success (201 Created)

```json
{
  "message": "Venue created successfully with all floors, elements, categories, and seats",
  "venue": {
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Estadio Nacional",
    "address": "Av. Principal 123",
    "city": "Ciudad de México",
    "capacity": 50000,
    "description": "Estadio de fútbol con capacidad para 50,000 personas",
    "image": "https://doevent-venue-images.s3.amazonaws.com/550e8400-e29b-41d4-a716-446655440000.png",
    "isCertified": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "floors": [
    {
      "floorId": "660e8400-e29b-41d4-a716-446655440001",
      "venueId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Planta Baja"
    },
    {
      "floorId": "660e8400-e29b-41d4-a716-446655440002",
      "venueId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Nivel Superior"
    }
  ],
  "summary": {
    "floorsCreated": 2,
    "elementsCreated": 3,
    "categoriesCreated": 3,
    "seatsCreated": 12
  }
}
```

## 2. Agregar Floor a Venue Existente (POST /venues/{venueId}/floors)

### Request Body

```json
{
  "name": "Nivel Subterráneo",
  "description": "Estacionamiento y áreas de servicio",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgAB..."
}
```

### Response Success (201 Created)

```json
{
  "message": "Floor created successfully",
  "floor": {
    "floorId": "770e8400-e29b-41d4-a716-446655440003",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Nivel Subterráneo",
    "description": "Estacionamiento y áreas de servicio",
    "image": "https://doevent-venue-images.s3.amazonaws.com/floors/770e8400-e29b-41d4-a716-446655440003.jpeg",
    "createdAt": "2024-01-15T11:00:00.000Z"
  }
}
```

## 3. Agregar Element a Floor (POST /venues/{venueId}/floors/{floorId}/elements)

### Request Body

```json
{
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

### Response Success (201 Created)

```json
{
  "message": "Element created successfully",
  "element": {
    "elementId": "880e8400-e29b-41d4-a716-446655440004",
    "floorId": "660e8400-e29b-41d4-a716-446655440001",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Salida de Emergencia Oeste",
    "type": "exit",
    "position": "Oeste",
    "relX": 5,
    "relY": 50,
    "width": 4,
    "height": 8,
    "notes": "Salida de emergencia con barra antipánico",
    "createdAt": "2024-01-15T11:15:00.000Z"
  }
}
```

## 4. Agregar Category a Floor (POST /venues/{venueId}/floors/{floorId}/categories)

### Request Body

```json
{
  "name": "Tribuna Norte",
  "description": "Sección norte del estadio",
  "color": "#E91E63",
  "relX": 25,
  "relY": 10,
  "width": 50,
  "height": 35
}
```

### Response Success (201 Created)

```json
{
  "message": "Category created successfully",
  "category": {
    "categoryId": "990e8400-e29b-41d4-a716-446655440005",
    "floorId": "660e8400-e29b-41d4-a716-446655440001",
    "venueId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Tribuna Norte",
    "description": "Sección norte del estadio",
    "color": "#E91E63",
    "relX": 25,
    "relY": 10,
    "width": 50,
    "height": 35,
    "createdAt": "2024-01-15T11:30:00.000Z"
  }
}
```

## 5. Agregar Seats a Category (POST /venues/{venueId}/floors/{floorId}/categories/{categoryId}/seats)

### Request Body

```json
{
  "seats": [
    { "row": "E", "number": "1", "status": "available" },
    { "row": "E", "number": "2", "status": "available" },
    { "row": "E", "number": "3", "status": "reserved" },
    { "row": "F", "number": "1", "status": "available" },
    { "row": "F", "number": "2", "status": "disabled" }
  ]
}
```

### Response Success (201 Created)

```json
{
  "message": "5 seats created successfully",
  "seats": [
    {
      "seatId": "aa0e8400-e29b-41d4-a716-446655440006",
      "categoryId": "990e8400-e29b-41d4-a716-446655440005",
      "floorId": "660e8400-e29b-41d4-a716-446655440001",
      "venueId": "550e8400-e29b-41d4-a716-446655440000",
      "row": "E",
      "number": "1",
      "status": "available",
      "createdAt": "2024-01-15T11:45:00.000Z"
    }
    // ... otros 4 asientos
  ]
}
```

## 6. Obtener Venue Completo (GET /venues/{venueId})

### Response Success (200 OK)

```json
{
  "venue": {
    "venue_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Estadio Nacional",
    "address": "Av. Principal 123",
    "city": "Ciudad de México",
    "capacity": 50000,
    "description": "Estadio de fútbol con capacidad para 50,000 personas",
    "image": "https://doevent-venue-images.s3.amazonaws.com/550e8400-e29b-41d4-a716-446655440000.png",
    "isCertified": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
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
            "name": "Salida de Emergencia Oeste",
            "type": "exit",
            "position": "Oeste",
            "relX": 5,
            "relY": 50,
            "width": 4,
            "height": 8,
            "notes": "Salida de emergencia con barra antipánico"
          }
          // ... más elementos
        ],
        "categories": [
          {
            "categoryId": "990e8400-e29b-41d4-a716-446655440005",
            "floorId": "660e8400-e29b-41d4-a716-446655440001",
            "venueId": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Tribuna Norte",
            "description": "Sección norte del estadio",
            "color": "#E91E63",
            "relX": 25,
            "relY": 10,
            "width": 50,
            "height": 35,
            "seats": [
              {
                "seatId": "aa0e8400-e29b-41d4-a716-446655440006",
                "categoryId": "990e8400-e29b-41d4-a716-446655440005",
                "floorId": "660e8400-e29b-41d4-a716-446655440001",
                "venueId": "550e8400-e29b-41d4-a716-446655440000",
                "row": "E",
                "number": "1",
                "status": "available"
              }
              // ... más asientos
            ]
          }
          // ... más categorías
        ]
      },
      {
        "floorId": "660e8400-e29b-41d4-a716-446655440002",
        "venueId": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Nivel Superior",
        "description": "Segundo nivel del estadio",
        "elements": [],
        "categories": []
      }
    ]
  }
}
```

## 7. Eliminar Venue (DELETE /venues/{venueId})

Elimina en cascada:

1. Todos los seats de todas las categorías
2. Todas las categorías de todos los floors
3. Todos los elements de todos los floors
4. Todos los floors del venue
5. El venue

### Response Success (200 OK)

```json
{
  "message": "Venue and all related data deleted successfully",
  "venueId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Notas Importantes

1. **venue_id vs venueId**: La tabla Venues usa `venue_id` (snake_case) como clave primaria en DynamoDB, pero en el resto de la aplicación usamos `venueId` (camelCase).

2. **Campos de Posicionamiento**: Los campos `relX`, `relY`, `width`, `height` son porcentajes (0-100) que permiten posicionar elementos y categorías en un sistema de coordenadas relativo al floor.

3. **Base64 Images**: Las imágenes se pueden enviar en formato base64 con el prefijo `data:image/[tipo];base64,`. El sistema las procesa y almacena en S3.

4. **Integración con Tickets**: Las categorías de venue pueden asociarse con categorías de tickets desde la lambda `aws-lambda-managetickets`.

5. **Tipos de Elementos**: Los elementos pueden ser: `bathroom`, `stairs`, `entrance`, `exit`, u `other`.

6. **Estados de Asientos**: Los asientos pueden tener estados: `available`, `occupied`, `reserved`, o `disabled`.
