# API de Gestión de Accesos/Puertas de Venues

## Descripción General

Este sistema gestiona **accesos físicos (puertas de entrada)** para venues. Permite definir diferentes puertas de acceso con categorías específicas para controlar el flujo de personas en eventos.

> **IMPORTANTE:** Este sistema gestiona **accesos físicos**, no precios. Los precios se manejan en el sistema de tickets/eventos.

---

## Estructura de Tablas DynamoDB

### 1. Tabla: `Venue_Entrance`

Configuración principal de accesos para un venue.

**Campos:**

| Campo                 | Tipo         | Descripción                                        |
| --------------------- | ------------ | -------------------------------------------------- |
| `entranceId`          | String (PK)  | ID único del acceso                                |
| `venueId`             | String (GSI) | ID del venue                                       |
| `name`                | String       | Nombre del acceso (ej: "Accesos Estadio Nacional") |
| `description`         | String       | Descripción del acceso                             |
| `type`                | String       | Tipo: general, vip, accessible, emergency          |
| `isActive`            | Boolean      | Si está activo                                     |
| `capacity`            | Number       | Capacidad total de personas                        |
| `availableCapacity`   | Number       | Capacidad disponible                               |
| `requiresReservation` | Boolean      | Si requiere reserva                                |
| `allowsGroupBooking`  | Boolean      | Si permite reservas grupales                       |
| `minGroupSize`        | Number       | Tamaño mínimo de grupo                             |
| `maxGroupSize`        | Number       | Tamaño máximo de grupo                             |
| `validFrom`           | String (ISO) | Fecha desde cuando es válido                       |
| `validUntil`          | String (ISO) | Fecha hasta cuando es válido                       |
| `metadata`            | Object       | Datos adicionales                                  |
| `createdAt`           | String (ISO) | Fecha de creación                                  |
| `updatedAt`           | String (ISO) | Fecha de actualización                             |
| `createdBy`           | String       | Usuario creador                                    |
| `updatedBy`           | String       | Usuario que actualizó                              |

**Índices:**

- Primary Key: `entranceId`
- GSI: `venueIdIndex` (venueId)

---

### 2. Tabla: `Venue_Entrance_Category`

Categorías de acceso (puertas específicas) dentro de un venue.

**Campos:**

| Campo                   | Tipo          | Descripción                                             |
| ----------------------- | ------------- | ------------------------------------------------------- |
| `entranceCategoryId`    | String (PK)   | ID único de la categoría                                |
| `entranceId`            | String (GSI)  | ID del acceso padre                                     |
| `venueId`               | String (GSI)  | ID del venue                                            |
| `name`                  | String        | Nombre (ej: "Puerta VIP Norte")                         |
| `description`           | String        | Descripción                                             |
| `type`                  | String        | Tipo: vip, standard, student, senior, child, accessible |
| `capacity`              | Number        | Capacidad de esta puerta                                |
| `availableCapacity`     | Number        | Capacidad disponible                                    |
| `minAge`                | Number        | Edad mínima (opcional)                                  |
| `maxAge`                | Number        | Edad máxima (opcional)                                  |
| `requiresDocumentation` | Boolean       | Si requiere documentación especial                      |
| `allowedDays`           | Array<String> | Días permitidos ["monday", "tuesday", ...]              |
| `allowedTimeRanges`     | Array<Object> | Rangos horarios [{start: "09:00", end: "17:00"}]        |
| `priority`              | Number        | Prioridad de uso                                        |
| `sortOrder`             | Number        | Orden de presentación                                   |
| `isActive`              | Boolean       | Si está activo                                          |
| `metadata`              | Object        | Datos adicionales                                       |
| `createdAt`             | String (ISO)  | Fecha de creación                                       |
| `createdBy`             | String        | Usuario creador                                         |

**Índices:**

- Primary Key: `entranceCategoryId`
- GSI: `venueIdIndex` (venueId)
- GSI: `entranceIdIndex` (entranceId)

---

## Endpoints API

### 1. Crear Configuración de Accesos

**Endpoint:** `POST /venues/{venueId}/entrances`

**Descripción:** Crea una configuración de accesos para un venue, incluyendo categorías (puertas específicas).

**Request Body:**

```json
{
  "name": "Accesos Estadio Nacional",
  "description": "Puertas de acceso para el estadio",
  "type": "general",
  "capacity": 50000,
  "requiresReservation": false,
  "allowsGroupBooking": true,
  "minGroupSize": 1,
  "maxGroupSize": 10,
  "validFrom": "2025-01-01T00:00:00Z",
  "validUntil": "2025-12-31T23:59:59Z",
  "categories": [
    {
      "name": "Puerta VIP Norte",
      "description": "Acceso preferencial VIP",
      "type": "vip",
      "capacity": 1000,
      "requiresDocumentation": true,
      "allowedDays": [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
      ],
      "priority": 1
    },
    {
      "name": "Puerta General Occidental",
      "type": "standard",
      "capacity": 20000,
      "allowedDays": ["saturday", "sunday"]
    },
    {
      "name": "Puerta Estudiantil Sur",
      "type": "student",
      "capacity": 5000,
      "minAge": 18,
      "maxAge": 28,
      "requiresDocumentation": true
    }
  ]
}
```

