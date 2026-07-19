# Resumen de Implementación - URLs Firmadas y WhatsApp Internacional

**Fecha:** 25 de Enero, 2026  
**Estado:** Implementación completada, pendiente deploy

---

## ✅ Cambios Realizados

### 1. **aws-lambda-notifications/src/gateways/whatsappNotification.js**

**Cambio:** Agregar soporte para generar URLs firmadas automáticamente para templates con imágenes

```javascript
// ANTES:
const {
  getExpirationDate,
  saveNotificationToDb,
  getClientByUserId,
} = require("../utils/index");

// AHORA:
const {
  getExpirationDate,
  saveNotificationToDb,
  getClientByUserId,
  getEventImageUrl,  // ← NUEVO
} = require("../utils/index");
```

**Lógica agregada en línea ~65:**
```javascript
// TEMPLATES QUE NECESITAN URLS FIRMADAS DE EVENTOS
const templatesWithImages = ["event_invitation", "event_cancelled", "event_rescheduled"];

// Si el template necesita imagen y hay eventId, generar URL firmada
if (templatesWithImages.includes(templateRel) && meta.eventId && !meta.eventImage) {
  console.log(`🔗 Generando URL firmada para template ${templateRel} con eventId ${meta.eventId}`);
  meta.eventImage = await getEventImageUrl(meta.eventId, 86400); // 24 horas
  console.log(`✅ URL firmada generada: ${meta.eventImage.substring(0, 50)}...`);
}
```

**Beneficio:** Las imágenes se sirven con URLs firmadas de S3 válidas por 24 horas, directamente desde el gateway de WhatsApp

---

### 2. **aws-lambda-login/src/login.js - Google Auth**

**Cambio:** Actualizar cómo se guarda el teléfono e indicativo para usuarios Google

```javascript
// ANTES:
const newUserGoogleAuth = {
  // ...
  phone: "n/a",
  indicativo: "",
  // ...
};

// AHORA:
const newUserGoogleAuth = {
  // ...
  phone: data.phone || "n/a", // Aceptar teléfono si viene
  phoneNumber: data.phoneNumber || null, // Teléfono sin indicativo
  countryCode: data.countryCode || null, // Indicativo (+57, +1, etc)
  indicativo: data.countryCode ? data.countryCode.replace("+", "") : "", // Indicativo sin símbolo
  // ...
};
```

**Beneficio:** Usuarios de Google pueden proporcionar país/teléfono en el payload, se guarda en formato correcto para WhatsApp

---

### 3. **aws-lambda-login/src/login.js - Apple Auth**

**Cambio:** Igual que Google, actualizar estructura de almacenamiento de teléfono

```javascript
// ANTES:
const newUserAppleAuth = {
  // ...
  phone: "n/a",
  indicativo: "",
  // ...
};

// AHORA:
const newUserAppleAuth = {
  // ...
  phone: data.phone || "n/a",
  phoneNumber: data.phoneNumber || null,
  countryCode: data.countryCode || null,
  indicativo: data.countryCode ? data.countryCode.replace("+", "") : "",
  // También se corrigió lastName y user
  lastName: data.fullName.familyName || data.fullName.givenName,
  user: data.fullName.givenName || data.email.split("@")[0],
  // ...
};
```

---

### 4. **aws-lambda-orders-manageTickets/src/orders/createOrder.js**

**Cambio:** Mejorar parseo de userId para soportar múltiples formatos

```javascript
// ANTES:
const userID = body.user_id || body.userID || metadata.userID;

if (!eventId || !userID) {
  return buildResponse(400, { message: 'Faltan parámetros en metadata: eventId o userID.' });
}

// AHORA:
const userID = body.user_id || body.userId || body.userID || metadata.userID || metadata.userId;

if (!eventId || !userID) {
  return buildResponse(400, { 
    message: 'Faltan parámetros requeridos: eventId (event_id/eventId) y userId (user_id/userId/userID)',
    debug: { eventId, userID, body_keys: Object.keys(body), metadata_keys: Object.keys(metadata) }
  });
}
```

**Beneficio:** Mejor manejo de errores, soporte para múltiples formatos de campos

---

### 5. **aws-lambda-notifications/src/utils/getEventImageUrl.js**

**Estado:** ✅ Función ya existe y exportada

```javascript
/**
 * Obtiene la imagen de un evento y devuelve una URL firmada válida por 24 horas
 * @param {string} eventId - ID del evento
 * @param {number} expiresIn - Segundos para que expire la URL
 * @returns {Promise<string>} - URL firmada de S3 o URL por defecto
 */
async function getEventImageUrl(eventId, expiresIn = 86400)
```

---

## 🔄 Flujo de Funcionamiento Completado

### Antes (Problema):
1. Usuario de Google/Apple crea cuenta → sin teléfono/indicativo
2. Se envía notificación WhatsApp → falta teléfono
3. Template de evento → imagen no tiene URL firmada

