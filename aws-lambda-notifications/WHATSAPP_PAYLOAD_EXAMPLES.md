# Ejemplos de Payload - WhatsApp Templates con Indicativos Correctos

Ejemplos de payloads completos para testear cada template de WhatsApp con usuarios de diferentes países.

---

## 1️⃣ EVENT_INVITATION - Usuario de Colombia

**Endpoint:** POST `/notifications/trigger`

```json
{
  "triggerId": "EVENT_INVITATION",
  "userId": "user-col-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-col-001",
    "favoriteUserName": "Juan Pérez",
    "inviterName": "Carlos López",
    "eventName": "Concierto 2026",
    "eventId": "evt-12345",
    "eventImage": "https://doeventbucket.s3.amazonaws.com/event-image.jpg?X-Amz-Signature=...",
    "eventDate": "2026-02-15",
    "eventLocation": "Bogotá, Colombia"
  }
}
```

**Cliente en DynamoDB (formato recomendado):**
```json
{
  "id": "user-col-001",
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "countryCode": "+57",
  "phoneNumber": "3001234567",
  "indicativo": "57",
  "phone": "+573001234567"
}
```

**Resultado WhatsApp:**
- Número enviado: `573001234567` (sin símbolos)
- Mensaje: "Hola Juan Pérez, Carlos López te ha invitado al evento Concierto 2026. 🎉"

---

## 2️⃣ EVENT_INVITATION - Usuario de México

```json
{
  "triggerId": "EVENT_INVITATION",
  "userId": "user-mex-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-mex-001",
    "favoriteUserName": "María García",
    "inviterName": "Antonio Ruiz",
    "eventName": "Festival de Música",
    "eventId": "evt-67890",
    "eventImage": "https://doeventbucket.s3.amazonaws.com/festival.jpg?X-Amz-Signature=...",
    "eventDate": "2026-03-20",
    "eventLocation": "Ciudad de México"
  }
}
```

**Cliente en DynamoDB:**
```json
{
  "id": "user-mex-001",
  "name": "María García",
  "email": "maria@example.com",
  "countryCode": "+52",
  "phoneNumber": "5512345678",
  "indicativo": "52",
  "phone": "+525512345678"
}
```

**Resultado:** Número enviado: `525512345678`

---

## 3️⃣ EVENT_INVITATION - Usuario de Argentina

```json
{
  "triggerId": "EVENT_INVITATION",
  "userId": "user-arg-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-arg-001",
    "favoriteUserName": "Lucas Fernández",
    "inviterName": "Sofía Martínez",
    "eventName": "Evento Deportivo",
    "eventId": "evt-11223",
    "eventImage": "https://doeventbucket.s3.amazonaws.com/sports.jpg?X-Amz-Signature=...",
    "eventDate": "2026-04-10",
    "eventLocation": "Buenos Aires"
  }
}
```

**Cliente en DynamoDB:**
```json
{
  "id": "user-arg-001",
  "name": "Lucas Fernández",
  "countryCode": "+54",
  "phoneNumber": "1123456789",
  "indicativo": "54",
  "phone": "+541123456789"
}
```

**Resultado:** Número enviado: `541123456789`

---

## 4️⃣ TICKET_TRANSFERRED_RECEIVED - Transferencia a Usuario

```json
{
  "triggerId": "TICKET_TRANSFERRED_RECEIVED",
  "userId": "user-receptor-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-receptor-001",
    "receiverName": "Ana López",
    "senderName": "Carlos Mendoza",
    "ticketCount": 2,
    "eventName": "Concierto Rock 2026",
    "orderID": "order-abc123",
    "eventId": "evt-45678",
    "eventDate": "2026-02-28"
  }
}
```

**Cliente Receptor:**
```json
{
  "id": "user-receptor-001",
  "name": "Ana López",
  "countryCode": "+57",
  "phoneNumber": "3109876543",
  "phone": "+573109876543"
}
```

**Mensaje WhatsApp:**
"Hola Ana López, Carlos Mendoza te ha transferido 2 boleta(s) para Concierto Rock 2026."

---

## 5️⃣ TICKET_TRANSFERRED_SENT - Confirmación al Remitente

```json
{
  "triggerId": "TICKET_TRANSFERRED_SENT",
  "userId": "user-remitente-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-remitente-001",
    "senderName": "Carlos Mendoza",
    "ticketCount": 2,
    "receiverName": "Ana López",
    "eventName": "Concierto Rock 2026",
    "orderID": "order-abc123",
    "eventId": "evt-45678"
  }
}
```

**Cliente Remitente (España):**
```json
{
  "id": "user-remitente-001",
  "name": "Carlos Mendoza",
  "countryCode": "+34",
  "phoneNumber": "612345678",
  "indicativo": "34",
  "phone": "+34612345678"
}
```

**Resultado:** Número enviado: `34612345678`  
**Mensaje:** "Hola Carlos Mendoza, has transferido 2 boleta(s) a Ana López para Concierto Rock 2026."

---

## 6️⃣ REFUND_REQUESTED - Solicitud de Reembolso

```json
{
  "triggerId": "REFUND_REQUESTED",
  "userId": "user-refund-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-refund-001",
    "userName": "Diego Pérez",
    "refundAmount": 150000,
    "currency": "COP",
    "eventName": "Concierto Cancelado",
    "refundType": "FULL",
    "ticketCount": 3,
    "orderId": "order-xyz789",
    "refundId": "refund-001",
    "processingDays": "3-5"
  }
}
```

**Cliente (Colombia):**
```json
{
  "id": "user-refund-001",
  "name": "Diego Pérez",
  "countryCode": "+57",
  "phoneNumber": "3156789012",
  "phone": "+573156789012"
}
```

