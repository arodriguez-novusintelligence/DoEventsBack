ds66666666666666666666666y6# Guía de Creación de Categorías

## Resumen

Existen **dos formas** de crear categorías según el tipo de venue:

1. **Categorías CON silletería** (`hasSeating: true`) - Se guardan en `Venue_Category` y opcionalmente en `Tickets`
2. **Categorías SIN silletería** (`hasSeating: false`) - Solo se guardan en `Tickets` (capacidad general)

---

## 1. Crear Categoría Individual

### Endpoint

```
POST /dev/venues/{venueId}/floors/{floorId}/categories
```

### Payload - Categoría CON Silletería

```json
{
  "name": "VIP",
  "color": "#FFD700",
  "level": 1,
  "sortOrder": 1,
  "gateId": "gate-123",
  "gateName": "Puerta Principal",
  "relX": 100,
  "relY": 150,
  "width": 500,
  "height": 300,
  "config": "",
  "isAccessibleZone": false,
  "createdBy": "user-id-123"
}
```

**Nota**: Esta categoría se guarda en `Venue_Category` y puede tener asientos (`Venue_Seat`).

### Payload - Categoría SIN Silletería (Capacidad General)

```json
{
  "name": "General",
  "color": "#00FF00",
  "level": 0,
  "sortOrder": 1,
  "gateId": "gate-456",
  "gateName": "Puerta Norte",
  "createdBy": "user-id-123"
}
```

**Nota**: Para capacidad general, normalmente NO se guarda en `Venue_Category`, solo se usa en la tabla `Tickets`. Ver método 2.

---

## 2. Crear Venue Completo con Categorías

### Endpoint

```
POST /dev/venues
```

Este es el método recomendado para crear venues de eventos con todas sus categorías.

### Payload - Venue CON Silletería

```json
{
  "name": "Estadio Nacional",
  "ownerUserId": "user-id-123",
  "eventId": "event-456",
  "hasSeating": true,
  "type": "stadium",
  "capacity": 50000,
  "country": "Colombia",
  "city": "Bogotá",
  "address": "Calle 45 #12-34",
  "gates": [
    {
      "gateId": "gate-001",
      "gateNumber": 1,
      "name": "Puerta Principal",
      "description": "Entrada principal del estadio"
    },
    {
      "gateId": "gate-002",
      "gateNumber": 2,
      "name": "Puerta Norte",
      "description": "Entrada lateral norte"
    }
  ],
  "floors": [
    {
      "name": "Piso 1",
      "description": "Planta baja",
      "categories": [
        {
          "name": "VIP",
          "color": "#FFD700",
          "level": 1,
          "sortOrder": 1,
          "gateId": "gate-001",
          "gateName": "Puerta Principal",
          "relX": 100,
          "relY": 150,
          "width": 500,
          "height": 300,
          "ticketCategory": {
            "categoria": "VIP",
            "cantidadTickets": 100,
            "moneda": "COP",
            "costo": 50000,
            "valor": 150000,
            "descripcion": "Zona VIP con acceso exclusivo"
          },
          "seats": [
            {
              "row": "A",
              "number": 1,
              "posX": 100,
              "posY": 100,
              "status": "available"
            },
            {
              "row": "A",
              "number": 2,
              "posX": 120,
              "posY": 100,
              "status": "available"
            }
          ]
        },
        {
          "name": "Palco",
          "color": "#FF0000",
          "level": 2,
          "sortOrder": 2,
          "gateId": "gate-001",
          "gateName": "Puerta Principal",
          "relX": 200,
          "relY": 250,
          "width": 400,
          "height": 200,
          "ticketCategory": {
            "categoria": "Palco",
            "cantidadTickets": 50,
            "moneda": "COP",
            "costo": 80000,
            "valor": 250000,
            "descripcion": "Palcos con vista privilegiada"
          },
          "seats": [
            {
              "row": "P",
              "number": 1,
              "posX": 200,
              "posY": 200,
              "status": "available"
            }
          ]
        }
      ]
    }
  ]
}
```

