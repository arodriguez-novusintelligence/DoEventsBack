# 🧪 Guía de Pruebas Locales - Sistema de Invitaciones

## Problema Identificado

El sistema de notificaciones no recibía las invitaciones correctamente debido a:

1. **Mismatch de parámetros**: `triggerNotification` esperaba `triggerId` pero recibía `templateKey`
2. **userId en ubicación incorrecta**: Se esperaba como parámetro separado pero venía dentro de `metadata`

## ✅ Soluciones Aplicadas

### 1. Actualización de `triggerNotification.js`

- Ahora acepta tanto `triggerId` como `templateKey`
- Soporta `userId` como parámetro o dentro de `metadata`
- Logs mejorados para debugging

### 2. Correcciones en otras lambdas

- `sendEventInvitationsHandler.js`: Corrección de tabla Client (usa `id` no `user_id`)
- `sendEventInvitationsHandler.js`: Campo `userIds` en grupos (no `members`)
- `eventsFeed.js`: Enriquecimiento con ubicación de Venues
- `createVenueHandler.js`: Soporte para `floors` y `floor`

## 🚀 Cómo Probar Localmente

### Paso 1: Iniciar Serverless Offline

Abre **DOS terminales** separadas:

#### Terminal 1 - Lambda de Notificaciones

```powershell
cd aws-lambda-notifications
serverless offline
```

✅ Debería iniciar en puerto **3031**

#### Terminal 2 - Lambda de Guests

```powershell
cd aws-lambda-guests
serverless offline
```

✅ Debería iniciar en puerto **3000**

### Paso 2: Ejecutar Pruebas

En una **tercera terminal**:

```powershell
# Instalar axios si no lo tienes
npm install axios

# Probar solo notificación directa
node test-local-invitations.js notification

# Probar solo invitación completa
node test-local-invitations.js invitation

# Probar ambas
node test-local-invitations.js both
```

## 📋 Tests Disponibles

### Test 1: Notificación Directa

Prueba directamente el endpoint de notificaciones con un payload EVENT_INVITATION completo.

**Endpoint**: `POST http://localhost:3031/dev/trigger-notification`

**Verifica**:

- ✅ Template EVENT_INVITATION se encuentra
- ✅ Metadata se procesa correctamente
- ✅ Canales configurados funcionan
- ✅ Usuario se enriquece correctamente

### Test 2: Invitación Completa (End-to-End)

Prueba el flujo completo desde crear invitación hasta enviar notificaciones.

**Endpoint**: `POST http://localhost:3000/dev/events/{eventId}/invitations`

**Verifica**:

- ✅ Evento existe en DynamoDB
- ✅ Grupos se expanden correctamente
- ✅ Invitaciones se crean en tabla EventInvitations
- ✅ Notificaciones se disparan exitosamente

## 🔍 Logs a Verificar

### En Terminal de Notificaciones:

```
🔔 Trigger Notification - Evento recibido
📧 Enviando notificación: EVENT_INVITATION al usuario: xxx
📊 Canales: email, push, whatsapp, inApp
📋 Metadata enriquecido: {...}
✅ Notificación enviada exitosamente
```

### En Terminal de Guests:

```
Buscando evento con ID: xxx
Evento encontrado: Sí
Expandiendo grupos: [...]
Grupo encontrado: Sí
IDs de miembros procesados: [...]
Enviando invitaciones a X usuarios
Invitación creada para usuario xxx
Enviando X notificaciones
```

## ⚠️ Troubleshooting

### Error: "Connection refused"

- Verifica que ambas lambdas estén corriendo
- Confirma los puertos (3031 para notifications, 3000 para guests)

### Error: "Event not found"

- El evento `fc9edc72-23d8-4904-beb5-5a726c1bb1b6` debe existir en DynamoDB tabla `Eventos`
- Cambia el `eventId` en el script por uno válido

### Error: "Group not found"

- El grupo `0ab32ef8-e3a9-44cd-a196-e1e45fe04686` debe existir en `FavoriteGroups`
- Cambia el `groupId` o prueba solo con `users`

### Error: "Function not found"

Para pruebas locales, necesitas modificar temporalmente `sendEventInvitationsHandler.js`:

```javascript
// Cambiar esto:
FunctionName: process.env.NOTIFICATIONS_FUNCTION ||
  "notifications-dev-triggerNotification";

// Por esto (para local):
FunctionName: "notifications-dev-triggerNotification"; // O usar HTTP invoke
```

## 🌐 Prueba con Thunder Client / Postman

### Request: Notificación Directa

```http
POST http://localhost:3031/dev/trigger-notification
Content-Type: application/json

{
  "templateKey": "EVENT_INVITATION",
  "channels": ["email", "push"],
  "metadata": {
    "userId": "46b7f861-630e-4304-a8b0-d6fafd4a54ce",
    "eventId": "fc9edc72-23d8-4904-beb5-5a726c1bb1b6",
    "eventName": "Mi Evento",
    "inviterName": "Juan",
    "eventDate": "20/12/2025",
    "link": "https://app.doevents.com/events/mi-evento"
  }
}
```

### Request: Crear Invitación

```http
POST http://localhost:3000/dev/events/fc9edc72-23d8-4904-beb5-5a726c1bb1b6/invitations
Content-Type: application/json

{
  "invitedBy": "42c2e4a4-0",
  "users": ["46b7f861-630e-4304-a8b0-d6fafd4a54ce"],
  "groups": [],
  "channels": ["email", "push"],
  "message": "¡Ven a mi evento!"
}
```

## 📦 Despliegue a AWS

Una vez verificado localmente, despliega:

```powershell
# Desplegar notificaciones
cd aws-lambda-notifications
serverless deploy function -f triggerNotification

# Desplegar guests
cd aws-lambda-guests
serverless deploy function -f sendEventInvitations

# O despliegue completo
serverless deploy
```

## 📝 Notas Importantes

1. **Node.js**: Notifications usa `nodejs24.x`, Guests usa `nodejs18.x` (por serverless-offline)
2. **DynamoDB Local**: Si usas DynamoDB local, configura `AWS_ENDPOINT` en variables de entorno
3. **Credenciales AWS**: Serverless offline necesita credenciales válidas para acceder a DynamoDB en AWS
4. **CORS**: Los endpoints ya tienen CORS configurado para desarrollo

## 🎯 Próximos Pasos

1. ✅ Verificar que las notificaciones lleguen a los canales configurados
2. ✅ Confirmar que los emails se envíen con el template correcto
3. ✅ Validar que WhatsApp use el formato correcto
4. ✅ Probar con múltiples usuarios y grupos
5. ✅ Verificar que las invitaciones se guarden en EventInvitations

## 🐛 Reporte de Bugs

Si encuentras problemas:

1. Copia los logs completos de ambas terminales
2. Incluye el payload de prueba usado
3. Especifica qué test estabas ejecutando
4. Menciona si es local o en AWS
