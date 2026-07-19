# Resumen: Sistema de Accesos/Puertas para Venues

## ✅ ¿Qué se ha creado?

Se ha implementado un **sistema completo de gestión de accesos físicos (puertas de entrada)** para venues que permite:

### 📊 Componentes Creados

1. **2 Tablas DynamoDB:**

   - `Venue_Entrance` - Configuraciones de accesos/puertas
   - `Venue_Entrance_Category` - Categorías de acceso (VIP, General, Preferencial, etc.)

2. **7 Funciones Lambda:**

   - **CRUD Accesos:** Create, Read (All), Read (One), Update, Delete
   - **CRUD Categorías:** Create, Update

3. **7 Endpoints HTTP:**
   - `POST /venues/{venueId}/entrances`
   - `GET /venues/{venueId}/entrances`
   - `GET /venues/{venueId}/entrances/{entranceId}`
   - `PUT /venues/{venueId}/entrances/{entranceId}`
   - `DELETE /venues/{venueId}/entrances/{entranceId}`
   - `POST /venues/{venueId}/entrances/{entranceId}/categories`
   - `PUT /venues/{venueId}/entrances/{entranceId}/categories/{categoryId}`

---

## 🚀 Cómo Desplegar

### Paso 1: Crear Tablas DynamoDB

```powershell
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-venues
.\create-entrance-tables.ps1
```

Esto creará las 2 tablas necesarias en DynamoDB.

### Paso 2: Desplegar Lambdas

```powershell
serverless deploy
```

Esto desplegará todas las funciones Lambda y creará los endpoints HTTP.

---

## 📝 Cómo Usar

### Flujo Básico

```
1. Crear Venue (ya existente)
   └── POST /venues

2. Crear Configuración de Accesos
   └── POST /venues/{venueId}/entrances
        └── Incluye categorías (Puerta VIP, Puerta General, etc.)

3. (Opcional) Agregar más categorías
   └── POST /venues/{venueId}/entrances/{entranceId}/categories

4. Asociar a Evento
   └── En createEvent incluir: "entranceConfigId": "{entranceId}"
```

---

## 💡 Ejemplo Completo

### 1. Crear Acceso con Categorías

```bash
POST https://{api-url}/venues/venue-123/entrances
Content-Type: application/json

{
  "name": "Accesos Estadio Nacional",
  "type": "general",
  "capacity": 40000,
  "categories": [
    {
      "name": "Puerta VIP Norte",
      "type": "vip",
      "capacity": 500,
      "allowedDays": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    },
    {
      "name": "Puerta General Occidental",
      "type": "standard",
      "capacity": 15000
    },
    {
      "name": "Puerta General Oriental",
      "type": "standard",
      "capacity": 15000
    },
    {
      "name": "Puerta Sur Estudiantil",
      "type": "student",
      "capacity": 9200,
      "minAge": 18,
      "maxAge": 28,
      "requiresDocumentation": true
    }
  ]
}
```

### 2. Consultar Accesos del Venue

```bash
GET https://{api-url}/venues/venue-123/entrances
```

**Respuesta:**

```json
{
  "venueId": "venue-123",
  "entrances": [
    {
      "entranceId": "entrance-456",
      "name": "Accesos Estadio Nacional",
      "capacity": 40000,
      "categories": [
        {
          "entranceCategoryId": "category-789",
          "name": "Puerta VIP Norte",
          "type": "vip",
          "capacity": 500
        }
      ]
    }
  ],
  "total": 1
}
```

---

## 🎯 Ventajas del Sistema

### ✅ Flexibilidad

- Múltiples categorías de acceso por venue
- Categorías con restricciones (edad, documentación)
- Configuraciones reutilizables para múltiples eventos
- Control de días y horarios permitidos

### ✅ Escalabilidad

- Separación clara de responsabilidades
- GSI optimizados para consultas rápidas
- Soporte para miles de configuraciones

### ✅ Control

- Gestión de capacidad por categoría y puerta
- Validaciones de edad y documentación
- Control de acceso por tipo (VIP, General, Estudiante, etc.)

---

## 📋 Estructura de Datos

```
Venue_Entrance {
  entranceId: UUID
  venueId: UUID
  name: string (ej: "Accesos Estadio Nacional")
  type: string (general, vip, accessible)
  capacity: number
  categories: []
}

Venue_Entrance_Category {
  entranceCategoryId: UUID
  entranceId: UUID
  venueId: UUID
  name: string (ej: "Puerta VIP Norte")
  type: string (vip, standard, student, senior)
  capacity: number
  minAge: number (opcional)
  maxAge: number (opcional)
  requiresDocumentation: boolean
  allowedDays: ["monday", "tuesday", ...]
  allowedTimeRanges: [{start: "09:00", end: "17:00"}]
}
```

---

## 🔗 Integración con Eventos

### En `aws-lambda-manageevents`

Al crear un evento, puedes referenciar la configuración de accesos:

```json
{
  "eventId": "event-789",
  "venueId": "venue-123",
  "entranceConfigId": "entrance-456",
  "skipVenue": false
}
```

Luego, al vender tickets:

1. Consultar `Venue_Entrance_Category` para obtener puertas disponibles
2. Asignar puerta de acceso según categoría del ticket
3. Validar capacidad disponible de la puerta
4. Crear ticket en tabla `Tickets` (ya existente) con referencia a `entranceCategoryId`
5. Decrementar `availableCapacity` de la categoría de acceso

---

## 📊 Ejemplo de Uso en Producción

### Caso: Estadio de Fútbol

**Configuración de Accesos:**

- Puerta Norte VIP: 800 asientos, acceso preferencial
- Puerta Occidental General: 15,000 asientos
- Puerta Oriental General: 15,000 asientos
- Puerta Sur Estudiantil: 9,200 asientos

**Restricciones:**

- Puerta Estudiantil: 18-28 años, requiere carnet
- Puerta VIP: Acceso con pase especial
- Puertas Generales: Sin restricciones

**Horarios:**

- Todas las puertas abren 2 horas antes del evento
- Puerta VIP con acceso extendido (3 horas antes)

Todo esto se configura en **una sola llamada** al endpoint `POST /venues/{venueId}/entrances`.

---

## 📞 Archivos Importantes

1. **`create-entrance-tables.ps1`** - Script para crear tablas
2. **`ENTRANCES_API.md`** - Documentación completa de la API
3. **`src/createEntranceHandler.js`** - Crear configuración completa
4. **`src/getEntrancesHandler.js`** - Obtener entradas de un venue
5. **`src/updateEntranceHandler.js`** - Actualizar configuración
6. **`src/deleteEntranceHandler.js`** - Eliminar configuración
7. **`serverless.yml`** - Configuración actualizada con nuevos endpoints

---

## ⚠️ Próximos Pasos

1. **Ejecutar script de creación de tablas**

   ```powershell
   .\create-entrance-tables.ps1
   ```

2. **Desplegar lambdas**

   ```powershell
   serverless deploy
   ```

3. **Probar endpoints** con Postman o curl

4. **Integrar con `aws-lambda-manageevents`**
   - Agregar campo `entranceConfigId` al crear eventos
   - Modificar lógica de venta de tickets

---

**¿Necesitas ayuda?** Toda la documentación está en `ENTRANCES_API.md`
