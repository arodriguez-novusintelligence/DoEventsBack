# Ejemplos de Requests - FAQ y EventDays

## 📝 Ejemplo 1: Crear Evento Completo con FAQ y EventDays

### Endpoint
```
POST https://your-api-gateway-url/dev/events
Content-Type: application/json
```

### Request Body
```json
{
  "nombre": "Conferencia Tech Colombia 2025",
  "descripcion": "La conferencia más grande de tecnología en Colombia. Dos días completos de aprendizaje, networking y talleres prácticos con expertos internacionales.",
  "fechaIni": "25/12/2024",
  "fechaFin": "26/12/2024",
  "horaIni": "09:00",
  "horaFin": "18:00",
  "userId": "user-123-abc",
  "organizerName": "Tech Events Colombia SAS",
  "email": "info@techevents.co",
  "TelPrin": "3001234567",
  "IndicativoTelPrinOrg": "+57",
  "tipoEvento": "Conferencia",
  "Categoria": "Tecnología",
  "aforo": 500,
  "modalidadEvt": "public",
  "pais": "Colombia",
  "ciudad": "Bogotá",
  "direccion": "Centro de Convenciones Gonzalo Jiménez de Quesada, Calle 24",
  "departamento": "Cundinamarca",
  "clase": "premium",
  "Hashtags": "#TechColombia #Tech2025 #IA #Desarrollo",
  "timezone": "America/Bogota",
  "currency": "COP",
  "faq": [
    {
      "question": "¿Cuál es el horario del evento?",
      "answer": "El evento será de 9:00 AM a 6:00 PM ambos días (25 y 26 de diciembre de 2024)"
    },
    {
      "question": "¿Hay estacionamiento disponible?",
      "answer": "Sí, hay estacionamiento gratuito disponible para todos los asistentes en el sótano del centro de convenciones"
    },
    {
      "question": "¿Se entrega certificado de participación?",
      "answer": "Sí, se entrega certificado de participación digital al finalizar el evento. Debe asistir al menos al 80% de las actividades"
    },
    {
      "question": "¿Qué incluye la entrada?",
      "answer": "La entrada incluye acceso a todas las conferencias, talleres, coffee breaks, almuerzo y kit de bienvenida"
    },
    {
      "question": "¿Puedo obtener reembolso?",
      "answer": "Sí, puedes solicitar reembolso hasta 7 días antes del evento con una penalidad del 10%"
    },
    {
      "question": "¿Hay descuentos para grupos?",
      "answer": "Sí, ofrecemos 15% de descuento para grupos de 5 o más personas"
    }
  ],
  "eventDays": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "dayName": "Día 1 - Conferencias y Keynotes",
      "date": "2024-12-25T00:00:00.000Z",
      "activities": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440011",
          "startTime": "2024-12-25T09:00:00.000Z",
          "endTime": "2024-12-25T09:30:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "09:30 A.M",
          "description": "Registro, acreditación y entrega de kits de bienvenida",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440012",
          "startTime": "2024-12-25T09:30:00.000Z",
          "endTime": "2024-12-25T10:00:00.000Z",
          "startTimeDisplay": "09:30 A.M",
          "endTimeDisplay": "10:00 A.M",
          "description": "Ceremonia de inauguración y palabras de bienvenida",
          "responsible": {
            "id": "user-456",
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "juan.perez@techevents.co",
            "username": "juanperez",
            "displayName": "Juan Pérez - Director General"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440013",
          "startTime": "2024-12-25T10:00:00.000Z",
          "endTime": "2024-12-25T11:30:00.000Z",
          "startTimeDisplay": "10:00 A.M",
          "endTimeDisplay": "11:30 A.M",
          "description": "Keynote: El futuro de la Inteligencia Artificial en Latinoamérica",
          "responsible": {
            "id": "speaker-001",
            "nombre": "Ana",
            "apellido": "García",
            "email": "ana.garcia@ai-institute.com",
            "username": "anagarcia",
            "displayName": "Dra. Ana García - AI Research Institute"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440014",
          "startTime": "2024-12-25T11:30:00.000Z",
          "endTime": "2024-12-25T12:00:00.000Z",
          "startTimeDisplay": "11:30 A.M",
          "endTimeDisplay": "12:00 P.M",
          "description": "Coffee break y networking",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440015",
          "startTime": "2024-12-25T12:00:00.000Z",
          "endTime": "2024-12-25T13:00:00.000Z",
          "startTimeDisplay": "12:00 P.M",
          "endTimeDisplay": "01:00 P.M",
          "description": "Panel: Tendencias en Desarrollo Web y Mobile 2025",
          "responsible": "María González - Moderadora"
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440016",
          "startTime": "2024-12-25T13:00:00.000Z",
          "endTime": "2024-12-25T14:00:00.000Z",
          "startTimeDisplay": "01:00 P.M",
          "endTimeDisplay": "02:00 P.M",
          "description": "Almuerzo",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440017",
          "startTime": "2024-12-25T14:00:00.000Z",
          "endTime": "2024-12-25T15:30:00.000Z",
          "startTimeDisplay": "02:00 P.M",
          "endTimeDisplay": "03:30 P.M",
          "description": "Conferencia: Arquitecturas Cloud Native y Microservicios",
          "responsible": {
            "id": "speaker-002",
            "nombre": "Carlos",
            "apellido": "Rodríguez",
            "email": "carlos.rodriguez@cloudtech.com",
            "username": "carlosr",
            "displayName": "Carlos Rodríguez - Cloud Architect"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440018",
          "startTime": "2024-12-25T15:30:00.000Z",
          "endTime": "2024-12-25T16:00:00.000Z",
          "startTimeDisplay": "03:30 P.M",
          "endTimeDisplay": "04:00 P.M",
          "description": "Coffee break",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440019",
          "startTime": "2024-12-25T16:00:00.000Z",
          "endTime": "2024-12-25T18:00:00.000Z",
          "startTimeDisplay": "04:00 P.M",
          "endTimeDisplay": "06:00 P.M",
          "description": "Workshop: Introducción a React y Next.js - Sesión práctica",
          "responsible": "Laura Martínez - Frontend Lead"
        }
      ]
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "dayName": "Día 2 - Talleres Prácticos y Cierre",
      "date": "2024-12-26T00:00:00.000Z",
      "activities": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440021",
          "startTime": "2024-12-26T09:00:00.000Z",
          "endTime": "2024-12-26T11:00:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "11:00 A.M",
          "description": "Workshop: Desarrollo de APIs REST con Node.js y Express",
          "responsible": {
            "id": "speaker-003",
            "nombre": "Miguel",
            "apellido": "Sánchez",
            "email": "miguel.sanchez@backend.dev",
            "username": "miguels",
            "displayName": "Miguel Sánchez - Backend Developer"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440022",
          "startTime": "2024-12-26T11:00:00.000Z",
          "endTime": "2024-12-26T11:30:00.000Z",
          "startTimeDisplay": "11:00 A.M",
          "endTimeDisplay": "11:30 A.M",
          "description": "Coffee break",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440023",
          "startTime": "2024-12-26T11:30:00.000Z",
          "endTime": "2024-12-26T13:00:00.000Z",
          "startTimeDisplay": "11:30 A.M",
          "endTimeDisplay": "01:00 P.M",
          "description": "Workshop: Machine Learning con Python - Casos prácticos",
          "responsible": {
            "id": "speaker-004",
            "nombre": "Patricia",
            "apellido": "López",
            "email": "patricia.lopez@ml-academy.com",
            "username": "patricial",
            "displayName": "Patricia López - ML Engineer"
          }
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440024",
          "startTime": "2024-12-26T13:00:00.000Z",
          "endTime": "2024-12-26T14:00:00.000Z",
          "startTimeDisplay": "01:00 P.M",
          "endTimeDisplay": "02:00 P.M",
          "description": "Almuerzo",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440025",
          "startTime": "2024-12-26T14:00:00.000Z",
          "endTime": "2024-12-26T15:30:00.000Z",
          "startTimeDisplay": "02:00 P.M",
          "endTimeDisplay": "03:30 P.M",
          "description": "Conferencia: DevOps y CI/CD - Mejores prácticas",
          "responsible": "Roberto Díaz - DevOps Engineer"
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440026",
          "startTime": "2024-12-26T15:30:00.000Z",
          "endTime": "2024-12-26T16:00:00.000Z",
          "startTimeDisplay": "03:30 P.M",
          "endTimeDisplay": "04:00 P.M",
          "description": "Coffee break y última sesión de networking",
          "responsible": null
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440027",
          "startTime": "2024-12-26T16:00:00.000Z",
          "endTime": "2024-12-26T17:30:00.000Z",
          "startTimeDisplay": "04:00 P.M",
          "endTimeDisplay": "05:30 P.M",
          "description": "Panel de cierre: El futuro del desarrollo de software",
          "responsible": "Panel de expertos"
        },
        {
          "id": "550e8400-e29b-41d4-a716-446655440028",
          "startTime": "2024-12-26T17:30:00.000Z",
          "endTime": "2024-12-26T18:00:00.000Z",
          "startTimeDisplay": "05:30 P.M",
          "endTimeDisplay": "06:00 P.M",
          "description": "Ceremonia de cierre y entrega de certificados",
          "responsible": {
            "id": "user-456",
            "nombre": "Juan",
            "apellido": "Pérez",
            "email": "juan.perez@techevents.co",
            "username": "juanperez",
            "displayName": "Juan Pérez - Director General"
          }
        }
      ]
    }
  ]
}
```

