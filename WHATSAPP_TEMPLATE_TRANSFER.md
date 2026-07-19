# Template de WhatsApp para Transferencia de Boletas

## Información del Template en Meta Business Suite

### Nombre del Template

`ticket_transferred_received`

### Categoría

**TRANSACTIONAL** (Transaccional - notificación de transferencia completada)

### Idioma

**Spanish (es)**

---

## Estructura del Template

### 1. Header (Encabezado)

**Tipo:** Imagen
**Contenido:** Imagen dinámica del evento

```
{{1}} <- URL de la imagen del evento
```

**Imagen por defecto si no hay imagen:**

```
https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png
```

---

### 2. Body (Cuerpo del mensaje)

**Contenido:**

```
¡Hola {{1}}! {{2}} te ha transferido {{3}} boleta(s) para el evento {{4}}. Las boletas ya están disponibles en tu cuenta.
```

**Parámetros:**

- `{{1}}` - **receiverName**: Nombre del usuario que recibe las boletas (ej: "Juan Pérez")
- `{{2}}` - **senderName**: Nombre del usuario que envía las boletas (ej: "María García")
- `{{3}}` - **ticketCount**: Cantidad de boletas transferidas (ej: "2")
- `{{4}}` - **eventName**: Nombre del evento (ej: "Concierto de Rock 2025")

**Ejemplo renderizado:**

```
¡Hola Juan Pérez! María García te ha transferido 2 boleta(s) para el evento Concierto de Rock 2025. Las boletas ya están disponibles en tu cuenta.
```

---

### 3. Button (Botón)

**Tipo:** URL Dinámica
**Texto del botón:** Ver mis boletas
**URL base:** `https://doevents.com/mis-boletas/{{1}}`

**Parámetros:**

- `{{1}}` - **orderID**: ID de la nueva orden creada para el receptor (ej: "ORD_1737123456789_ABC123")

**URL completa de ejemplo:**

```
https://doevents.com/mis-boletas/ORD_1737123456789_ABC123
```

---

## Configuración en Meta Business Suite

### Paso 1: Crear Nuevo Template

1. Ir a **Meta Business Suite** > **Configuración de WhatsApp** > **Plantillas de mensajes**
2. Click en **Crear plantilla**
3. Nombre: `ticket_transferred_received`
4. Categoría: **Transaccional**
5. Idioma: **Español**

### Paso 2: Configurar Header

1. Seleccionar tipo: **Imagen**
2. Agregar variable: `{{1}}`
3. Subir imagen de ejemplo (cualquier imagen de evento para preview)

### Paso 3: Configurar Body

Copiar y pegar exactamente:

```
¡Hola {{1}}! {{2}} te ha transferido {{3}} boleta(s) para el evento {{4}}. Las boletas ya están disponibles en tu cuenta.
```

### Paso 4: Configurar Button

1. Tipo: **URL Dinámica**
2. Texto del botón: `Ver mis boletas`
3. URL: `https://doevents.com/mis-boletas/{{1}}`

### Paso 5: Enviar para Aprobación

- Revisar preview
- Enviar para revisión de Meta
- Esperar aprobación (usualmente 24-48 horas)

---

## Datos Técnicos del Template

### Metadata Enviada por el Backend

```javascript
{
  receiverName: "Juan Pérez",      // Nombre del receptor
  userName: "Juan Pérez",          // Alias de receiverName
  senderName: "María García",      // Nombre del remitente
  ticketCount: 2,                  // Cantidad de boletas
  eventName: "Concierto de Rock",  // Nombre del evento
  eventId: "evt_123",              // ID del evento
  eventImage: "https://...",       // URL imagen del evento
  orderID: "ORD_1737..."          // ID de la nueva orden
}
```

### Componentes WhatsApp Business API

```javascript
[
  {
    type: "header",
    parameters: [
      {
        type: "image",
        image: { link: "https://..." },
      },
    ],
  },
  {
    type: "body",
    parameters: [
      { type: "text", text: "Juan Pérez" }, // {{1}}
      { type: "text", text: "María García" }, // {{2}}
      { type: "text", text: "2" }, // {{3}}
      { type: "text", text: "Concierto de Rock" }, // {{4}}
    ],
  },
  {
    type: "button",
    sub_type: "url",
    index: "0",
    parameters: [
      { type: "text", text: "ORD_1737..." }, // {{1}} del botón
    ],
  },
];
```

---

## Archivos Relacionados

