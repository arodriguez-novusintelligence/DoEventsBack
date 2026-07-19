# Guía de Sincronización Automática de Arrays

## Problema Resuelto

**ANTES**: Enviar menos elementos en arrays dejaba los viejos sin eliminar.
**AHORA**: El sistema sincroniza automáticamente - elimina lo que ya no está en el array.

---

## Comportamiento por Tipo de Campo

### Arrays que se Sincronizan Automáticamente

✅ **floors** - Floors del venue  
✅ **elements** - Elementos de cada floor  
✅ **categories** - Categorías de cada floor  
✅ **seats** - Asientos de cada categoría  
✅ **gates** - Puertas del venue (campo básico, NO sincroniza automáticamente)

### Campos Simples (NO Arrays)

Estos campos NO se sincronizan, solo se actualizan:

- `name`, `capacity`, `address`, etc.
- `hasSeating`, `isEventVenue`
- Todos los campos básicos del venue

---

## Ejemplos Detallados

### Ejemplo 1: Reducir Número de Floors

**Estado Inicial**:

```json
// GET /venues/venue-123
{
  "venue_id": "venue-123",
  "name": "Estadio",
  "floors": [
    { "floorId": "floor-a", "name": "Planta Baja" },
    { "floorId": "floor-b", "name": "Segundo Piso" },
    { "floorId": "floor-c", "name": "Tercer Piso" }
  ]
}
```

**Actualización**:

```json
PUT /venues/venue-123
{
  "floors": [
    { "floorId": "floor-a", "name": "Planta Baja Renovada" }
  ]
}
```

**Resultado**:

```json
{
  "venue_id": "venue-123",
  "name": "Estadio",
  "floors": [{ "floorId": "floor-a", "name": "Planta Baja Renovada" }]
}
```

**Logs**:

```
🏢 Procesando 1 floors con sincronización...
🗑️ Auto-eliminando 2 floors que ya no están en el array: ["floor-b", "floor-c"]
🗑️ Eliminando floor floor-b y sus elementos relacionados...
🗑️ Eliminando floor floor-c y sus elementos relacionados...
✏️ Actualizando floor: Planta Baja Renovada
```

---

### Ejemplo 2: Eliminar Categorías de un Floor

**Estado Inicial**:

```json
{
  "floors": [
    {
      "floorId": "floor-1",
      "categories": [
        { "categoryId": "cat-vip", "name": "VIP" },
        { "categoryId": "cat-general", "name": "General" },
        { "categoryId": "cat-palco", "name": "Palco" }
      ]
    }
  ]
}
```

**Actualización** (mantener solo VIP y General):

```json
PUT /venues/venue-123
{
  "floors": [{
    "floorId": "floor-1",
    "categories": [
      { "categoryId": "cat-vip", "name": "VIP Premium" },
      { "categoryId": "cat-general", "name": "General" }
    ]
  }]
}
```

**Resultado**:

- ✅ cat-vip: actualizado a "VIP Premium"
- ✅ cat-general: mantenido
- 🗑️ cat-palco: **ELIMINADO** (con todos sus seats)

**Logs**:

```
📦 Procesando 2 categorías para floor floor-1
🗑️ Auto-eliminando 1 categorías del floor floor-1
🗑️ Eliminando seats de categoría cat-palco...
✅ 150 asientos eliminados
✏️ Actualizando categoría: VIP Premium
✏️ Actualizando categoría: General
```

---

### Ejemplo 3: Reducir Asientos de una Categoría

**Estado Inicial**:

```json
{
  "categories": [
    {
      "categoryId": "cat-vip",
      "seats": [
        { "seatId": "seat-a1", "seatCode": "A1" },
        { "seatId": "seat-a2", "seatCode": "A2" },
        { "seatId": "seat-a3", "seatCode": "A3" },
        { "seatId": "seat-a4", "seatCode": "A4" },
        { "seatId": "seat-a5", "seatCode": "A5" }
      ]
    }
  ]
}
```

**Actualización** (mantener solo 3 asientos):

```json
PUT /venues/venue-123
{
  "floors": [{
    "floorId": "floor-1",
    "categories": [{
      "categoryId": "cat-vip",
      "seats": [
        { "seatId": "seat-a1", "seatCode": "A1" },
        { "seatId": "seat-a2", "seatCode": "A2" },
        { "seatId": "seat-a3", "seatCode": "A3" }
      ]
    }]
  }]
}
```

**Resultado**:

- ✅ seat-a1, seat-a2, seat-a3: mantenidos
- 🗑️ seat-a4, seat-a5: **ELIMINADOS**

---

### Ejemplo 4: Agregar Floor SIN Eliminar Existentes

Para agregar un nuevo floor sin eliminar los existentes, debes enviar TODOS los floors:

**Estado Inicial**: 2 floors
**Quieres**: 3 floors (2 existentes + 1 nuevo)

```json
PUT /venues/venue-123
{
  "floors": [
    // ✅ Mantener existentes (con sus floorId)
    { "floorId": "floor-1", "name": "Planta Baja" },
    { "floorId": "floor-2", "name": "Segundo Piso" },

    // ➕ Agregar nuevo (SIN floorId)
    { "name": "Tercer Piso - Nuevo" }
  ]
}
```

**Resultado**: 3 floors (2 actualizados + 1 creado)

---

### Ejemplo 5: Vaciar Completamente un Floor

**Eliminar todas las categorías de un floor**:

