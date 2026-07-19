# AWS Lambda Venues Management

Sistema completo de gestión de venues (lugares/recintos) para eventos con soporte para categorías, secciones y asientos. Incluye **sincronización automática bidireccional** con la tabla Tickets.

## ✨ Características Principales

- ✅ **Sincronización Automática con Tickets** - Las modificaciones en venues se reflejan automáticamente en la tabla Tickets
- ✅ **Generación Automática de TicketsDistribution** - Crea boletas individuales listas para compra
- ✅ **Preservación de Datos de Ventas** - Nunca se pierden datos de tickets vendidos o reservados
- ✅ **Auto-eliminación Inteligente** - Elementos no incluidos en updates se eliminan automáticamente
- ✅ **Comparación Inteligente** - Solo actualiza campos que realmente cambiaron
- ✅ **Batch Operations** - Operaciones masivas optimizadas
- ✅ **Venues Base y Event Venues** - Soporte para plantillas reutilizables y venues específicos de eventos
- ✅ **Integración con Sistema de Órdenes** - Totalmente alineado con la lógica de compra de boletas

## 📋 Estructura de Datos

### Tablas DynamoDB

1. **Venue** - Tabla principal de venues

   - PK: `venueId` (String)
   - GSI: `ownerUserIdIndex` (ownerUserId)

2. **VenueCategory** - Categorías de un venue (VIP, General, etc.)

   - PK: `categoryId` (String)
   - GSI: `venueIdIndex` (venueId)

3. **VenueSection** - Secciones dentro de una categoría

   - PK: `sectionId` (String)
   - GSI: `categoryIdIndex` (categoryId)
   - GSI: `venueIdIndex` (venueId)

4. **VenueSeat** - Asientos individuales
   - PK: `seatId` (String)
   - GSI: `sectionIdIndex` (sectionId)
   - GSI: `categoryIdIndex` (categoryId)
   - GSI: `venueIdIndex` (venueId)

## 🚀 Instalación

```bash
cd aws-lambda-venues
npm install
```

## 📊 Crear Tablas en DynamoDB

### Tabla Venue

```bash
aws dynamodb create-table \
  --table-name Venue \
  --attribute-definitions \
    AttributeName=venueId,AttributeType=S \
    AttributeName=ownerUserId,AttributeType=S \
  --key-schema AttributeName=venueId,KeyType=HASH \
  --global-secondary-indexes \
    "[{\"IndexName\":\"ownerUserIdIndex\",\"KeySchema\":[{\"AttributeName\":\"ownerUserId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### Tabla VenueCategory

```bash
aws dynamodb create-table \
  --table-name VenueCategory \
  --attribute-definitions \
    AttributeName=categoryId,AttributeType=S \
    AttributeName=venueId,AttributeType=S \
  --key-schema AttributeName=categoryId,KeyType=HASH \
  --global-secondary-indexes \
    "[{\"IndexName\":\"venueIdIndex\",\"KeySchema\":[{\"AttributeName\":\"venueId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### Tabla VenueSection

```bash
aws dynamodb create-table \
  --table-name VenueSection \
  --attribute-definitions \
    AttributeName=sectionId,AttributeType=S \
    AttributeName=categoryId,AttributeType=S \
    AttributeName=venueId,AttributeType=S \
  --key-schema AttributeName=sectionId,KeyType=HASH \
  --global-secondary-indexes \
    "[{\"IndexName\":\"categoryIdIndex\",\"KeySchema\":[{\"AttributeName\":\"categoryId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}},{\"IndexName\":\"venueIdIndex\",\"KeySchema\":[{\"AttributeName\":\"venueId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### Tabla VenueSeat

```bash
aws dynamodb create-table \
  --table-name VenueSeat \
  --attribute-definitions \
    AttributeName=seatId,AttributeType=S \
    AttributeName=sectionId,AttributeType=S \
    AttributeName=categoryId,AttributeType=S \
    AttributeName=venueId,AttributeType=S \
  --key-schema AttributeName=seatId,KeyType=HASH \
  --global-secondary-indexes \
    "[{\"IndexName\":\"sectionIdIndex\",\"KeySchema\":[{\"AttributeName\":\"sectionId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}},{\"IndexName\":\"categoryIdIndex\",\"KeySchema\":[{\"AttributeName\":\"categoryId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}},{\"IndexName\":\"venueIdIndex\",\"KeySchema\":[{\"AttributeName\":\"venueId\",\"KeyType\":\"HASH\"}],\"Projection\":{\"ProjectionType\":\"ALL\"},\"ProvisionedThroughput\":{\"ReadCapacityUnits\":5,\"WriteCapacityUnits\":5}}]" \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

