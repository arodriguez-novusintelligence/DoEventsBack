# 🚀 IMPLEMENTACIÓN DE NOTIFICACIONES - TRANSFER Y REFUND

## ✅ Cambios Implementados

### **1. aws-lambda-manageevents (Transfer & Refund)**

#### **transferTickets.js**
- ✅ Agregado cliente Lambda para invocar notificaciones
- ✅ Notificación al **RECEPTOR** después de transferencia exitosa
- ✅ Notificación al **EMISOR** después de transferencia exitosa
- ✅ Manejo de errores no críticos (no falla si falla la notificación)

**Template usado:**
- `TICKET_TRANSFERRED_RECEIVED` → Para el receptor
- `TICKET_TRANSFERRED_SENT` → Para el emisor

**Canales:** Email, Push, In-App, WhatsApp

---

#### **processRefund.js**
- ✅ Agregado cliente Lambda (@aws-sdk/client-lambda)
- ✅ Notificación al usuario después de procesar reembolso
- ✅ Manejo de errores no críticos

**Template usado:**
- `REFUND_REQUESTED` → Cuando se procesa el reembolso inicial

**Canales:** Email, Push, In-App, WhatsApp

---

#### **serverless.yml**
- ✅ Agregado permiso IAM para invocar `notifications-dev-triggerNotification`

---

### **2. aws-lambda-notifications (Templates)**

#### **src/templates/index.js**
- ✅ Creado template `REFUND_REQUESTED`
- ✅ Creado template `REFUND_APPROVED` (para uso futuro)
- ✅ Configurados todos los canales (email, push, inApp, whatsapp)

#### **Nuevos archivos creados:**

**Templates WhatsApp:**
- `src/templates/whatsapp/refund_requested.js`
- `src/templates/whatsapp/refund_approved.js`

**Templates Email:**
- `src/templates/email/refund_requested.hbs`
- `src/templates/email/refund_approved.hbs`

---

## 🔧 DESPLIEGUE

### **Paso 1: Desplegar aws-lambda-manageevents**

```powershell
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-manageevents
serverless deploy --force
```

**Funciones actualizadas:**
- ✅ `transferTickets` - Ahora envía notificaciones
- ✅ `processRefund` - Ahora envía notificaciones
- ✅ Permisos IAM actualizados

---

### **Paso 2: Desplegar aws-lambda-notifications**

```powershell
cd ..\aws-lambda-notifications
serverless deploy --force
```

**Recursos actualizados:**
- ✅ Templates REFUND_REQUESTED y REFUND_APPROVED
- ✅ Templates de WhatsApp para refund
- ✅ Templates de Email para refund

---

## 📋 CONFIGURACIÓN DE WHATSAPP (Meta Business Suite)

Debes crear estos templates en Meta Business Suite:

### **1. refund_requested**
```
Categoría: UTILITY
Idioma: Español (ES)

Body:
¡Hola {{1}}! Tu solicitud de reembolso para {{2}} ha sido recibida. Reembolsaremos {{3}} boleta(s) por un total de {{4}} {{5}}. El reembolso será procesado en {{6}} días hábiles.

Variables:
{{1}} - Nombre del usuario
{{2}} - Nombre del evento
{{3}} - Cantidad de boletas
{{4}} - Monto del reembolso
{{5}} - Moneda
{{6}} - Días de procesamiento
```

### **2. refund_approved**
```
Categoría: UTILITY
Idioma: Español (ES)

Body:
¡Hola {{1}}! Tu reembolso para {{2}} ha sido aprobado. Recibirás {{3}} {{4}} en tu método de pago original en {{5}} días hábiles.

Variables:
{{1}} - Nombre del usuario
{{2}} - Nombre del evento
{{3}} - Monto del reembolso
{{4}} - Moneda
{{5}} - Días de procesamiento
```

---

## 🧪 PRUEBAS

### **Probar Transfer con Notificaciones**

```bash
# Endpoint: POST /transferTickets

curl -X POST https://tu-api.execute-api.us-east-1.amazonaws.com/transferTickets \
  -H "Content-Type: application/json" \
  -d '{
    "fromUserId": "user-uuid-emisor",
    "toUserId": "user-uuid-receptor",
    "orderId": "order-uuid",
    "transferAll": true
  }'
```

**Verificar:**
- ✅ Transferencia se completa exitosamente
- ✅ Receptor recibe notificación (email, push, in-app, whatsapp)
- ✅ Emisor recibe notificación (email, push, in-app, whatsapp)
- ✅ Logs muestran "✅ Notificación al receptor enviada"
- ✅ Logs muestran "✅ Notificación al emisor enviada"

---

### **Probar Refund con Notificaciones**

```bash
# Endpoint: POST /processRefund

curl -X POST https://tu-api.execute-api.us-east-1.amazonaws.com/processRefund \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "orderId": "order-uuid",
    "reason": "No puedo asistir"
  }'
```