```json
PUT /venues/venue-123
{
  "floors": [{
    "floorId": "floor-1",
    "name": "Planta Baja",
    "categories": []  // Array vacío = elimina todas
  }]
}
```

**Logs**:

```
📦 Procesando 0 categorías para floor floor-1
🗑️ Auto-eliminando 5 categorías del floor floor-1
✅ Array categories vacío - todas las categorías eliminadas
```

---

### Ejemplo 6: Actualizar Solo Campos Básicos

Si NO quieres modificar floors, simplemente no los envíes:

```json
PUT /venues/venue-123
{
  "name": "Nuevo Nombre",
  "capacity": 8000,
  "address": "Nueva Dirección"
  // NO enviar "floors" = se mantienen sin cambios
}
```

**Resultado**: Solo campos básicos actualizados, floors intactos.

---

## Estrategias Recomendadas

### 1. Para Actualizaciones Parciales: No Enviar Array

```json
// Actualizar solo nombre y capacidad
PUT /venues/venue-123
{
  "name": "Nuevo Nombre",
  "capacity": 10000
  // floors, categories, seats se mantienen
}
```

### 2. Para Eliminar Todo: Enviar Array Vacío

```json
// Eliminar todos los floors
PUT /venues/venue-123
{
  "floors": []
}
```

### 3. Para Sincronización Completa: Enviar Estado Final

```json
// El estado final que quieres tener
PUT /venues/venue-123
{
  "floors": [
    /* Todos los floors que deben existir */
  ]
}
```

### 4. Para Agregar Sin Eliminar: GET + Modificar + PUT

```javascript
// Paso 1: Obtener estado actual
const venue = await GET("/venues/venue-123");

// Paso 2: Agregar nuevo elemento
venue.floors.push({
  name: "Nuevo Floor",
});

// Paso 3: Enviar todo
await PUT("/venues/venue-123", {
  floors: venue.floors,
});
```

---

## Validación de Índices GSI Requeridos

Para que la sincronización funcione, necesitas estos índices en DynamoDB:

### Venue_Floor

- **venueIdIndex**: GSI en campo `venueId`

### Venue_Category

- **floorIdIndex**: GSI en campo `floorId`

### Venue_Seat

- **categoryIdIndex**: GSI en campo `categoryId`

### Venue_Element

- **floorIdIndex**: GSI en campo `floorId`

**Verificar índices**:

```powershell
aws dynamodb describe-table --table-name Venue_Floor | ConvertFrom-Json | Select-Object -ExpandProperty Table | Select-Object -ExpandProperty GlobalSecondaryIndexes
```

---

## Casos Especiales

### Gates (No Sincroniza)

Los `gates` son un campo simple del venue, NO un array relacionado:

```json
PUT /venues/venue-123
{
  "gates": [
    { "gateId": "gate-1", "name": "Puerta Norte" },
    { "gateId": "gate-2", "name": "Puerta Sur" }
  ]
}
```

**Comportamiento**: Sobrescribe completamente el campo gates, pero NO hay tablas relacionadas que eliminar.

### Categories Independientes

Las categorías en el array `categories` (raíz del body) se usan para la tabla `Tickets`:

```json
{
  "categories": [{ "name": "VIP", "valor": 100000 }]
}
```

Estas NO sincronizan con `Venue_Category` a menos que tengan `floorId` y `hasSeating=true`.

---

## Troubleshooting

### Problema: "Se eliminaron floors que no quería"

**Causa**: Enviaste array `floors` incompleto.  
**Solución**: Envía TODOS los floors que deben existir, o NO envíes el campo `floors`.

### Problema: "Los cambios no se aplican"

**Causa**: No enviaste el array del elemento a modificar.  
**Solución**: Incluye el array con los cambios en el body.

### Problema: "Error: floorIdIndex not found"

**Causa**: Faltan índices GSI en las tablas.  
**Solución**: Ejecutar scripts de creación de tablas con índices.

### Problema: "Se eliminó todo sin querer"

**Causa**: Enviaste array vacío `[]`.  
**Solución**: Para mantener elementos, no envíes el array o envía todos los elementos actuales.

---

## Resumen Rápido

| Quieres                 | Acción              | Código                      |
| ----------------------- | ------------------- | --------------------------- |
| Mantener todo           | No enviar array     | `{ "name": "..." }`         |
| Eliminar todo           | Array vacío         | `{ "floors": [] }`          |
| Actualizar algunos      | Enviar solo esos    | `{ "floors": [{id: "1"}] }` |
| Agregar sin borrar      | GET + Agregar + PUT | Ver ejemplo 4               |
| Eliminar uno específico | Omitirlo del array  | Enviar sin ese ID           |

---

## Logs para Debugging

El handler imprime logs detallados:

```
🏢 Procesando 2 floors con sincronización...
🗑️ Auto-eliminando 1 floors que ya no están en el array: ["floor-old"]
🗑️ Eliminando floor floor-old y sus elementos relacionados...
  🗑️ Eliminando 3 categorías del floor...
  🗑️ Eliminando 150 asientos...
  🗑️ Eliminando 5 elementos...
✅ Floor floor-old eliminado completamente
✏️ Actualizando floor: Planta Baja
✏️ Actualizando floor: Segundo Piso
```

Busca estos emojis en CloudWatch:

- 🗑️ = Eliminación automática
- ✏️ = Actualización
- ➕ = Creación
- ✅ = Operación completada
