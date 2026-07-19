# Order Creation API Guide

Guía completa para la creación y consumo de órdenes (Orders) — estructura de datos, endpoints, ejemplos, validaciones y la relación con `TicketsDistribution` (consumo de `getAvailableSeats`). Esta guía sigue el nivel de detalle de `VENUES_API_COMPLETE_GUIDE.md`.

**Tabla de contenido**
1. **Resumen**
2. **Estructura de datos (Orders)**
3. **Endpoint: Crear Orden**
4. **Headers**
5. **Request Body — Estructura nueva (tickets individuales)**
6. **Request Body — Estructura legacy (metadata)**
7. **Paso a paso: flujo de creación de orden**
8. **Consumo de `getAvailableSeats` para selección de tickets**
9. **Operaciones atómicas y recomendaciones**
10. **Ejemplos completos**
11. **Validaciones y errores comunes**
12. **Notas sobre índices y diseño en DynamoDB**

---

## 1. Resumen

Este documento describe cómo crear órdenes para eventos, cubriendo:
- Formatos de orden nuevos (tickets individuales con `ticket_id` / `ticketInstanceId`).
- Formato legacy (tickets agrupados en `metadata.tickets` con cantidades y `ticketsDistId`).
- Cómo consumir `getAvailableSeats` (tabla `TicketsDistribution`) para reservar/vender tickets.
- Pasos necesarios para marcar tickets como `RESERVED`/`SOLD`, guardar la orden y emitir respuestas coherentes.

---

## 2. Estructura de datos (Orders)

Campos principales (requeridos/convenciones):

- `order_id` (string) — ID de la orden (PK).
- `user_id` (string) — ID del comprador.
- `event_id` (string) — ID del evento.
- `amount` (number) — monto total cobrado a la orden.
- `currency` (string) — moneda, p.ej. `COP`.
- `payment_status` (string) — `PENDING`, `APPROVED`, `SOLD`, `CANCELLED`.
- `transfer_status` (string) — `NONE`, `PARTIALLY_TRANSFERRED`, `TRANSFERRED`, `RECEIVED`.
- `created_at` (ISO timestamp)
- `finalized_at` (ISO timestamp) — cuando se confirma el pago
- `tickets` (array) — lista de tickets (estructura nueva) OR
- `metadata` (object) — para orden legacy con `metadata.tickets`.
- `quantity` (number) — cantidad total de tickets en la orden (útil en legacy)
- `reference` (string) — referencia externa si aplica
- `metadata.*` — información adicional (eventName, ticketsDistId, etc.)

Alias y campos aceptados:
- `ticket_id` y `ticketInstanceId` se usan de forma intercambiable según integración.
- `ticketsDistId` / `distributionId` / `distId` pueden aparecer según origen.
- `distributionCreateDate` / `distCreateDate` / `createDate` se usan para identificar la partición en `TicketsDistribution`.

---

## 3. Endpoint: Crear Orden

POST /orders

Descripción: crea una orden y reserva/vende tickets en `TicketsDistribution`.

Respuesta esperada: 201 Created con el objeto de orden y tickets asignados.

---

## 4. Headers

- `Content-Type: application/json`
- `Authorization: Bearer {token}` (si aplica)

---

## 5. Request Body — Estructura nueva (tickets individuales)

Recomendado cuando cada ticket ya existe como instancia en `TicketsDistribution`.

Ejemplo:

{
  "order_id": "uuid-1234",
  "user_id": "user-uuid",
  "event_id": "event-uuid",
  "amount": 120000,
  "currency": "COP",
  "payment_status": "PENDING",
  "tickets": [
    {
      "ticket_id": "c73348d1-8414-4a3b-89c7-4e1288994b71", // ticketInstanceId
      "ticketsDistId": "dist-uuid-1",
      "distributionCreateDate": "2026-01-17T10:00:00.000Z",
      "purchasePrice": 60000,
      "category": "VIP",
      "location": { "row":"A", "number":15, "seatLabel":"A15" },
      "qrCodeKey": "QR-KEY",
      "qr_url": "https://..."
    },
    {
      "ticket_id": "...",
      "ticketsDistId": "dist-uuid-1",
      "distributionCreateDate": "2026-01-17T10:00:00.000Z",
      "purchasePrice": 60000
    }
  ],
  "metadata": { "eventName": "Concierto 2026" },
  "reference": "PAY-123"
}

Notas:
- `ticket_id` aquí se espera que sea el `ticketInstanceId` que existe dentro de `TicketsDistribution.tickets[].ticketInstanceId`.
- `ticketsDistId` + `distributionCreateDate` sirven para localizar la distribución exacta donde está el ticket (ver `getAvailableSeats`).

