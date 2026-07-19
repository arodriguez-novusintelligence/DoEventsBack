# Comparación: Endpoints de Consulta de Asientos

## 📊 Resumen

Se han creado **DOS** opciones para consultar asientos disponibles:

### ✅ Opción Recomendada: Por Evento (NUEVO)
```
GET /events/{eventId}/available-seats
```

### 🔧 Opción Alternativa: Por Categoría (Original)
```
GET /tickets-distribution/{distributionId}/available-seats?createDate={createDate}
```

---

## 🚀 OPCIÓN RECOMENDADA: Por Evento

### Request
```bash
GET https://API_URL/dev/events/event-456/available-seats
```

### Ventajas
✅ **Una sola llamada HTTP** para todo el evento  
✅ No necesitas conocer `distributionId` ni `createDate` previamente  
✅ Devuelve todas las categorías organizadas  
✅ Incluye resumen global de disponibilidad  
✅ Perfecto para mostrar selector de categorías + mapa de asientos  
✅ Reduce latencia y carga en el servidor  
✅ Más fácil de implementar en frontend

### Respuesta
```json
{
  "eventId": "event-456",
  "totalCategories": 3,
  "summary": {
    "totalSeats": 150,
    "availableSeats": 142,
    "reservedSeats": 5,
    "soldSeats": 3
  },
  "categories": [
    {
      "categoryId": "cat-vip-001",
      "categoryName": "VIP",
      "distributionId": "dist-vip-xyz",
      "createDate": "2026-01-12T15:30:00.000Z",
      "venueId": "venue-cloned-789",
      "ticketId": "tk-abc",
      "summary": {
        "totalSeats": 50,
        "availableSeats": 48,
        "reservedSeats": 2,
        "soldSeats": 0
      },
      "seats": [
        {
          "ticketInstanceId": "ticket-inst-001",
          "location": {
            "seatId": "seat-cloned-101",
            "row": "A",
            "number": "1",
            "seatLabel": "A1"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-001",
          "ownerId": null,
          "orderId": null
        }
      ]
    },
    {
      "categoryId": "cat-general-001",
      "categoryName": "General",
      "distributionId": "dist-general-xyz",
      "createDate": "2026-01-12T15:30:00.000Z",
      "summary": {
        "totalSeats": 100,
        "availableSeats": 94,
        "reservedSeats": 3,
        "soldSeats": 3
      },
      "seats": [...]
    }
  ]
}
```

### Cuándo Usarla
- ✅ Mostrar página de compra con selector de categorías
- ✅ Dashboard de evento mostrando disponibilidad general
- ✅ Primera carga de interfaz de compra
- ✅ **Caso de uso principal recomendado**

---

## 🔧 OPCIÓN ALTERNATIVA: Por Categoría

### Request
```bash
GET https://API_URL/dev/tickets-distribution/dist-vip-xyz/available-seats?createDate=2026-01-12T15:30:00.000Z
```

### Ventajas
✅ Respuesta más pequeña (solo una categoría)  
✅ Útil para recargas parciales  
✅ Más específica si ya conoces la categoría

### Desventajas
❌ Requiere llamada previa a `/getTicketByEventId` para obtener `distributionId` y `createDate`  
❌ Necesitas una llamada HTTP **por cada categoría** del evento  
❌ Más complejo en frontend (múltiples estados, múltiples llamadas)  
❌ Mayor latencia total si hay varias categorías

### Respuesta
```json
{
  "distributionId": "dist-vip-xyz",
  "categoryId": "cat-vip-001",
  "categoryName": "VIP",
  "eventId": "event-456",
  "venueId": "venue-cloned-789",
  "ticketId": "tk-abc",
  "summary": {
    "totalSeats": 50,
    "availableSeats": 48,
    "reservedSeats": 2,
    "soldSeats": 0
  },
  "seats": [
    {
      "ticketInstanceId": "ticket-inst-001",
      "location": {
        "seatId": "seat-cloned-101",
        "row": "A",
        "number": "1",
        "seatLabel": "A1"
      },
      "ticketStatus": "AVAILABLE",
      "price": 150000,
      "qrCodeKey": "qr-key-001",
      "ownerId": null,
      "orderId": null
    }
  ]
}
```

### Cuándo Usarla
- ✅ Recargar solo una categoría (ej: después de timeout de reserva)
- ✅ Optimización si solo hay una categoría en el evento
- ✅ Polling de disponibilidad para categoría específica

