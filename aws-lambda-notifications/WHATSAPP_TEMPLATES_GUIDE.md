# Guía Completa de Templates de WhatsApp

Todos los templates de WhatsApp requeridos para DoEvents, con estructura Meta Business Suite, manejo de imágenes firmadas y soporte para indicativos internacionales.

---

## 📋 Tabla de Templates Requeridos

| Nombre Template | ID Trigger | Con Imagen | Parámetros Body | Estado |
|---|---|---|---|---|
| `event_invitation` | EVENT_INVITATION | ✅ Sí | 3 | Activo |
| `ticket_transferred_received` | TICKET_TRANSFERRED_RECEIVED | ❌ No | 3 | Activo |
| `ticket_transferred_sent` | TICKET_TRANSFERRED_SENT | ❌ No | 3 | Activo |
| `refund_requested` | REFUND_REQUESTED | ❌ No | 3 | Activo |
| `refund_approved` | REFUND_APPROVED | ❌ No | 3 | Activo |
| `event_cancelled` | EVENT_CANCELLED | ✅ Sí | 2 | Activo |
| `event_rescheduled` | EVENT_RESCHEDULED | ✅ Sí | 4 | Activo |
| `get_otp` | GET_OTP | ❌ No | 1 | Activo |

---

## 🔧 Estructura Base de Template WhatsApp en Meta Business Suite

Todos los templates siguen esta estructura:

```
Header: [Tipo - texto/imagen/video]
Body: [Texto con {{1}}, {{2}}, {{3}}, etc. como placeholders]
Footer: [Texto opcional]
Button: [Tipo - URL/Teléfono/Copiar código - Opcional]
```

---

## 1️⃣ EVENT_INVITATION

**Nombre en Meta:** `event_invitation`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ✅ Sí  

### Estructura Meta Business Suite
```
Header: Imagen (URL del evento - DEBE SER FIRMADA)
Body: "Hola {{1}}, {{2}} te ha invitado al evento {{3}}. 🎉"
Footer: "DoEvents"
Button: URL - "Ver detalles" → https://app.doevents.com/event/{{4}}
```

### Parámetros Requeridos (en metadata)
- `userId` - ID del usuario invitado
- `favoriteUserName` ({{1}}) - Nombre del usuario invitado
- `inviterName` ({{2}}) - Nombre del usuario que invita
- `eventName` ({{3}}) - Nombre del evento
- `eventId` ({{4}}) - ID del evento para la URL
- `eventImage` - URL de la imagen (automáticamente se firma en `getEventImageUrl`)
- `eventDate` - Fecha del evento (opcional)
- `eventLocation` - Ubicación del evento (opcional)

