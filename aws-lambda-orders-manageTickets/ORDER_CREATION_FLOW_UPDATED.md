# Flujo Completo Actualizado: Consulta de Asientos → Creación de Orden

## 🎯 Cambios Implementados

### ✅ Correcciones en `manageOrders.js`

1. **Filtro de asientos corregido**: Ahora compara correctamente con `ticket.location.seatLabel` en lugar del objeto completo
2. **Validación mejorada**: Verifica que todos los asientos solicitados estén disponibles
3. **Trazabilidad completa**: Los tickets reservados ahora incluyen:
   - `seatId`: ID único del asiento en Venue_Seat
   - `seatLabel`: Etiqueta del asiento (ej: "A1")
   - `categoryId`: ID de la categoría
   - `distributionId`: ID de la distribución
   - `distributionCreateDate`: Fecha de creación de la distribución
   - `price`: Precio de compra
4. **Logs detallados**: Seguimiento completo del proceso de reserva

---

## 📋 FLUJO COMPLETO

### PASO 1: Consultar asientos disponibles del evento

```bash
GET https://API_URL/dev/events/event-456/available-seats
```

**Respuesta:**
```json
{
  "eventId": "event-456",
  "totalCategories": 2,
  "summary": {
    "totalSeats": 150,
    "availableSeats": 145,
    "reservedSeats": 3,
    "soldSeats": 2
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
        "reservedSeats": 1,
        "soldSeats": 1
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
        },
        {
          "ticketInstanceId": "ticket-inst-002",
          "location": {
            "seatId": "seat-cloned-102",
            "row": "A",
            "number": "2",
            "seatLabel": "A2"
          },
          "ticketStatus": "AVAILABLE",
          "price": 150000,
          "qrCodeKey": "qr-key-002",
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
        "availableSeats": 97,
        "reservedSeats": 2,
        "soldSeats": 1
      },
      "seats": [...]
    }
  ]
}
```

---

### PASO 2: Usuario selecciona asientos en el frontend

El usuario ve el mapa de asientos y selecciona:
- VIP: A1, A2 (2 asientos)
- General: B5, B6, B7 (3 asientos)

---

### PASO 3: Crear orden con asientos específicos

#### Opción A: Asientos específicos (usuario elige)

```bash
POST https://API_URL/dev/orders
Content-Type: application/json
```

```json
{
  "reference": "ORDER-2026-12345",
  "customer_email": "cliente@ejemplo.com",
  "amount_in_cents": 550000,
  "currency": "COP",
  "metadata": {
    "eventId": "event-456",
    "userID": "user-789",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-vip-001",
        "quantity": 2,
        "ticketsDistId": "dist-vip-xyz",
        "createDate": "2026-01-12T15:30:00.000Z",
        "seats": ["A1", "A2"]
      },
      {
        "category": "General",
        "categoryId": "cat-general-001",
        "quantity": 3,
        "ticketsDistId": "dist-general-xyz",
        "createDate": "2026-01-12T15:30:00.000Z",
        "seats": ["B5", "B6", "B7"]
      }
    ]
  }
}
```

#### Opción B: Asignación automática (sistema elige)

```json
{
  "reference": "ORDER-2026-12346",
  "customer_email": "cliente2@ejemplo.com",
  "amount_in_cents": 300000,
  "currency": "COP",
  "metadata": {
    "eventId": "event-456",
    "userID": "user-890",
    "tickets": [
      {
        "category": "VIP",
        "categoryId": "cat-vip-001",
        "quantity": 2,
        "ticketsDistId": "dist-vip-xyz",
        "createDate": "2026-01-12T15:30:00.000Z",
        "seats": []
      }
    ]
  }
}
```

---

### PASO 4: Respuesta de orden creada

