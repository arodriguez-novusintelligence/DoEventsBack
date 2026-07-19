# Actualización Template WhatsApp - Invitación de Eventos

## 🎯 Cambios Implementados

### 1. **Template WhatsApp (`event_invitation.js`)**

Actualizado para coincidir con el template `invitacion_evento` creado en Meta Business Suite.

**Estructura del template en Meta Business Suite:**

```
Hola, {{1}}! {{2}} te ha invitado al evento {{3}}.

Haz click aquí para ver tu invitación
[Botón con URL dinámica: {{1}}]
```

**Parámetros:**

- **Body:**
  - `{{1}}`: FavoriteUserName (nombre del usuario invitado)
  - `{{2}}`: userName (nombre del usuario que invita)
  - `{{3}}`: eventName (nombre del evento)
- **Button:**
  - `{{1}}`: eventSlug (slug del evento para construir el link)

**IMPORTANTE**: El botón usa `eventSlug` (ej: "evento-de-prueba") en lugar de `eventId` (UUID) porque Meta Business Suite tiene límites en la longitud de los parámetros de URL.

---

### 2. **Handler de Invitaciones (`sendEventInvitationsHandler.js`)**

Agregado obtención del nombre del usuario invitado:

```javascript
// Obtener información del usuario invitado
const invitedUserData = await dynamodb
  .get({
    TableName: "Client",
    Key: { id: userId },
  })
  .promise();

const favoriteUserName = invitedUserData.Item
  ? `${invitedUserData.Item.name || ""} ${
      invitedUserData.Item.lastName || ""
    }`.trim()
  : "Usuario";
```

Agregado `favoriteUserName` y `eventId` a los metadatos de notificación:

```javascript
notifications.push({
  userId,
  eventId,
  eventName: eventInfo.event_name || eventInfo.name,
  inviterName,
  favoriteUserName, // ← Nuevo
  // ... otros campos
});
```

---

### 3. **Templates Index (`templates/index.js`)**

Actualizado para incluir los nuevos campos en metadata de WhatsApp:

```javascript
whatsapp: {
  template: "whatsapp/event_invitation.js",
  metadata: {
    eventName: metadata.eventName,
    inviterName: metadata.inviterName,
    favoriteUserName: metadata.favoriteUserName || "Usuario", // ← Nuevo
    eventId: metadata.eventId, // ← Nuevo
    // ... otros campos
  }
}
```

Cambiado el `type` de `event_invitation` a `invitacion_evento` en push e inApp para consistencia.

---

## 📋 Estructura de Datos

### Request al Handler

```json
POST /events/{eventId}/invitations
{
  "users": ["user-123", "user-456"],
  "groups": ["group-abc"],
  "channels": ["whatsapp", "push", "inApp", "email"],
  "message": "¡Te esperamos en este evento!"
}
```

### Metadata Enviado a WhatsApp

```json
{
  "favoriteUserName": "Juan Pérez",
  "inviterName": "María González",
  "eventName": "Concierto Rock 2025",
  "eventSlug": "concierto-rock-2025"
}
```

### Componentes WhatsApp Generados

```json
[
  {
    "type": "body",
    "parameters": [
      { "type": "text", "text": "Juan Pérez" },
      { "type": "text", "text": "María González" },
      { "type": "text", "text": "Concierto Rock 2025" }
    ]
  },
  {
    "type": "button",
    "sub_type": "url",
    "index": "0",
    "parameters": [{ "type": "text", "text": "concierto-rock-2025" }]
  }
]
```

---

## ✅ Configuración en Meta Business Suite

### Template: `invitacion_evento`

**Nombre del Template:** `invitacion_evento`
**Idioma:** Español (es)
**Categoría:** UTILITY

**Body:**

```
Hola, {{1}}! {{2}} te ha invitado al evento {{3}}.

Haz click aquí para ver tu invitación
```

**Botón:**

- Tipo: URL
- Texto: "Ver Invitación"
- URL: `https://app.doevents.com/events/{{1}}`

**Variables:**

1. Body {{1}}: Nombre del invitado (favoriteUserName)
2. Body {{2}}: Nombre del que invita (inviterName)
3. Body {{3}}: Nombre del evento (eventName)
4. Button {{1}}: Slug del evento (eventSlug) - Ej: "concierto-rock-2025"

**⚠️ Nota Importante**: El botón debe usar el **slug** del evento (texto corto y amigable) en lugar del UUID completo, ya que Meta Business Suite tiene límites en la longitud de los parámetros dinámicos en URLs.

---

## 🧪 Testing

### 1. Test Local

```bash
cd aws-lambda-notifications
node test-event-invitation-flow.js
```

### 2. Verificar Logs

```powershell
aws logs tail /aws/lambda/notifications-dev-triggerNotification --follow --since 5m
```

### 3. Test desde API

```bash
POST https://jg5f4zqefb.execute-api.us-east-1.amazonaws.com/dev/events/{eventId}/invitations
Content-Type: application/json

{
  "users": ["test-user-id"],
  "channels": ["whatsapp"],
  "message": "Te esperamos!"
}
```

---

## 📝 Notas Importantes

1. **Aprobación del Template**: El template `invitacion_evento` debe estar aprobado en Meta Business Suite antes de usarse en producción.

2. **Nombre del Usuario**: Si no se encuentra el usuario en la tabla `Client`, se usa "Usuario" como valor por defecto.

3. **EventId en URL**: El botón construye la URL como `https://app.doevents.com/events/{eventSlug}`, asegúrate de que esta ruta exista en tu frontend.

4. **Slug vs UUID**: Se usa `eventSlug` (texto corto) en lugar de `eventId` (UUID) para el botón debido a las limitaciones de Meta Business Suite con parámetros largos.

5. **Fallbacks**: El código tiene fallbacks para todos los campos:

   - `favoriteUserName`: "Usuario"
   - `inviterName`: "Alguien"
   - `eventName`: "un evento"
   - `eventId`: ""

6. **Formato del Template**: El sistema normaliza el nombre del template automáticamente:
   - `whatsapp/event_invitation.js` → `event_invitation`
   - Debe coincidir con el nombre en Meta Business Suite

---

## 🚀 Deploy

```powershell
# Desplegar notifications
cd aws-lambda-notifications
serverless deploy --force

# Desplegar guests
cd ../aws-lambda-guests
serverless deploy --force
```

---

## 🔍 Verificación Post-Deploy

1. Verificar que el template existe en Meta Business:

   - Nombre: `invitacion_evento`
   - Estado: Aprobado
   - Idioma: es

2. Enviar invitación de prueba

3. Verificar logs de WhatsApp gateway:

```powershell
aws logs tail /aws/lambda/notifications-dev-triggerNotification --follow
```

4. Verificar que el mensaje llegue con el formato correcto:

```
Hola, Juan Pérez! María González te ha invitado al evento Concierto Rock 2025.

Haz click aquí para ver tu invitación
[Ver Invitación]
```

---

## 📚 Archivos Modificados

- ✅ `aws-lambda-notifications/src/templates/whatsapp/event_invitation.js`
- ✅ `aws-lambda-notifications/src/templates/index.js`
- ✅ `aws-lambda-guests/src/sendEventInvitationsHandler.js`
