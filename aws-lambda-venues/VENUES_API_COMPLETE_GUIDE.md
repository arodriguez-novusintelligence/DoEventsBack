# 📘 Guía Completa de API de Venues

## 📋 Tabla de Contenido
1. [Estructura de Datos](#estructura-de-datos)
2. [Crear Venue](#crear-venue)
3. [Actualizar Venue](#actualizar-venue)
4. [Clonar Venue para Evento](#clonar-venue)
5. [Manejo de Imágenes](#manejo-de-imágenes)
6. [Consultar Venue por ID](#consultar-venue-por-id)
7. [Listar Venues con Filtros](#listar-venues-con-filtros)
8. [Consultar Asientos Disponibles](#consultar-asientos-disponibles)
9. [Categorías con y sin Sillas](#categorías-con-y-sin-sillas)
10. [Tickets y Distribuciones](#tickets-y-distribuciones)

---

## 🏗️ Estructura de Datos

### Conceptos Clave

#### hasSeating (boolean)
- `true`: El venue tiene asientos numerados (ej: estadios, teatros)
- `false`: El venue es de entrada general sin asientos específicos (ej: conciertos, festivales)

#### Venue Types
- **Venue Base**: Template reutilizable (`isEventVenue: false`, `eventId: null`)
- **Venue de Evento**: Copia específica para un evento (`isEventVenue: true`, `eventId: "uuid"`)

---

## 1️⃣ Crear Venue

### Endpoint
```
POST /venues
```

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {token}"
}
```

---

### 📦 Estructura del Request Body

#### Campos Básicos (Requeridos)
```json
{
  "name": "string (requerido)",
  "ownerUserId": "string (requerido)",
  "type": "string (opcional: stadium, theater, arena, convention_center, etc.)",
  "capacity": "number (opcional, default: 0)",
  "hasSeating": "boolean (opcional, default: true)"
}
```

#### Campos de Ubicación (Opcionales)
```json
{
  "country": "string",
  "city": "string",
  "address": "string",
  "address2": "string",
  "postalCode": "string",
  "latitude": "number",
  "longitude": "number",
  "timezone": "string (default: UTC)"
}
```

#### Campos de Configuración (Opcionales)
```json
{
  "isTemplate": "boolean (default: false)",
  "isCertified": "boolean (default: false)",
  "visibility": "string (private, public - default: private)",
  "status": "string (draft, active, inactive - default: draft)",
  "amenities": "string",
  "tags": "string",
  "geo": "string"
}
```

#### Para Venue de Evento (Opcional)
```json
{
  "eventId": "string (UUID del evento)",
  "baseVenueId": "string (UUID del venue base si fue clonado)"
}
```

---

### 🖼️ Imágenes

#### Opción 1: Una sola imagen (Base64)
```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA..."
}
```

#### Opción 2: Múltiples imágenes (Array)
```json
{
  "images": [
    {
      "fileName": "venue-front.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    },
    {
      "fileName": "venue-inside.png",
      "base64": "iVBORw0KGgoAAAANSUhEUg..."
    }
  ]
}
```

**Formatos soportados**: JPG, JPEG, PNG, GIF, WEBP, SVG, BMP, TIFF, ICO

**Resultado**: Se guardan en S3 y se retorna un string con URLs separadas por coma:
```
"images": "https://bucket.s3.amazonaws.com/venues/uuid/img1.jpg,https://bucket.s3.amazonaws.com/venues/uuid/img2.png"
```

---

### 🚪 Gates (Puertas/Accesos)

```json
{
  "gates": [
    {
      "gateId": "string (opcional, se genera automáticamente)",
      "gateNumber": "number (requerido)",
      "name": "string (requerido)",
      "description": "string (opcional)"
    }
  ]
}
```

**Ejemplo:**
```json
{
  "gates": [
    {
      "gateNumber": 1,
      "name": "Puerta Principal",
      "description": "Entrada VIP"
    },
    {
      "gateNumber": 2,
      "name": "Puerta Norte",
      "description": "Entrada General"
    }
  ]
}
```

---

### 🏢 Floors (Pisos) - Solo para hasSeating: true

```json
{
  "floors": [
    {
      "floorId": "string (opcional, se genera automáticamente)",
      "name": "string (requerido)",
      "description": "string (opcional)",
      "image": "string (opcional, URL de plano)",
      "elements": [...],
      "categories": [...]
    }
  ]
}
```

---

### 🎨 Categories dentro de Floors (Para venues CON sillas)

```json
{
  "floors": [
    {
      "name": "Planta Baja",
      "categories": [
        {
          "categoryId": "string (opcional, se genera automáticamente)",
          "name": "string (requerido, ej: VIP, Platea, Balcón)",
          "color": "string (código hex, default: #000000)",
          "level": "number (opcional, default: 0)",
          "sortOrder": "number (opcional, default: 0)",
          "gateId": "string (opcional, UUID del gate asociado)",
          "gateName": "string (opcional)",
          "relX": "number (posición X relativa)",
          "relY": "number (posición Y relativa)",
          "width": "number",
          "height": "number",
          "config": "string (configuración JSON)",
          "isAccessibleZone": "boolean (default: false)",
          "seats": [
            {
              "seatId": "string (opcional, se genera automáticamente)",
              "row": "string (ej: A, B, C)",
              "rowLabel": "string",
              "number": "number (ej: 1, 2, 3)",
              "colNumber": "number",
              "seatCode": "string (ej: A1, B15)",
              "seatType": "string (standard, vip, wheelchair - default: standard)",
              "status": "string (available, occupied, reserved - default: available)",
              "isAccessible": "boolean (default: false)",
              "notes": "string (opcional)"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 🎫 Categories (Array Independiente) - Recomendado

**Este es el formato PRINCIPAL y RECOMENDADO para definir categorías de tickets.**

```json
{
  "categories": [
    {
      "categoryId": "string (opcional, se genera automáticamente)",
      "name": "string (requerido, ej: VIP, General, Platea)",
      "categoria": "string (alias de name)",
      "cantidadTickets": "number (requerido, cantidad de boletas)",
      "quantity": "number (alias de cantidadTickets)",
      "valor": "number (precio de venta, requerido)",
      "price": "number (alias de valor)",
      "costo": "number (costo de producción, opcional, default: 0)",
      "cost": "number (alias de costo)",
      "moneda": "string (opcional, default: COP)",
      "currency": "string (alias de moneda)",
      "descripcion": "string (opcional)",
      "description": "string (alias de descripcion)",
      "imgboleta": "string (opcional, URL de imagen)",
      "image": "string (alias de imgboleta)",
      "gateId": "string (opcional, UUID del gate asociado)",
      "distributionId": "string (opcional, se genera automáticamente)",
      
      "floorId": "string (SOLO si hasSeating: true y quieres vincular a un piso)",
      "color": "string (SOLO si hasSeating: true)",
      "level": "number (SOLO si hasSeating: true)",
      "relX": "number (SOLO si hasSeating: true)",
      "relY": "number (SOLO si hasSeating: true)",
      "width": "number (SOLO si hasSeating: true)",
      "height": "number (SOLO si hasSeating: true)",
      
      "seats": [
        {
          "seatId": "string (opcional)",
          "row": "string (ej: A, B, C)",
          "number": "number (ej: 1, 2, 3)",
          "seatCode": "string (ej: A1)",
          "seatType": "string (standard, vip, wheelchair)",
          "status": "string (available, occupied, reserved)",
          "isAccessible": "boolean"
        }
      ]
    }
  ]
}
```

---

### 📊 Diferencias: Venue CON Sillas vs SIN Sillas

#### ✅ Venue CON Sillas (hasSeating: true)

**Características:**
- Tiene floors (pisos)
- Categorías vinculadas a floors con posiciones (relX, relY, width, height)
- Cada categoría tiene array de `seats` con filas y números
- Se crean registros en tablas: `Venue_Floor`, `Venue_Category`, `Venue_Seat`

**Ejemplo completo:**
```json
{
  "name": "Estadio Nacional",
  "ownerUserId": "user-123",
  "hasSeating": true,
  "capacity": 50000,
  "type": "stadium",
  "categories": [
    {
      "name": "VIP",
      "cantidadTickets": 100,
      "valor": 150000,
      "costo": 50000,
      "moneda": "COP",
      "floorId": "floor-uuid-1",
      "color": "#FFD700",
      "relX": 100,
      "relY": 200,
      "width": 300,
      "height": 150,
      "seats": [
        {
          "row": "A",
          "number": 1,
          "seatCode": "A1",
          "seatType": "vip"
        },
        {
          "row": "A",
          "number": 2,
          "seatCode": "A2",
          "seatType": "vip"
        }
      ]
    },
    {
      "name": "Platea",
      "cantidadTickets": 500,
      "valor": 80000,
      "floorId": "floor-uuid-1",
      "color": "#87CEEB",
      "seats": [
        {
          "row": "B",
          "number": 1,
          "seatCode": "B1"
        }
      ]
    }
  ],
  "floors": [
    {
      "floorId": "floor-uuid-1",
      "name": "Planta Principal",
      "description": "Nivel principal del estadio"
    }
  ]
}
```

---

#### ✅ Venue SIN Sillas (hasSeating: false)

**Características:**
- NO tiene floors
- Categorías son solo para organizar tipos de tickets (VIP, General, etc.)
- NO tiene seats individuales
- `cantidadTickets` representa cantidad total de boletas disponibles sin asiento asignado
- Solo se crea registro en tabla `Tickets` con las categorías

**Ejemplo completo:**
```json
{
  "name": "Festival de Música",
  "ownerUserId": "user-123",
  "hasSeating": false,
  "capacity": 10000,
  "type": "festival",
  "categories": [
    {
      "name": "VIP",
      "cantidadTickets": 200,
      "valor": 250000,
      "costo": 80000,
      "moneda": "COP",
      "descripcion": "Acceso VIP con zona exclusiva",
      "gateId": "gate-1"
    },
    {
      "name": "General",
      "cantidadTickets": 800,
      "valor": 120000,
      "costo": 40000,
      "moneda": "COP",
      "descripcion": "Entrada general al festival",
      "gateId": "gate-2"
    },
    {
      "name": "Early Bird",
      "cantidadTickets": 300,
      "valor": 90000,
      "costo": 30000,
      "moneda": "COP",
      "descripcion": "Promoción anticipada"
    }
  ],
  "gates": [
    {
      "gateNumber": 1,
      "name": "Entrada VIP"
    },
    {
      "gateNumber": 2,
      "name": "Entrada General"
    }
  ]
}
```

---

### 📋 Request Body Completo - Ejemplo Real

#### Venue CON Sillas + Imágenes
```json
{
  "name": "Teatro Municipal",
  "ownerUserId": "cedef71c-c123-456",
  "type": "theater",
  "capacity": 800,
  "hasSeating": true,
  "city": "Bogotá",
  "address": "Calle 10 #5-32",
  "latitude": 4.598056,
  "longitude": -74.075833,
  "isCertified": true,
  "visibility": "public",
  "status": "active",
  
  "images": [
    {
      "fileName": "teatro-exterior.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    },
    {
      "fileName": "teatro-interior.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    }
  ],
  
  "gates": [
    {
      "gateNumber": 1,
      "name": "Entrada Principal",
      "description": "Acceso Platea y VIP"
    },
    {
      "gateNumber": 2,
      "name": "Entrada Balcón",
      "description": "Acceso segundo piso"
    }
  ],
  
  "floors": [
    {
      "name": "Planta Baja",
      "description": "Nivel principal del teatro"
    },
    {
      "name": "Segundo Piso",
      "description": "Balcones laterales"
    }
  ],
  
  "categories": [
    {
      "name": "VIP Platea Central",
      "cantidadTickets": 50,
      "valor": 150000,
      "costo": 50000,
      "moneda": "COP",
      "floorId": "floor-uuid-1",
      "color": "#FFD700",
      "gateId": "gate-uuid-1",
      "seats": [
        { "row": "A", "number": 1, "seatCode": "A1" },
        { "row": "A", "number": 2, "seatCode": "A2" }
      ]
    },
    {
      "name": "Platea General",
      "cantidadTickets": 300,
      "valor": 80000,
      "floorId": "floor-uuid-1",
      "color": "#87CEEB",
      "seats": [
        { "row": "B", "number": 1, "seatCode": "B1" }
      ]
    },
    {
      "name": "Balcón",
      "cantidadTickets": 150,
      "valor": 50000,
      "floorId": "floor-uuid-2",
      "color": "#90EE90",
      "seats": [
        { "row": "C", "number": 1, "seatCode": "C1" }
      ]
    }
  ]
}
```

#### Venue SIN Sillas + Una Imagen
```json
{
  "name": "Festival Verano 2026",
  "ownerUserId": "cedef71c-c123-456",
  "type": "festival",
  "capacity": 15000,
  "hasSeating": false,
  "city": "Medellín",
  "address": "Parque Norte",
  "visibility": "public",
  "status": "active",
  
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...",
  
  "gates": [
    {
      "gateNumber": 1,
      "name": "Puerta VIP"
    },
    {
      "gateNumber": 2,
      "name": "Puerta General Norte"
    },
    {
      "gateNumber": 3,
      "name": "Puerta General Sur"
    }
  ],
  
  "categories": [
    {
      "name": "VIP All Inclusive",
      "cantidadTickets": 500,
      "valor": 350000,
      "costo": 120000,
      "moneda": "COP",
      "descripcion": "Incluye barra libre y zona VIP",
      "gateId": "gate-uuid-1"
    },
    {
      "name": "General",
      "cantidadTickets": 10000,
      "valor": 150000,
      "costo": 50000,
      "moneda": "COP",
      "descripcion": "Acceso general al festival"
    },
    {
      "name": "Preventa",
      "cantidadTickets": 2000,
      "valor": 110000,
      "costo": 40000,
      "moneda": "COP",
      "descripcion": "Boletas en preventa con descuento"
    }
  ]
}
```

---

### ✅ Response Exitoso (201 Created)

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Teatro Municipal",
    "type": "theater",
    "capacity": 800,
    "eventId": null,
    "isEventVenue": false,
    "hasSeating": true,
    "baseVenueId": null,
    "floorCount": 2,
    "floors": [
      {
        "floorId": "floor-uuid-1",
        "name": "Planta Baja",
        "categoryCount": 2,
        "elementCount": 0,
        "categories": [
          {
            "categoryId": "cat-uuid-1",
            "name": "VIP Platea Central",
            "seatCount": 50
          },
          {
            "categoryId": "cat-uuid-2",
            "name": "Platea General",
            "seatCount": 300
          }
        ]
      },
      {
        "floorId": "floor-uuid-2",
        "name": "Segundo Piso",
        "categoryCount": 1,
        "elementCount": 0,
        "categories": [
          {
            "categoryId": "cat-uuid-3",
            "name": "Balcón",
            "seatCount": 150
          }
        ]
      }
    ],
    "gateCount": 2,
    "gates": [
      {
        "gateId": "gate-uuid-1",
        "gateNumber": 1,
        "name": "Entrada Principal",
        "description": "Acceso Platea y VIP"
      },
      {
        "gateId": "gate-uuid-2",
        "gateNumber": 2,
        "name": "Entrada Balcón",
        "description": "Acceso segundo piso"
      }
    ],
    "ticketRecord": null
  }
}
```

Para venues de evento (`eventId` presente), incluye `ticketRecord`:
```json
{
  "ticketRecord": {
    "ticketId": "abc123def4",
    "categoriesCount": 3
  }
}
```

---

## 2️⃣ Actualizar Venue

### Endpoint
```
PUT /venues/{venueId}
```

### Características
- **Actualización inteligente**: Solo modifica campos enviados
- **Auto-sincronización de floors**: Elimina floors que no estén en el array
- **Batch deletions**: Soporta eliminación masiva de elementos
- **Gestión de imágenes**: Agregar nuevas o mantener existentes

---

### 📦 Request Body

Puedes enviar solo los campos que deseas modificar:

```json
{
  "name": "Nuevo nombre del venue",
  "capacity": 900,
  "status": "active",
  
  "images": [
    {
      "fileName": "nueva-imagen.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    }
  ],
  
  "categories": [
    {
      "categoryId": "cat-existing-1",
      "name": "VIP Actualizado",
      "cantidadTickets": 60,
      "valor": 180000
    },
    {
      "name": "Nueva Categoría",
      "cantidadTickets": 100,
      "valor": 120000
    }
  ],
  
  "floors": [
    {
      "floorId": "floor-existing-1",
      "name": "Planta Baja Renovada"
    }
  ],
  
  "deletions": {
    "categories": ["cat-to-delete-1", "cat-to-delete-2"],
    "seats": ["seat-to-delete-1"],
    "floors": ["floor-to-delete-1"]
  }
}
```

### Comportamiento de Sincronización

#### Floors
- Si NO envías `floors`: Se mantienen los existentes
- Si envías `floors: []`: Se eliminan TODOS los floors
- Si envías `floors: [...]`: 
  - Floors con `floorId` existente → se actualizan
  - Floors sin `floorId` → se crean nuevos
  - Floors existentes NO en el array → se eliminan automáticamente

#### Categories
Similar a floors, pero las categorías se sincronizan con la tabla `Tickets` si es venue de evento.

#### Images
- Las imágenes existentes se mantienen
- Las nuevas se agregan
- Se actualiza el campo `images` con todas las URLs separadas por coma

---

### ✅ Response Exitoso (200 OK)

```json
{
  "message": "Venue updated successfully",
  "venueId": "venue-uuid",
  "hasSeating": true,
  "eventId": "event-uuid",
  "floorsResult": {
    "floorsProcessed": 2,
    "categoriesProcessed": 4,
    "seatsProcessed": 350,
    "floorsDeleted": 1,
    "floors": [...]
  },
  "ticketUpdate": {
    "ticketId": "ticket-id",
    "categoriesUpdated": 3,
    "distributionsCreated": 3
  },
  "deletions": {
    "categoriesDeleted": 2,
    "seatsDeleted": 15,
    "floorsDeleted": 1
  }
}
```

---

## 3️⃣ Clonar Venue para Evento

### Endpoint
```
POST /venues/clone-for-event
```

### Propósito
Crea una copia de un venue base para usarlo en un evento específico. Clona toda la estructura (floors, categories, seats, elements).

---

### 📦 Request Body

```json
{
  "baseVenueId": "uuid-del-venue-base",
  "eventId": "uuid-del-evento",
  "name": "Nombre personalizado (opcional)",
  "hasSeating": true,
  
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...",
  
  "images": [
    {
      "fileName": "venue-front.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    }
  ],
  
  "ticketCategories": [
    {
      "id": "category-id",
      "categoria": "VIP",
      "cantidadTickets": 100,
      "valor": 200000,
      "costo": 70000,
      "moneda": "COP",
      "descripcion": "Zona VIP",
      "imgboleta": "https://...",
      "distributionId": "optional-uuid"
    }
  ],
  
  "fechaIniVent": "2026-06-01T00:00:00.000Z",
  "fechaFinVent": "2026-06-30T23:59:59.000Z",
  "horaIniVent": "08:00",
  "horaFinVent": "20:00",
  
  "overrides": {
    "capacity": 5500,
    "status": "active",
    "description": "Venue específico para este evento"
  }
}
```

### Campos

#### Requeridos
- `baseVenueId`: UUID del venue a clonar
- `eventId`: UUID del evento

#### Opcionales
- `name`: Nombre personalizado (default: "{nombre base} - Event")
- `hasSeating`: Sobrescribe el hasSeating del venue base
- `imageBase64`: Imagen en base64 (una sola imagen)
- `images`: Array de imágenes en base64 con nombre de archivo
- `ticketCategories`: Array de categorías de tickets con precios y cantidades
- `fechaIniVent`, `fechaFinVent`: Fechas de venta
- `horaIniVent`, `horaFinVent`: Horas de venta
- `overrides`: Objeto con cualquier campo del venue a sobrescribir

**Nota sobre imágenes:** Si envías `imageBase64` o `images`, se subirán a S3 y el venue clonado tendrá las nuevas imágenes. Si no envías imágenes, se copiarán las imágenes del venue base.

---

### Proceso de Clonación

1. **Copia el venue base** con nuevo `venueId`
2. **Clona todos los floors** con nuevos `floorId`
3. **Clona todos los elements** de cada floor
4. **Clona todas las categories** con nuevos `categoryId`
5. **Clona todos los seats** (si `hasSeating: true`)
6. **Crea registro en Tickets** con las categorías
7. **Crea distribuciones en TicketsDistribution** para cada categoría
8. **Asocia seats a tickets** en las distribuciones
9. **Actualiza el evento** con el `venueId`

---

### ✅ Response Exitoso (201 Created)

```json
{
  "message": "Venue cloned successfully for event",
  "venue": {
    "venueId": "new-venue-uuid",
    "name": "Teatro Municipal - Event",
    "eventId": "event-uuid",
    "baseVenueId": "base-venue-uuid",
    "isEventVenue": true,
    "hasSeating": true,
    "floorsCloned": 2,
    "categoriesCloned": 3,
    "gatesCloned": 2,
    "ticketRecord": {
      "ticketId": "ticket-id",
      "categoriesCount": 3,
      "totalCapacity": 500
    }
  }
}
```

---

## 4️⃣ Manejo de Imágenes

### Formatos de Envío

#### Base64 con Data URI (Recomendado)
```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA..."
}
```

#### Base64 sin Data URI
```json
{
  "imageBase64": "/9j/4AAQSkZJRgABAQEA..."
}
```

#### Múltiples imágenes
```json
{
  "images": [
    {
      "fileName": "front.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    },
    {
      "fileName": "back.png",
      "base64": "iVBORw0KGgoAAAANSUhEUg..."
    },
    {
      "fileName": "side.webp",
      "base64": "UklGRiQAAABXRUJQVlA4..."
    }
  ]
}
```

### Almacenamiento

Las imágenes se suben a S3 con la siguiente estructura:
```
s3://doevent-venue-images/venues/{venueId}/{imageId}.{extension}
```

**Metadata guardada:**
- `venueId`: UUID del venue
- `uploadedAt`: Timestamp
- `originalFileName`: Nombre original del archivo

### URLs Resultantes

Las URLs se guardan en el campo `images` del venue como string separado por comas:
```
"images": "https://doevent-venue-images.s3.amazonaws.com/venues/uuid1/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/uuid1/img2.png"
```

### Gestión en Actualización

Al actualizar un venue:
- Las imágenes existentes se mantienen
- Las nuevas se agregan al final
- El campo se actualiza con todas las URLs

Para eliminar imágenes:
1. Obtén el venue actual
2. Filtra las URLs que quieres mantener
3. Envía el nuevo string en el update

---

## 5️⃣ Tickets y Distribuciones

### Cuándo se crean

Los tickets y distribuciones se crean automáticamente cuando:
- El venue tiene `eventId` (es venue de evento)
- Se proporcionan categorías con `cantidadTickets > 0`

### Estructura de Tickets

#### Tabla: Tickets
```json
{
  "id": "ticket-id",
  "eventId": "event-uuid",
  "venueId": "venue-uuid",
  "hasSeating": true,
  "createDate": "2026-01-17T10:00:00.000Z",
  "fechaIniVent": "2026-06-01T00:00:00.000Z",
  "fechaFinVent": "2026-06-30T23:59:59.000Z",
  "horaIniVent": "08:00",
  "horaFinVent": "20:00",
  "boletas": [
    {
      "id": "category-uuid",
      "categoria": "VIP",
      "cantidadTickets": 100,
      "avaliableCapacity": 100,
      "reservedTickets": 0,
      "soldTickets": 0,
      "valor": 200000,
      "costo": 70000,
      "moneda": "COP",
      "descripcion": "Zona VIP",
      "imgboleta": "https://...",
      "gateId": "gate-uuid",
      "distributionId": "distribution-uuid",
      "distributionCreateDate": "2026-01-17T10:00:00.000Z"
    }
  ]
}
```

### Estructura de TicketsDistribution

#### Tabla: TicketsDistribution (Clave compuesta: id + createDate)
```json
{
  "id": "distribution-uuid",
  "createDate": "2026-01-17T10:00:00.000Z",
  "ticketId": "ticket-id",
  "eventId": "event-uuid",
  "venueId": "venue-uuid",
  "boletaId": "category-uuid",
  "categoryName": "VIP",
  "tickets": [
    {
      "ticketInstanceId": "ticket-instance-uuid-1",
      "category": "VIP",
      "categoryId": "category-uuid",
      "location": {
        "seatId": "seat-uuid-1",
        "row": "A",
        "number": 1,
        "seatLabel": "A1"
      },
      "ticketStatus": "AVAILABLE",
      "qrCodeKey": "qr-uuid-1",
      "ownerId": null,
      "orderId": null,
      "entityType": "TICKET",
      "purchasePrice": 200000,
      "distributionId": "distribution-uuid",
      "createDate": "2026-01-17T10:00:00.000Z"
    },
    {
      "ticketInstanceId": "ticket-instance-uuid-2",
      "category": "VIP",
      "categoryId": "category-uuid",
      "location": {
        "seatId": "seat-uuid-2",
        "row": "A",
        "number": 2,
        "seatLabel": "A2"
      },
      "ticketStatus": "AVAILABLE",
      "qrCodeKey": "qr-uuid-2",
      "ownerId": null,
      "orderId": null,
      "entityType": "TICKET",
      "purchasePrice": 200000,
      "distributionId": "distribution-uuid",
      "createDate": "2026-01-17T10:00:00.000Z"
    }
  ]
}
```

### Tickets CON Sillas vs SIN Sillas

#### CON Sillas (hasSeating: true)
```json
{
  "location": {
    "seatId": "seat-uuid",
    "row": "A",
    "number": 15,
    "seatLabel": "A15"
  }
}
```

#### SIN Sillas (hasSeating: false)
```json
{
  "location": {}
}
```

El ticket existe pero no tiene asiento asignado (entrada general).

---

## 6️⃣ Consultar Venue por ID

### Endpoint
```
GET /venues/{venueId}
```

### Headers
```json
{
  "Content-Type": "application/json"
}
```

### Parámetros de Ruta
- `venueId` (requerido): UUID del venue

### Descripción
Obtiene un venue específico con toda su estructura completa:
- Información básica del venue
- Floors (pisos) si aplica
- Elements de cada floor
- Categories con sus asientos
- Gates (puertas)

---

### ✅ Response Exitoso (200 OK)

```json
{
  "venue": {
    "venue_id": "a1b2c3d4-e5f6-7890",
    "venueId": "a1b2c3d4-e5f6-7890",
    "name": "Teatro Municipal",
    "ownerUserId": "user-123",
    "type": "theater",
    "capacity": 800,
    "hasSeating": true,
    "eventId": null,
    "isEventVenue": false,
    "baseVenueId": null,
    "isTemplate": false,
    "isCertified": true,
    "visibility": "public",
    "status": "active",
    "country": "Colombia",
    "city": "Bogotá",
    "address": "Calle 10 #5-32",
    "latitude": 4.598056,
    "longitude": -74.075833,
    "timezone": "America/Bogota",
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4/img2.png",
    "imageUrls": [
      "https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4/img1.jpg",
      "https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4/img2.png"
    ],
    "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4/img1.jpg",
    "gates": [
      {
        "gateId": "gate-uuid-1",
        "gateNumber": 1,
        "name": "Entrada Principal",
        "description": "Acceso Platea y VIP"
      },
      {
        "gateId": "gate-uuid-2",
        "gateNumber": 2,
        "name": "Entrada Balcón",
        "description": "Acceso segundo piso"
      }
    ],
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-01-20T15:30:00.000Z",
    "createdBy": "user-123",
    "updatedBy": "user-123"
  },
  "floors": [
    {
      "floorId": "floor-uuid-1",
      "venueId": "a1b2c3d4-e5f6-7890",
      "name": "Planta Baja",
      "description": "Nivel principal del teatro",
      "image": "",
      "elements": [
        {
          "elementId": "elem-uuid-1",
          "floorId": "floor-uuid-1",
          "venueId": "a1b2c3d4-e5f6-7890",
          "name": "Escenario",
          "type": "stage",
          "relX": 150,
          "relY": 50,
          "width": 200,
          "height": 100,
          "geometry": "RECTANGLE",
          "notes": ""
        }
      ],
      "categories": [
        {
          "categoryId": "cat-uuid-1",
          "floorId": "floor-uuid-1",
          "venueId": "a1b2c3d4-e5f6-7890",
          "name": "VIP Platea Central",
          "color": "#FFD700",
          "level": 0,
          "sortOrder": 1,
          "relX": 100,
          "relY": 200,
          "width": 300,
          "height": 150,
          "totalSeats": 50,
          "gateId": "gate-uuid-1",
          "gateName": "Entrada Principal",
          "hasPrice": true,
          "ticketPrice": 150000,
          "currency": "COP",
          "seats": [
            {
              "seatId": "seat-uuid-1",
              "categoryId": "cat-uuid-1",
              "floorId": "floor-uuid-1",
              "venueId": "a1b2c3d4-e5f6-7890",
              "row": "A",
              "rowLabel": "A",
              "number": 1,
              "colNumber": 1,
              "seatCode": "A1",
              "seatLabel": "A1",
              "seatType": "vip",
              "status": "available",
              "isAccessible": false,
              "notes": ""
            },
            {
              "seatId": "seat-uuid-2",
              "categoryId": "cat-uuid-1",
              "floorId": "floor-uuid-1",
              "venueId": "a1b2c3d4-e5f6-7890",
              "row": "A",
              "rowLabel": "A",
              "number": 2,
              "colNumber": 2,
              "seatCode": "A2",
              "seatLabel": "A2",
              "seatType": "vip",
              "status": "available",
              "isAccessible": false,
              "notes": ""
            }
          ]
        }
      ]
    },
    {
      "floorId": "floor-uuid-2",
      "venueId": "a1b2c3d4-e5f6-7890",
      "name": "Segundo Piso",
      "description": "Balcones laterales",
      "image": "",
      "elements": [],
      "categories": [
        {
          "categoryId": "cat-uuid-3",
          "floorId": "floor-uuid-2",
          "venueId": "a1b2c3d4-e5f6-7890",
          "name": "Balcón",
          "color": "#90EE90",
          "level": 1,
          "totalSeats": 150,
          "seats": []
        }
      ]
    }
  ]
}
```

### ❌ Errores

#### 400 Bad Request
```json
{
  "error": "venueId is required"
}
```

#### 404 Not Found
```json
{
  "error": "Venue not found"
}
```

---

## 7️⃣ Listar Venues (con Filtros)

### Endpoint
```
GET /venues
```

### Headers
```json
{
  "Content-Type": "application/json"
}
```

### Query Parameters (Todos opcionales)

#### Filtros Generales
- `ownerUserId` (string): Filtrar por propietario
- `isTemplate` (boolean): Filtrar venues template (`true` o `false`)
- `status` (string): Filtrar por estado (`draft`, `active`, `inactive`)
- `limit` (number): Cantidad máxima de resultados (default: 50)
- `lastEvaluatedKey` (string): Para paginación (URL encoded)

#### Filtros de Ubicación
- `latitude` (number): Latitud del usuario/punto de referencia
- `longitude` (number): Longitud del usuario/punto de referencia  
- `maxDistance` (number): Distancia máxima en kilómetros

**Nota:** Si proporcionas `latitude` y `longitude`, los resultados incluirán la distancia calculada y se ordenarán por proximidad. Si además agregas `maxDistance`, solo se retornarán venues dentro de ese radio.

---

### Ejemplos de Uso

#### 1. Listar todos los venues (paginado)
```
GET /venues?limit=20
```

#### 2. Listar venues de un propietario
```
GET /venues?ownerUserId=user-123
```

#### 3. Listar venues templates activos
```
GET /venues?isTemplate=true&status=active
```

#### 4. Listar venues por ubicación (cerca de Bogotá)
```
GET /venues?latitude=4.710989&longitude=-74.072092
```

#### 5. Listar venues en un radio de 10km
```
GET /venues?latitude=4.710989&longitude=-74.072092&maxDistance=10
```

#### 6. Listar venues de un propietario cerca de una ubicación
```
GET /venues?ownerUserId=user-123&latitude=4.710989&longitude=-74.072092&maxDistance=20
```

#### 7. Paginación (segunda página)
```
GET /venues?limit=20&lastEvaluatedKey=%7B%22venue_id%22%3A%22abc123%22%7D
```

---

### ✅ Response Exitoso (200 OK)

```json
{
  "venues": [
    {
      "venue_id": "venue-uuid-1",
      "venueId": "venue-uuid-1",
      "name": "Teatro Municipal",
      "ownerUserId": "user-123",
      "type": "theater",
      "capacity": 800,
      "hasSeating": true,
      "eventId": null,
      "isEventVenue": false,
      "baseVenueId": null,
      "isTemplate": true,
      "isCertified": true,
      "visibility": "public",
      "status": "active",
      "city": "Bogotá",
      "address": "Calle 10 #5-32",
      "latitude": 4.598056,
      "longitude": -74.075833,
      "images": "https://doevent-venue-images.s3.amazonaws.com/venues/uuid1/img1.jpg",
      "imageUrls": [
        "https://doevent-venue-images.s3.amazonaws.com/venues/uuid1/img1.jpg"
      ],
      "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/uuid1/img1.jpg",
      "distance": 2.45,
      "createdAt": "2026-01-10T10:00:00.000Z",
      "updatedAt": "2026-01-20T15:30:00.000Z"
    },
    {
      "venue_id": "venue-uuid-2",
      "venueId": "venue-uuid-2",
      "name": "Estadio Nacional",
      "ownerUserId": "user-123",
      "type": "stadium",
      "capacity": 50000,
      "hasSeating": true,
      "eventId": null,
      "isEventVenue": false,
      "isTemplate": true,
      "isCertified": true,
      "visibility": "public",
      "status": "active",
      "city": "Bogotá",
      "address": "Carrera 30 #57-60",
      "latitude": 4.646930,
      "longitude": -74.090870,
      "images": "https://doevent-venue-images.s3.amazonaws.com/venues/uuid2/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/uuid2/img2.jpg",
      "imageUrls": [
        "https://doevent-venue-images.s3.amazonaws.com/venues/uuid2/img1.jpg",
        "https://doevent-venue-images.s3.amazonaws.com/venues/uuid2/img2.jpg"
      ],
      "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/uuid2/img1.jpg",
      "distance": 5.72,
      "createdAt": "2026-01-05T14:00:00.000Z",
      "updatedAt": "2026-01-18T09:15:00.000Z"
    },
    {
      "venue_id": "venue-uuid-3",
      "venueId": "venue-uuid-3",
      "name": "Festival Park",
      "ownerUserId": "user-456",
      "type": "festival",
      "capacity": 15000,
      "hasSeating": false,
      "eventId": null,
      "isEventVenue": false,
      "isTemplate": true,
      "isCertified": false,
      "visibility": "public",
      "status": "active",
      "city": "Medellín",
      "address": "Parque Norte",
      "latitude": 6.270060,
      "longitude": -75.565010,
      "images": "",
      "imageUrls": [],
      "mainImage": null,
      "distance": null,
      "createdAt": "2026-01-12T11:30:00.000Z",
      "updatedAt": "2026-01-12T11:30:00.000Z"
    }
  ],
  "count": 3,
  "lastEvaluatedKey": "encoded-pagination-key",
  "hasMore": true,
  "filters": {
    "ownerUserId": "user-123",
    "isTemplate": true,
    "status": "active",
    "location": {
      "latitude": 4.710989,
      "longitude": -74.072092,
      "maxDistance": 10
    }
  }
}
```

### Campos Calculados en el Response

| Campo | Descripción |
|-------|-------------|
| `imageUrls` | Array de URLs de imágenes (procesado desde el string `images`) |
| `mainImage` | Primera imagen del array (imagen principal) |
| `distance` | Distancia en kilómetros desde la ubicación proporcionada (solo si se envía `latitude` y `longitude`) |

### Paginación

Si `hasMore: true`, hay más resultados disponibles. Para obtener la siguiente página:

```javascript
const nextPageUrl = `/venues?limit=20&lastEvaluatedKey=${encodeURIComponent(response.lastEvaluatedKey)}`;
```

### Ordenamiento

- **Sin ubicación:** Orden natural de DynamoDB
- **Con ubicación (`latitude` y `longitude`):** Ordenado por distancia ascendente (más cercano primero)

### Fórmula de Distancia

El sistema usa la **Fórmula de Haversine** para calcular la distancia entre dos puntos geográficos:

```javascript
// Ejemplo de cálculo manual
const R = 6371; // Radio de la Tierra en km
const dLat = (lat2 - lat1) * Math.PI / 180;
const dLon = (lon2 - lon1) * Math.PI / 180;
const a = 
  Math.sin(dLat/2) * Math.sin(dLat/2) +
  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
  Math.sin(dLon/2) * Math.sin(dLon/2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
const distance = R * c; // Distancia en km
```

---

## 8️⃣ Consultar Asientos Disponibles

### Endpoint por Distribución
```
GET /tickets-distribution/{distributionId}/available-seats?createDate={createDate}
```

### Endpoint por Evento (Recomendado)
```
GET /events/{eventId}/available-seats
```

### Response
```json
{
  "eventId": "event-uuid",
  "totalCategories": 3,
  "summary": {
    "totalSeats": 500,
    "availableSeats": 450,
    "reservedSeats": 30,
    "soldSeats": 20
  },
  "categories": [
    {
      "categoryId": "cat-uuid-1",
      "categoryName": "VIP",
      "distributionId": "dist-uuid-1",
      "createDate": "2026-01-17T10:00:00.000Z",
      "venueId": "venue-uuid",
      "ticketId": "ticket-id",
      "summary": {
        "totalSeats": 100,
        "availableSeats": 90,
        "reservedSeats": 5,
        "soldSeats": 5
      },
      "seats": [
        {
          "ticketInstanceId": "instance-uuid-1",
          "location": {
            "seatId": "seat-uuid-1",
            "row": "A",
            "number": 1,
            "seatLabel": "A1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 200000,
          "qrCodeKey": "qr-uuid-1",
          "ownerId": null,
          "orderId": null
        }
      ]
    }
  ]
}
```

---

## 🔗 Endpoints Completos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/venues` | Crear venue |
| GET | `/venues/{venueId}` | Obtener venue por ID con estructura completa |
| GET | `/venues` | Listar venues (con filtros y búsqueda por ubicación) |
| PUT | `/venues/{venueId}` | Actualizar venue |
| DELETE | `/venues/{venueId}` | Eliminar venue |
| POST | `/venues/clone-for-event` | Clonar venue para evento |
| POST | `/venues/{venueId}/images` | Subir imágenes |
| GET | `/events/{eventId}/available-seats` | Consultar asientos por evento |

### Parámetros de Query para Listar Venues

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `ownerUserId` | string | Filtrar por propietario | `user-123` |
| `isTemplate` | boolean | Venues template | `true` o `false` |
| `status` | string | Estado del venue | `active`, `draft`, `inactive` |
| `latitude` | number | Latitud para búsqueda por ubicación | `4.710989` |
| `longitude` | number | Longitud para búsqueda por ubicación | `-74.072092` |
| `maxDistance` | number | Radio máximo en kilómetros | `10` |
| `limit` | number | Cantidad de resultados (default: 50) | `20` |
| `lastEvaluatedKey` | string | Para paginación (URL encoded) | Retornado en response anterior |

---

## 📌 Notas Importantes

### Campos Aliases
Soportamos múltiples nombres para facilitar integración:
- `categoria` = `name`
- `cantidadTickets` = `quantity`
- `valor` = `price`
- `costo` = `cost`
- `moneda` = `currency`
- `descripcion` = `description`
- `imgboleta` = `image`

### IDs Auto-generados
Si no envías estos IDs, se generan automáticamente:
- `venueId`
- `floorId`
- `categoryId`
- `seatId`
- `gateId`
- `elementId`
- `distributionId`

### Validaciones Clave
- `hasSeating: true` → Requiere floors y categories con seats
- `hasSeating: false` → Categories sin seats, solo cantidades
- Venue de evento → Requiere `eventId`
- Clonación → Requiere `baseVenueId` y `eventId`

---

## 🚨 Errores Comunes

### 400 Bad Request
```json
{
  "error": "name and ownerUserId are required"
}
```

### 404 Not Found
```json
{
  "error": "Venue not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Error message details",
  "stack": "..."
}
```

---

## 📞 Soporte

Para dudas o problemas con la API de Venues, contactar al equipo de desarrollo.

**Última actualización:** 17 de enero de 2026