### Backend - Servicio de Notificaciones

- **Template WhatsApp:** `aws-lambda-notifications/src/templates/whatsapp/ticket_transferred_received.js`
- **Configuración Template:** `aws-lambda-notifications/src/templates/index.js` (línea ~660)
- **Template Email:** `aws-lambda-notifications/src/templates/email/ticket_transferred_received.hbs`

### Backend - Servicio de Transferencia

- **Función Principal:** `aws-lambda-orders-manageTickets/src/ticket/transferTicket.js`
- **Helper WebSocket:** `aws-lambda-orders-manageTickets/src/helpers/websocketHelper.js`

---

## Testing del Template

### 1. Verificar Template en Meta

```bash
# Verificar que el template esté aprobado
curl -X GET "https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/message_templates?name=ticket_transferred_received" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

### 2. Probar Transferencia

```bash
POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/tickets/transfer

Body:
{
  "orderID": "ORD_...",
  "ticketIDs": ["TICKET_001"],
  "newUserID": "user_receiver_123",
  "currentUserID": "user_sender_456"
}
```

### 3. Verificar Logs

```bash
# Ver logs del handler de WhatsApp
aws logs tail /aws/lambda/notifications-dev-whatsappNotificationHandler --follow
```

---

## Canales de Notificación Configurados

| Canal         | Estado    | Template/Archivo                     |
| ------------- | --------- | ------------------------------------ |
| **In-App**    | ✅ Activo | Configurado en `index.js`            |
| **Push**      | ✅ Activo | Firebase Cloud Messaging             |
| **Email**     | ✅ Activo | `ticket_transferred_received.hbs`    |
| **WhatsApp**  | ✅ Activo | `ticket_transferred_received.js`     |
| **WebSocket** | ✅ Activo | Tiempo real vía `websocketHelper.js` |

---

## Ejemplo de Flujo Completo

### Escenario

María García transfiere 2 boletas a Juan Pérez

### 1. Request HTTP

```json
POST /tickets/transfer
{
  "orderID": "ORD_MARIA_123",
  "ticketIDs": ["TKT_001", "TKT_002"],
  "newUserID": "user_juan_789",
  "currentUserID": "user_maria_456"
}
```

### 2. Backend procesa

- Valida tickets pertenecen a María
- Crea nueva orden para Juan
- Actualiza propiedad de tickets
- Registra trazabilidad en transfer_history

### 3. Notificaciones enviadas a Juan

**In-App:**

```
Título: "Has recibido 2 boleta(s)"
Cuerpo: "María García te ha transferido boletas para Concierto de Rock"
```

**Push:**

```
Título: "🎫 Boletas recibidas"
Cuerpo: "María García te transfirió 2 boleta(s) para Concierto de Rock"
```

**Email:**
HTML con diseño verde, información del evento y botón "Ver mis boletas"

**WhatsApp:**

```
[Imagen del evento]

¡Hola Juan Pérez! María García te ha transferido 2 boleta(s) para el evento Concierto de Rock. Las boletas ya están disponibles en tu cuenta.

[Botón: Ver mis boletas] → https://doevents.com/mis-boletas/ORD_JUAN_NEW_789
```

**WebSocket (tiempo real):**

```json
{
  "channel": "notification",
  "action": "tickets-received",
  "type": "TICKET_TRANSFERRED_RECEIVED",
  "senderName": "María García",
  "ticketCount": 2,
  "eventName": "Concierto de Rock",
  "orderID": "ORD_JUAN_NEW_789"
}
```

---

## Notas Importantes

⚠️ **Aprobación de Meta:** El template debe ser aprobado por Meta antes de poder enviar mensajes.

⚠️ **URL del botón:** Asegurarse que la URL `https://doevents.com/mis-boletas/{orderID}` existe y funciona correctamente.

⚠️ **Variables obligatorias:** Todos los parámetros `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}` deben ser proporcionados o el mensaje fallará.

⚠️ **Imagen del header:** Si no hay imagen del evento, se usa imagen por defecto. Meta requiere que la imagen esté públicamente accesible.

✅ **Validación backend:** El código incluye fallbacks para todos los campos requeridos.

---

## Deployment Status

✅ **aws-lambda-notifications** - Desplegado con template WhatsApp (74s)
✅ **aws-lambda-orders-manageTickets** - Desplegado con metadata completa (87s)

**Fecha:** 2025-01-16
**Región:** us-east-1
**Stage:** dev