## 🚢 Despliegue

```bash
serverless deploy
```

## 📡 Endpoints

### Venues

#### Crear Venue (con categorías, secciones y asientos)

```http
POST /venues
```

**Body ejemplo:**

```json
{
  "ownerUserId": "user123",
  "name": "Estadio Nacional",
  "type": "stadium",
  "capacity": 50000,
  "country": "Colombia",
  "city": "Bogotá",
  "address": "Calle 123",
  "timezone": "America/Bogota",
  "categories": [
    {
      "name": "VIP",
      "color": "#FFD700",
      "level": 1,
      "sortOrder": 1,
      "sections": [
        {
          "name": "VIP A",
          "rows": 10,
          "seatsPerRow": 20,
          "capacity": 200,
          "seats": [
            {
              "rowLabel": "A",
              "colNumber": 1,
              "seatCode": "A-1",
              "seatType": "vip"
            }
          ]
        }
      ]
    }
  ]
}
```

#### Obtener Venue (con toda la estructura)

```http
GET /venues/{venueId}
```

#### Listar Venues

```http
GET /venues?ownerUserId=user123&isTemplate=false&status=active
```

#### Actualizar Venue

```http
PUT /venues/{venueId}
```

#### Eliminar Venue (elimina todo: categorías, secciones, asientos)

```http
DELETE /venues/{venueId}
```

### Categories

#### Crear Categoría

```http
POST /venues/{venueId}/categories
```

#### Actualizar Categoría

```http
PUT /venues/{venueId}/categories/{categoryId}
```

#### Eliminar Categoría

```http
DELETE /venues/{venueId}/categories/{categoryId}
```

### Sections

#### Crear Sección

```http
POST /venues/{venueId}/categories/{categoryId}/sections
```

#### Actualizar Sección

```http
PUT /venues/{venueId}/categories/{categoryId}/sections/{sectionId}
```

#### Eliminar Sección

```http
DELETE /venues/{venueId}/categories/{categoryId}/sections/{sectionId}
```

### Seats

#### Crear Asientos (múltiples)

```http
POST /venues/{venueId}/categories/{categoryId}/sections/{sectionId}/seats
```

#### Actualizar Asiento

```http
PUT /venues/{venueId}/seats/{seatId}
```

#### Eliminar Asiento

```http
DELETE /venues/{venueId}/seats/{seatId}
```

## 🔧 Características

- ✅ CRUD completo para Venues
- ✅ Gestión jerárquica: Venue → Category → Section → Seat
- ✅ Creación en cascada (crear venue con toda su estructura de una vez)
- ✅ Eliminación en cascada (eliminar venue elimina todo lo relacionado)
- ✅ **Sincronización automática con tabla Tickets**
- ✅ **Preservación de datos de ventas (soldTickets, reservedTickets)**
- ✅ Batch operations para asientos (hasta 25 por batch)
- ✅ Índices GSI para consultas eficientes
- ✅ Soporte para templates de venues
- ✅ Control de visibilidad y estado
- ✅ Tracking de uso (usageCount)
- ✅ Versionado de floorplan
- ✅ **Comparación inteligente - Solo actualiza cambios reales**
- ✅ **Auto-eliminación de elementos no enviados**