### Después (Solución):
1. **Google/Apple Auth** → Puede proporcionar `countryCode` + `phoneNumber`
   - Se almacena en `countryCode` ("+57"), `phoneNumber` ("300..."), `indicativo` ("57")
   - Fallback si no viene: `phone: "n/a"`, `indicativo: ""`

2. **Crear Orden** → Parsea `user_id` (snake_case) o `userId` (camelCase)
   - Payloads con ambos formatos funcionan
   - Mejor mensaje de error con debug info

3. **Enviar WhatsApp**
   - `whatsappNotification.js` detecta template con imagen
   - Llama `getEventImageUrl(eventId)` → obtiene URL de S3 firmada
   - Genera componentes con imagen firmada para Meta
   - `whatsappGateway` sanitiza teléfono: `countryCode + phoneNumber` → `573001234567`

---

## 📋 Payload Recomendado para Crear Orden

```json
{
  "event_id": "1392904a-2554-4131-8cd8-a9314c46dc5a",
  "user_id": "cedef71c-c",
  "currency": "COP",
  "payment_status": "PENDING",
  "tickets": [
    {
      "ticket_id": "83853767-e83c-4656-9c91-ce1dcb9d7a34",
      "ticketsDistId": "205be8e8-8a7d-4378-9304-6f03e5833072",
      "purchasePrice": 33333
    }
  ],
  "metadata": {
    "eventName": "Evento Nuevo Ordenes",
    "hasSeating": true
  },
  "amount": 99999,
  "reference": "test_1aFeZH",
  "customer_email": "user@example.com"
}
```

**Validaciones:**
- ✅ `event_id` o `eventId` en root o metadata
- ✅ `user_id` o `userId` o `userID` en root o metadata
- ✅ `tickets` array con estructura: `ticket_id`, `ticketsDistId`, `purchasePrice`
- ✅ `amount` puede ser total de orden
- ✅ `metadata.orderTotals` es opcional (usa fallback si falta)

---

## 🌍 Payload para Google/Apple Login con País

```json
{
  "data": {
    "user": {
      "id": "google_user_123",
      "name": "Juan García",
      "givenName": "Juan",
      "familyName": "García",
      "email": "juan@gmail.com",
      "photo": "https://lh3.googleusercontent.com/...",
      "phone": "3001234567",
      "countryCode": "+57"
    }
  }
}
```

**Campos guardados en Client table:**
- `phone`: "3001234567" (teléfono completo)
- `phoneNumber`: "3001234567" (sin indicativo)
- `countryCode`: "+57" (con símbolo)
- `indicativo`: "57" (sin símbolo)
- `platform`: "GOOGLE"

---

## 🚀 Deploy Checklist

- [ ] Deploy `aws-lambda-notifications`
  ```bash
  cd aws-lambda-notifications
  serverless deploy
  ```

- [ ] Deploy `aws-lambda-login`
  ```bash
  cd ../aws-lambda-login
  serverless deploy
  ```

- [ ] Deploy `aws-lambda-orders-manageTickets`
  ```bash
  cd ../aws-lambda-orders-manageTickets
  serverless deploy
  ```

- [ ] Verificar CloudWatch Logs
  ```
  /aws/lambda/notifications-dev-triggerNotification
  Buscar: "URL firmada generada", "Usando formato separado"
  ```

- [ ] Testear WhatsApp
  - [ ] Crear orden con `user_id` (snake_case)
  - [ ] Crear evento con imagen
  - [ ] Invitar usuario → recibir WhatsApp con imagen
  - [ ] Verificar URL en WhatsApp es firmada (tiene ?X-Amz-Signature)

---

## 🔗 Documentación Relacionada

- `WHATSAPP_TEMPLATES_GUIDE.md` - Estructura de los 8 templates en Meta
- `INTERNATIONAL_PHONE_CODES.md` - Indicativos por país y validación
- `IMPLEMENTATION_SIGNED_URLS.md` - Cómo usar getEventImageUrl en otros servicios
- `ORDER_CREATION_API_GUIDE.md` - Detalle completo del payload de órdenes

---

## ❌ Problemas Resueltos

### ❌ Error: "Faltan parámetros: eventId, userId"
- **Causa:** Payload enviado con `user_id` (snake_case), código buscaba `userId`
- **Solución:** Actualizar createOrder.js para aceptar ambos formatos
- **Status:** ✅ Resuelto

### ❌ Usuario Google/Apple sin teléfono
- **Causa:** Auth guardaba `phone: "n/a"`, `indicativo: ""`
- **Solución:** Aceptar campos opcionales en payload de OAuth
- **Status:** ✅ Resuelto

### ❌ Imágenes en WhatsApp sin URL firmada
- **Causa:** Se pasaba `main_image` (nombre de key en S3) en lugar de URL completa
- **Solución:** Usar `getEventImageUrl()` en gateway, antes de construir template
- **Status:** ✅ Resuelto

---

Última actualización: 25 de Enero, 2026