**Verificar:**
- ✅ Reembolso se procesa exitosamente
- ✅ Usuario recibe notificación (email, push, in-app, whatsapp)
- ✅ Logs muestran "✅ Notificación de reembolso enviada exitosamente"

---

## 📊 MONITOREO

### **Ver logs de transferTickets:**
```powershell
aws logs tail "/aws/lambda/aws-lambda-manageevent-dev-transferTickets" --since 5m --follow --region us-east-1
```

### **Ver logs de processRefund:**
```powershell
aws logs tail "/aws/lambda/aws-lambda-manageevent-dev-processRefund" --since 5m --follow --region us-east-1
```

### **Ver logs de notificaciones:**
```powershell
aws logs tail "/aws/lambda/notifications-dev-triggerNotification" --since 5m --follow --region us-east-1
```

---

## 🔍 TROUBLESHOOTING

### **Si las notificaciones no se envían:**

1. **Verificar permisos IAM:**
   ```powershell
   aws lambda get-policy --function-name aws-lambda-manageevent-dev-transferTickets
   ```

2. **Verificar variable de entorno:**
   - `NOTIFICATIONS_LAMBDA` debe ser `notifications-dev-triggerNotification`

3. **Ver logs de errores:**
   ```powershell
   aws logs filter-log-events --log-group-name "/aws/lambda/aws-lambda-manageevent-dev-transferTickets" --filter-pattern "Error enviando notificaciones"
   ```

4. **Verificar que función de notificaciones existe:**
   ```powershell
   aws lambda get-function --function-name notifications-dev-triggerNotification
   ```

---

## 📝 METADATA REQUERIDA

### **Transfer (TICKET_TRANSFERRED_RECEIVED):**
```javascript
{
  userId: "uuid",
  senderName: "string",
  senderEmail: "string",
  receiverName: "string",
  eventId: "uuid",
  eventName: "string",
  ticketCount: number,
  orderId: "uuid",
  transferDate: "ISO string",
  ticketDetails: [...]
}
```

### **Transfer (TICKET_TRANSFERRED_SENT):**
```javascript
{
  userId: "uuid",
  senderName: "string",
  receiverName: "string",
  receiverEmail: "string",
  eventId: "uuid",
  eventName: "string",
  ticketCount: number,
  orderId: "uuid",
  transferDate: "ISO string"
}
```

### **Refund (REFUND_REQUESTED):**
```javascript
{
  userId: "uuid",
  refundId: "uuid",
  orderId: "uuid",
  eventId: "uuid",
  eventName: "string",
  ticketCount: number,
  refundAmount: number,
  currency: "COP",
  refundType: "TOTAL" | "PARCIAL",
  refundDate: "ISO string",
  processingDays: "3-5",
  ticketDetails: [...]
}
```

---

## ⚠️ NOTAS IMPORTANTES

1. **Las notificaciones son asíncronas** (`InvocationType: "Event"`)
   - No bloquean el flujo principal
   - Si fallan, no afectan la transferencia/reembolso

2. **Manejo de errores:**
   - Los errores de notificación se loguean pero NO fallan la operación
   - Búsqueda en logs: "⚠️ Error enviando notificaciones"

3. **Templates de WhatsApp:**
   - Deben estar aprobados en Meta Business Suite
   - Si no existen, solo fallarán las notificaciones de WhatsApp

4. **Costos:**
   - WhatsApp: ~$0.005 por mensaje (depende del país)
   - Email (SES): ~$0.10 por 1000 emails
   - Lambda: Incluido en free tier

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [x] Código actualizado en transferTickets.js
- [x] Código actualizado en processRefund.js
- [x] Templates creados en index.js
- [x] Templates de WhatsApp creados
- [x] Templates de Email creados
- [x] Permisos IAM actualizados
- [ ] Deploy de aws-lambda-manageevents
- [ ] Deploy de aws-lambda-notifications
- [ ] Crear templates en Meta Business Suite
- [ ] Probar transferencia con notificaciones
- [ ] Probar reembolso con notificaciones
- [ ] Verificar emails recibidos
- [ ] Verificar WhatsApp recibidos
- [ ] Verificar notificaciones in-app

---

## 🎯 PRÓXIMOS PASOS OPCIONALES

1. **Agregar REFUND_DENIED template** (para reembolsos rechazados)
2. **Agregar TRANSFER_CANCELLED template** (si se cancela una transferencia)
3. **Dashboard de notificaciones** (ver qué notificaciones se enviaron)
4. **Reintentos automáticos** (si falla el envío)
5. **Preferencias de usuario** (elegir canales preferidos)

---

**Fecha de implementación:** 2026-01-20
**Autor:** GitHub Copilot
**Versión:** 1.0
