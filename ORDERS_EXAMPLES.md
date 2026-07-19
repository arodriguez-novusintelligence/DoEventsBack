# Ejemplos de Creación de Órdenes - DoEvents API

## 1. cURL - Crear orden simple (3 tickets)

```bash
curl -X POST \
  "https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/orders" \
  -H "Content-Type: application/json" \
  -d '{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "reference": "test_orden_simple",
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
    "eventName": "Test Orden",
    "hasSeating": false,
    "orderTotals": {
      "total_ticket_amount": 99999,
      "total_additional_charges": 0,
      "total_amount": 99999
    }
  }
}'
```

---

## 2. cURL - Crear orden con asientos

```bash
curl -X POST \
  "https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/orders" \
  -H "Content-Type: application/json" \
  -d '{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "reference": "test_orden_asientos",
  "customer_email": "jlyaleoficial@gmail.com",
  "amount": 99999,
  "tickets": [
    {
      "ticket_id": "ticket-a1",
      "ticketsDistId": "dist-vip-001",
      "purchasePrice": 33333,
      "category": "VIP",
      "location": {
        "row": "A",
        "number": 1,
        "seatLabel": "A1"
      }
    },
    {
      "ticket_id": "ticket-a2",
      "ticketsDistId": "dist-vip-001",
      "purchasePrice": 33333,
      "category": "VIP",
      "location": {
        "row": "A",
        "number": 2,
        "seatLabel": "A2"
      }
    },
    {
      "ticket_id": "ticket-b1",
      "ticketsDistId": "dist-general-001",
      "purchasePrice": 33333,
      "category": "GENERAL",
      "location": {
        "row": "B",
        "number": 1,
        "seatLabel": "B1"
      }
    }
  ],
  "metadata": {
    "eventName": "Concierto con Asientos",
    "hasSeating": true,
    "orderTotals": {
      "total_ticket_amount": 99999,
      "total_additional_charges": 0,
      "total_amount": 99999
    }
  }
}'
```

---

## 3. PowerShell - Crear orden dinámicamente

```powershell
# Importar función
. ./test-create-order.ps1

# Crear orden con parámetros personalizados
./test-create-order.ps1 `
  -EventId "1392904a-2554-4131-8cd8-a9314c46dc5a" `
  -UserId "cedef71c-c" `
  -TicketCount 5 `
  -PricePerTicket 50000
```

---

## 4. JavaScript/Node.js - Crear orden