---

## 📈 Comparación de Flujos

### Flujo con Opción RECOMENDADA (Por Evento)

```
1. GET /events/{eventId}/available-seats
   └─> Respuesta: Todas las categorías + todos los asientos

2. Renderizar selector de categorías

3. Usuario selecciona categoría

4. Renderizar mapa de asientos (ya tenemos los datos)

5. Usuario selecciona asientos

6. POST /orders/create
```

**Total: 2 llamadas HTTP**

---

### Flujo con Opción ALTERNATIVA (Por Categoría)

```
1. GET /getTicketByEventId/{eventId}
   └─> Respuesta: Array de categorías con distributionId, createDate

2. Renderizar selector de categorías

3. Usuario selecciona categoría

4. GET /tickets-distribution/{distId}/available-seats?createDate=...
   └─> Respuesta: Asientos de esa categoría

5. Renderizar mapa de asientos

6. Usuario selecciona asientos

7. POST /orders/create
```

**Total: 3 llamadas HTTP (o más si cambia de categoría)**

---

## 💻 Código Frontend

### Con Opción RECOMENDADA

```javascript
async function loadEventSeats(eventId) {
  // Una sola llamada
  const response = await fetch(`${API_URL}/events/${eventId}/available-seats`);
  const data = await response.json();
  
  // Ya tenemos todo
  renderCategories(data.categories);
  renderSeatMap(data.categories[0].seats); // Primera categoría
}
```

### Con Opción ALTERNATIVA

```javascript
async function loadEventSeats(eventId) {
  // Primera llamada: obtener categorías
  const ticketsResponse = await fetch(`${API_URL}/getTicketByEventId/${eventId}`);
  const ticketsData = await ticketsResponse.json();
  const categories = ticketsData[0].boleta;
  
  renderCategories(categories);
  
  // Segunda llamada: obtener asientos de primera categoría
  const firstCategory = categories[0];
  const seatsResponse = await fetch(
    `${API_URL}/tickets-distribution/${firstCategory.distributionId}/available-seats?createDate=${firstCategory.distributionCreateDate}`
  );
  const seatsData = await seatsResponse.json();
  
  renderSeatMap(seatsData.seats);
}

// Si usuario cambia de categoría -> nueva llamada HTTP
async function onCategoryChange(category) {
  const response = await fetch(
    `${API_URL}/tickets-distribution/${category.distributionId}/available-seats?createDate=${category.distributionCreateDate}`
  );
  const data = await response.json();
  renderSeatMap(data.seats);
}
```

---

## 🎯 Recomendación Final

### Para la mayoría de casos:
```
✅ USA: GET /events/{eventId}/available-seats
```

**Razones:**
- Más simple de implementar
- Mejor experiencia de usuario (carga más rápida)
- Menos llamadas al servidor
- Más fácil de cachear
- Reduce latencia percibida

### Solo usa la alternativa si:
- Tienes muchas categorías (>50) y quieres cargar bajo demanda
- Necesitas polling frecuente de una categoría específica
- Optimizas para conexiones muy lentas y quieres carga progresiva

---

## 📋 Endpoints Creados

### Archivo: `getAvailableSeatsByEvent.js` (NUEVO)
- **Path:** `/events/{eventId}/available-seats`
- **Método:** GET
- **Handler:** `src/tickets-distribution/getAvailableSeatsByEvent.handler`
- **Tabla:** TicketsDistribution (query con GSI `eventIdIndex`)

### Archivo: `getAvailableSeats.js` (Original)
- **Path:** `/tickets-distribution/{distributionId}/available-seats`
- **Método:** GET
- **Handler:** `src/tickets-distribution/getAvailableSeats.handler`
- **Tabla:** TicketsDistribution (get con clave compuesta)

Ambos endpoints están configurados en:
```
aws-lambda-orders-manageTickets/serverless.yml
```

---

## 🚀 Próximos Pasos

1. **Desplegar el servicio:**
   ```powershell
   cd aws-lambda-orders-manageTickets
   serverless deploy --force
   ```

2. **Probar el nuevo endpoint:**
   ```bash
   GET https://YOUR_API_URL/dev/events/event-456/available-seats
   ```

3. **Actualizar frontend** para usar el nuevo endpoint más simple

4. **Mantener endpoint original** para casos de uso específicos
