# 🚀 Quick Start: FAQ y EventDays

Guía rápida para empezar a usar los nuevos campos `faq` y `eventDays` en tus eventos.

## ⚡ TL;DR (Too Long; Didn't Read)

```javascript
// Agregar FAQ y EventDays a tu evento
{
  // ... campos básicos del evento ...
  "faq": [
    { "question": "¿Pregunta?", "answer": "Respuesta" }
  ],
  "eventDays": [
    {
      "id": "uuid",
      "dayName": "Día 1",
      "date": "2024-12-25T00:00:00.000Z",
      "activities": [
        {
          "id": "uuid",
          "startTime": "2024-12-25T09:00:00.000Z",
          "endTime": "2024-12-25T10:00:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "10:00 A.M",
          "description": "Actividad",
          "responsible": "Nombre" // o objeto completo o null
        }
      ]
    }
  ]
}
```

## 📝 Paso 1: Instalar uuid (si no lo tienes)

```bash
npm install uuid
```

## 🎯 Paso 2: Crear el Request

### Opción A: JavaScript/Node.js

```javascript
const { v4: uuidv4 } = require('uuid');

const eventRequest = {
  // Campos básicos requeridos
  nombre: "Mi Evento",
  descripcion: "Descripción del evento",
  fechaIni: "25/12/2024",
  fechaFin: "25/12/2024",
  horaIni: "09:00",
  horaFin: "18:00",
  userId: "user-123",
  organizerName: "Mi Organizador",
  email: "info@evento.com",
  TelPrin: "3001234567",
  tipoEvento: "Conferencia",
  Categoria: "Tecnología",
  aforo: 100,
  modalidadEvt: "public",
  pais: "Colombia",
  ciudad: "Bogotá",
  direccion: "Calle 123",
  
  // Nuevo: FAQ
  faq: [
    {
      question: "¿Cuál es el horario?",
      answer: "9:00 AM a 6:00 PM"
    },
    {
      question: "¿Hay estacionamiento?",
      answer: "Sí, gratuito"
    }
  ],
  
  // Nuevo: EventDays
  eventDays: [
    {
      id: uuidv4(),
      dayName: "Día 1",
      date: "2024-12-25T00:00:00.000Z",
      activities: [
        {
          id: uuidv4(),
          startTime: "2024-12-25T09:00:00.000Z",
          endTime: "2024-12-25T10:00:00.000Z",
          startTimeDisplay: "09:00 A.M",
          endTimeDisplay: "10:00 A.M",
          description: "Registro",
          responsible: null
        },
        {
          id: uuidv4(),
          startTime: "2024-12-25T10:00:00.000Z",
          endTime: "2024-12-25T12:00:00.000Z",
          startTimeDisplay: "10:00 A.M",
          endTimeDisplay: "12:00 P.M",
          description: "Conferencia principal",
          responsible: "Juan Pérez"
        }
      ]
    }
  ]
};

// Enviar request
fetch('https://your-api.com/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(eventRequest)
});
```

### Opción B: cURL

Guarda el siguiente JSON en `event.json`:

```json
{
  "nombre": "Mi Evento",
  "descripcion": "Descripción",
  "fechaIni": "25/12/2024",
  "fechaFin": "25/12/2024",
  "horaIni": "09:00",
  "horaFin": "18:00",
  "userId": "user-123",
  "organizerName": "Organizador",
  "email": "info@evento.com",
  "TelPrin": "3001234567",
  "tipoEvento": "Conferencia",
  "Categoria": "Tecnología",
  "aforo": 100,
  "modalidadEvt": "public",
  "pais": "Colombia",
  "ciudad": "Bogotá",
  "direccion": "Calle 123",
  "faq": [
    {"question": "¿Horario?", "answer": "9AM-6PM"}
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
          "endTime": "2024-12-25T10:00:00.000Z",
          "startTimeDisplay": "09:00 A.M",
          "endTimeDisplay": "10:00 A.M",
          "description": "Registro",
          "responsible": null
        }
      ]
    }
  ]
}
```

Luego ejecuta:

```bash
curl -X POST https://your-api.com/events \
  -H "Content-Type: application/json" \
  -d @event.json
```

### Opción C: Postman

1. **Crear nueva request**
   - Method: `POST`
   - URL: `https://your-api-gateway-url/dev/events`

2. **Headers**
   ```
   Content-Type: application/json
   Authorization: Bearer YOUR_TOKEN
   ```

3. **Body (raw JSON)**
   - Copia el JSON del ejemplo de arriba

4. **Pre-request Script** (para generar UUIDs)
   ```javascript
   pm.globals.set("day_id", pm.variables.replaceIn('{{$guid}}'));
   pm.globals.set("activity_id", pm.variables.replaceIn('{{$guid}}'));
   ```

5. **Usar variables en el body**
   ```json
   {
     "eventDays": [
       {
         "id": "{{day_id}}",
         "activities": [
           {
             "id": "{{activity_id}}",
             // ...
           }
         ]
       }
     ]
   }
   ```

## 🔄 Actualizar Evento Existente

### Solo actualizar FAQ