```javascript
const axios = require('axios');

const API_ENDPOINT = 'https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev';

async function createOrder() {
  try {
    const totalAmount = 99999;
    
    const payload = {
      event_id: '1392904a-2554-4131-8cd8-a9314c46dc5a',
      user_id: 'cedef71c-c',
      currency: 'COP',
      payment_status: 'PENDING',
      reference: `test_orden_${Date.now()}`,
      customer_email: 'jlyaleoficial@gmail.com',
      amount: totalAmount,
      tickets: [
        {
          ticket_id: '83853767-e83c-4656-9c91-ce1dcb9d7a34',
          ticketsDistId: '205be8e8-8a7d-4378-9304-6f03e5833072',
          purchasePrice: 33333,
          category: 'GENERAL PISO 2'
        },
        {
          ticket_id: '75a73721-fb50-44a2-8687-dfcd2f532cab',
          ticketsDistId: '205be8e8-8a7d-4378-9304-6f03e5833072',
          purchasePrice: 33333,
          category: 'GENERAL PISO 2'
        },
        {
          ticket_id: 'fb38b88e-e581-4139-9b9f-6b1d199d96fc',
          ticketsDistId: '205be8e8-8a7d-4378-9304-6f03e5833072',
          purchasePrice: 33333,
          category: 'GENERAL PISO 2'
        }
      ],
      metadata: {
        eventName: 'Evento Nuevo Ordenes',
        hasSeating: true,
        orderTotals: {
          total_ticket_amount: totalAmount,
          total_additional_charges: 0,
          total_amount: totalAmount
        }
      }
    };

    console.log('📤 Creando orden...');
    console.log(JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${API_ENDPOINT}/orders`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Orden creada exitosamente:');
    console.log(JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('\n❌ Error creando orden:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}

// Ejecutar
createOrder();
```

---

## 5. Python - Crear orden

```python
import requests
import json
from datetime import datetime

API_ENDPOINT = "https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev"

def create_order(
    event_id="1392904a-2554-4131-8cd8-a9314c46dc5a",
    user_id="cedef71c-c",
    ticket_count=3,
    price_per_ticket=33333
):
    total_amount = ticket_count * price_per_ticket
    reference = f"test_orden_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Generar tickets
    tickets = []
    for i in range(1, ticket_count + 1):
        tickets.append({
            "ticket_id": f"ticket-{i:03d}",
            "ticketsDistId": "dist-001",
            "purchasePrice": price_per_ticket,
            "category": "GENERAL"
        })
    
    # Construir payload
    payload = {
        "event_id": event_id,
        "user_id": user_id,
        "currency": "COP",
        "payment_status": "PENDING",
        "reference": reference,
        "customer_email": "jlyaleoficial@gmail.com",
        "amount": total_amount,
        "tickets": tickets,
        "metadata": {
            "eventName": "Test Orden Python",
            "hasSeating": False,
            "orderTotals": {
                "total_ticket_amount": total_amount,
                "total_additional_charges": 0,
                "total_amount": total_amount
            }
        }
    }
    
    print(f"📤 Creando orden con {ticket_count} tickets...")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    
    try:
        response = requests.post(
            f"{API_ENDPOINT}/orders",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"\n✅ Respuesta HTTP: {response.status_code}")
        
        if response.status_code in [200, 201]:
            data = response.json()
            print("✅ Orden creada exitosamente:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return data
        else:
            print("❌ Error:")
            print(json.dumps(response.json(), indent=2, ensure_ascii=False))
            return None
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return None

if __name__ == "__main__":
    # Crear orden de prueba
    create_order(ticket_count=3, price_per_ticket=33333)
```

---

## 6. Postman - Configuración

**Method:** POST  
**URL:** `https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/orders`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "reference": "test_postman",
  "customer_email": "jlyaleoficial@gmail.com",
  "amount": 99999,
  "tickets": [
    {
      "ticket_id": "{{$randomUUID}}",
      "ticketsDistId": "dist-001",
      "purchasePrice": 33333,
      "category": "GENERAL"
    },
    {
      "ticket_id": "{{$randomUUID}}",
      "ticketsDistId": "dist-001",
      "purchasePrice": 33333,
      "category": "GENERAL"
    },
    {
      "ticket_id": "{{$randomUUID}}",
      "ticketsDistId": "dist-001",
      "purchasePrice": 33333,
      "category": "GENERAL"
    }
  ],
  "metadata": {
    "eventName": "Test Postman",
    "hasSeating": false,
    "orderTotals": {
      "total_ticket_amount": 99999,
      "total_additional_charges": 0,
      "total_amount": 99999
    }
  }
}
```

---

## ✅ Respuesta Exitosa

```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "order_id": "test_orden_20260125_103045",
    "status": "RESERVED",
    "tickets_count": 3,
    "total_amount": 99999,
    "currency": "COP",
    "created_at": "2026-01-25T10:30:45.123Z"
  }
}
```

---

## ❌ Respuestas de Error

### Error: Faltan parámetros
```json
{
  "statusCode": 400,
  "body": {
    "message": "Faltan parámetros requeridos: eventId (event_id/eventId) y userId (user_id/userId/userID)",
    "debug": {
      "eventId": null,
      "userID": null,
      "body_keys": ["currency", "payment_status"],
      "metadata_keys": []
    }
  }
}
```

### Error: Totales inconsistentes
```json
{
  "statusCode": 400,
  "body": {
    "message": "Total mismatch: expected 99999, got 333915"
  }
}
```

---

Última actualización: 25 de Enero, 2026