**Response (201):**

```json
{
  "message": "Entrance configuration created successfully",
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "venueId": "venue-456",
    "name": "Accesos Estadio Nacional",
    "type": "general",
    "capacity": 50000,
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

### 2. Obtener Todos los Accesos de un Venue

**Endpoint:** `GET /venues/{venueId}/entrances`

**Descripción:** Obtiene todas las configuraciones de accesos de un venue con sus categorías.

**Response (200):**

```json
{
  "venueId": "venue-456",
  "entrances": [
    {
      "entranceId": "entrance-uuid-123",
      "venueId": "venue-456",
      "name": "Accesos Estadio Nacional",
      "type": "general",
      "capacity": 50000,
      "availableCapacity": 48500,
      "categories": [
        {
          "entranceCategoryId": "category-uuid-789",
          "name": "Puerta VIP Norte",
          "type": "vip",
          "capacity": 1000,
          "availableCapacity": 950
        }
      ]
    }
  ],
  "total": 1
}
```

---

### 3. Obtener Acceso Específico

**Endpoint:** `GET /venues/{venueId}/entrances/{entranceId}`

**Descripción:** Obtiene una configuración de acceso específica con todas sus categorías.

**Response (200):**

```json
{
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "venueId": "venue-456",
    "name": "Accesos Estadio Nacional",
    "description": "Puertas de acceso para el estadio",
    "type": "general",
    "capacity": 50000,
    "availableCapacity": 48500,
    "requiresReservation": false,
    "allowsGroupBooking": true,
    "categories": [
      {
        "entranceCategoryId": "category-uuid-789",
        "name": "Puerta VIP Norte",
        "type": "vip",
        "capacity": 1000,
        "availableCapacity": 950,
        "requiresDocumentation": true,
        "allowedDays": [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday"
        ]
      }
    ]
  }
}
```

---

### 4. Actualizar Configuración de Acceso

**Endpoint:** `PUT /venues/{venueId}/entrances/{entranceId}`

**Descripción:** Actualiza la configuración principal de un acceso (NO las categorías).

**Request Body:**

```json
{
  "name": "Accesos Renovados Estadio Nacional",
  "description": "Configuración actualizada",
  "capacity": 55000,
  "isActive": true
}
```

**Response (200):**

```json
{
  "message": "Entrance configuration updated successfully",
  "entrance": {
    "entranceId": "entrance-uuid-123",
    "name": "Accesos Renovados Estadio Nacional",
    "capacity": 55000,
    "updatedAt": "2025-12-01T10:30:00Z"
  }
}
```

---

### 5. Eliminar Configuración de Acceso

**Endpoint:** `DELETE /venues/{venueId}/entrances/{entranceId}`

**Descripción:** Elimina una configuración de acceso y TODAS sus categorías asociadas.

**Response (200):**

```json
{
  "message": "Entrance configuration deleted successfully",
  "deletedItems": {
    "entrance": 1,
    "categories": 3
  }
}
```

---

### 6. Crear Categoría de Acceso

**Endpoint:** `POST /venues/{venueId}/entrances/{entranceId}/categories`

**Descripción:** Agrega una nueva categoría (puerta) a una configuración de acceso existente.

**Request Body:**

```json
{
  "name": "Puerta Accesibilidad Este",
  "description": "Acceso para personas con movilidad reducida",
  "type": "accessible",
  "capacity": 500,
  "requiresDocumentation": true,
  "allowedDays": [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ],
  "allowedTimeRanges": [
    {
      "start": "08:00",
      "end": "22:00"
    }
  ],
  "priority": 10,
  "sortOrder": 1
}
```

**Response (201):**

```json
{
  "message": "Entrance category created successfully",
  "category": {
    "entranceCategoryId": "category-uuid-999",
    "entranceId": "entrance-uuid-123",
    "venueId": "venue-456",
    "name": "Puerta Accesibilidad Este",
    "type": "accessible",
    "capacity": 500,
    "createdAt": "2025-12-01T11:00:00Z"
  }
}
```

---

### 7. Actualizar Categoría de Acceso

**Endpoint:** `PUT /venues/{venueId}/entrances/{entranceId}/categories/{categoryId}`

**Descripción:** Actualiza una categoría de acceso existente.

**Request Body:**

```json
{
  "name": "Puerta VIP Norte - Premium",
  "capacity": 1200,
  "isActive": true
}
```

**Response (200):**

```json
{
  "message": "Entrance category updated successfully",
  "category": {
    "entranceCategoryId": "category-uuid-789",
    "name": "Puerta VIP Norte - Premium",
    "capacity": 1200,
    "updatedAt": "2025-12-01T11:15:00Z"
  }
}
```

---

## Script de Creación de Tablas

El archivo `create-entrance-tables.ps1` crea las 2 tablas necesarias:

```powershell
# Ejecutar en PowerShell
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-venues
.\create-entrance-tables.ps1
```

---

## Casos de Uso

### Caso 1: Estadio de Fútbol

```json
{
  "name": "Accesos Estadio Municipal",
  "type": "general",
  "capacity": 45000,
  "categories": [
    {
      "name": "Puerta Norte VIP",
      "type": "vip",
      "capacity": 2000
    },
    {
      "name": "Puerta Sur General",
      "type": "standard",
      "capacity": 20000
    },
    {
      "name": "Puerta Este General",
      "type": "standard",
      "capacity": 20000
    },
    {
      "name": "Puerta Oeste Accesibilidad",
      "type": "accessible",
      "capacity": 3000,
      "requiresDocumentation": true
    }
  ]
}
```

### Caso 2: Teatro/Auditorio

```json
{
  "name": "Accesos Teatro Nacional",
  "type": "general",
  "capacity": 1500,
  "categories": [
    {
      "name": "Entrada Principal Platea",
      "type": "standard",
      "capacity": 800,
      "allowedTimeRanges": [{ "start": "18:00", "end": "23:00" }]
    },
    {
      "name": "Entrada Lateral Palcos",
      "type": "vip",
      "capacity": 200,
      "requiresDocumentation": true
    },
    {
      "name": "Entrada Posterior Balcón",
      "type": "standard",
      "capacity": 500
    }
  ]
}
```

### Caso 3: Centro de Convenciones

```json
{
  "name": "Accesos Centro de Convenciones",
  "type": "general",
  "capacity": 10000,
  "requiresReservation": true,
  "categories": [
    {
      "name": "Entrada Expositores",
      "type": "vip",
      "capacity": 1000,
      "requiresDocumentation": true,
      "allowedTimeRanges": [{ "start": "06:00", "end": "22:00" }]
    },
    {
      "name": "Entrada Visitantes General",
      "type": "standard",
      "capacity": 8000,
      "allowedTimeRanges": [{ "start": "09:00", "end": "20:00" }]
    },
    {
      "name": "Entrada Prensa",
      "type": "vip",
      "capacity": 500,
      "requiresDocumentation": true
    }
  ]
}
```

---

## Notas Importantes

### 🚪 Accesos vs Tickets

- **Accesos/Puertas:** Son puntos físicos de entrada al venue
- **Tickets:** Son los boletos vendidos que SE ASIGNAN a una puerta de acceso
- Los **precios** se manejan en el sistema de tickets, NO en este sistema

### 🔄 Flujo de Uso

1. **Configurar Venue:** Crear el venue en `aws-lambda-venues`
2. **Configurar Accesos:** Crear accesos y puertas usando esta API
3. **Crear Evento:** En `aws-lambda-manageevents`, referenciar `entranceConfigId`
4. **Vender Tickets:** Al vender, asignar ticket a una puerta específica (`entranceCategoryId`)
5. **Validar Entrada:** En el evento, escanear QR y validar que el ticket corresponde a la puerta correcta

### ⚡ Capacidad

- `capacity`: Capacidad máxima configurada
- `availableCapacity`: Se va decrementando al asignar tickets
- Al vender un ticket, debe verificarse que haya `availableCapacity > 0`

### 📅 Restricciones

- **allowedDays:** Días en que la puerta está abierta
- **allowedTimeRanges:** Horarios específicos de operación
- **minAge/maxAge:** Restricciones de edad para acceder
- **requiresDocumentation:** Si requiere validación adicional (carnet estudiante, pase VIP, etc.)

### 🔐 Integración con Eventos

Al crear un evento, incluye el campo:

```json
{
  "eventId": "event-123",
  "venueId": "venue-456",
  "entranceConfigId": "entrance-uuid-123"
}
```

Luego, al vender tickets, consulta las categorías disponibles y asigna:

```json
{
  "ticketId": "ticket-789",
  "eventId": "event-123",
  "entranceCategoryId": "category-uuid-789",
  "entranceName": "Puerta VIP Norte"
}
```

---

## Endpoints Resumen

| Método | Endpoint                                                           | Descripción                    |
| ------ | ------------------------------------------------------------------ | ------------------------------ |
| POST   | `/venues/{venueId}/entrances`                                      | Crear configuración de accesos |
| GET    | `/venues/{venueId}/entrances`                                      | Listar todos los accesos       |
| GET    | `/venues/{venueId}/entrances/{entranceId}`                         | Obtener acceso específico      |
| PUT    | `/venues/{venueId}/entrances/{entranceId}`                         | Actualizar acceso              |
| DELETE | `/venues/{venueId}/entrances/{entranceId}`                         | Eliminar acceso                |
| POST   | `/venues/{venueId}/entrances/{entranceId}/categories`              | Crear categoría                |
| PUT    | `/venues/{venueId}/entrances/{entranceId}/categories/{categoryId}` | Actualizar categoría           |

---

**Documentación actualizada:** Diciembre 2025  
**Sistema:** Gestión de Accesos/Puertas de Venues (sin pricing)
