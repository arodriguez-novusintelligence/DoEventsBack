# Guía Completa: Creación de Órdenes - DoEvents

**Endpoint:** POST `/orders` (API Gateway)  
**Fecha:** 25 de Enero, 2026

---

## ✅ Estructura del Payload Correcta

### Opción 1: Forma Recomendada (Con Detalles de Tickets)

```json
{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "reference": "test_1aFeZH",
  "customer_email": "jlyaleoficial@gmail.com",
  "amount": 99999,
  "tickets": [
    {
      "ticket_id": "83853767-e83c-4656-9c91-ce1dcb9d7a34",
      "ticketsDistId": "205be8e8-8a7d-4378-9304-6f03e5833072",
      "purchasePrice": 33333,
      "category": "GENERAL PISO 2",
      "location": {
        "row": "F",
        "number": 4,
        "seatLabel": "F4"
      }
    },
    {
      "ticket_id": "75a73721-fb50-44a2-8687-dfcd2f532cab",
      "ticketsDistId": "205be8e8-8a7d-4378-9304-6f03e5833072",
      "purchasePrice": 33333,
      "category": "GENERAL PISO 2",
      "location": {
        "row": "E",
        "number": 4,
        "seatLabel": "E4"
      }
    },
    {
      "ticket_id": "fb38b88e-e581-4139-9b9f-6b1d199d96fc",
      "ticketsDistId": "205be8e8-8a7d-4378-9304-6f03e5833072",
      "purchasePrice": 33333,
      "category": "GENERAL PISO 2",
      "location": {
        "row": "D",
        "number": 4,
        "seatLabel": "D4"
      }
    }
  ],
  "metadata": {
    "eventName": "Evento Nuevo Ordenes",
    "hasSeating": true,
    "orderTotals": {
      "total_ticket_amount": 99999,
      "total_additional_charges": 0,
      "total_amount": 99999
    }
  }
}
```

**Validación:**
- ✅ `event_id` en root
- ✅ `user_id` en root
- ✅ `tickets` array con estructura correcta
- ✅ Cada ticket tiene `purchasePrice` (suma debe = `total_ticket_amount`)
- ✅ `metadata.orderTotals` con 3 campos requeridos
- ✅ `amount` en root = `total_amount`

---

## 🔍 Campos Requeridos vs Opcionales

### ✅ REQUERIDOS en Root

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `event_id` | string | ID del evento | `"1392904a-2554-4131-8cd8-a9314c46dc5a"` |
| `user_id` | string | ID del usuario que compra | `"cedef71c-c"` |
| `currency` | string | Moneda ISO | `"COP"` |
| `amount` | number | Total de la orden | `99999` |
| `tickets` | array | Array de boletas | `[...]` |

### ✅ REQUERIDOS en metadata.orderTotals

| Campo | Tipo | Descripción | Cálculo |
|-------|------|-------------|---------|
| `total_ticket_amount` | number | Suma de precios de boletas | Sum(tickets[].purchasePrice) |
| `total_additional_charges` | number | Cargos adicionales | Generalmente 0 |
| `total_amount` | number | Total final | total_ticket_amount + total_additional_charges |

### ⚪ OPCIONALES en Root

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `order_id` | string | ID de orden (se genera automáticamente) |
| `payment_status` | string | PENDING, COMPLETED, FAILED |
| `reference` | string | Referencia del cliente |
| `customer_email` | string | Email para confirmación |

### ⚪ OPCIONALES en metadata

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `eventName` | string | Nombre del evento (para notificaciones) |
| `eventEndDate` | string | ISO date para expiración de QR |
| `hasSeating` | boolean | Si el evento tiene asientos |
| `venueLocation` | string | Ubicación del venue |

---

## 📋 Estructura de Cada Ticket

```json
{
  "ticket_id": "83853767-e83c-4656-9c91-ce1dcb9d7a34",
  "ticketsDistId": "205be8e8-8a7d-4378-9304-6f03e5833072",
  "distributionCreateDate": "2026-01-25T17:55:14.507Z",
  "purchasePrice": 33333,
  "category": "GENERAL PISO 2",
  "location": {
    "row": "F",
    "number": 4,
    "seatLabel": "F4"
  }
}
```

### Campos de Ticket

| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `ticket_id` | string | ✅ | ID único de la boleta |
| `ticketsDistId` | string | ✅ | ID de distribución |
| `purchasePrice` | number | ✅ | Precio unitario |
| `category` | string | ⚪ | Categoría (ej: GENERAL, VIP) |
| `location` | object | ⚪ | Información de asiento |
| `location.row` | string | ⚪ | Fila (A, B, C...) |
| `location.number` | number | ⚪ | Número de asiento |
| `location.seatLabel` | string | ⚪ | Label del asiento (A1, B5) |
| `distributionCreateDate` | string | ⚪ | Fecha de creación |

---

## 🔧 Validación de Totales

El sistema valida con **tolerancia de 1 centavo**:

