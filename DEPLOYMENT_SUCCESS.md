# 🚀 DoEvents - Servicios Desplegados Exitosamente

## 📡 Endpoints Desplegados

### 🌐 WebSocket Gateway

- **Endpoint**: `wss://ajojxxqr14.execute-api.us-east-1.amazonaws.com/dev`
- **Servicio**: global-websocket-gateway-dev
- **Rutas WebSocket disponibles**:
  - `$connect` - Conexión inicial
  - `$disconnect` - Desconexión
  - `dispatcher` - Dispatcher general
  - `statusConnection` - Estado de conexión
  - `joinRoom` - Unirse a sala de chat
  - `sendChatMessage` - Enviar mensaje de chat
  - `sendChatMessageAssets` - Enviar mensaje con assets
  - `editChatMessage` - Editar mensaje de chat
  - `inAppNotification` - Notificación in-app
  - `sendEmailNotification` - Notificación por email
  - `sendWhatsAppNotification` - Notificación por WhatsApp

### 💬 Chat Room Events API

- **Base URL**: `https://s74yw0vme7.execute-api.us-east-1.amazonaws.com/dev`
- **Servicio**: chat-room-events-dev

#### Endpoints REST disponibles:

- `GET /chat-room-by-event/{eventId}` - Obtener sala de chat por evento
- `GET /chat-messages-by-room/{roomId}` - Obtener mensajes por sala
- `GET /chats-rooms-by-user/{userId}` - Obtener salas por usuario
- `PUT /send-invitation-chat-room` - Enviar invitación a sala
- `PUT /kicked-out-user-by-chat-room` - Expulsar usuario de sala
- `PUT /exit-chat-room` - Salir de sala de chat
- `PUT /blacklist-chat-room` - Bloquear sala de chat
- `PUT /unblacklist-chat-room` - Desbloquear sala de chat
- `PUT /accept-invitation-chat-room` - Aceptar invitación
- `PUT /decline-invitation-chat-room` - Rechazar invitación

### 🔔 Notifications API

- **Servicio**: notifications-dev
- **Nota**: Los endpoints específicos se obtienen después del despliegue

#### Funciones Lambda desplegadas:

- APIs REST para notificaciones
- WebSocket handlers para notificaciones push, email e in-app

## 🔧 Configuración Actual

### Variables de entorno actualizadas:

- Todos los archivos `.env` apuntan al WebSocket desplegado
- Configuración lista para producción

### Arquitectura desplegada:

1. **WebSocket Gateway** invoca funciones Lambda remotas de:
   - Chat service
   - Notifications service
2. **Chat service** maneja APIs REST y WebSocket handlers
3. **Notifications service** maneja notificaciones y WebSocket handlers

## ✅ Estado del despliegue:

- ✅ aws-lambda-notifications: DESPLEGADO
- ✅ aws-lambda-chats: DESPLEGADO
- ✅ aws-global-websocket-gateway: DESPLEGADO
- ✅ Variables de entorno: CONFIGURADAS

## 🧪 Próximos pasos para testing:

1. Probar conectividad WebSocket
2. Verificar invocación de Lambda functions remotas
3. Testing integral de chat y notificaciones

## 📝 Notas importantes:

- Los servicios están desplegados en `stage: dev`
- Todos usan la región `us-east-1`
- Las credenciales AWS se manejan automáticamente por AWS Lambda
- Los servicios pueden escalarse independientemente
