# Implementación de URLs Firmadas en Notificaciones de Eventos

Guía completa para asegurar que las imágenes de eventos se envíen con URLs firmadas correctamente en todos los templates de WhatsApp.

---

## 📋 Funciones Que Necesitan Actualización

Las siguientes funciones envían notificaciones y deben incluir URLs firmadas:

1. **aws-lambda-manageevents/src/inviteUsers.js** - EVENT_INVITATION
2. **aws-lambda-manageevents/src/publishEvent.js** - EVENT_PUBLISHED
3. **aws-lambda-manageevents/src/cancelEvent.js** - EVENT_CANCELLED
4. **aws-lambda-manageevents/src/rescheduleEvent.js** - EVENT_RESCHEDULED
5. **aws-lambda-orders-manageTickets/src/ticket/transferTicket_NEW.js** - TICKET_TRANSFERRED_*
6. **aws-lambda-manageevents/src/processRefund.js** - REFUND_*

---

## 🔧 Implementación de getEventImageUrl.js

**Ubicación:** `aws-lambda-notifications/src/utils/getEventImageUrl.js`

```javascript
const AWS = require("aws-sdk");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const dynamoDBClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});
const dynamodb = DynamoDBDocumentClient.from(dynamoDBClient);

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || "us-east-1",
  signatureVersion: "v4",
});

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";

/**
 * Obtiene la imagen de un evento y devuelve una URL firmada
 * @param {string} eventId - ID del evento
 * @param {number} expiresIn - Segundos para que expire la URL (default: 86400 = 24h)
 * @returns {Promise<string>} - URL firmada o URL por defecto
 */
async function getEventImageUrl(eventId, expiresIn = 86400) {
  try {
    if (!eventId) {
      console.warn("⚠️ getEventImageUrl: eventId no proporcionado");
      return "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";
    }

    // Obtener evento de DynamoDB
    const result = await dynamodb.send(
      new GetCommand({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        ProjectionExpression: "main_image,imagenPrincipal,id",
      })
    );

    if (!result.Item) {
      console.warn(`⚠️ Evento ${eventId} no encontrado`);
      return "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";
    }

    // Obtener key de imagen (puede estar bajo main_image o imagenPrincipal)
    const imageKey = result.Item.main_image || result.Item.imagenPrincipal;

    if (!imageKey) {
      console.log(`ℹ️ Evento ${eventId} no tiene imagen, usando default`);
      return "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";
    }

    // Generar URL firmada
    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: BUCKET,
      Key: imageKey,
      Expires: Math.min(expiresIn, 604800), // Max 7 días por seguridad
    });

    console.log(`✅ URL firmada generada para evento ${eventId}`);
    return signedUrl;
  } catch (error) {
    console.error(`❌ Error generando URL firmada para evento ${eventId}:`, error);
    // Fallback a URL por defecto si hay error
    return "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";
  }
}

module.exports = { getEventImageUrl };
```

### Registro en utils/index.js

Asegurar que se exporta correctamente:

```javascript
// En aws-lambda-notifications/src/utils/index.js

const { getEventImageUrl } = require("./getEventImageUrl");

module.exports = {
  getExpirationDate,
  saveNotificationToDb,
  getClientByUserId,
  getEventImageUrl, // ← Agregar esta línea
};
```

---

## 1️⃣ Actualización: inviteUsers.js (EVENT_INVITATION)

**Archivo:** `aws-lambda-manageevents/src/inviteUsers.js`

```javascript
const { getEventImageUrl } = require("../utils/getEventImageUrl");

// ... dentro de la función handler ...

// Obtener imagen firmada del evento
const eventImage = await getEventImageUrl(eventId);

// Enviar notificación
try {
  await lambda.invoke({
    FunctionName: process.env.NOTIFICATIONS_LAMBDA || "notifications-dev-triggerNotification",
    InvocationType: "Event",
    Payload: JSON.stringify({
      triggerId: "EVENT_INVITATION",
      userId: favoriteUser.id,
      channels: ["inApp", "push", "email", "whatsapp"],
      metadata: {
        userId: favoriteUser.id,
        favoriteUserName: favoriteUser.name || favoriteUser.nombre,
        inviterName: currentUser.name || currentUser.nombre,
        eventName: event.name || event.nombre,
        eventId: event.id,
        eventImage: eventImage, // ✅ URL FIRMADA
        eventDate: event.date || event.fechaIni,
        eventLocation: event.location || event.lugar,
        shareLinkUrl: `https://app.doevents.com/event/${event.id}/invite`,
      },
    }),
  }).promise();
  console.log(`✅ Notificación enviada a ${favoriteUser.id}`);
} catch (notifError) {
  console.error("⚠️ Error enviando notificación:", notifError.message);
  // Continuar aunque falle la notificación
}
```

---

## 2️⃣ Actualización: cancelEvent.js (EVENT_CANCELLED)

**Archivo:** `aws-lambda-manageevents/src/cancelEvent.js`

```javascript
const { getEventImageUrl } = require("../utils/getEventImageUrl");

