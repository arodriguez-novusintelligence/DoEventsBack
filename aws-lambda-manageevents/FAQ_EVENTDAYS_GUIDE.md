# Guía de Uso: FAQ y EventDays

## 📋 Descripción

Esta guía describe los nuevos campos `faq` y `eventDays` agregados al modelo de eventos en `aws-lambda-manageevents`.

## 🆕 Campos Agregados

### 1. FAQ (Preguntas Frecuentes)

Campo opcional que almacena un array de preguntas y respuestas frecuentes sobre el evento.

**Tipo:** `Array<Object>`

**Estructura:**
```json
{
  "question": "string",  // Pregunta
  "answer": "string"     // Respuesta
}
```

### 2. EventDays (Agenda del Evento)

Campo opcional que almacena la agenda estructurada del evento por días, donde cada día contiene múltiples actividades con información detallada.

**Tipo:** `Array<Object>`

**Estructura:**
```json
{
  "id": "string",              // UUID del día
  "dayName": "string",         // Nombre del día (ej: "Día 1", "Primer Día")
  "date": "string",            // Fecha ISO (ej: "2024-12-25T00:00:00.000Z")
  "activities": [              // Array de actividades del día
    {
      "id": "string",          // UUID de la actividad
      "startTime": "string",   // Hora inicio ISO
      "endTime": "string",     // Hora fin ISO
      "startTimeDisplay": "string",  // Hora inicio formato display (ej: "09:00 A.M")
      "endTimeDisplay": "string",    // Hora fin formato display (ej: "10:30 A.M")
      "description": "string", // Descripción de la actividad
      "responsible": {         // Responsable (objeto o string)
        "id": "string",        // ID del usuario
        "nombre": "string",
        "apellido": "string",
        "email": "string",
        "username": "string",
        "displayName": "string"
      }
      // O simplemente:
      // "responsible": "Nombre del Responsable"  // String legacy
      // O:
      // "responsible": null  // Si no hay responsable
    }
  ]
}
```

## 📝 Ejemplos de Uso

### Ejemplo 1: Crear Evento con FAQ y EventDays

**Endpoint:** `POST /events`

**Request Body:**
```json
{
  "nombre": "Conferencia Tech 2025",
  "descripcion": "Conferencia anual de tecnología",
  "fechaIni": "25/12/2024",
  "fechaFin": "26/12/2024",
  "horaIni": "09:00",
  "horaFin": "18:00",
  "userId": "user-123",
  "organizerName": "Tech Events",
  "email": "info@techevents.com",
  "tipoEvento": "Conferencia",
  "Categoria": "Tecnología",
  "aforo": 500,
  "modalidadEvt": "public",
  "pais": "Colombia",
  "ciudad": "Bogotá",
  "direccion": "Centro de Convenciones",
  "faq": [
    {
      "question": "¿Cuál es el horario del evento?",
      "answer": "El evento será de 9:00 AM a 6:00 PM"
    },
    {
      "question": "¿Hay estacionamiento?",
      "answer": "Sí, hay estacionamiento gratuito disponible"
    },
    {
      "question": "¿Se entrega certificado?",
      "answer": "Sí, se entrega certificado de participación al finalizar el evento"
    }
  ],
  "eventDays": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "dayName": "Día 1",
      "date": "2024-12-25T00:00:00.000Z",
      "activities": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440011",
          "startTime": "2024-12-25T09:00:00.000Z",
          "endTime": "2024-12-25T10:30:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "10:30 A.M",
          "description": "Registro y bienvenida",
          "responsible": {
            "id": "user-456",
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "juan.perez@example.com",
            "username": "juanperez",
            "displayName": "Juan Pérez"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440012",
          "startTime": "2024-12-25T11:00:00.000Z",
          "endTime": "2024-12-25T12:30:00.000Z",
          "startTimeDisplay": "11:00 A.M",
          "endTimeDisplay": "12:30 P.M",
          "description": "Conferencia principal: El futuro de la IA",
          "responsible": "María González"
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440013",
          "startTime": "2024-12-25T14:00:00.000Z",
          "endTime": "2024-12-25T16:00:00.000Z",
          "startTimeDisplay": "02:00 P.M",
          "endTimeDisplay": "04:00 P.M",
          "description": "Panel: Tendencias en desarrollo web",
          "responsible": null
        }
      ]
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "dayName": "Día 2",
      "date": "2024-12-26T00:00:00.000Z",
      "activities": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440021",
          "startTime": "2024-12-26T09:00:00.000Z",
          "endTime": "2024-12-26T11:00:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "11:00 A.M",
          "description": "Workshop: Introducción a React",
          "responsible": {
            "id": "user-789",
            "nombre": "Carlos",
            "apellido": "Rodríguez",
            "email": "carlos.rodriguez@example.com",
            "username": "carlosr",
            "displayName": "Carlos Rodríguez"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440022",
          "startTime": "2024-12-26T14:00:00.000Z",
          "endTime": "2024-12-26T15:30:00.000Z",
          "startTimeDisplay": "02:00 P.M",
          "endTimeDisplay": "03:30 P.M",
          "description": "Taller práctico: Desarrollo de APIs con Node.js",
          "responsible": "Ana Martínez"
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "exitoso",
  "data": {
    "statusDesc": "Evento creado exitosamente",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "createDate": "2025-01-13T10:30:00.000Z"
  }
}
```