## 📝 Ejemplo 2: Request Mínimo (Solo Campos Básicos)

```json
{
  "nombre": "Evento Básico",
  "descripcion": "Un evento simple sin FAQ ni agenda",
  "fechaIni": "15/03/2025",
  "fechaFin": "15/03/2025",
  "horaIni": "10:00",
  "horaFin": "18:00",
  "userId": "user-789",
  "organizerName": "Organizador Simple",
  "email": "info@evento.com",
  "TelPrin": "3009876543",
  "tipoEvento": "Conferencia",
  "Categoria": "Negocios",
  "aforo": 100,
  "modalidadEvt": "public",
  "pais": "Colombia",
  "ciudad": "Medellín",
  "direccion": "Calle 50 #45-30"
}
```

## 📝 Ejemplo 3: Actualizar Solo FAQ

### Endpoint
```
PUT https://your-api-gateway-url/dev/events/{eventId}
Content-Type: application/json
```

### Request Body
```json
{
  "faq": [
    {
      "question": "¿Cuál es el horario del evento?",
      "answer": "El evento será de 9:00 AM a 6:00 PM"
    },
    {
      "question": "¿Hay estacionamiento disponible?",
      "answer": "Sí, hay estacionamiento gratuito para asistentes"
    },
    {
      "question": "¿Se entrega certificado?",
      "answer": "Sí, certificado digital al finalizar"
    },
    {
      "question": "¿Qué incluye la entrada?",
      "answer": "Acceso a todas las actividades, coffee breaks y almuerzo"
    }
  ]
}
```