// ... dentro de la función handler ...

// Obtener imagen firmada
const eventImage = await getEventImageUrl(eventId);

// Buscar usuarios que necesitan notificación
const usersToNotify = [
  /* lista de usuarios invitados y asistentes */
];

for (const user of usersToNotify) {
  try {
    await lambda.invoke({
      FunctionName: process.env.NOTIFICATIONS_LAMBDA,
      InvocationType: "Event",
      Payload: JSON.stringify({
        triggerId: "EVENT_CANCELLED",
        userId: user.id,
        channels: ["inApp", "push", "email", "whatsapp"],
        metadata: {
          userId: user.id,
          userName: user.name || user.nombre,
          eventName: event.name,
          eventId: eventId,
          eventImage: eventImage, // ✅ URL FIRMADA
          cancellationReason: body.reason || "Razón no especificada",
          cancelledAt: new Date().toISOString(),
          refundInfo: body.hasRefund ? "Se procesará reembolso automáticamente" : null,
        },
      }),
    }).promise();
  } catch (error) {
    console.error(`⚠️ Error notificando a usuario ${user.id}:`, error.message);
  }
}
```

---

## 3️⃣ Actualización: rescheduleEvent.js (EVENT_RESCHEDULED)

**Archivo:** `aws-lambda-manageevents/src/rescheduleEvent.js`

```javascript
const { getEventImageUrl } = require("../utils/getEventImageUrl");

// ... dentro de la función handler ...

// Obtener imagen firmada
const eventImage = await getEventImageUrl(eventId);

// Formatear fecha y hora
const newDateFormatted = new Date(body.newDate).toLocaleDateString("es-CO");
const newTimeFormatted = body.newTime || "Hora por confirmar";

// Notificar a todos los usuarios del evento
const usersToNotify = [/* usuarios */];

for (const user of usersToNotify) {
  try {
    await lambda.invoke({
      FunctionName: process.env.NOTIFICATIONS_LAMBDA,
      InvocationType: "Event",
      Payload: JSON.stringify({
        triggerId: "EVENT_RESCHEDULED",
        userId: user.id,
        channels: ["inApp", "push", "email", "whatsapp"],
        metadata: {
          userId: user.id,
          userName: user.name,
          eventName: event.name,
          eventId: eventId,
          eventImage: eventImage, // ✅ URL FIRMADA
          originalDate: new Date(event.date).toLocaleDateString("es-CO"),
          originalTime: event.time || "Hora original",
          newDate: newDateFormatted,
          newTime: newTimeFormatted,
          reason: body.reason || "Reprogramación",
          rescheduledAt: new Date().toISOString(),
        },
      }),
    }).promise();
  } catch (error) {
    console.error(`⚠️ Error notificando a usuario ${user.id}:`, error.message);
  }
}
```

---

## 4️⃣ Actualización: transferTicket_NEW.js (TICKET_TRANSFERRED_*)

**Archivo:** `aws-lambda-orders-manageTickets/src/ticket/transferTicket_NEW.js`

El código actual ya está bien, solo asegurar que `eventImage` viene en los datos del evento:

```javascript
// ... en la función donde se obtiene eventData ...

// 4. OBTENER INFORMACIÓN DEL EVENTO
const eventResult = await doc.get({
  TableName: EVENTS_TABLE,
  Key: { id: originalOrder.event_id }
}).promise();
const eventData = eventResult.Item;

// Nota: En este caso, eventData ya trae main_image/imagenPrincipal
// Si se quiere URL firmada, se puede usar:
// const { getEventImageUrl } = require('../../../aws-lambda-notifications/src/utils/getEventImageUrl');
// const eventImageSigned = await getEventImageUrl(originalOrder.event_id);

// Las notificaciones ya incluyen:
await axios.post(NOTIFICATIONS_API, {
  triggerId: 'TICKET_TRANSFERRED_RECEIVED',
  userId: newUserID,
  channels: ['inApp', 'push', 'email', 'whatsapp'],
  metadata: {
    senderName,
    receiverName,
    userName: receiverName,
    senderUserId: currentUserID,
    ticketCount: transferredCount,
    eventName: eventData?.name || 'un evento',
    eventId: originalOrder.event_id,
    eventImage: eventData?.main_image || eventData?.imagenPrincipal || '',
    orderID: newOrderID,
    eventDate: eventData?.date || eventData?.fechaIni,
    eventLocation: eventData?.location || eventData?.lugar
  }
});
```

---

## 5️⃣ Actualización: processRefund.js (REFUND_*)

**Archivo:** `aws-lambda-manageevents/src/processRefund.js`

Agregar información de imagen del evento si es necesario:

```javascript
// ... después de obtener los datos del evento ...

