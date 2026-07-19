# Ejemplos de Payload para Crear Órdenes

## Endpoint
```
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders
```

---

## 1. Orden CON Asientos/Sillas (incluye color y datos de categoría)

### Estructura del Payload
```json
{
  "eventId": "9e92d1df-c227-4d54-b884-5bbaf9a60c86",
  "userId": "cedef71c-c",
  "tickets": [
    {
      "ticketInstanceId": "b468cdcd-ea15-43ec-bf62-d807fea00923",
      "distributionId": "d63cd00b-6816-4894-ac10-d504fdd1a158",
      "createDate": "2026-02-10T00:57:30.489Z",
      "purchasePrice": 30000,
      "categoryId": "6150f617-7b97-4264-8b13-8ce49bbc0d0a",
      "category": "GENERAL",
      "categoryColor": "#BBDEFB",
      "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
      "gateName": "Gate One",
      "seatId": "787be850-406b-4c37-be31-efd27b3cfa59",
      "location": {
        "seatLabel": "A1",
        "row": "A",
        "number": 1,
        "floorId": "b93934a0-2a71-4e10-ad1c-2292a0b00e42",
        "venueId": "fa9135f8-6859-4898-acb1-d5fe00323780"
      },
      "additionalCharges": [
        {
          "name": "Service Fee",
          "amount": 5000
        },
        {
          "name": "Processing Fee",
          "amount": 2000
        }
      ]
    },
    {
      "ticketInstanceId": "34826b47-b619-4dad-ab9b-64b6a20aa580",
      "distributionId": "d63cd00b-6816-4894-ac10-d504fdd1a158",
      "createDate": "2026-02-10T00:57:30.489Z",
      "purchasePrice": 30000,
      "categoryId": "6150f617-7b97-4264-8b13-8ce49bbc0d0a",
      "category": "GENERAL",
      "categoryColor": "#BBDEFB",
      "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
      "gateName": "Gate One",
      "seatId": "86958c98-3418-4ab5-97ea-c14205dba694",
      "location": {
        "seatLabel": "A2",
        "row": "A",
        "number": 2,
        "floorId": "b93934a0-2a71-4e10-ad1c-2292a0b00e42",
        "venueId": "fa9135f8-6859-4898-acb1-d5fe00323780"
      },
      "additionalCharges": [
        {
          "name": "Service Fee",
          "amount": 5000
        }
      ]
    }
  ],
  "metadata": {
    "eventEndDate": "2026-03-15T23:59:59.000Z",
    "orderTotals": {
      "total_ticket_amount": 60000,
      "total_additional_charges": 12000,
      "grand_total": 72000
    }
  }
}
```

### Ejemplo Simplificado (2 asientos de categoría PALCO)
```json
{
  "eventId": "9e92d1df-c227-4d54-b884-5bbaf9a60c86",
  "userId": "cedef71c-c",
  "tickets": [
    {
      "ticketInstanceId": "0c9dc8db-c08e-4f44-ba66-387ba09e7e18",
      "purchasePrice": 50000,
      "categoryId": "6ad05a96-97a1-490b-ac68-b41ee8625292",
      "category": "PALCO",
      "categoryColor": "#E1BEE7",
      "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
      "gateName": "Gate One",
      "seatId": "cc3a738e-8137-4464-8d08-38d5c8d0a45f",
      "location": {
        "seatLabel": "A1",
        "row": "A",
        "number": 1
      }
    },
    {
      "ticketInstanceId": "31741f19-e31a-4ee4-87e8-a73896db9fce",
      "purchasePrice": 50000,
      "categoryId": "6ad05a96-97a1-490b-ac68-b41ee8625292",
      "category": "PALCO",
      "categoryColor": "#E1BEE7",
      "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
      "gateName": "Gate One",
      "seatId": "219d6916-cf4d-414e-8426-bf8bd6c35110",
      "location": {
        "seatLabel": "A2",
        "row": "A",
        "number": 2
      }
    }
  ]
}
```

---

## 2. Orden SIN Asientos/Sillas (Boletas generales - incluye color)

### Estructura del Payload
```json
{
  "eventId": "9e92d1df-c227-4d54-b884-5bbaf9a60c86",
  "userId": "cedef71c-c",
  "metadata": {
    "qty": 3,
    "tickets": [
      {
        "category": "GENERAL",
        "categoryId": "6150f617-7b97-4264-8b13-8ce49bbc0d0a",
        "categoryColor": "#BBDEFB",
        "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
        "gateName": "Gate One",
        "quantity": 3,
        "price": 30000,
        "additionalCharges": [
          {
            "name": "Service Fee",
            "amount": 5000
          }
        ]
      }
    ],
    "orderTotals": {
      "total_ticket_amount": 90000,
      "total_additional_charges": 15000,
      "grand_total": 105000
    }
  }
}
```