**Mensaje WhatsApp:**
"Hola Diego Pérez, tu solicitud de reembolso de 150000 COP para Concierto Cancelado está siendo procesada."

---

## 7️⃣ REFUND_APPROVED - Reembolso Aprobado

```json
{
  "triggerId": "REFUND_APPROVED",
  "userId": "user-refund-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-refund-001",
    "userName": "Diego Pérez",
    "refundAmount": 150000,
    "currency": "COP",
    "eventName": "Concierto Cancelado",
    "refundType": "FULL",
    "ticketCount": 3,
    "orderId": "order-xyz789",
    "refundId": "refund-001",
    "processingDays": "5",
    "approvalDate": "2026-01-25T14:30:00Z"
  }
}
```

**Mensaje WhatsApp:**
"Hola Diego Pérez, tu reembolso de 150000 COP ha sido aprobado. Recibirás el dinero en 5 días hábiles."

---

## 8️⃣ EVENT_CANCELLED - Evento Cancelado

```json
{
  "triggerId": "EVENT_CANCELLED",
  "userId": "user-evt-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-evt-001",
    "userName": "Roberto Silva",
    "eventName": "Festival de Verano 2026",
    "eventId": "evt-cancelled-001",
    "eventImage": "https://doeventbucket.s3.amazonaws.com/festival-summer.jpg?X-Amz-Signature=...",
    "reason": "Condiciones climáticas adversas"
  }
}
```

**Cliente (USA):**
```json
{
  "id": "user-evt-001",
  "name": "Roberto Silva",
  "countryCode": "+1",
  "phoneNumber": "5551234567",
  "indicativo": "1",
  "phone": "+15551234567"
}
```

**Resultado:** Número enviado: `15551234567`  
**Mensaje:** "Hola Roberto Silva, lamentamos informarte que el evento Festival de Verano 2026 ha sido cancelado."

---

## 9️⃣ EVENT_RESCHEDULED - Evento Reprogramado

```json
{
  "triggerId": "EVENT_RESCHEDULED",
  "userId": "user-evt-002",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-evt-002",
    "userName": "Alejandra Gómez",
    "eventName": "Concierto de Jazz",
    "eventId": "evt-reschedule-001",
    "newDate": "15/03/2026",
    "newTime": "20:00",
    "eventImage": "https://doeventbucket.s3.amazonaws.com/jazz-concert.jpg?X-Amz-Signature=...",
    "originalDate": "08/03/2026"
  }
}
```

**Cliente (Chile):**
```json
{
  "id": "user-evt-002",
  "name": "Alejandra Gómez",
  "countryCode": "+56",
  "phoneNumber": "987654321",
  "indicativo": "56",
  "phone": "+56987654321"
}
```

**Resultado:** Número enviado: `56987654321`  
**Mensaje:** "Hola Alejandra Gómez, el evento Concierto de Jazz ha sido reprogramado para 15/03/2026 a las 20:00."

---

## 🔟 GET_OTP - Código de Verificación

```json
{
  "triggerId": "GET_OTP",
  "userId": "user-otp-001",
  "channels": ["whatsapp"],
  "metadata": {
    "userId": "user-otp-001",
    "otp": "654321"
  }
}
```

**Cliente (Perú):**
```json
{
  "id": "user-otp-001",
  "name": "Miguel Torres",
  "countryCode": "+51",
  "phoneNumber": "987654321",
  "phone": "+51987654321"
}
```

**Resultado:** Número enviado: `51987654321`  
**Mensaje:** "Tu código de verificación es: 654321. No lo compartas con nadie."

---

## 🧪 Test de Indicativos - Todos los Países

| País | Indicativo | Ejemplo Número | Esperado en WhatsApp |
|---|---|---|---|
| Colombia | +57 | 3001234567 | 573001234567 |
| México | +52 | 5512345678 | 525512345678 |
| Argentina | +54 | 1123456789 | 541123456789 |
| España | +34 | 612345678 | 34612345678 |
| USA | +1 | 5551234567 | 15551234567 |
| Chile | +56 | 987654321 | 56987654321 |
| Perú | +51 | 987654321 | 51987654321 |

---

## ⚠️ Notas Importantes

### Formatos de Teléfono
- **Nunca incluir:** Espacios, guiones, paréntesis
- **Siempre remover:** `+`, `-`, `(`, `)`, espacios
- **Formato final:** Solo dígitos: `573001234567`

### URLs de Imágenes
- Deben ser **URLs firmadas de S3** válidas por mínimo 24 horas
- Formato: `https://bucket.s3.amazonaws.com/key?X-Amz-Signature=...&X-Amz-Expires=...`
- Meta descargará la imagen al crear el template, no cada vez que se envía

### Parámetros Body ({{1}}, {{2}}, etc.)
- El orden importa: {{1}} es el primer parámetro
- Todos los {{n}} deben estar presentes en el body del template en Meta
- Los valores se pasan en orden en el array `parameters`

### Estados de Template en Meta
- `PENDING_DELETION` - Será eliminada
- `REJECTED` - Fue rechazada, revisar violaciones
- `DISABLED` - Deshabilitada por Meta
- `APPROVED` - Lista para usar ✅

---

## 🚀 Verificación Post-Deployment

```bash
# 1. Verificar que los templates están en Meta Business Suite
# Dashboard → WhatsApp → Configuración → Plantillas

# 2. Verificar CloudWatch logs
# /aws/lambda/notifications-dev-triggerNotification

# 3. Monitorear tabla Notifications en DynamoDB
# Filtrar por channel="whatsapp"

# 4. Verificar tabla Client
# Confirmar countryCode + phoneNumber correctos
```

---

Última actualización: 25 de Enero, 2026