### Código JavaScript (template builder)
```javascript
module.exports = ({ metadata }) => {
  const {
    favoriteUserName,
    inviterName,
    eventName,
    eventId,
    eventImage,
  } = metadata;

  // URL de imagen con firma S3 (ya viene firmada desde getEventImageUrl)
  const imageUrl = eventImage || "https://doeventsapp.com/default-event.png";

  return [
    {
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: imageUrl },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: favoriteUserName || "Usuario" },
        { type: "text", text: inviterName || "Alguien" },
        { type: "text", text: eventName || "un evento" },
        { type: "text", text: eventId || "" },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 2️⃣ TICKET_TRANSFERRED_RECEIVED

**Nombre en Meta:** `ticket_transferred_received`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ❌ No  

### Estructura Meta Business Suite
```
Header: Texto (Emoji)
Body: "Hola {{1}}, {{2}} te ha transferido {{3}} boleta(s) para {{4}}."
Footer: "DoEvents"
Button: URL - "Ver boletas" → https://app.doevents.com/orders/{{5}}
```

### Parámetros Requeridos
- `userId` - ID del usuario receptor
- `receiverName` ({{1}}) - Nombre del receptor
- `senderName` ({{2}}) - Nombre de quien envía
- `ticketCount` ({{3}}) - Cantidad de boletas
- `eventName` ({{4}}) - Nombre del evento
- `orderID` ({{5}}) - ID de la orden

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const {
    receiverName,
    senderName,
    ticketCount,
    eventName,
    orderID,
  } = metadata;

  return [
    {
      type: "header",
      parameters: [
        { type: "text", text: "🎫" },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: receiverName || "Usuario" },
        { type: "text", text: senderName || "Alguien" },
        { type: "text", text: String(ticketCount || 1) },
        { type: "text", text: eventName || "un evento" },
        { type: "text", text: orderID || "" },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 3️⃣ TICKET_TRANSFERRED_SENT

**Nombre en Meta:** `ticket_transferred_sent`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ❌ No  

### Estructura Meta Business Suite
```
Header: Texto (Emoji)
Body: "Hola {{1}}, has transferido {{2}} boleta(s) a {{3}} para {{4}}."
Footer: "DoEvents"
Button: URL - "Verificar" → https://app.doevents.com/orders/{{5}}
```

### Parámetros Requeridos
- `userId` - ID del usuario remitente
- `senderName` ({{1}}) - Nombre de quien envía
- `ticketCount` ({{2}}) - Cantidad de boletas
- `receiverName` ({{3}}) - Nombre del receptor
- `eventName` ({{4}}) - Nombre del evento
- `orderID` ({{5}}) - ID de la orden

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const {
    senderName,
    ticketCount,
    receiverName,
    eventName,
    orderID,
  } = metadata;

  return [
    {
      type: "header",
      parameters: [
        { type: "text", text: "✅" },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: senderName || "Usuario" },
        { type: "text", text: String(ticketCount || 1) },
        { type: "text", text: receiverName || "Alguien" },
        { type: "text", text: eventName || "un evento" },
        { type: "text", text: orderID || "" },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 4️⃣ REFUND_REQUESTED

**Nombre en Meta:** `refund_requested`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ❌ No  

### Estructura Meta Business Suite
```
Header: Texto (Emoji)
Body: "Hola {{1}}, tu solicitud de reembolso de {{2}} {{3}} para {{4}} está siendo procesada."
Footer: "Plazo: 3-5 días hábiles"
```

### Parámetros Requeridos
- `userId` - ID del usuario
- `userName` ({{1}}) - Nombre del usuario
- `refundAmount` ({{2}}) - Monto del reembolso
- `currency` ({{3}}) - Moneda (COP, USD, etc.)
- `eventName` ({{4}}) - Nombre del evento

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const {
    userName,
    refundAmount,
    currency,
    eventName,
  } = metadata;

  return [
    {
      type: "header",
      parameters: [
        { type: "text", text: "⏳" },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: userName || "Usuario" },
        { type: "text", text: String(refundAmount || 0) },
        { type: "text", text: currency || "COP" },
        { type: "text", text: eventName || "un evento" },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 5️⃣ REFUND_APPROVED

**Nombre en Meta:** `refund_approved`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ❌ No  

### Estructura Meta Business Suite
```
Header: Texto (Emoji)
Body: "Hola {{1}}, tu reembolso de {{2}} {{3}} ha sido aprobado. Recibirás el dinero en {{4}} días hábiles."
Footer: "DoEvents"
```

### Parámetros Requeridos
- `userId` - ID del usuario
- `userName` ({{1}}) - Nombre del usuario
- `refundAmount` ({{2}}) - Monto del reembolso
- `currency` ({{3}}) - Moneda
- `processingDays` ({{4}}) - Días hábiles para procesar

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const {
    userName,
    refundAmount,
    currency,
    processingDays,
  } = metadata;

  return [
    {
      type: "header",
      parameters: [
        { type: "text", text: "✅" },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: userName || "Usuario" },
        { type: "text", text: String(refundAmount || 0) },
        { type: "text", text: currency || "COP" },
        { type: "text", text: String(processingDays || "3-5") },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 6️⃣ EVENT_CANCELLED

**Nombre en Meta:** `event_cancelled`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ✅ Sí  

### Estructura Meta Business Suite
```
Header: Imagen (Logo del evento)
Body: "Hola {{1}}, lamentamos informarte que el evento {{2}} ha sido cancelado."
Footer: "DoEvents"
Button: URL - "Información" → https://app.doevents.com/event/{{3}}
```

### Parámetros Requeridos
- `userId` - ID del usuario
- `userName` ({{1}}) - Nombre del usuario
- `eventName` ({{2}}) - Nombre del evento
- `eventId` ({{3}}) - ID del evento
- `eventImage` - URL de la imagen (FIRMADA)
- `reason` - Razón de cancelación (opcional)

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const {
    userName,
    eventName,
    eventId,
    eventImage,
  } = metadata;

  const imageUrl = eventImage || "https://doeventsapp.com/default-event.png";

  return [
    {
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: imageUrl },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: userName || "Usuario" },
        { type: "text", text: eventName || "un evento" },
        { type: "text", text: eventId || "" },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 7️⃣ EVENT_RESCHEDULED

**Nombre en Meta:** `event_rescheduled`  
**Canales:** inApp, push, email, whatsapp  
**Con imagen:** ✅ Sí  

### Estructura Meta Business Suite
```
Header: Imagen (Logo del evento)
Body: "Hola {{1}}, el evento {{2}} ha sido reprogramado para {{3}} a las {{4}}."
Footer: "DoEvents"
Button: URL - "Ver detalles" → https://app.doevents.com/event/{{5}}
```

### Parámetros Requeridos
- `userId` - ID del usuario
- `userName` ({{1}}) - Nombre del usuario
- `eventName` ({{2}}) - Nombre del evento
- `newDate` ({{3}}) - Nueva fecha (formato: DD/MM/YYYY)
- `newTime` ({{4}}) - Nueva hora (formato: HH:MM)
- `eventId` ({{5}}) - ID del evento
- `eventImage` - URL de la imagen (FIRMADA)

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const {
    userName,
    eventName,
    newDate,
    newTime,
    eventId,
    eventImage,
  } = metadata;

  const imageUrl = eventImage || "https://doeventsapp.com/default-event.png";

  return [
    {
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: imageUrl },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: userName || "Usuario" },
        { type: "text", text: eventName || "un evento" },
        { type: "text", text: newDate || "fecha por confirmar" },
        { type: "text", text: newTime || "hora por confirmar" },
        { type: "text", text: eventId || "" },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 8️⃣ GET_OTP

**Nombre en Meta:** `get_otp`  
**Canales:** whatsapp  
**Con imagen:** ❌ No  

### Estructura Meta Business Suite
```
Header: Texto
Body: "Tu código de verificación es: {{1}}. No lo compartas con nadie."
Footer: "Válido por 10 minutos"
Button: OTP Copy - "{{1}}"
```

### Parámetros Requeridos
- `userId` - ID del usuario
- `otp` ({{1}}) - Código OTP de 6 dígitos

### Código JavaScript
```javascript
module.exports = ({ metadata }) => {
  const { otp } = metadata;

  return [
    {
      type: "header",
      parameters: [
        { type: "text", text: "🔐" },
      ],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: String(otp || "000000") },
      ],
    },
    {
      type: "footer",
      parameters: [],
    },
  ];
};
```

---

## 🌍 Manejo de Indicativos Internacionales

### En el Cliente (tabla Client)
Los clientes deben tener uno de estos formatos:

**Opción 1: Campo `phone` unificado (legacy)**
```json
{
  "id": "user-123",
  "phone": "+573001234567",
  "countryCode": "+57"
}
```

**Opción 2: Campos separados (recomendado)**
```json
{
  "id": "user-123",
  "countryCode": "+57",
  "phoneNumber": "3001234567",
  "indicativo": "57",
  "phone": "+573001234567"
}
```

### En whatsappNotification.js (ya implementado)
```javascript
// RECIPIENT PHONE - Manejar ambos formatos
let toSanitized;
if (client.phoneNumber && client.countryCode) {
  // Usar formato separado: +57 + 3001234567
  toSanitized = `${client.countryCode}${client.phoneNumber}`.replace(/[^0-9]/g, "");
} else {
  // Usar formato unificado: +573001234567
  toSanitized = String(client.phone || "").replace(/[^0-9]/g, "");
}

