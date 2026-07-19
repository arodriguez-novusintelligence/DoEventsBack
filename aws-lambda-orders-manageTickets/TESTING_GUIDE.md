# 🧪 Guía de Pruebas - Flujo de Órdenes y TTL

## Cambios Implementados

### ✅ Liberación inmediata en pago fallido

Cuando el callback de pago recibe un estado fallido (`REJECTED`, `FAILED`, `DECLINED`, `ERROR`, `CANCELLED`), las boletas RESERVED vuelven automáticamente a AVAILABLE.

### ✅ TTL validado de 15 minutos

EventBridge Scheduler programa la liberación exactamente a los 15 minutos con validación.

---

## 📝 Escenarios de Prueba

### 1. **Prueba Rápida: Pago Fallido**

Crea una orden y simula un pago fallido inmediatamente.

```powershell
# Ejecutar el script de prueba completa
.\test-create-order-and-fail.ps1
```

**Resultado esperado:**

- ✅ Orden creada con estado PENDING
- ✅ Boletas cambian de AVAILABLE → RESERVED
- ✅ Callback de pago con status REJECTED
- ✅ Boletas vuelven a AVAILABLE inmediatamente
- ✅ Contadores actualizados

**Duración:** ~10 segundos

---

### 2. **Prueba con Orden Específica**

Si ya tienes una orden creada, simula el pago fallido:

```powershell
# Reemplazar con tu order_id
.\test-payment-failure.ps1 -OrderId "tu-order-id-aqui"

# Probar diferentes estados de fallo
.\test-payment-failure.ps1 -OrderId "tu-order-id" -Status "FAILED"
.\test-payment-failure.ps1 -OrderId "tu-order-id" -Status "DECLINED"
```

---

### 3. **Prueba TTL de 15 Minutos**

Valida que las órdenes expiren exactamente a los 15 minutos.

```powershell
# Crear orden y monitorear TTL
.\test-ttl-15min.ps1
```

**El script mostrará:**

- ✅ Orden creada
- ✅ TTL configurado (~15 minutos)
- ✅ EventBridge Scheduler creado
- 📋 Comandos de monitoreo

**Luego monitorear en tiempo real:**

```powershell
# Ver logs cuando expire (dejar corriendo)
aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder --follow --format short
```

**Resultado esperado después de 15 minutos:**

- ✅ EventBridge Scheduler invoca releaseExpiredOrder
- ✅ Orden: PENDING → CANCELLED
- ✅ Boletas: RESERVED → AVAILABLE
- ✅ Log muestra: "✅ Orden {id} cancelada y tickets liberados"

---

## 🔍 Verificaciones Manuales

### Verificar estado de orden en DynamoDB

```powershell
aws dynamodb get-item `
  --table-name Orders `
  --key '{"order_id":{"S":"tu-order-id"}}' `
  --output json | ConvertFrom-Json | Select-Object -ExpandProperty Item
```

### Verificar boletas en TicketsDistribution

```powershell
$eventId = "ba42aa8b-6e7b-4eb9-937e-260f7968288b"
Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$eventId/available-seats" -Method GET | ConvertTo-Json -Depth 10
```

### Ver schedule en EventBridge

```powershell
# Listar todos los schedules
aws scheduler list-schedules --output json | ConvertFrom-Json | Select-Object -ExpandProperty Schedules

# Ver schedule específico
aws scheduler get-schedule --name "release-order-{order-id}" --output json
```

### Ver logs de liberación

```powershell
# Últimos 30 minutos
aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder --since 30m --format short

# Filtrar por order_id específico
aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder --since 30m --format short | Select-String "tu-order-id"
```

---

## 📊 Tabla de Estados

| Momento          | Estado Orden     | Estado Boletas     | Contadores                                 |
| ---------------- | ---------------- | ------------------ | ------------------------------------------ |
| Inicial          | -                | AVAILABLE          | avaliableCapacity: N                       |
| Orden creada     | PENDING          | RESERVED           | avaliableCapacity: N-X, reservedTickets: X |
| Pago exitoso     | APPROVED         | RESERVED/CONFIRMED | Sin cambio                                 |
| **Pago fallido** | REJECTED/FAILED  | **AVAILABLE** ✅   | avaliableCapacity: N, reservedTickets: 0   |
| **TTL 15min**    | **CANCELLED** ✅ | **AVAILABLE** ✅   | avaliableCapacity: N, reservedTickets: 0   |

---

## ⚠️ Troubleshooting

### Las boletas no se liberan

1. Verificar que el endpoint recibe el callback:

   ```powershell
   aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-processPaymentCallback --since 10m
   ```

2. Verificar que el status es uno de los fallidos:
   - REJECTED
   - FAILED
   - DECLINED
   - ERROR
   - CANCELLED

3. Verificar que las boletas tienen orderId correcto en TicketsDistribution

### El TTL no es 15 minutos

1. Verificar logs al crear la orden:

   ```powershell
   aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-createOrder --since 10m
   ```

2. Buscar el mensaje: `"⚠️ TTL de orden {id} no es 15 minutos"`

3. Verificar variable TTL_MINUTES en createOrder.js (debe ser 15)

### Schedule no se crea

1. Verificar rol IAM: `SchedulerInvokeReleaseOrderRole`
2. Verificar permisos de scheduler en serverless.yml
3. Ver logs de error al crear orden

---

## 📞 Endpoints de Prueba

### Crear Orden

```
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders
```

### Callback de Pago

```
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/payments/callback
```

### Liberar Orden Manualmente

```
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/{orderId}/release
```

### Ver Boletas Disponibles

```
GET https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/{eventId}/available-seats
```

---

## 🎯 Checklist de Validación

- [ ] Crear orden (boletas pasan a RESERVED)
- [ ] Simular pago REJECTED (boletas vuelven a AVAILABLE)
- [ ] Verificar contadores actualizados
- [ ] Verificar TTL es ~15 minutos
- [ ] Verificar EventBridge Scheduler creado
- [ ] Esperar 15 minutos sin pagar
- [ ] Verificar orden CANCELLED automáticamente
- [ ] Verificar boletas liberadas
- [ ] Verificar logs muestran liberación
- [ ] Probar con múltiples boletas
- [ ] Probar con diferentes categorías

---

## 📈 Métricas Clave

Al finalizar las pruebas, validar:

1. **Tiempo de liberación en pago fallido**: < 5 segundos
2. **Tiempo de liberación por TTL**: Exactamente 15 minutos ± 10 segundos
3. **Precisión de contadores**: 100% (sin discrepancias)
4. **Logs generados**: Completos y descriptivos
5. **Schedules limpiados**: No acumulación de schedules viejos
