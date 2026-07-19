# Sistema de Invitaciones a Eventos

## Descripción General

Sistema completo para enviar invitaciones masivas a eventos, integrando:

- Usuarios individuales de `FavoriteUsers`
- Grupos completos de `FavoriteGroups`
- Notificaciones multicanal (Email, Push, WhatsApp, In-App)
- Gestión de estados de invitaciones

---

## 📋 Tabla de Contenidos

1. [Configuración Inicial](#configuración-inicial)
2. [API Endpoints](#api-endpoints)
3. [Ejemplos de Uso](#ejemplos-de-uso)
4. [Estados de Invitación](#estados-de-invitación)
5. [Estructura de Datos](#estructura-de-datos)

---

## 🚀 Configuración Inicial

### 1. Crear la tabla DynamoDB

```powershell
cd aws-lambda-guests
./create-invitations-table.ps1
```

### 2. Desplegar las lambdas

```powershell
# Desplegar notifications (primero, porque guests depende de ella)
cd ../aws-lambda-notifications
serverless deploy

# Desplegar guests
cd ../aws-lambda-guests
serverless deploy
```

---

## 🔌 API Endpoints

### 1. Enviar Invitaciones

**POST** `/events/{eventId}/invitations`

Envía invitaciones masivas a usuarios y/o grupos.

#### Request Body

```json
{
  "invitedBy": "user-id-del-organizador",
  "users": ["user-id-1", "user-id-2"],
  "groups": ["group-id-1", "group-id-2"],
  "channels": ["email", "push", "whatsapp", "inApp"],
  "message": "¡Te esperamos en nuestro evento especial!"
}
```

#### Parámetros

| Campo       | Tipo   | Requerido | Descripción                                          |
| ----------- | ------ | --------- | ---------------------------------------------------- |
| `invitedBy` | string | ✅        | ID del usuario que envía la invitación               |
| `users`     | array  | ⚠️ \*     | Array de userIds a invitar                           |
| `groups`    | array  | ⚠️ \*     | Array de groupIds (se expandirán a usuarios)         |
| `channels`  | array  | ❌        | Canales de notificación (default: ["email", "push"]) |
| `message`   | string | ❌        | Mensaje personalizado opcional                       |

_\* Al menos uno de `users` o `groups` es requerido_

#### Canales Disponibles

- `email` - Envía email con template HTML
- `push` - Notificación push móvil
- `whatsapp` - Mensaje de WhatsApp
- `inApp` - Notificación dentro de la app

#### Response

```json
{
  "message": "Invitations sent successfully",
  "eventId": "event-123",
  "totalInvitations": 15,
  "newInvitations": 12,
  "notificationsSent": 15,
  "channels": ["email", "push", "whatsapp"]
}
```

---

### 2. Obtener Invitaciones de un Evento

**GET** `/events/{eventId}/invitations?status=pending`

Obtiene todas las invitaciones de un evento con estadísticas.

#### Query Parameters

| Parámetro | Tipo   | Descripción                                                      |
| --------- | ------ | ---------------------------------------------------------------- |
| `status`  | string | Filtrar por estado: `pending`, `accepted`, `rejected`, `expired` |

#### Response

```json
{
  "invitations": [
    {
      "invitationId": "inv-123",
      "eventId": "event-123",
      "userId": "user-456",
      "userName": "Juan Pérez",
      "userEmail": "juan@example.com",
      "userPhone": "+57300123456",
      "invitedBy": "user-789",
      "inviterName": "María González",
      "status": "pending",
      "channels": ["email", "push"],
      "message": "Te esperamos!",
      "createdAt": "2025-12-12T10:00:00Z",
      "updatedAt": "2025-12-12T10:00:00Z",
      "expiresAt": "2026-01-11T10:00:00Z"
    }
  ],
  "stats": {
    "total": 20,
    "pending": 12,
    "accepted": 5,
    "rejected": 2,
    "expired": 1
  }
}
```

---

### 3. Actualizar Estado de Invitación

**PUT** `/events/{eventId}/invitations/{invitationId}`

Actualiza el estado de una invitación (aceptar/rechazar).

#### Request Body

```json
{
  "status": "accepted",
  "userId": "user-456"
}
```

#### Estados Válidos

- `pending` - Invitación pendiente
- `accepted` - Invitación aceptada (se agrega a EventGuests)
- `rejected` - Invitación rechazada
- `expired` - Invitación expirada

#### Response

```json
{
  "message": "Invitation status updated successfully",
  "invitation": {
    "invitationId": "inv-123",
    "status": "accepted",
    "updatedAt": "2025-12-12T11:00:00Z"
  }
}
```

**Nota:** Cuando una invitación es aceptada, automáticamente se crea un registro en `EventGuests`.

---

## 📝 Ejemplos de Uso

### Ejemplo 1: Invitar usuarios individuales

```javascript
// Invitar 3 usuarios específicos por email y push
const response = await fetch(
  "https://api.doevents.com/events/event-123/invitations",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invitedBy: "organizer-id",
      users: ["user-1", "user-2", "user-3"],
      channels: ["email", "push"],
      message: "¡No te pierdas nuestro evento VIP!",
    }),
  }
);
```

### Ejemplo 2: Invitar grupos completos

```javascript
// Invitar todos los miembros de 2 grupos por todos los canales
const response = await fetch(
  "https://api.doevents.com/events/event-123/invitations",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invitedBy: "organizer-id",
      groups: ["group-vip", "group-amigos"],
      channels: ["email", "push", "whatsapp", "inApp"],
    }),
  }
);
```

### Ejemplo 3: Invitar usuarios + grupos

```javascript
// Mezclar usuarios individuales y grupos
const response = await fetch(
  "https://api.doevents.com/events/event-123/invitations",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invitedBy: "organizer-id",
      users: ["special-user-1", "special-user-2"],
      groups: ["group-team", "group-family"],
      channels: ["email", "whatsapp"],
      message: "Celebremos juntos este momento especial",
    }),
  }
);
```

### Ejemplo 4: Aceptar invitación

```javascript
// Usuario acepta la invitación
const response = await fetch(
  "https://api.doevents.com/events/event-123/invitations/inv-456",
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "accepted",
      userId: "user-789",
    }),
  }
);
```

### Ejemplo 5: Consultar invitaciones pendientes

```javascript
// Ver quién aún no ha respondido
const response = await fetch(
  "https://api.doevents.com/events/event-123/invitations?status=pending"
);

const data = await response.json();
console.log(`Pendientes: ${data.stats.pending}`);
console.log(`Aceptadas: ${data.stats.accepted}`);
```

---

## 🔄 Estados de Invitación

### Flujo de Estados

```
pending → accepted ✅
        ↘ rejected ❌
        ↘ expired ⏱️
```

### Descripción de Estados

| Estado     | Descripción                             | Acción                                  |
| ---------- | --------------------------------------- | --------------------------------------- |
| `pending`  | Invitación enviada, esperando respuesta | Usuario aún no responde                 |
| `accepted` | Usuario aceptó la invitación            | Se agrega a EventGuests automáticamente |
| `rejected` | Usuario rechazó la invitación           | No se agrega a EventGuests              |
| `expired`  | Invitación venció (30 días)             | Se marca como expirada                  |

---

## 📊 Estructura de Datos

### Tabla: EventInvitations

```javascript
{
  PK: "EVENT#event-123",           // Partition Key
  SK: "USER#user-456#inv-789",     // Sort Key
  invitationId: "inv-789",
  eventId: "event-123",
  userId: "user-456",
  invitedBy: "organizer-id",
  inviterName: "María González",
  eventName: "Concierto Rock 2025",
  eventLink: "https://app.doevents.com/events/concierto-rock-2025",
  eventShareLink: "https://app.doevents.com/event/concierto-rock-2025/invite",
  status: "pending",
  channels: ["email", "push"],
  message: "Te esperamos!",
  createdAt: "2025-12-12T10:00:00Z",
  updatedAt: "2025-12-12T10:00:00Z",
  expiresAt: "2026-01-11T10:00:00Z"
}
```

### Índices

1. **UserIdIndex** - Consultar invitaciones por usuario

   - PK: `userId`
   - SK: `createdAt`

2. **EventIdIndex** - Consultar invitaciones por evento
   - PK: `eventId`
   - SK: `createdAt`

---

## 🎨 Templates de Notificación

### Email Template

- Archivo: `email/event_invitation.hbs`
- Incluye: Nombre del evento, invitador, fecha, hora, ubicación, ciudad, organizador, mensaje personalizado
- Botón: "Ver evento"
- **Links compartibles**: Link directo al evento + link para compartir con otros

### WhatsApp Template

- Archivo: `whatsapp/event_invitation.js`
- Formato: Texto con emojis
- Incluye: Información completa del evento (fecha, hora, ubicación)
- **Links**: Link directo al evento + link para compartir

### Push/In-App

- Título: "Invitación a {eventName}"
- Cuerpo: "{inviterName} te ha invitado - {eventDate}"
- Metadata: eventId, userId, link, shareLink, eventDate, eventLocation

---

## 🔒 Características de Seguridad

- ✅ **Validación de duplicados**: No se envían invitaciones duplicadas
- ✅ **Actualización inteligente**: Si existe, se actualiza en lugar de duplicar
- ✅ **Expiración automática**: Las invitaciones expiran en 30 días
- ✅ **Sincronización con EventGuests**: Al aceptar, se agrega automáticamente

---

## 🚨 Manejo de Errores

### Errores Comunes

| Código | Error                                    | Solución                       |
| ------ | ---------------------------------------- | ------------------------------ |
| 400    | `eventId is required`                    | Incluir eventId en path        |
| 400    | `invitedBy is required`                  | Incluir invitedBy en body      |
| 400    | `At least one user or group is required` | Incluir users o groups         |
| 404    | `Event not found`                        | Verificar que el evento existe |
| 500    | `Internal server error`                  | Revisar logs en CloudWatch     |

---

## 📈 Monitoreo

### CloudWatch Logs

```powershell
# Ver logs de envío de invitaciones
serverless logs -f sendEventInvitations --tail

# Ver logs de actualización de estado
serverless logs -f updateInvitationStatus --tail
```

### Métricas Importantes

- Número de invitaciones enviadas por evento
- Tasa de aceptación vs rechazo
- Tiempo de respuesta promedio
- Invitaciones expiradas

---

## 🔧 Troubleshooting

### Las notificaciones no se envían

1. Verificar que `aws-lambda-notifications` está desplegada
2. Verificar variable de entorno `NOTIFICATIONS_FUNCTION`
3. Revisar permisos IAM para invocar Lambda

### Duplicación de invitaciones

- El sistema previene duplicados automáticamente
- Si un usuario ya tiene invitación, se actualiza en lugar de duplicar

### Grupos no se expanden

- Verificar que los grupos existen en `FavoriteGroups`
- Verificar que tienen el campo `members` poblado

---

## 📞 Soporte

Para problemas o dudas:

- Revisar logs en CloudWatch
- Verificar tablas en DynamoDB
- Contactar al equipo de desarrollo

---

**Última actualización:** 12 de diciembre, 2025