// Obtener imagen del evento si es relevante
const event = await dynamodb.send(
  new GetCommand({
    TableName: process.env.EVENTS_TABLE || "Eventos",
    Key: { id: order.event_id },
  })
);

const eventImage = event.Item?.main_image || event.Item?.imagenPrincipal || null;

// Enviar notificación REFUND_REQUESTED
await lambdaClient.send(
  new InvokeCommand({
    FunctionName: process.env.NOTIFICATIONS_LAMBDA,
    InvocationType: "Event",
    Payload: JSON.stringify({
      triggerId: "REFUND_REQUESTED",
      userId: userId,
      channels: ["inApp", "push", "email", "whatsapp"],
      metadata: {
        userId: userId,
        eventName: order.metadata?.eventName || event.Item?.name,
        refundAmount: refundAmount,
        currency: order.currency || "COP",
        ticketCount: ticketsToRefund.length,
        refundType: isFullRefund ? "FULL" : "PARTIAL",
        orderId: orderId,
        refundId: refundId,
        refundDate: new Date().toISOString(),
        processingDays: "3-5",
        eventImage: eventImage, // ✅ Incluir si es necesario
      },
    }),
  })
);

// Enviar notificación REFUND_APPROVED
await lambdaClient.send(
  new InvokeCommand({
    FunctionName: process.env.NOTIFICATIONS_LAMBDA,
    InvocationType: "Event",
    Payload: JSON.stringify({
      triggerId: "REFUND_APPROVED",
      userId: userId,
      channels: ["inApp", "push", "email", "whatsapp"],
      metadata: {
        userId: userId,
        eventName: order.metadata?.eventName || event.Item?.name,
        refundAmount: refundAmount,
        currency: order.currency || "COP",
        ticketCount: ticketsToRefund.length,
        refundType: isFullRefund ? "FULL" : "PARTIAL",
        orderId: orderId,
        refundId: refundId,
        approvalDate: new Date().toISOString(),
        processingDays: "5",
        eventImage: eventImage, // ✅ Incluir si es necesario
      },
    }),
  })
);
```

---

## ✅ Checklist de Implementación

### En aws-lambda-notifications

- [ ] Crear `src/utils/getEventImageUrl.js` con función de URL firmada
- [ ] Actualizar `src/utils/index.js` para exportar `getEventImageUrl`
- [ ] Verificar que `whatsappNotification.js` maneja correctamente `eventImage` en metadata
- [ ] Testear que URLs firmadas son válidas por 24 horas

### En aws-lambda-manageevents

- [ ] Importar `getEventImageUrl` en inviteUsers.js
- [ ] Incluir `eventImage: eventImage` en metadata de EVENT_INVITATION
- [ ] Importar y usar `getEventImageUrl` en cancelEvent.js
- [ ] Importar y usar `getEventImageUrl` en rescheduleEvent.js
- [ ] Asegurar que processRefund.js incluye información de evento

### En aws-lambda-orders-manageTickets

- [ ] Verificar que transferTicket_NEW.js incluye `eventData?.main_image`
- [ ] Validar que el formato de metadata es consistente

### Deployment

- [ ] Desplegar aws-lambda-notifications primero
- [ ] Desplegar aws-lambda-manageevents
- [ ] Desplegar aws-lambda-orders-manageTickets
- [ ] Testear notificaciones end-to-end

### Testing

```bash
# 1. Crear evento con imagen
# 2. Invitar usuario (verificar EVENT_INVITATION con imagen firmada)
# 3. Cancelar evento (verificar EVENT_CANCELLED con imagen)
# 4. Transferir boletas (verificar TICKET_TRANSFERRED_*)
# 5. Procesar reembolso (verificar REFUND_REQUESTED y REFUND_APPROVED)
```

---

## 🔍 Troubleshooting

### Error: "eventImage is undefined"
- Verificar que `getEventImageUrl` devuelve URL válida
- Revisar que eventId es correcto en metadata
- Confirmar que tabla Eventos tiene el campo main_image o imagenPrincipal

### Error: "Invalid signed URL"
- URL firmada expirada: aumentar `expiresIn` en getEventImageUrl
- Bucket o Key incorrecta: verificar valores en S3
- Signature inválida: revisar credenciales AWS

### Imagen no carga en WhatsApp
- URL debe estar accesible públicamente (verificar bucket policy)
- Tiempo de expiración debe ser > 24 horas
- Meta descarga la imagen cuando se registra el template, no en cada envío

---

## 📊 Monitoreo

### CloudWatch Logs
```
# Buscar patrones:
"URL firmada generada para evento"
"Error generando URL firmada"
"eventImage extraída:"
```

### Métricas
- Lambda invocations: aws-lambda-notifications
- Duration: < 2 segundos para firmar URL
- Errors: verificar causa raíz

---

Última actualización: 25 de Enero, 2026
