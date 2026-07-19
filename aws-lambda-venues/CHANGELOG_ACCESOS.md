# ✅ Sistema de Accesos/Puertas - Actualizado

## Cambios Realizados

Se ha **simplificado el sistema** para gestionar solo **accesos físicos (puertas)**, eliminando completamente la gestión de precios.

---

## ❌ Eliminado

### Tabla

- ✗ `Venue_Entrance_Pricing` - Tabla completa eliminada

### Handlers

- ✗ `createEntrancePricingHandler.js`
- ✗ `updateEntrancePricingHandler.js`

### Endpoints

- ✗ `POST /venues/{venueId}/entrances/{entranceId}/categories/{categoryId}/pricing`
- ✗ `PUT /venues/{venueId}/pricing/{pricingId}`

### Configuración

- ✗ Variable de entorno: `VENUE_ENTRANCE_PRICING_TABLE`
- ✗ Permisos IAM para tabla de pricing
- ✗ Lógica de pricing en handlers existentes

---

## ✅ Sistema Actual

### 2 Tablas DynamoDB

1. **`Venue_Entrance`** - Configuración de accesos
2. **`Venue_Entrance_Category`** - Categorías de puertas

### 7 Endpoints HTTP

1. `POST /venues/{venueId}/entrances` - Crear accesos
2. `GET /venues/{venueId}/entrances` - Listar accesos
3. `GET /venues/{venueId}/entrances/{entranceId}` - Obtener acceso
4. `PUT /venues/{venueId}/entrances/{entranceId}` - Actualizar acceso
5. `DELETE /venues/{venueId}/entrances/{entranceId}` - Eliminar acceso
6. `POST /venues/{venueId}/entrances/{entranceId}/categories` - Crear categoría
7. `PUT /venues/{venueId}/entrances/{entranceId}/categories/{categoryId}` - Actualizar categoría

### 7 Handlers Lambda

1. `createEntranceHandler.js` ✓
2. `getEntrancesHandler.js` ✓
3. `getEntranceByIdHandler.js` ✓
4. `updateEntranceHandler.js` ✓
5. `deleteEntranceHandler.js` ✓
6. `createEntranceCategoryHandler.js` ✓
7. `updateEntranceCategoryHandler.js` ✓

---

## 🎯 Propósito del Sistema

Gestionar **puertas de acceso físicas** a venues:

- **Puerta VIP Norte** → 1000 personas
- **Puerta General Occidental** → 15000 personas
- **Puerta Estudiantil Sur** → 5000 personas (18-28 años)
- **Puerta Accesibilidad Este** → 500 personas

### NO gestiona:

- ❌ Precios de tickets
- ❌ Costo de entradas
- ❌ Tarifas dinámicas

### SÍ gestiona:

- ✅ Puertas físicas de acceso
- ✅ Capacidad por puerta
- ✅ Restricciones de edad
- ✅ Horarios de operación
- ✅ Días permitidos
- ✅ Documentación requerida

---

## 🚀 Cómo Desplegar

### 1. Crear Tablas

```powershell
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-venues
.\create-entrance-tables.ps1
```

Esto crea:

- `Venue_Entrance`
- `Venue_Entrance_Category`

### 2. Desplegar Lambdas

```powershell
serverless deploy
```

---

## 📝 Ejemplo de Uso

### Crear Configuración de Accesos

```json
POST /venues/venue-123/entrances

{
  "name": "Accesos Estadio Nacional",
  "type": "general",
  "capacity": 40000,
  "categories": [
    {
      "name": "Puerta VIP Norte",
      "type": "vip",
      "capacity": 1000,
      "requiresDocumentation": true
    },
    {
      "name": "Puerta General Sur",
      "type": "standard",
      "capacity": 20000
    },
    {
      "name": "Puerta Estudiantil Este",
      "type": "student",
      "capacity": 5000,
      "minAge": 18,
      "maxAge": 28,
      "requiresDocumentation": true
    }
  ]
}
```

### Respuesta

```json
{
  "message": "Entrance configuration created successfully",
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "venueId": "venue-123",
    "name": "Accesos Estadio Nacional",
    "capacity": 40000,
    "categoryCount": 3,
    "categories": [
      {
        "entranceCategoryId": "category-uuid-789",
        "name": "Puerta VIP Norte",
        "type": "vip",
        "capacity": 1000
      }
    ]
  }
}
```

---

## 🔗 Integración con Sistema de Tickets

Los **precios** se gestionan en el sistema de **tickets/eventos**:

1. **Venue Entrances (este sistema):**

   - Define puertas: "Puerta VIP", "Puerta General"
   - Capacidad: 1000 personas, 20000 personas

2. **Sistema de Tickets:**

   - Define precios: VIP $300,000, General $80,000
   - Asigna ticket a puerta: `entranceCategoryId: "puerta-vip"`

3. **Al vender ticket:**
   - Validar capacidad en `Venue_Entrance_Category`
   - Decrementar `availableCapacity`
   - Guardar referencia a `entranceCategoryId` en el ticket

---

## 📚 Documentación

- **`ENTRANCES_API.md`** - Documentación técnica completa de la API
- **`ENTRANCES_RESUMEN.md`** - Guía ejecutiva de uso
- **`create-entrance-tables.ps1`** - Script de creación de tablas

---

## ✨ Beneficios del Cambio

### Antes (con pricing)

- ❌ Confusión entre accesos y precios
- ❌ 3 tablas (complejo)
- ❌ 9 endpoints (sobrecargado)
- ❌ Lógica duplicada con sistema de tickets

### Ahora (solo accesos)

- ✅ Propósito claro: gestión de puertas físicas
- ✅ 2 tablas (simple)
- ✅ 7 endpoints (enfocados)
- ✅ Separación clara: accesos ≠ precios

---

**Sistema listo para deployment** 🚀
