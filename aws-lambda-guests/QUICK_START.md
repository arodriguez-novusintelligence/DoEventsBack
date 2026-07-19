# 🚀 Quick Start - Sistema de Invitaciones

## Configuración en 5 minutos

### 1️⃣ Crear tabla DynamoDB (2 min)

```powershell
cd aws-lambda-guests
./create-invitations-table.ps1
```

✅ Tabla `EventInvitations` creada

---

### 2️⃣ Desplegar servicios (2 min)

```powershell
# Desplegar notifications primero
cd ../aws-lambda-notifications
serverless deploy

# Desplegar guests
cd ../aws-lambda-guests
serverless deploy
```

✅ Lambdas desplegadas y endpoints disponibles

---

### 3️⃣ Primer invitación (1 min)

**Endpoint:** `POST https://YOUR-API.execute-api.us-east-1.amazonaws.com/dev/events/{eventId}/invitations`

**Body:**

```json
{
  "invitedBy": "tu-user-id",
  "users": ["user-1", "user-2"],
  "channels": ["email", "push"],
  "message": "¡Te invito a mi evento!"
}
```

**cURL:**

```bash
curl -X POST \
  https://YOUR-API/dev/events/event-123/invitations \
  -H 'Content-Type: application/json' \
  -d '{
    "invitedBy": "organizer-id",
    "users": ["user-1", "user-2"],
    "channels": ["email", "push"],
    "message": "¡Te invito!"
  }'
```

✅ Invitaciones enviadas

---

## 🎯 Uso Básico

### Invitar usuarios

```javascript
POST /events/{eventId}/invitations
{
  "invitedBy": "org-id",
  "users": ["user-1", "user-2"],
  "channels": ["email", "push"]
}
```

### Invitar grupos

```javascript
POST /events/{eventId}/invitations
{
  "invitedBy": "org-id",
  "groups": ["group-vip"],
  "channels": ["email", "whatsapp"]
}
```

### Ver invitaciones

```javascript
GET / events / { eventId } / invitations;
```

### Aceptar invitación

```javascript
PUT /events/{eventId}/invitations/{invId}
{
  "status": "accepted",
  "userId": "user-123"
}
```

---

## 📱 Canales Disponibles

- ✉️ `email` - Email con template HTML
- 🔔 `push` - Notificación push móvil
- 💬 `whatsapp` - Mensaje de WhatsApp
- 📲 `inApp` - Notificación in-app

---

## 🧪 Probar con script

```powershell
node test-event-invitations.js
```

---

## 📚 Más Información

- [EVENT_INVITATIONS_GUIDE.md](./EVENT_INVITATIONS_GUIDE.md) - Guía completa
- [INVITATIONS_SUMMARY.md](./INVITATIONS_SUMMARY.md) - Resumen ejecutivo
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - Arquitectura

---

**¡Listo para usar!** 🎉