```json
{
  "statusCode": 200,
  "body": {
    "message": "Orden creada y tickets reservados.",
    "order_id": "ORDER-2026-12345",
    "tickets": [
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-001",
        "category": "VIP",
        "categoryId": "cat-vip-001",
        "seat": {
          "seatId": "seat-cloned-101",
          "row": "A",
          "number": "1",
          "seatLabel": "A1"
        },
        "seatId": "seat-cloned-101",
        "seatLabel": "A1",
        "qr_url": "https://bucket.s3.amazonaws.com/qrs/qr-key-001.png",
        "qrCodeKey": "qr-key-001",
        "user_id": "user-789",
        "distributionId": "dist-vip-xyz",
        "distributionCreateDate": "2026-01-12T15:30:00.000Z",
        "price": 150000
      },
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-002",
        "category": "VIP",
        "categoryId": "cat-vip-001",
        "seat": {
          "seatId": "seat-cloned-102",
          "row": "A",
          "number": "2",
          "seatLabel": "A2"
        },
        "seatId": "seat-cloned-102",
        "seatLabel": "A2",
        "qr_url": "https://bucket.s3.amazonaws.com/qrs/qr-key-002.png",
        "qrCodeKey": "qr-key-002",
        "user_id": "user-789",
        "distributionId": "dist-vip-xyz",
        "distributionCreateDate": "2026-01-12T15:30:00.000Z",
        "price": 150000
      },
      {
        "event_id": "event-456",
        "ticket_id": "ticket-inst-101",
        "category": "General",
        "categoryId": "cat-general-001",
        "seat": {
          "seatId": "seat-cloned-205",
          "row": "B",
          "number": "5",
          "seatLabel": "B5"
        },
        "seatId": "seat-cloned-205",
        "seatLabel": "B5",
        "qr_url": "https://bucket.s3.amazonaws.com/qrs/qr-key-101.png",
        "qrCodeKey": "qr-key-101",
        "user_id": "user-789",
        "distributionId": "dist-general-xyz",
        "distributionCreateDate": "2026-01-12T15:30:00.000Z",
        "price": 50000
      }
    ],
    "summary": {
      "totalTickets": 5,
      "categories": [
        {
          "category": "VIP",
          "quantity": 2
        },
        {
          "category": "General",
          "quantity": 3
        }
      ]
    }
  }
}
```

---

## 🔍 Validaciones Implementadas

### 1. Validación de Parámetros Obligatorios
```javascript
if (!category || !quantity || !ticketsDistId || !createDate) {
  return error('Parámetros inválidos en categoría');
}
```

### 2. Validación de Disponibilidad
```javascript
if (disponibles.length < quantity) {
  return error('No hay suficientes boletos disponibles');
}
```

### 3. Validación de Asientos Específicos
```javascript
if (seats.length > 0 && seats.length !== disponibles.length) {
  const seatsFaltantes = seats.filter(s => !seatsEncontrados.includes(s));
  return error('Asientos no disponibles: ' + seatsFaltantes.join(', '));
}
```

---

## 📊 Trazabilidad en la Base de Datos

### En TicketsDistribution
```json
{
  "id": "dist-vip-xyz",
  "createDate": "2026-01-12T15:30:00.000Z",
  "tickets": [
    {
      "ticketInstanceId": "ticket-inst-001",
      "ticketStatus": "RESERVED",
      "location": {
        "seatId": "seat-cloned-101",
        "row": "A",
        "number": "1",
        "seatLabel": "A1"
      },
      "orderId": "ORDER-2026-12345",
      "ownerId": "user-789",
      "reservationExpiry": 1736693400,
      "qrUrl": "https://bucket.s3.amazonaws.com/qrs/qr-key-001.png"
    }
  ]
}
```

### En Orders
```json
{
  "order_id": "ORDER-2026-12345",
  "event_id": "event-456",
  "user_id": "user-789",
  "payment_status": "PENDING",
  "tickets": [
    {
      "ticket_id": "ticket-inst-001",
      "seatId": "seat-cloned-101",
      "seatLabel": "A1",
      "distributionId": "dist-vip-xyz",
      "distributionCreateDate": "2026-01-12T15:30:00.000Z"
    }
  ]
}
```

---

## 🎯 Casos de Uso

### Caso 1: Usuario elige asientos específicos
- Frontend muestra mapa con todos los asientos
- Usuario hace clic en A1, A2
- Request incluye `seats: ["A1", "A2"]`
- Sistema reserva exactamente esos asientos

### Caso 2: Sistema asigna automáticamente
- Usuario solo elige cantidad y categoría
- Request incluye `seats: []`
- Sistema toma los primeros N asientos disponibles

### Caso 3: Múltiples categorías
- Usuario compra VIP + General en una sola orden
- Array `tickets` con múltiples objetos
- Cada uno con su `distributionId` y `createDate`

### Caso 4: Asientos no disponibles
- Usuario intenta reservar A1, pero ya está RESERVED
- Sistema retorna error: "Asientos no disponibles: A1"
- Frontend debe refrescar disponibilidad

---

## 🚀 Despliegue

```powershell
cd aws-lambda-orders-manageTickets
serverless deploy --force
```

---

## ✅ Resumen de Mejoras

| Aspecto | Antes | Después |
|---------|-------|---------|
| Filtro de asientos | ❌ Comparaba objeto completo | ✅ Compara `seatLabel` |
| Trazabilidad | ⚠️ Solo `seat` object | ✅ `seatId`, `seatLabel`, `distributionId`, `categoryId` |
| Validación | ⚠️ Básica | ✅ Verifica asientos específicos |
| Logs | ⚠️ Mínimos | ✅ Detallados por categoría |
| Respuesta | ⚠️ Lista de tickets | ✅ Lista + resumen por categoría |
| Asignación | ⚠️ No funcionaba con asientos específicos | ✅ Funciona con específicos o automático |