## 📝 Ejemplo 4: Actualizar Solo EventDays

### Endpoint
```
PUT https://your-api-gateway-url/dev/events/{eventId}
Content-Type: application/json
```

### Request Body
```json
{
  "eventDays": [
    {
      "id": "day-unique-id-1",
      "dayName": "Día Único",
      "date": "2025-03-20T00:00:00.000Z",
      "activities": [
        {
          "id": "activity-1",
          "startTime": "2025-03-20T09:00:00.000Z",
          "endTime": "2025-03-20T10:00:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "10:00 A.M",
          "description": "Apertura del evento",
          "responsible": null
        },
        {
          "id": "activity-2",
          "startTime": "2025-03-20T10:00:00.000Z",
          "endTime": "2025-03-20T12:00:00.000Z",
          "startTimeDisplay": "10:00 A.M",
          "endTimeDisplay": "12:00 P.M",
          "description": "Conferencia principal",
          "responsible": "Speaker Principal"
        }
      ]
    }
  ]
}
```

## 📝 Ejemplo 5: Evento de 1 Solo Día con Agenda

```json
{
  "nombre": "Workshop de React",
  "descripcion": "Workshop intensivo de React para principiantes",
  "fechaIni": "10/04/2025",
  "fechaFin": "10/04/2025",
  "horaIni": "09:00",
  "horaFin": "17:00",
  "userId": "user-react-123",
  "organizerName": "React Academy",
  "email": "info@reactacademy.co",
  "TelPrin": "3001111111",
  "tipoEvento": "Workshop",
  "Categoria": "Tecnología",
  "aforo": 30,
  "modalidadEvt": "public",
  "pais": "Colombia",
  "ciudad": "Cali",
  "direccion": "Avenida 6N #24-50",
  "faq": [
    {
      "question": "¿Necesito conocimientos previos?",
      "answer": "Sí, se requiere conocimiento básico de JavaScript"
    },
    {
      "question": "¿Qué debo traer?",
      "answer": "Laptop con Node.js instalado"
    }
  ],
  "eventDays": [
    {
      "id": "workshop-day-1",
      "dayName": "Workshop Completo",
      "date": "2025-04-10T00:00:00.000Z",
      "activities": [
        {
          "id": "ws-act-1",
          "startTime": "2025-04-10T09:00:00.000Z",
          "endTime": "2025-04-10T10:30:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "10:30 A.M",
          "description": "Introducción a React y JSX",
          "responsible": {
            "id": "instructor-1",
            "nombre": "Sandra",
            "apellido": "Jiménez",
            "email": "sandra@reactacademy.co",
            "username": "sandraj",
            "displayName": "Sandra Jiménez - React Instructor"
          }
        },
        {
          "id": "ws-act-2",
          "startTime": "2025-04-10T10:30:00.000Z",
          "endTime": "2025-04-10T12:00:00.000Z",
          "startTimeDisplay": "10:30 A.M",
          "endTimeDisplay": "12:00 P.M",
          "description": "Componentes y Props",
          "responsible": {
            "id": "instructor-1",
            "nombre": "Sandra",
            "apellido": "Jiménez",
            "email": "sandra@reactacademy.co",
            "username": "sandraj",
            "displayName": "Sandra Jiménez"
          }
        },
        {
          "id": "ws-act-3",
          "startTime": "2025-04-10T12:00:00.000Z",
          "endTime": "2025-04-10T13:00:00.000Z",
          "startTimeDisplay": "12:00 P.M",
          "endTimeDisplay": "01:00 P.M",
          "description": "Almuerzo",
          "responsible": null
        },
        {
          "id": "ws-act-4",
          "startTime": "2025-04-10T13:00:00.000Z",
          "endTime": "2025-04-10T15:00:00.000Z",
          "startTimeDisplay": "01:00 P.M",
          "endTimeDisplay": "03:00 P.M",
          "description": "State y Lifecycle",
          "responsible": "Sandra Jiménez"
        },
        {
          "id": "ws-act-5",
          "startTime": "2025-04-10T15:00:00.000Z",
          "endTime": "2025-04-10T17:00:00.000Z",
          "startTimeDisplay": "03:00 P.M",
          "endTimeDisplay": "05:00 P.M",
          "description": "Proyecto práctico final",
          "responsible": "Sandra Jiménez"
        }
      ]
    }
  ]
}
```