---

## 6. Request Body — Estructura legacy (metadata)

Usada cuando la orden almacena cantidades por categoría en `metadata.tickets`. El sistema debe mapear esas cantidades a instancias concretas en `TicketsDistribution` al crear la orden.

Ejemplo:

{
  "order_id": "order-legacy-1",
  "user_id": "user-uuid",
  "event_id": "event-uuid",
  "amount": 200000,
  "currency": "COP",
  "payment_status": "PENDING",
  "metadata": {
    "tickets": [
      { "ticketsDistId": "dist-uuid-1", "createDate": "2026-01-17T10:00:00.000Z", "quantity": 2, "price": 100000 }
    ],
    "eventName": "Evento Legacy"
  },
  "quantity": 2
}

Procesamiento esperado:
- El backend debe consultar `TicketsDistribution` para `ticketsDistId`+`createDate`, encontrar `quantity` tickets con `ticketStatus: AVAILABLE`, reservarlos y añadirlos a `order.tickets` como instancias concretas.

---

## 7. Paso a paso: flujo de creación de orden

1. Validaciones iniciales (userId, eventId, tickets o metadata).
2. Si `tickets[]` provisto (estructura nueva): por cada ticket:
   - Validar que en `TicketsDistribution` exista `ticketInstanceId` con `ticketStatus: AVAILABLE`.
   - Marcar temporalmente como `RESERVED` (o usar un mecanismo de bloqueo) para evitar race conditions.
3. Si `metadata.tickets` (legacy): para cada entrada metadata:
   - Consultar `TicketsDistribution` (clave: `id` + `createDate`) para esa distribución.
   - Seleccionar `quantity` tickets con `ticketStatus: AVAILABLE`.
   - Marcar como `RESERVED` y mapear sus `ticketInstanceId` en `order.tickets`.
4. Calcular `amount` sumando `purchasePrice` de cada ticket (o usando `metadata.price` si aplica).
5. Persistir la orden (`PUT` en tabla `Orders`) con `payment_status: PENDING`, tickets (si ya fueron asignados) y `created_at`.
6. Realizar cobro externo (pasarela). Si el cobro falla, revertir los `RESERVED` a `AVAILABLE`.
7. Si el cobro es exitoso:
   - Actualizar `TicketsDistribution` marcando `ticketStatus: SOLD`, `ownerId`, `orderId`, `qrUrl` si aplica.
   - Actualizar `Orders` -> `payment_status: APPROVED` o `SOLD`, `finalized_at`.
   - Crear cualquier registro de trazabilidad (p.ej. `ticketsCancelation` para reembolsos futuros si aplica).
8. Enviar notificaciones (invocar Lambda de notificaciones) y responder 201 con detalles de la orden.

Atomicidad y concurrencia:
- Para evitar double-sell, usar una operación condicional en DynamoDB (conditional update) sobre `TicketsDistribution` o usar un mecanismo de lock (atributo `ticketStatus` cambiado con condición `ticketStatus = AVAILABLE`).
- Ejemplo de actualización condicional por ticket:
  - UpdateExpression: SET tickets[<index>].ticketStatus = :sold, tickets[<index>].orderId = :orderId
  - ConditionExpression: tickets[<index>].ticketStatus = :available

---

## 8. Consumo de `getAvailableSeats` para selección de tickets

`getAvailableSeats` (ver [src/tickets-distribution/getAvailableSeats.js](src/tickets-distribution/getAvailableSeats.js)) devuelve la distribución completa y un array `tickets[]` con estados y detalles.

Campos importantes en la respuesta de `getAvailableSeats`:
- `distributionId` (id)
- `createDate` (createDate)
- `tickets[]`:
  - `ticketInstanceId`
  - `ticketStatus` (`AVAILABLE`, `RESERVED`, `SOLD`)
  - `price` / `purchasePrice`
  - `location` (seat data)
  - `ownerId`, `orderId` (cuando ya vendido)
  - `qrCodeKey`, `qr_url`

Uso en creación de orden:
- Para orders nuevas: el frontend puede invocar `getAvailableSeats` con `distributionId` + `createDate` y mostrar `tickets[]` filtrando por `ticketStatus: AVAILABLE`.
- Para pedidos legacy: el backend debe reservar automáticamente `n` tickets disponibles en la distribución requerida.

Ejemplo de llamada:
```
GET /tickets-distribution/{distributionId}/available-seats?createDate=2026-01-17T10:00:00.000Z
```