// Resultado: 573001234567 (sin símbolos)
// WhatsApp API lo entiende correctamente
```

### Ejemplos de Indicativos por País
```
Colombia:    +57  (celular: 10 dígitos)
México:      +52  (celular: 10 dígitos)
Argentina:   +54  (celular: 10 dígitos)
España:      +34  (celular: 9 dígitos)
USA:         +1   (celular: 10 dígitos)
Chile:       +56  (celular: 9 dígitos)
Perú:        +51  (celular: 9 dígitos)
```

---

## 🖼️ Imágenes Firmadas en Templates

### Templates CON Imagen
- `event_invitation`
- `event_cancelled`
- `event_rescheduled`

### Cómo se Firman las URLs
En `getEventImageUrl.js` (ya implementado):

```javascript
// Recibe eventId, obtiene la imagen y devuelve URL firmada
const getEventImageUrl = async (eventId) => {
  const event = await dynamodb.get({
    TableName: "Eventos",
    Key: { id: eventId }
  }).promise();

  const imageKey = event.Item?.main_image || event.Item?.imagenPrincipal;
  
  if (!imageKey) return "https://doeventsapp.com/default-event.png";

  // Generar URL firmada válida por 24 horas
  const signedUrl = s3.getSignedUrl('getObject', {
    Bucket: 'doeventimageeventbucket',
    Key: imageKey,
    Expires: 86400 // 24 horas
  });

  return signedUrl;
};
```

### Uso en Metadata
```javascript
// En la función que envía notificación
const eventImage = await getEventImageUrl(metadata.eventId);