```javascript
const updateRequest = {
  faq: [
    { question: "Nueva pregunta", answer: "Nueva respuesta" }
  ]
};

fetch(`https://your-api.com/events/${eventId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updateRequest)
});
```

### Solo actualizar EventDays

```javascript
const updateRequest = {
  eventDays: [
    {
      id: uuidv4(),
      dayName: "Día actualizado",
      date: "2024-12-26T00:00:00.000Z",
      activities: [/* ... */]
    }
  ]
};

fetch(`https://your-api.com/events/${eventId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updateRequest)
});
```

## 🧪 Probar Localmente

### 1. Ejecutar los tests incluidos

```bash
cd aws-lambda-manageevents
node test-faq-eventdays.js
```

### 2. Resultado esperado

```
============================================================
ℹ Iniciando pruebas de FAQ y EventDays
============================================================

ℹ Test 1: Crear evento con FAQ y EventDays
✓ Evento creado exitosamente
ℹ Event ID: 550e8400-e29b-41d4-a716-446655440000

ℹ Test 2: Crear evento solo con FAQ
✓ Evento con FAQ creado exitosamente
ℹ Event ID: 660e8400-e29b-41d4-a716-446655440000

...

✓ Pruebas completadas
```

## 📱 Ejemplo Frontend (React)

### Crear Evento

```jsx
import { v4 as uuidv4 } from 'uuid';

function CreateEventForm() {
  const [faqList, setFaqList] = useState([]);
  const [eventDays, setEventDays] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const eventData = {
      nombre: formData.nombre,
      // ... otros campos ...
      faq: faqList,
      eventDays: eventDays.map(day => ({
        ...day,
        id: uuidv4(),
        activities: day.activities.map(act => ({
          ...act,
          id: uuidv4()
        }))
      }))
    };

    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData)
    });
    
    const result = await response.json();
    console.log('Evento creado:', result);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Campos del formulario */}
    </form>
  );
}
```

### Mostrar FAQ

```jsx
function EventFAQ({ faq }) {
  if (!faq || faq.length === 0) return null;

  return (
    <div className="faq-section">
      <h2>Preguntas Frecuentes</h2>
      {faq.map((item, index) => (
        <div key={index} className="faq-item">
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </div>
      ))}
    </div>
  );
}
```

### Mostrar Agenda

```jsx
function EventAgenda({ eventDays }) {
  if (!eventDays || eventDays.length === 0) return null;

  return (
    <div className="agenda-section">
      <h2>Agenda del Evento</h2>
      {eventDays.map(day => (
        <div key={day.id} className="day">
          <h3>{day.dayName}</h3>
          <p>{new Date(day.date).toLocaleDateString()}</p>
          {day.activities.map(activity => (
            <div key={activity.id} className="activity">
              <span className="time">
                {activity.startTimeDisplay} - {activity.endTimeDisplay}
              </span>
              <p>{activity.description}</p>
              {activity.responsible && (
                <span className="responsible">
                  {typeof activity.responsible === 'string' 
                    ? activity.responsible 
                    : activity.responsible.displayName}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

## ⚠️ Errores Comunes

### 1. IDs no únicos
```javascript
❌ Mal: Usar el mismo ID
const id = "day-1";

✅ Bien: Generar UUID único
const id = uuidv4();
```

### 2. Formato de fecha incorrecto
```javascript
❌ Mal:
"date": "25/12/2024"

✅ Bien:
"date": "2024-12-25T00:00:00.000Z"
```

### 3. Array vacío
```javascript
❌ Mal: Enviar array vacío
"faq": []

✅ Bien: No enviar el campo
// No incluir faq en el request
```

### 4. Responsible mal formado
```javascript
❌ Mal:
"responsible": { "name": "Juan" }

✅ Bien: Usar estructura completa o string
"responsible": {
  "id": "user-123",
  "nombre": "Juan",
  "apellido": "Pérez",
  "email": "juan@example.com",
  "username": "juanp",
  "displayName": "Juan Pérez"
}
// O simplemente:
"responsible": "Juan Pérez"
```

## 📚 Recursos Adicionales

- [Guía Completa](./FAQ_EVENTDAYS_GUIDE.md)
- [Ejemplos de Requests](./REQUEST_EXAMPLES_FAQ_EVENTDAYS.md)
- [Resumen de Cambios](./RESUMEN_CAMBIOS_FAQ_EVENTDAYS.md)

## 💡 Tips Rápidos

1. **Genera IDs únicos** con `uuid`
2. **Usa formato ISO** para fechas
3. **Valida antes de enviar** (arrays, campos requeridos)
4. **Campos opcionales** no necesitan enviarse si están vacíos
5. **Actualización parcial** permitida (solo FAQ, solo EventDays, o ambos)

## ✅ Checklist

Antes de crear/actualizar un evento con FAQ y EventDays:

- [ ] Todos los IDs son únicos (UUIDs)
- [ ] Fechas en formato ISO 8601
- [ ] FAQ tiene `question` y `answer`
- [ ] EventDays tiene `id`, `dayName`, `date`, `activities`
- [ ] Activities tiene todos los campos requeridos
- [ ] `responsible` está en formato válido (objeto, string, o null)
- [ ] Arrays no están vacíos (o no se envían)

## 🎉 ¡Listo!

Ahora puedes crear eventos con FAQ y agenda estructurada. Para más detalles, consulta la documentación completa.