## 🔧 cURL Examples

### Crear Evento
```bash
curl -X POST https://your-api-gateway-url/dev/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @create-event-request.json
```

### Actualizar FAQ
```bash
curl -X PUT https://your-api-gateway-url/dev/events/EVENT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "faq": [
      {
        "question": "Nueva pregunta",
        "answer": "Nueva respuesta"
      }
    ]
  }'
```

### Actualizar EventDays
```bash
curl -X PUT https://your-api-gateway-url/dev/events/EVENT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @update-eventdays-request.json
```

## 💡 Tips para Generar IDs

### JavaScript/Node.js
```javascript
const { v4: uuidv4 } = require('uuid');

// Generar IDs para días
const dayId = uuidv4(); // "550e8400-e29b-41d4-a716-446655440001"

// Generar IDs para actividades
const activityId = uuidv4(); // "550e8400-e29b-41d4-a716-446655440011"
```

### Python
```python
import uuid

# Generar IDs
day_id = str(uuid.uuid4())
activity_id = str(uuid.uuid4())
```

### Postman Pre-request Script
```javascript
// Generar UUID en Postman
pm.globals.set("day_id", pm.variables.replaceIn('{{$guid}}'));
pm.globals.set("activity_id", pm.variables.replaceIn('{{$guid}}'));
```

## 📌 Notas Importantes

1. **IDs**: Los IDs deben ser únicos. Usa UUIDs v4
2. **Fechas**: Formato ISO 8601 para `date`, `startTime`, `endTime`
3. **Display Times**: Proporciona formato legible para el usuario
4. **Responsible**: Puede ser objeto completo, string, o null
5. **Arrays vacíos**: No envíes arrays vacíos `[]`, mejor omite el campo

## ✅ Validación de Request

Antes de enviar, valida:
- ✅ Todos los IDs son únicos
- ✅ Fechas en formato correcto
- ✅ `faq` es un array de objetos con `question` y `answer`
- ✅ `eventDays` es un array de objetos con la estructura correcta
- ✅ Campos requeridos presentes: nombre, descripcion, fechas, etc.