### Ejemplo 2: Actualizar Solo FAQ

**Endpoint:** `PUT /events/{eventId}`

**Request Body:**
```json
{
  "faq": [
    {
      "question": "¿Cuál es el horario del evento?",
      "answer": "El evento será de 9:00 AM a 6:00 PM todos los días"
    },
    {
      "question": "¿Hay estacionamiento?",
      "answer": "Sí, hay estacionamiento gratuito disponible para asistentes"
    },
    {
      "question": "¿Se entrega certificado?",
      "answer": "Sí, se entrega certificado de participación digital"
    },
    {
      "question": "¿Qué incluye la entrada?",
      "answer": "La entrada incluye acceso a todas las conferencias, talleres y coffee breaks"
    }
  ]
}
```

### Ejemplo 3: Actualizar Solo EventDays

**Endpoint:** `PUT /events/{eventId}`

**Request Body:**
```json
{
  "eventDays": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "dayName": "Día 1 - Conferencias",
      "date": "2024-12-25T00:00:00.000Z",
      "activities": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440011",
          "startTime": "2024-12-25T08:30:00.000Z",
          "endTime": "2024-12-25T09:00:00.000Z",
          "startTimeDisplay": "08:30 A.M",
          "endTimeDisplay": "09:00 A.M",
          "description": "Registro y acreditación",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440012",
          "startTime": "2024-12-25T09:00:00.000Z",
          "endTime": "2024-12-25T10:00:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "10:00 A.M",
          "description": "Inauguración y palabras de bienvenida",
          "responsible": "Director General"
        }
      ]
    }
  ]
}
```

### Ejemplo 4: Evento Simple Sin FAQ ni EventDays

Si no se requieren estos campos, simplemente no se incluyen en el request:

```json
{
  "nombre": "Evento Básico",
  "descripcion": "Un evento sencillo",
  "fechaIni": "15/03/2025",
  "fechaFin": "15/03/2025",
  "horaIni": "10:00",
  "horaFin": "18:00",
  "userId": "user-123",
  "organizerName": "Organizador",
  "email": "info@evento.com",
  "tipoEvento": "Conferencia",
  "Categoria": "Negocios",
  "aforo": 100,
  "modalidadEvt": "public"
}
```

## 🔍 Casos de Uso

### 1. Evento de Un Solo Día

Para eventos de un solo día, incluir un solo elemento en `eventDays`:

```json
{
  "eventDays": [
    {
      "id": "unique-id",
      "dayName": "Evento Principal",
      "date": "2024-12-25T00:00:00.000Z",
      "activities": [
        // ... actividades del día
      ]
    }
  ]
}
```

### 2. Evento de Múltiples Días

Para eventos de varios días, incluir un elemento por cada día:

```json
{
  "eventDays": [
    {
      "id": "day-1-id",
      "dayName": "Día 1",
      "date": "2024-12-25T00:00:00.000Z",
      "activities": [/* ... */]
    },
    {
      "id": "day-2-id",
      "dayName": "Día 2",
      "date": "2024-12-26T00:00:00.000Z",
      "activities": [/* ... */]
    },
    {
      "id": "day-3-id",
      "dayName": "Día 3",
      "date": "2024-12-27T00:00:00.000Z",
      "activities": [/* ... */]
    }
  ]
}
```

### 3. FAQ Extendido

Para eventos complejos, agregar todas las preguntas frecuentes necesarias:

```json
{
  "faq": [
    {
      "question": "¿Cuál es el horario del evento?",
      "answer": "El evento inicia a las 9:00 AM y finaliza a las 6:00 PM"
    },
    {
      "question": "¿Dónde está ubicado el evento?",
      "answer": "En el Centro de Convenciones, Calle 100 #10-20"
    },
    {
      "question": "¿Cómo llegar?",
      "answer": "Puedes llegar en TransMilenio (estación Calle 100) o en vehículo particular"
    },
    {
      "question": "¿Hay restricciones de edad?",
      "answer": "El evento es para mayores de 18 años"
    },
    {
      "question": "¿Se puede cancelar o devolver el ticket?",
      "answer": "Sí, puedes solicitar reembolso hasta 48 horas antes del evento"
    }
  ]
}
```

## ✅ Validaciones

### FAQ
- ✅ Campo opcional
- ✅ Debe ser un array
- ✅ Cada elemento debe tener `question` y `answer` como strings
- ✅ Si se envía vacío o `null`, no se guarda en la base de datos

### EventDays
- ✅ Campo opcional
- ✅ Debe ser un array
- ✅ Cada día debe tener: `id`, `dayName`, `date`, `activities`
- ✅ `activities` debe ser un array
- ✅ Cada actividad debe tener: `id`, `startTime`, `endTime`, `description`
- ✅ `responsible` puede ser: objeto completo, string, o null
- ✅ Si se envía vacío o `null`, no se guarda en la base de datos

## 📊 Formato de Responsables

El campo `responsible` dentro de las actividades puede tener tres formatos:

### 1. Objeto Completo (Recomendado)
```json
{
  "responsible": {
    "id": "user-123",
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "juan.perez@example.com",
    "username": "juanperez",
    "displayName": "Juan Pérez"
  }
}
```

### 2. String Simple (Legacy)
```json
{
  "responsible": "María González"
}
```

### 3. Null (Sin Responsable)
```json
{
  "responsible": null
}
```

## 🔄 Actualización Parcial

Puedes actualizar solo uno de los campos sin afectar el otro:

```json
// Solo actualizar FAQ
{
  "faq": [/* nuevos FAQ */]
}

// Solo actualizar EventDays
{
  "eventDays": [/* nuevos días */]
}

// Actualizar ambos
{
  "faq": [/* nuevos FAQ */],
  "eventDays": [/* nuevos días */]
}
```

## 📌 Notas Importantes

1. **IDs únicos:** Genera UUIDs únicos para cada día y actividad
2. **Fechas ISO:** Usa formato ISO 8601 para fechas y horas
3. **Display Times:** Proporciona formatos legibles para el frontend
4. **Compatibilidad:** Los campos son opcionales y no afectan eventos existentes
5. **Array validation:** El sistema valida que sean arrays antes de guardar

## 🚀 Integración con Frontend

### Ejemplo de Renderizado de FAQ

```javascript
// React/Vue/Angular ejemplo
eventData.faq?.map(item => (
  <div key={item.question}>
    <h3>{item.question}</h3>
    <p>{item.answer}</p>
  </div>
))
```

### Ejemplo de Renderizado de Agenda

```javascript
// React/Vue/Angular ejemplo
eventData.eventDays?.map(day => (
  <div key={day.id}>
    <h2>{day.dayName}</h2>
    <p>{new Date(day.date).toLocaleDateString()}</p>
    {day.activities.map(activity => (
      <div key={activity.id}>
        <span>{activity.startTimeDisplay} - {activity.endTimeDisplay}</span>
        <p>{activity.description}</p>
        {activity.responsible && (
          <span>
            Responsable: {
              typeof activity.responsible === 'string' 
                ? activity.responsible 
                : activity.responsible.displayName
            }
          </span>
        )}
      </div>
    ))}
  </div>
))
```

## 🎯 Endpoints Afectados

Los siguientes endpoints ahora soportan `faq` y `eventDays`:

- ✅ `POST /events` - Crear evento
- ✅ `PUT /events/{eventId}` - Actualizar evento
- ⚠️ `GET /events/{eventId}` - Obtener evento (devuelve los campos si existen)
- ⚠️ `GET /events` - Listar eventos (devuelve los campos si existen)

## 💡 Tips

1. **Generación de IDs:** Usa `uuid` library para generar IDs únicos
2. **Formato de hora:** Mantén consistencia en el formato de display
3. **Responsables:** Usa el objeto completo cuando tengas la información del usuario
4. **Validación Frontend:** Valida los datos antes de enviarlos
5. **Actualización:** Al actualizar, envía el array completo, no solo los cambios

## 📞 Soporte

Para más información sobre el modelo de eventos, consulta:
- [MODELO_EVENT_ACTUALIZADO.md](./MODELO_EVENT_ACTUALIZADO.md)
- [MANAGEEVENTS_API.md](./MANAGEEVENTS_API.md)
