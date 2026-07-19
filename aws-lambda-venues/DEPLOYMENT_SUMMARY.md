# 🎯 Resumen del Proyecto AWS Lambda Venues

## ✅ Proyecto Completado

Se ha creado un sistema completo de gestión de Venues (recintos/lugares para eventos) con arquitectura serverless usando AWS Lambda y DynamoDB.

## 📁 Estructura del Proyecto

```
aws-lambda-venues/
├── src/
│   ├── createVenueHandler.js      ✅ Crear venue con toda su estructura
│   ├── getVenueHandler.js         ✅ Obtener venue completo (con categorías, secciones, asientos)
│   ├── listVenuesHandler.js       ✅ Listar venues con filtros
│   ├── updateVenueHandler.js      ✅ Actualizar datos del venue
│   ├── deleteVenueHandler.js      ✅ Eliminar venue y toda su estructura
│   ├── createCategoryHandler.js   ✅ Crear categoría
│   ├── updateCategoryHandler.js   ✅ Actualizar categoría
│   ├── deleteCategoryHandler.js   ✅ Eliminar categoría (cascada)
│   ├── createSectionHandler.js    ✅ Crear sección
│   ├── updateSectionHandler.js    ✅ Actualizar sección
│   ├── deleteSectionHandler.js    ✅ Eliminar sección (cascada)
│   ├── createSeatsHandler.js      ✅ Crear múltiples asientos
│   ├── updateSeatHandler.js       ✅ Actualizar asiento
│   └── deleteSeatHandler.js       ✅ Eliminar asiento
├── serverless.yml                 ✅ Configuración completa con 14 endpoints
├── package.json                   ✅ Dependencias instaladas
├── README.md                      ✅ Documentación completa
└── EXAMPLES.md                    ✅ 15 ejemplos de uso

```

## 🗄️ Tablas DynamoDB (Debes crearlas)

### 1. Tabla Venue

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

### 2. Tabla VenueCategory

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

### 3. Tabla VenueSection

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

### 4. Tabla VenueSeat

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

## 🚀 Desplegar

```bash
cd aws-lambda-venues
serverless deploy
```

## 📡 Endpoints Disponibles (14 endpoints)

### Venues (5 endpoints)

- POST `/venues` - Crear venue completo
- GET `/venues/{venueId}` - Obtener venue con toda su estructura
- GET `/venues` - Listar venues con filtros
- PUT `/venues/{venueId}` - Actualizar venue
- DELETE `/venues/{venueId}` - Eliminar venue (cascada)

### Categories (3 endpoints)

- POST `/venues/{venueId}/categories` - Crear categoría
- PUT `/venues/{venueId}/categories/{categoryId}` - Actualizar categoría
- DELETE `/venues/{venueId}/categories/{categoryId}` - Eliminar categoría (cascada)

### Sections (3 endpoints)

- POST `/venues/{venueId}/categories/{categoryId}/sections` - Crear sección
- PUT `/venues/{venueId}/categories/{categoryId}/sections/{sectionId}` - Actualizar sección
- DELETE `/venues/{venueId}/categories/{categoryId}/sections/{sectionId}` - Eliminar sección (cascada)

### Seats (3 endpoints)

- POST `/venues/{venueId}/categories/{categoryId}/sections/{sectionId}/seats` - Crear asientos (batch)
- PUT `/venues/{venueId}/seats/{seatId}` - Actualizar asiento
- DELETE `/venues/{venueId}/seats/{seatId}` - Eliminar asiento

## 🎨 Características Principales

✅ **Creación en cascada**: Crear un venue con todas sus categorías, secciones y asientos en una sola petición  
✅ **Eliminación en cascada**: Eliminar venue/categoría/sección elimina todo lo relacionado  
✅ **Batch operations**: Crear hasta 25 asientos por batch automáticamente  
✅ **Templates**: Soporte para templates de venues reutilizables  
✅ **Filtros avanzados**: Filtrar por usuario, estado, template, etc.  
✅ **GSI optimizados**: Índices para consultas eficientes  
✅ **Gestión de estados**: available, reserved, sold, blocked, maintenance  
✅ **Accesibilidad**: Soporte para asientos accesibles y zonas especiales  
✅ **Geolocalización**: Campo geo para coordenadas  
✅ **Versionado**: Control de versiones de floorplan  
✅ **Tracking**: createdBy, updatedBy, createdAt, updatedAt

## 📚 Documentación

- `README.md` - Documentación técnica completa
- `EXAMPLES.md` - 15 ejemplos de uso con JSON completos

## 🔧 Próximos Pasos

1. **Crear las 4 tablas en DynamoDB** (comandos arriba)
2. **Desplegar**: `serverless deploy`
3. **Probar endpoints** con los ejemplos en EXAMPLES.md
4. **Integrar con frontend** usando las interfaces TypeScript proporcionadas

## 💡 Uso Típico

```typescript
// 1. Crear venue completo con estructura
POST /venues + JSON con categories, sections, seats

// 2. Obtener venue con toda la jerarquía
GET /venues/{venueId}

// 3. Agregar más secciones/asientos después
POST /venues/{venueId}/categories/{categoryId}/sections
POST /venues/{venueId}/categories/{categoryId}/sections/{sectionId}/seats

// 4. Actualizar estados de asientos
PUT /venues/{venueId}/seats/{seatId}
```

## ✨ Todo listo para usar!