**Resultado**:

- ✅ Se crea el venue
- ✅ Se crean los gates
- ✅ Se crean los floors
- ✅ Se guardan las categorías en `Venue_Category`
- ✅ Se guardan los asientos en `Venue_Seat`
- ✅ Se guarda el registro consolidado de tickets en la tabla `Tickets`

---

### Payload - Venue SIN Silletería (Capacidad General)

```json
{
  "name": "Parque de Conciertos",
  "ownerUserId": "user-id-123",
  "eventId": "event-789",
  "hasSeating": false,
  "type": "outdoor",
  "capacity": 10000,
  "country": "Colombia",
  "city": "Medellín",
  "address": "Carrera 70 #50-20",
  "gates": [
    {
      "gateId": "gate-100",
      "gateNumber": 1,
      "name": "Entrada General",
      "description": "Acceso único al parque"
    }
  ],
  "floors": [
    {
      "name": "Zona Única",
      "description": "Capacidad general sin asientos",
      "categories": [
        {
          "name": "General",
          "color": "#00FF00",
          "level": 0,
          "sortOrder": 1,
          "gateId": "gate-100",
          "gateName": "Entrada General",
          "ticketCategory": {
            "categoria": "General",
            "cantidadTickets": 8000,
            "moneda": "COP",
            "costo": 20000,
            "valor": 50000,
            "descripcion": "Entrada general sin asiento asignado"
          }
        },
        {
          "name": "VIP General",
          "color": "#FFD700",
          "level": 1,
          "sortOrder": 2,
          "gateId": "gate-100",
          "gateName": "Entrada General",
          "ticketCategory": {
            "categoria": "VIP General",
            "cantidadTickets": 2000,
            "moneda": "COP",
            "costo": 40000,
            "valor": 100000,
            "descripcion": "Zona VIP sin asiento asignado pero con área exclusiva"
          }
        }
      ]
    }
  ]
}
```

**Resultado**:

- ✅ Se crea el venue con `hasSeating: false`
- ✅ Se crean los gates
- ✅ Se crean los floors
- ❌ NO se guardan las categorías en `Venue_Category` (porque `hasSeating: false`)
- ❌ NO se crean asientos en `Venue_Seat`
- ✅ Se guarda el registro consolidado de tickets en la tabla `Tickets` con capacidades generales

---

## Diferencias Clave

| Característica                     | CON Silletería (`hasSeating: true`) | SIN Silletería (`hasSeating: false`) |
| ---------------------------------- | ----------------------------------- | ------------------------------------ |
| **Tabla Venue_Category**           | ✅ Se guarda                        | ❌ No se guarda                      |
| **Tabla Venue_Seat**               | ✅ Se crean asientos                | ❌ No se crean                       |
| **Tabla Tickets**                  | ✅ Se guarda                        | ✅ Se guarda                         |
| **ticketCategory.cantidadTickets** | Suma de asientos                    | Capacidad total de la zona           |
| **Asiento asignado**               | Sí (row, number)                    | No (entrada general)                 |
| **Uso típico**                     | Teatros, estadios, auditorios       | Parques, conciertos, festivales      |

---

## Estructura de ticketCategory

```json
{
  "ticketCategory": {
    "categoria": "Nombre de la categoría",
    "cantidadTickets": 100, // Cantidad total de tickets
    "moneda": "COP", // Moneda (COP, USD, etc)
    "costo": 50000, // Costo de producción
    "valor": 150000, // Precio de venta
    "descripcion": "Descripción", // Descripción de la categoría
    "imgboleta": "url-imagen" // URL de imagen de la boleta (opcional)
  }
}
```

**Campos calculados automáticamente**:

- `id`: categoryId
- `avaliableCapacity`: cantidadTickets (inicial)
- `reservedTickets`: 0 (inicial)
- `soldTickets`: 0 (inicial)
- `distributionId`: UUID generado
- `distributionCreateDate`: Timestamp de creación
- `eventId`: ID del evento
- `venueId`: ID del venue
- `categoryId`: ID de la categoría