## 🔄 Sincronización con Tickets

El sistema mantiene automáticamente sincronizadas las categorías entre `Venue_Category` y la tabla `Tickets`:

### Funcionamiento Automático

Cuando actualizas un venue con `eventId`:

1. Se procesan todos los cambios en floors, categorías y asientos
2. Se recolectan todas las categorías finales del venue
3. Se obtienen datos existentes de Tickets (ventas, reservas)
4. Se calcula el conteo real de asientos desde `Venue_Seat`
5. Se actualizan los Tickets preservando datos importantes

### Datos Preservados

- ✅ `soldTickets` - Tickets vendidos
- ✅ `reservedTickets` - Tickets reservados
- ✅ `distributionId` - ID de distribución
- ✅ `distributionCreateDate` - Fecha de creación

### Datos Actualizados

- 🔄 `cantidadTickets` - Total de asientos (desde Venue_Seat)
- 🔄 `avaliableCapacity` - Disponibilidad calculada
- 🔄 `valor` - Precio (desde ticketPrice)
- 🔄 `categoria` - Nombre (desde name)

---

## 🎫 Generación Automática de TicketsDistribution

### ¿Qué es TicketsDistribution?

`TicketsDistribution` es la tabla que contiene los **tickets individuales** listos para ser comprados. Cada ticket tiene:

- `ticketInstanceId` único
- `ticketStatus`: AVAILABLE, RESERVED, SOLD, USED
- `qrCodeKey` para generar QR code
- `purchasePrice` del ticket

### Flujo de Generación

Cuando creas un venue con eventId:

```
Venue creado
    ↓
Categorías en Venue_Category
    ↓
Registro en Tickets (boletas agrupadas)
    ↓
TicketsDistribution (tickets individuales)
```

**Ejemplo:**

```javascript
// Categoría VIP con 100 asientos
{
  categoria: "VIP",
  cantidadTickets: 100,
  valor: 200000
}

// Genera automáticamente:
TicketsDistribution {
  tickets: [
    { ticketInstanceId: "uuid-1", ticketStatus: "AVAILABLE", ... },
    { ticketInstanceId: "uuid-2", ticketStatus: "AVAILABLE", ... },
    // ... 100 tickets individuales
  ]
}
```

### Sincronización Inteligente

Al actualizar un venue:

- ✅ **Nuevas categorías** → Crea nueva distribución
- ✅ **Aumentar cantidad** → Agrega tickets AVAILABLE
- ✅ **Disminuir cantidad** → Elimina solo tickets AVAILABLE
- ⚠️ **Protección** → Nunca elimina tickets RESERVED, SOLD o USED

### Integración con Compras

El sistema de órdenes (`orders-manageTickets`) usa TicketsDistribution:

1. Usuario selecciona tickets
2. `createOrder` busca en TicketsDistribution
3. Cambia status de AVAILABLE → RESERVED
4. Usuario paga
5. `processPayment` cambia RESERVED → SOLD
6. Usuario recibe QR codes

### Documentación Detallada

- [TICKETS_SYNC_GUIDE.md](TICKETS_SYNC_GUIDE.md) - Guía completa de sincronización
- [TICKETS_SYNC_EXAMPLES.md](TICKETS_SYNC_EXAMPLES.md) - Ejemplos prácticos
- [TICKETS_DISTRIBUTION_IMPLEMENTATION.md](TICKETS_DISTRIBUTION_IMPLEMENTATION.md) - Implementación técnica detallada
- [UPDATE_VENUE_GUIDE.md](UPDATE_VENUE_GUIDE.md) - Guía de actualización de venues

## 📝 Notas

- Los asientos se crean en lotes de 25 para optimizar el rendimiento
- Cada nivel (venue, category, section, seat) tiene su propio ID único (UUID)
- El campo `venueId` se propaga a través de toda la jerarquía
- Se mantiene trazabilidad con `createdBy`, `updatedBy`, `createdAt`, `updatedAt`
