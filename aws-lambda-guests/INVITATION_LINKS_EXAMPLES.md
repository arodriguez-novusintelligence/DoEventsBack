# 📱 Ejemplos Visuales de Invitaciones con Links

## 📧 Email - Vista del Usuario

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                  🎉 Te han invitado a un evento             │
│                                                             │
│  María González te ha invitado a unirte a:                 │
│                                                             │
│  ╔═══════════════════════════════════════════════════════╗ │
│  ║  🎸 Concierto Rock 2025                                ║ │
│  ║                                                        ║ │
│  ║  📅 Fecha: 15 de Enero, 2026 - 8:00 PM               ║ │
│  ║  📍 Lugar: Movistar Arena, Bogotá                     ║ │
│  ║  🎤 Organizador: Live Nation Colombia                 ║ │
│  ╚═══════════════════════════════════════════════════════╝ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  💬 Mensaje del organizador:                         │  │
│  │  "¡No te pierdas el mejor concierto del año!"       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│            ┌────────────────────────┐                       │
│            │    🎫 Ver Evento       │ ← Botón clickeable   │
│            └────────────────────────┘                       │
│                                                             │
│  O comparte este link:                                      │
│  🔗 https://app.doevents.com/event/concierto-rock-2025/invite │
│                                                             │
│  ───────────────────────────────────────────────────       │
│  Has recibido esta invitación porque María González         │
│  quiere compartir este evento contigo.                      │
│                                                             │
│  DoEvents - Creando experiencias inolvidables              │
└─────────────────────────────────────────────────────────────┘
```

---

## 💬 WhatsApp - Vista del Usuario

```
┌──────────────────────────────────────────────┐
│  📱 WhatsApp                                 │
├──────────────────────────────────────────────┤
│                                              │
│  🎉 *Invitación a evento*                    │
│                                              │
│  *María González* te ha invitado a:         │
│  📋 *Concierto Rock 2025*                    │
│                                              │
│  📅 *Fecha:* 15 de Enero, 2026 - 8:00 PM   │
│  📍 *Lugar:* Movistar Arena, Bogotá         │
│                                              │
│  💬 _"¡No te pierdas el mejor concierto     │
│     del año!"_                               │
│                                              │
│  👉 *Ver evento:*                            │
│  https://app.doevents.com/events/concierto-rock-2025 │
│                                              │
│  🔗 *Compartir:*                             │
│  https://app.doevents.com/event/concierto-rock-2025/invite │
│                                              │
│  ¡Nos vemos allí! 🎊                         │
│                                              │
└──────────────────────────────────────────────┘
```

---

## 🔔 Push Notification - Vista Móvil

```
┌─────────────────────────────────────────────┐
│  📱 Notificación                            │
├─────────────────────────────────────────────┤
│  🎉 DoEvents                        ahora   │
│                                             │
│  Invitación a Concierto Rock 2025          │
│  María González te ha invitado a este      │
│  evento - 15 de Enero, 2026                │
│                                             │
│  [Desliza para ver más]                    │
└─────────────────────────────────────────────┘
```

Al hacer click, abre:

```
https://app.doevents.com/events/concierto-rock-2025
```

---

## 📲 In-App Notification - Dentro de la App

```
┌────────────────────────────────────────────────┐
│  🔔 Notificaciones                             │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │  🎉 Nueva invitación: Concierto Rock..  │ │
│  │  María González te ha invitado a unirte │ │
│  │  a este evento: "¡No te pierdas el..."  │ │
│  │                                          │ │
│  │  📅 15 de Enero, 2026 - 8:00 PM         │ │
│  │  📍 Movistar Arena, Bogotá               │ │
│  │                                          │ │
│  │  [Ver Evento] [Aceptar] [Rechazar]      │ │
│  │                            hace 2 min    │ │
│  └──────────────────────────────────────────┘ │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 🔗 Tipos de Links Generados

### 1. **Event Link** (Link Directo)

```
https://app.doevents.com/events/{slug}
https://app.doevents.com/events/concierto-rock-2025
```

**Uso:** Ver página del evento completa con toda la información

### 2. **Share Link** (Link para Compartir)

```
https://app.doevents.com/event/{slug}/invite
https://app.doevents.com/event/concierto-rock-2025/invite
```

**Uso:** Página optimizada para compartir con tracking de invitación

---

## 📊 Datos en la Respuesta de la API

```json
{
  "invitations": [
    {
      "invitationId": "inv-789",
      "eventName": "Concierto Rock 2025",
      "eventLink": "https://app.doevents.com/events/concierto-rock-2025",
      "eventShareLink": "https://app.doevents.com/event/concierto-rock-2025/invite",
      "userName": "Juan Pérez",
      "userEmail": "juan@example.com",
      "status": "pending"
    }
  ]
}
```

---

## 🎯 Flujo de Usuario con Links

```
1. Usuario recibe invitación (Email/WhatsApp/Push)
                ↓
2. Click en link directo o share link
                ↓
3. Se abre app/web en página del evento
                ↓
4. Usuario ve información completa:
   • Nombre del evento
   • Fecha y hora
   • Ubicación
   • Descripción
   • Entradas disponibles
   • Botón "Aceptar Invitación"
                ↓
5. Usuario acepta
                ↓
6. Sistema actualiza status a "accepted"
                ↓
7. Usuario agregado a EventGuests automáticamente
```

---

## 🔄 Links Dinámicos por Canal

| Canal        | Link Usado                  | Tracking            |
| ------------ | --------------------------- | ------------------- |
| **Email**    | ambos (directo + compartir) | ✅ Query params     |
| **WhatsApp** | ambos (directo + compartir) | ✅ UTM params       |
| **Push**     | directo                     | ✅ Deep link        |
| **In-App**   | directo                     | ✅ Internal routing |

---

## 💡 Ventajas de los Links

✅ **Share Link con tracking**: Saber quién comparte más invitaciones
✅ **Deep linking**: Abrir directamente en la app móvil
✅ **SEO friendly**: URLs amigables con el slug del evento
✅ **Analytics**: Medir conversión de invitaciones a registros
✅ **Compartible**: Fácil de copiar y pegar en cualquier canal

---

## 🧪 Ejemplo de Payload Completo

```javascript
// Request
POST /events/event-123/invitations
{
  "invitedBy": "organizer-id",
  "users": ["user-1", "user-2"],
  "channels": ["email", "push", "whatsapp"],
  "message": "¡No te lo pierdas!"
}

// Response
{
  "message": "Invitations sent successfully",
  "eventId": "event-123",
  "eventName": "Concierto Rock 2025",
  "eventLink": "https://app.doevents.com/events/concierto-rock-2025",
  "eventShareLink": "https://app.doevents.com/event/concierto-rock-2025/invite",
  "totalInvitations": 2,
  "notificationsSent": 2,
  "channels": ["email", "push", "whatsapp"]
}
```

---

**Los links se generan automáticamente y se incluyen en todas las notificaciones** 🎉