// Se pasa al template
await axios.post(NOTIFICATIONS_API, {
  triggerId: 'EVENT_INVITATION',
  userId: userId,
  metadata: {
    ...metadata,
    eventImage // URL ya firmada
  }
});
```

---

## ✅ Configuración en Meta Business Suite

### Pasos para Registrar cada Template

1. **Ir a:** WhatsApp Business → Configuración → Plantillas de mensajes
2. **Crear plantilla:**
   - Nombre: `event_invitation` (exactamente como en la tabla)
   - Categoría: `MARKETING` o `TRANSACTIONAL` (según corresponda)
   - Idioma: Español

3. **Header:**
   - Tipo: `Imagen` (si aplica) o `Texto`
   - Contenido: Describir el tipo

4. **Body:**
   - Incluir {{1}}, {{2}}, etc.
   - Ej: "Hola {{1}}, {{2}} te invita a {{3}}"

5. **Footer:**
   - Opcional: "DoEvents"

6. **Buttons:**
   - Tipo: `URL Dynamic` o `Quick Reply`
   - Ej: "Ver detalles" → `https://app.doevents.com/event/{{4}}`

7. **Guardar y esperar aprobación** (generalmente 5 minutos - 24 horas)

---

## 📝 Checklist de Deployment

- [ ] Crear todos 8 templates en Meta Business Suite
- [ ] Verificar que los nombres coincidan exactamente
- [ ] Confirmar que templates están "APROBADOS"
- [ ] Implementar `getEventImageUrl.js` con URLs firmadas
- [ ] Actualizar `whatsappNotification.js` con manejo de indicativos
- [ ] Validar que metadata incluya todos los parámetros requeridos
- [ ] Testear con números reales de múltiples países
- [ ] Verificar que imágenes se cargan correctamente en WhatsApp
- [ ] Monitorear logs de errores en CloudWatch

---

## 🔗 Referencias Útiles

- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/message-templates)
- [WhatsApp Template Guidelines](https://www.whatsapp.com/business/api/getting-started/message-templates/)
- [ISO Country Codes](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes)

---

Última actualización: 25 de Enero, 2026
