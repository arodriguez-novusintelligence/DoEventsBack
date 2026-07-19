# Resumen de Cambios: Array de Categorías Independiente

## ✅ Cambios Implementados

### 1. **createVenueHandler.js**

- ✅ Soporta array `categories` independiente fuera de `floors`
- ✅ `floors` y `seats` son opcionales cuando `hasSeating = false`
- ✅ Guarda categorías en tabla `Tickets` automáticamente
- ✅ Si `hasSeating = true` y hay `floorId`, también guarda en `Venue_Category`
- ✅ Procesa `seats` solo cuando `hasSeating = true`
- ✅ Mantiene compatibilidad con formato antiguo (categories dentro de floors)
- ✅ Soporta campo opcional `gateId` en cada categoría para asignar puertas

### 2. **updateVenueHandler.js**

- ✅ Soporta array `categories` independiente para actualizaciones
- ✅ `floors` y `seats` opcionales cuando `hasSeating = false`
- ✅ Busca registro existente en tabla `Tickets` por `eventId`
- ✅ Actualiza registro existente o crea uno nuevo
- ✅ Procesa categorías y seats igual que en create
- ✅ Retorna información sobre la actualización de tickets
- ✅ Soporta campo opcional `gateId` en cada categoría

### 3. **Documentación**

- ✅ Creado `CATEGORIES_ARRAY_EXAMPLES.md` con ejemplos completos
- ✅ Escenario 1: Venue CON silletería (`hasSeating: true`)
- ✅ Escenario 2: Venue SIN silletería (`hasSeating: false`)
- ✅ Escenario 3: Híbrido (floors sin seats)
- ✅ Ejemplos de actualización (PUT)
- ✅ Migración desde formato antiguo

### 4. **Script de Verificación**

- ✅ Creado `check-tickets-index.ps1` para verificar índice `eventIdIndex`

---

## 🔄 Flujo de Procesamiento

### Creación (POST /venues)

```
1. Recibe request con categories array
2. Guarda venue en tabla Venues
3. Si hasSeating=true y floors existe:
   - Crea floors en Venue_Floor
   - Crea elements en Venue_Element
4. Por cada categoría:
   - Si hasSeating=true y floorId presente:
     * Guarda en Venue_Category
     * Guarda seats en Venue_Seat
   - Siempre: Agrega a array de boletas
5. Crea registro en tabla Tickets con todas las boletas
```

### Actualización (PUT /venues/{venueId})

```
1. Recibe request con categories array
2. Actualiza venue en tabla Venues
3. Procesa floors si existen (igual que create)
4. Por cada categoría:
   - Si hasSeating=true y floorId presente:
     * Crea/actualiza en Venue_Category
     * Crea/actualiza seats en Venue_Seat
   - Siempre: Agrega a array de boletas
5. Busca registro existente en Tickets por eventId
6. Si existe: Actualiza boletas
   Si no existe: Crea nuevo registro
```

---

## 📋 Estructura de Datos

### Request (hasSeating: true)

```json
{
  "hasSeating": true,
  "floors": [...],
  "categories": [
    {
      "categoryId": "cat-001",
      "name": "VIP",
      "floorId": "floor-001",
      "cantidadTickets": 100,
      "valor": 150000,
      "gateId": "gate-003",
      "seats": [
        {"row": "A", "number": "1", "status": "available"}
      ]
    }
  ]
}
```

### Request (hasSeating: false)

```json
{
  "hasSeating": false,
  "categories": [
    {
      "name": "General",
      "cantidadTickets": 5000,
      "valor": 50000,
      "gateId": "gate-001"
    }
  ]
}
```

### Tabla Tickets (resultado final)

```json
{
  "id": "ticket-123",
  "eventId": "event-abc",
  "venueId": "venue-xyz",
  "hasSeating": true,
  "boletas": [
    {
      "categoria": "VIP",
      "id": "cat-001",
      "cantidadTickets": 100,
      "avaliableCapacity": 100,
      "valor": 150000,
      "moneda": "COP",
      "gateId": "gate-003"
    }
  ]
}
```

---

## ⚙️ Para Desplegar

```powershell
cd aws-lambda-venues
serverless deploy --force
```

---

## 🧪 Testing

### 1. Verificar índice en Tickets

```powershell
./check-tickets-index.ps1
```

### 2. Crear venue con categorías (hasSeating: true)

```bash
POST /venues
# Ver CATEGORIES_ARRAY_EXAMPLES.md - Escenario 1
```

### 3. Crear venue sin silletería (hasSeating: false)

```bash
POST /venues
# Ver CATEGORIES_ARRAY_EXAMPLES.md - Escenario 2
```

### 4. Actualizar categorías

```bash
PUT /venues/{venueId}
# Ver CATEGORIES_ARRAY_EXAMPLES.md - Actualización
```

### 5. Verificar en DynamoDB

```powershell
# Verificar Tickets
aws dynamodb scan --table-name Tickets --limit 5

# Verificar Venue_Category
aws dynamodb scan --table-name Venue_Category --limit 5

# Verificar Venue_Seat
aws dynamodb scan --table-name Venue_Seat --limit 5
```

---

## 🎯 Ventajas del Nuevo Formato

1. **Separación de Responsabilidades**: Categories para tickets, floors para estructura física
2. **Flexibilidad**: hasSeating=false no requiere floors ni seats
3. **Simplicidad**: Un array unificado de categorías
4. **Trazabilidad**: Vínculo directo con Tickets table
5. **Escalabilidad**: Más fácil agregar/quitar categorías
6. **Compatibilidad**: Formato antiguo sigue funcionando

---

## ⚠️ Notas Importantes

1. El índice `eventIdIndex` debe existir en tabla `Tickets`
2. Las categorías sin `floorId` no se guardan en `Venue_Category`
3. Los `seats` solo se procesan si `hasSeating = true`
4. El campo `categoryId` puede venir como `id` (se normaliza)
5. El campo `name` puede venir como `categoria` (se normaliza)
6. El sistema prioriza el array `categories` sobre el formato antiguo
7. **`gateId`** es opcional y permite asignar una puerta específica a cada categoría
   - Debe corresponder a un `gateId` existente en el array `gates` del venue
   - Si no se especifica, queda como string vacío (`""`)
   - Se guarda tanto en `Venue_Category` como en la tabla `Tickets`

---

## 📚 Archivos Modificados

- ✅ `src/createVenueHandler.js`
- ✅ `src/updateVenueHandler.js`
- ✅ `CATEGORIES_ARRAY_EXAMPLES.md` (nuevo)
- ✅ `check-tickets-index.ps1` (nuevo)
- ✅ `VENUE_CATEGORIES_UPDATE_SUMMARY.md` (este archivo)
