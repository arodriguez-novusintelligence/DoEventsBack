# Cambios: Entrances → Gates

## 📋 Resumen

Se ha simplificado la estructura de accesos/entradas de los venues, reemplazando el sistema complejo de `Entrances` y `Entrance_Categories` por un sistema simple de `Gates` (puertas).

## 🔄 Cambios Realizados

### Nueva Interfaz

```typescript
interface VenueGateInterface {
  gateId: string;
  gateNumber: number;
  name: string;
  description?: string;
}
```

### Archivos Modificados

1. **createVenueHandler.js**

   - Cambio de `entrances` → `gates`
   - Eliminada lógica de entrance categories
   - Estructura simplificada con solo 4 campos

2. **updateVenueHandler.js**

   - Cambio de `entrances` → `gates`
   - Actualización/creación simplificada de gates
   - Eliminada lógica de categorías

3. **getVenueHandler.js**

   - Query a tabla `Venue_Gate` en lugar de `Venue_Entrance`
   - Eliminada query a `Venue_Entrance_Category`
   - Respuesta con array `gates` simple

4. **cloneVenueForEventHandler.js**

   - Clonación de gates en lugar de entrances
   - Eliminada clonación de entrance categories
   - Respuesta con `gatesCloned` count

5. **serverless.yml**

   - Variable de entorno: `VENUE_GATE_TABLE`
   - Permisos IAM para `Venue_Gate` table
   - Eliminadas referencias a `Venue_Entrance` y `Venue_Entrance_Category`

6. **EXAMPLES.md**
   - Actualizada estructura jerárquica del venue
   - Ejemplo 1: Crear venue con gates simples
   - Eliminadas secciones de Entrance CRUD
   - Actualizados todos los ejemplos relevantes

### Nueva Tabla DynamoDB

**Tabla:** `Venue_Gate`

**Estructura:**

- **PK:** `gateId` (String, HASH)
- **GSI:** `venueIdIndex` (venueId como HASH)
- **Atributos:**
  - `gateId`: ID único de la puerta
  - `venueId`: ID del venue al que pertenece
  - `gateNumber`: Número de la puerta (ej: 1, 2, 3)
  - `name`: Nombre descriptivo (ej: "Puerta Norte")
  - `description`: Descripción opcional
  - `createdAt`: Timestamp de creación
  - `updatedAt`: Timestamp de última actualización
  - `createdBy`: Usuario que creó
  - `updatedBy`: Usuario que actualizó

**Script de creación:** `create-gate-table.ps1`

## 📊 Comparación

### Antes (Entrances)

```json
{
  "entrances": [
    {
      "entranceId": "entrance-001",
      "name": "Accesos Principales",
      "type": "general",
      "capacity": 30000,
      "requiresReservation": false,
      "allowsGroupBooking": true,
      "minGroupSize": 1,
      "maxGroupSize": 10,
      "categories": [
        {
          "entranceCategoryId": "cat-001",
          "name": "Puerta Norte",
          "type": "standard",
          "capacity": 12000,
          "allowedDays": ["saturday", "sunday"],
          "priority": 1
        }
      ]
    }
  ]
}
```

### Ahora (Gates)

```json
{
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
    }
  ]
}
```

## ✅ Ventajas

1. **Simplicidad:** Estructura mucho más simple y fácil de entender
2. **Menos complejidad:** Eliminada jerarquía de categories innecesaria
3. **Menos tablas:** Solo 1 tabla en lugar de 2 (Entrance + Entrance_Category)
4. **Mejor rendimiento:** Menos queries y joins
5. **Mantenimiento:** Código más limpio y fácil de mantener
6. **Frontend friendly:** Estructura plana más fácil de consumir

## 🚀 Próximos Pasos

1. **Crear tabla Venue_Gate:**

   ```powershell
   .\create-gate-table.ps1
   ```

2. **Desplegar cambios:**

   ```bash
   serverless deploy --stage dev
   ```

3. **Migración de datos (si es necesario):**

   - Crear script para migrar entrances existentes a gates
   - Mapear entrance categories a gates individuales

4. **Actualizar frontend:**
   - Cambiar consumo de `entrances` → `gates`
   - Eliminar lógica de entrance categories
   - Actualizar formularios de creación/edición

## 📝 Notas

- Los endpoints de Entrance CRUD (`/venues/{venueId}/entrances`) aún existen pero deberían marcarse como deprecated
- La tabla `Venue_Entrance` y `Venue_Entrance_Category` pueden mantenerse temporalmente para retrocompatibilidad
- Se recomienda crear un endpoint de migración para convertir entrances antiguas a gates