Recomendaciones para consumir la respuesta:
- Seleccionar `ticketInstanceId` y enviar al endpoint de creación de orden.
- Preferir reservar tickets (marcarlos `RESERVED`) antes de confirmar cobro.
- Usar `ticketInstanceId` + `distributionId` + `createDate` al persistir en la orden.

---

## 9. Operaciones atómicas y recomendaciones

- Usar transacciones de DynamoDB (`TransactWriteItems`) para:
  - Insertar la orden y actualizar múltiples entradas en `TicketsDistribution` en una sola transacción (si el tamaño lo permite).
  - Si no es posible, usar Update con ConditionExpression por cada ticket para garantizar que su `ticketStatus` era `AVAILABLE`.
- Reservas temporales:
  - Marcar tickets como `RESERVED` con `reservationExpiry` timestamp (p.ej. +15 minutos).
  - Si la orden no se finaliza antes de `reservationExpiry`, un job TTL o proceso revierte `RESERVED` a `AVAILABLE`.

---

## 10. Ejemplos completos

### 10.1 Crear orden (tickets individuales, frontend seleccionó tickets)

Request:
```
POST /orders
Content-Type: application/json
{
  "user_id":"42c2e4a4-0",
  "order_id":"test-cf0f7283-0012",
  "event_id":"6ea51d60-8515-42a5-ab41-f9f7cfbfa939",
  "currency":"COP",
  "payment_status":"PENDING",
  "tickets":[
    {
      "ticket_id":"c73348d1-8414-4a3b-89c7-4e1288994b71",
      "ticketsDistId":"dist-uuid-1",
      "distributionCreateDate":"2026-01-17T10:00:00.000Z",
      "purchasePrice": 60000
    }
  ],
  "amount":60000
}
```

Respuesta (201):
```
{
  "order_id":"test-cf0f7283-0012",
  "user_id":"42c2e4a4-0",
  "payment_status":"SOLD",
  "tickets":[{ "ticketInstanceId":"c73348d1-8414-4a3b-89c7-4e1288994b71", "category":"VIP", "price":60000 }],
  "amount":60000
}
```

### 10.2 Crear orden (legacy — backend asigna instancias desde distribution)

Request:
```
POST /orders
{
  "user_id":"user-1",
  "order_id":"legacy-123",
  "event_id":"event-1",
  "metadata":{
    "tickets":[{"ticketsDistId":"dist-uuid-1","createDate":"2026-01-17T10:00:00.000Z","quantity":2,"price":50000}]
  },
  "amount":100000
}
```

Backend debe buscar 2 tickets con `ticketStatus: AVAILABLE` en la distribución `dist-uuid-1` y devolver order con `tickets[]` poblado.

---

## 11. Validaciones y errores comunes

- 400 Bad Request: falta `user_id`, `event_id`, o `tickets`/`metadata` inválidos.
- 404 Not Found: no existen tickets `AVAILABLE` en la/s distribuciones solicitadas.
- 409 Conflict (recomendado): intento de vender un ticket que ya se vendió (detectar con ConditionExpression y devolver conflicto).
- 500 Internal Server Error: error al actualizar `TicketsDistribution` o al persistir la orden.

Mensajes útiles a retornar al frontend:
- `No se encontraron tickets disponibles para la selección` (404)
- `Algunos tickets ya no están disponibles` (409) — incluir `missingTicketIds`
- `Pago rechazado` (402/200 con detalle especial)

---

## 12. Notas sobre índices y diseño en DynamoDB

Tabla `Orders`:
- PK: `order_id` (string)
- GSI recomendados: `user_id` (para listar órdenes por usuario), `event_id` (para buscar órdenes por evento)
- Atributos útiles: `payment_status`, `is_refunded`, `created_at`, `finalized_at`.

Tabla `TicketsDistribution`:
- Clave compuesta: `id` (distributionId) + `createDate` (partition+sort) — tal como implementado en `getAvailableSeats.js`.
- Cada item tiene `tickets[]` con objetos que contienen `ticketInstanceId`, `ticketStatus`, `orderId`, `ownerId`, `purchasePrice`, `location`.
- Para actualizaciones por índice de ticket dentro del array, guardar el `index` de la boleta (el código actual usa `dist.tickets` y operaciones `Put/Update` sobre el item completo).

---

### Recursos relacionados
- `getAvailableSeats` (ver): [src/tickets-distribution/getAvailableSeats.js](src/tickets-distribution/getAvailableSeats.js)
- `transferTicket` handlers (variantes): `transferTicket.js`, `transferTicket_NEW.js` en `aws-lambda-orders-manageTickets/src/ticket/`

---

Última actualización: 2026-01-20