---

## Estructura de Asientos (seats)

Solo aplica cuando `hasSeating: true`:

```json
{
  "seats": [
    {
      "seatId": "seat-uuid", // Opcional, se genera si no se envía
      "row": "A", // Fila del asiento
      "number": 1, // Número del asiento
      "posX": 100, // Posición X en el plano
      "posY": 100, // Posición Y en el plano
      "status": "available", // available, reserved, sold, blocked
      "label": "A1" // Etiqueta visual (opcional)
    }
  ]
}
```

---

## Ejemplos de Uso

### Ejemplo 1: Teatro con Silletería Numerada

```json
{
  "hasSeating": true,
  "floors": [
    {
      "name": "Platea",
      "categories": [
        {
          "name": "Platea A",
          "ticketCategory": {
            "cantidadTickets": 200,
            "valor": 80000
          },
          "seats": [...200 asientos con row y number...]
        }
      ]
    }
  ]
}
```

### Ejemplo 2: Festival al Aire Libre

```json
{
  "hasSeating": false,
  "floors": [
    {
      "name": "Zona Principal",
      "categories": [
        {
          "name": "General",
          "ticketCategory": {
            "cantidadTickets": 5000,
            "valor": 50000
          }
          // No se incluye array "seats"
        }
      ]
    }
  ]
}
```

### Ejemplo 3: Estadio Híbrido (Con y Sin Silletería)

```json
{
  "hasSeating": true,
  "floors": [
    {
      "name": "Tribuna",
      "categories": [
        {
          "name": "Tribuna Occidental",
          "ticketCategory": {
            "cantidadTickets": 1000,
            "valor": 60000
          },
          "seats": [...1000 asientos numerados...]
        }
      ]
    },
    {
      "name": "Cancha",
      "categories": [
        {
          "name": "Cancha General",
          "ticketCategory": {
            "cantidadTickets": 3000,
            "valor": 40000
          }
          // Sin asientos, pero se guarda en Venue_Category porque hasSeating: true a nivel de venue
        }
      ]
    }
  ]
}
```

---

## Flujo de Datos

### Con Silletería:

```
POST /venues
    ↓
Venues (venue_id)
    ↓
Venue_Floor (floorId)
    ↓
Venue_Category (categoryId) ← Se guarda porque hasSeating: true
    ↓
Venue_Seat (seatId) × cantidadTickets
    ↓
Tickets (eventId) ← Consolidado de todas las categorías
```

### Sin Silletería:

```
POST /venues
    ↓
Venues (venue_id, hasSeating: false)
    ↓
Venue_Floor (floorId)
    ↓
Venue_Category ← NO SE GUARDA
    ↓
Tickets (eventId) ← Solo se guarda aquí con capacidades generales
```

---

## Notas Importantes

1. **IDs Opcionales**: Puedes enviar `categoryId`, `floorId`, `gateId`, `seatId` desde el frontend o dejar que se generen automáticamente.

2. **Validación**: El campo `hasSeating` del venue determina si se guardan categorías en `Venue_Category`.

3. **ticketCategory**: Aunque una categoría no tenga silletería, si incluyes `ticketCategory`, se guardará en la tabla `Tickets`.

4. **Gates**: Los gates se guardan directamente en el venue como un array y no en tabla separada.

5. **Consistencia**: `cantidadTickets` debe coincidir con la cantidad de asientos en el array `seats` (si aplica).

6. **EventId**: Para venues de evento, siempre incluir `eventId` en el payload raíz.

---

## URLs de Endpoints

**Desarrollo**:

```
POST https://your-api-gateway-url/dev/venues
POST https://your-api-gateway-url/dev/venues/{venueId}/floors/{floorId}/categories
```

**Producción**:

```
POST https://your-api-gateway-url/prod/venues
POST https://your-api-gateway-url/prod/venues/{venueId}/floors/{floorId}/categories
```