```javascript
TOLERANCE = 1 COP

Ejemplo tu payload:
- tickets[0].purchasePrice = 33333
- tickets[1].purchasePrice = 33333  
- tickets[2].purchasePrice = 33333
- TOTAL = 99999

Validación:
- providedTotals.total_ticket_amount = 99999 ✅
- providedTotals.total_additional_charges = 0 ✅
- providedTotals.total_amount = 99999 ✅
- amount = 99999 ✅

RESULTADO: ✅ ORDEN CREADA
```

---

## ❌ Errores Comunes

### Error 1: "Faltan parámetros requeridos: eventId y userId"

**Causa:** No pasaste `event_id` o `user_id` en root

**Solución:**
```json
{
  "event_id": "...",     // ← AGREGAR
  "user_id": "...",      // ← AGREGAR
  "currency": "COP",
  "amount": 99999,
  "tickets": [...]
}
```

---

### Error 2: "Se requieren totales: total_ticket_amount, total_additional_charges, total_amount"

**Causa:** Falta `metadata.orderTotals`

**Solución:**
```json
{
  "event_id": "...",
  "user_id": "...",
  "metadata": {
    "orderTotals": {
      "total_ticket_amount": 99999,        // ← AGREGAR
      "total_additional_charges": 0,       // ← AGREGAR
      "total_amount": 99999                // ← AGREGAR
    }
  },
  "amount": 99999
}
```

---

### Error 3: "Total mismatch: expected XXX, got YYY"

**Causa:** Las sumas no coinciden

**Debug:**
```
Si recibiste: "expected 99999, got 333915"
Significa: sum(tickets[].purchasePrice) = 99999
           pero metadata.orderTotals.total_ticket_amount = 333915

SOLUCIÓN 1: Cambiar metadata.orderTotals a suma correcta
SOLUCIÓN 2: Cambiar purchasePrice de cada ticket
```

---

## 🧪 Test: Crear una Orden Válida

### Paso 1: Obtén IDs reales

```bash
# En AWS Console o CloudWatch
# Busca un evento con ID y el usuario actual con su ID
```

### Paso 2: Construcción del Payload

```json
{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "reference": "test_crear_orden_25_enero",
  "customer_email": "jlyaleoficial@gmail.com",
  "amount": 99999,
  "tickets": [
    {
      "ticket_id": "ticket-001",
      "ticketsDistId": "dist-001",
      "purchasePrice": 33333,
      "category": "GENERAL"
    },
    {
      "ticket_id": "ticket-002", 
      "ticketsDistId": "dist-001",
      "purchasePrice": 33333,
      "category": "GENERAL"
    },
    {
      "ticket_id": "ticket-003",
      "ticketsDistId": "dist-001", 
      "purchasePrice": 33333,
      "category": "GENERAL"
    }
  ],
  "metadata": {
    "eventName": "Test Orden 25 Enero",
    "hasSeating": false,
    "orderTotals": {
      "total_ticket_amount": 99999,
      "total_additional_charges": 0,
      "total_amount": 99999
    }
  }
}
```

### Paso 3: POST al Endpoint

```bash
curl -X POST \
  https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/orders \
  -H "Content-Type: application/json" \
  -d '@payload.json'
```

**Respuesta esperada:**
```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "order_id": "9f8c7b6a-5d4e-3c2b-1a0f-e9d8c7b6a5d4",
    "status": "RESERVED",
    "tickets_count": 3,
    "total_amount": 99999,
    "currency": "COP"
  }
}
```

---

## 📊 Validaciones Internas

El código realiza estas validaciones automáticamente:

1. ✅ **eventId y userId requeridos**
2. ✅ **Estructura de tickets válida**
3. ✅ **Totales coinciden** (con tolerancia de 1 centavo)
4. ✅ **Carga QR a S3** (genera URL firmada)
5. ✅ **Guarda tickets en DynamoDB** (con TTL de 15 min)
6. ✅ **Guarda orden** (si pasa todas las validaciones)
7. ✅ **Envía notificación** (opcional)

---

## 💡 Tips

### Generar IDs Únicos para Tickets

```javascript
const { v4: uuidv4 } = require('uuid');

const tickets = [1, 2, 3].map(i => ({
  ticket_id: uuidv4(),  // Genera ID único
  ticketsDistId: "dist-001",
  purchasePrice: 33333,
  category: "GENERAL"
}));
```

### Calcular Totales Automáticamente

```javascript
const ticketsPrices = [33333, 33333, 33333];
const total = ticketsPrices.reduce((a, b) => a + b, 0);

const payload = {
  // ... resto del payload
  amount: total,
  metadata: {
    orderTotals: {
      total_ticket_amount: total,
      total_additional_charges: 0,
      total_amount: total
    }
  }
};
```

---

## 🔐 Notas de Seguridad

- Todas las órdenes tienen **TTL de 15 minutos** (se borran automáticamente si no se completan)
- Los QR se firman en S3 con expiración de **1 día después del evento**
- El usuario debe ser **válido en la tabla Client**
- El evento debe existir en la tabla **Eventos**

---

Última actualización: 25 de Enero, 2026