### Ejemplo con Múltiples Categorías (Sin Asientos)
```json
{
  "eventId": "9e92d1df-c227-4d54-b884-5bbaf9a60c86",
  "userId": "cedef71c-c",
  "metadata": {
    "qty": 5,
    "tickets": [
      {
        "category": "GENERAL",
        "categoryId": "6150f617-7b97-4264-8b13-8ce49bbc0d0a",
        "categoryColor": "#BBDEFB",
        "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
        "gateName": "Gate One",
        "quantity": 3,
        "price": 30000
      },
      {
        "category": "PALCO",
        "categoryId": "6ad05a96-97a1-490b-ac68-b41ee8625292",
        "categoryColor": "#E1BEE7",
        "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
        "gateName": "Gate One",
        "quantity": 2,
        "price": 50000
      }
    ],
    "orderTotals": {
      "total_ticket_amount": 190000,
      "total_additional_charges": 0,
      "grand_total": 190000
    }
  }
}
```

---

## 3. Script PowerShell para Probar

### Crear Orden CON Asientos
```powershell
$endpoint = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders"

$payload = @{
    eventId = "9e92d1df-c227-4d54-b884-5bbaf9a60c86"
    userId = "cedef71c-c"
    tickets = @(
        @{
            ticketInstanceId = "b468cdcd-ea15-43ec-bf62-d807fea00923"
            purchasePrice = 30000
            categoryId = "6150f617-7b97-4264-8b13-8ce49bbc0d0a"
            category = "GENERAL"
            categoryColor = "#BBDEFB"
            gateId = "7926e8e3-f637-45aa-b336-f887fcc92743"
            gateName = "Gate One"
            seatId = "787be850-406b-4c37-be31-efd27b3cfa59"
            location = @{
                seatLabel = "A1"
                row = "A"
                number = 1
            }
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "🎫 Creando orden con asientos..." -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri $endpoint -Method POST -Body $payload -ContentType 'application/json'
$response | ConvertTo-Json -Depth 10
```

### Crear Orden SIN Asientos
```powershell
$endpoint = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders"

$payload = @{
    eventId = "9e92d1df-c227-4d54-b884-5bbaf9a60c86"
    userId = "cedef71c-c"
    metadata = @{
        qty = 3
        tickets = @(
            @{
                category = "GENERAL"
                categoryId = "6150f617-7b97-4264-8b13-8ce49bbc0d0a"
                categoryColor = "#BBDEFB"
                gateId = "7926e8e3-f637-45aa-b336-f887fcc92743"
                gateName = "Gate One"
                quantity = 3
                price = 30000
            }
        )
    }
} | ConvertTo-Json -Depth 10

Write-Host "🎫 Creando orden sin asientos..." -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri $endpoint -Method POST -Body $payload -ContentType 'application/json'
$response | ConvertTo-Json -Depth 10
```

---

## Notas Importantes

### Campos de Color
- **`categoryColor`**: Color en formato hexadecimal (ej: "#BBDEFB", "#E1BEE7")
- El color se propaga desde las distribuciones a las órdenes
- Se almacena en el campo `category_color` en la tabla Orders

### Campos de Gate
- **`gateId`**: ID del gate asociado a la categoría (UUID)
- **`gateName`**: Nombre descriptivo del gate (ej: "Gate One", "Puerta Principal")
- Los gates se pueden enviar opcionalmente en el payload de creación de orden
- Se almacenan en los campos `gate_id` y `gate_name` en la tabla Orders
- Si no se envían, se pueden consultar desde el endpoint de distribuciones
- Los gates están asociados a las **categorías** en el venue
- Cuando consultas distribuciones con el endpoint `/events/{eventId}/available-seats`, obtienes:
  - `gateId`: ID del gate asociado a la categoría
  - `gate`: Objeto completo con datos del gate (si existe en tabla Venue_Gate):
    ```json
    "gate": {
      "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
      "gateNumber": 1,
      "name": "Gate One",
      "description": "",
      "venueId": "fa9135f8-6859-4898-acb1-d5fe00323780",
      "eventId": "9e92d1df-c227-4d54-b884-5bbaf9a60c86",
      "status": "active"
    }
    ```

### Validaciones
- Si envías `ticketInstanceId`, el sistema valida que el ticket no esté ya vendido/reservado
- Los tickets se crean con status `RESERVED` y TTL de 15 minutos
- Después del TTL, se liberan automáticamente si no se confirma el pago

### Campos Alternativos Soportados
El endpoint acepta múltiples formatos por compatibilidad:
- `eventId` o `event_id`
- `userId` o `user_id` o `userID`
- `categoryColor` o `category_color`
- `gateId` o `gate_id`
- `gateName` o `gate_name`
- `purchasePrice` o `price`
- `ticketInstanceId` o `ticket_id` o `ticketId`

### Obtener Gate desde Distribuciones
Para obtener los datos del gate de un evento, consulta:
```
GET /events/{eventId}/available-seats
```

La respuesta incluirá para cada categoría:
```json
{
  "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
  "gate": {
    "gateId": "7926e8e3-f637-45aa-b336-f887fcc92743",
    "gateNumber": 1,
    "name": "Gate One",
    "description": "",
    "venueId": "fa9135f8-6859-4898-acb1-d5fe00323780",
    "eventId": "9e92d1df-c227-4d54-b884-5bbaf9a60c86",
    "status": "active"
  }
}
```

Estos datos pueden ser enviados al crear la orden para asociar el ticket con su gate.
