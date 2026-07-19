# Cómo Crear Órdenes - Guía Práctica

## 🔐 Autenticación en API Gateway

El endpoint `/orders` requiere autenticación a través de **AWS_IAM** o un **API Key** configurado en el API Gateway.

### Opción 1: Usar AWS CLI (Recomendado para pruebas)

```bash
# 1. Crear archivo payload.json
cat > payload.json << 'EOF'
{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "reference": "test_aws_cli",
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
}
EOF

# 2. Enviar petición firmada con AWS IAM
aws apigateway test-invoke-method \
  --rest-api-id ysfmaeawlf \
  --resource-id /orders \
  --http-method POST \
  --path-with-query-string /dev/orders \
  --body file://payload.json \
  --region us-east-1
```

---

### Opción 2: Usar AWS Lambda (Desde adentro del sistema)

Crear una función Lambda auxiliar que llame a createOrder sin autenticación:

```javascript
// lambda-invoke-create-order.js
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

exports.handler = async (event) => {
  try {
    const payload = {
      event_id: "1392904a-2554-4131-8cd8-a9314c46dc5a",
      user_id: "cedef71c-c",
      currency: "COP",
      payment_status: "PENDING",
      reference: `test_${Date.now()}`,
      customer_email: "jlyaleoficial@gmail.com",
      amount: 99999,
      tickets: [
        { ticket_id: "t1", ticketsDistId: "d1", purchasePrice: 33333 },
        { ticket_id: "t2", ticketsDistId: "d1", purchasePrice: 33333 },
        { ticket_id: "t3", ticketsDistId: "d1", purchasePrice: 33333 }
      ],
      metadata: {
        eventName: "Test Lambda",
        hasSeating: false,
        orderTotals: {
          total_ticket_amount: 99999,
          total_additional_charges: 0,
          total_amount: 99999
        }
      }
    };

    const result = await lambda.invoke({
      FunctionName: 'aws-lambda-orders-manageTickets-dev-createOrder',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        body: JSON.stringify(payload)
      })
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        result: JSON.parse(result.Payload)
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
```

---

### Opción 3: Desde DynamoDB / Logs (Testing)

Llama directamente la función handler exportada en `createOrder.js`:

```javascript
// test-local.js (para ejecutar localmente o en lambda)
const { handler } = require('./src/orders/createOrder');

const event = {
  body: JSON.stringify({
    event_id: "1392904a-2554-4131-8cd8-a9314c46dc5a",
    user_id: "cedef71c-c",
    currency: "COP",
    payment_status: "PENDING",
    reference: "test_local",
    customer_email: "jlyaleoficial@gmail.com",
    amount: 99999,
    tickets: [
      { ticket_id: "t1", ticketsDistId: "d1", purchasePrice: 33333 },
      { ticket_id: "t2", ticketsDistId: "d1", purchasePrice: 33333 },
      { ticket_id: "t3", ticketsDistId: "d1", purchasePrice: 33333 }
    ],
    metadata: {
      eventName: "Test Local",
      hasSeating: false,
      orderTotals: {
        total_ticket_amount: 99999,
        total_additional_charges: 0,
        total_amount: 99999
      }
    }
  })
};

handler(event).then(result => {
  console.log('Resultado:', JSON.stringify(result, null, 2));
});
```

---

## 🧪 Test Directo en Lambda Console

1. **Ir a AWS Lambda Console**
   - Service → Lambda → Functions
   - Buscar: `aws-lambda-orders-manageTickets-dev-createOrder`

2. **Click en "Test"**

3. **Crear test event:**
```json
{
  "body": "{\"event_id\": \"1392904a-2554-4131-8cd8-a9314c46dc5a\", \"user_id\": \"cedef71c-c\", \"currency\": \"COP\", \"payment_status\": \"PENDING\", \"reference\": \"test_console\", \"customer_email\": \"jlyaleoficial@gmail.com\", \"amount\": 99999, \"tickets\": [{\"ticket_id\": \"t1\", \"ticketsDistId\": \"d1\", \"purchasePrice\": 33333}, {\"ticket_id\": \"t2\", \"ticketsDistId\": \"d1\", \"purchasePrice\": 33333}, {\"ticket_id\": \"t3\", \"ticketsDistId\": \"d1\", \"purchasePrice\": 33333}], \"metadata\": {\"eventName\": \"Test Console\", \"hasSeating\": false, \"orderTotals\": {\"total_ticket_amount\": 99999, \"total_additional_charges\": 0, \"total_amount\": 99999}}}"
}
```

4. **Click "Test"** → Ver resultado en "Execution result"

---

## 📊 Verificar Orden Creada

### En DynamoDB Console:

```bash
# 1. Ir a DynamoDB → Tables → Orders
# 2. Buscar por order_id (reference usado)
# 3. Verificar campos:
#    - order_id
#    - user_id: cedef71c-c
#    - event_id: 1392904a-2554-4131-8cd8-a9314c46dc5a
#    - status: RESERVED
#    - tickets: array con 3 elementos
```

### En CloudWatch Logs:

```bash
# 1. Ir a CloudWatch → Log Groups
# 2. Buscar: /aws/lambda/aws-lambda-orders-manageTickets-dev-createOrder
# 3. Ver logs con timestamp reciente
# 4. Buscar por "🎫 Procesando" para ver logs de la función
```

---

## 🐛 Troubleshooting

### Error: "eventId, userID o tickets"

**Causa:** El payload no tiene la estructura correcta para `createOrder.js` (version antigua)

**Solución:** 
- Usar `manageOrders.createOrder` que soporta ambas estructuras
- O actualizar payload con estructura nueva (ver guía ORDERS_CREATION_GUIDE_COMPLETE.md)

### Error: "Missing Authentication Token"

**Causa:** Endpoint tiene autorización pero no pasaste credentials

**Solución:**
- Usar AWS CLI con `--signer=v4`
- O usar Lambda invoke desde otra función
- O desactivar autorización en API Gateway (no recomendado en producción)

### Error: "Total mismatch"

**Causa:** Sum(tickets[].purchasePrice) ≠ metadata.orderTotals.total_ticket_amount

**Solución:**
- Asegurar que la suma de purchasePrice = total_ticket_amount
- Ver ejemplo en ORDERS_CREATION_GUIDE_COMPLETE.md

---

## ✅ Próximos Pasos

1. **Test en Lambda Console** (recomendado)
   - Copiar payload del ejemplo
   - Pegar en test event
   - Ejecutar y verificar

2. **Verificar en DynamoDB**
   - Confirmar orden guardada
   - Verificar tickets reservados

3. **Monitorear CloudWatch**
   - Ver logs de creación
   - Confirmar no hay errores

4. **Notificaciones** (opcional)
   - Verificar que se envió notificación
   - Ver en tabla Notifications

---

Última actualización: 25 de Enero, 2026
