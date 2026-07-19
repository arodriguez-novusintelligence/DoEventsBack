# Arquitectura del Sistema de Invitaciones a Eventos

## 📐 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND / CLIENT                          │
│                                                                     │
│  Organizador selecciona:                                           │
│  • Usuarios: [user-1, user-2, user-3]                             │
│  • Grupos: [group-vip, group-amigos]                              │
│  • Canales: [email, push, whatsapp, inApp]                        │
│  • Mensaje: "¡Te invito a mi evento!"                             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              API Gateway: POST /events/{eventId}/invitations        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Lambda: sendEventInvitationsHandler                      │
│                                                                     │
│  1. Valida eventId y usuarios/grupos                               │
│  2. Obtiene información del evento (DynamoDB: Events)              │
│  3. Obtiene información del invitador (DynamoDB: Client)           │
│  4. Expande grupos a usuarios individuales                         │
│     └─▶ Query FavoriteGroups → Extrae campo "members"             │
│  5. Elimina duplicados                                             │
│  6. Para cada usuario:                                             │
│     ├─▶ Verifica si existe invitación                             │
│     ├─▶ Si existe: Actualiza                                      │
│     └─▶ Si no existe: Crea nueva                                  │
│                                                                     │
└──────────────┬──────────────────────────────────┬──────────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────────────┐  ┌──────────────────────────────┐
│  DynamoDB: EventInvitations      │  │  Lambda: Invoke Async        │
│                                  │  │  (notifications)             │
│  • PK: EVENT#{eventId}           │  │                              │
│  • SK: USER#{userId}#{invId}     │  └───────────┬──────────────────┘
│  • status: "pending"             │              │
│  • channels: [...]               │              ▼
│  • expiresAt: +30 days           │  ┌──────────────────────────────┐
└──────────────────────────────────┘  │ Lambda: triggerNotification  │
                                      │ (aws-lambda-notifications)   │
                                      │                              │
                                      │ Recibe:                      │
                                      │ {                            │
                                      │   templateKey: "EVENT_..."   │
                                      │   channels: [...]            │
                                      │   metadata: {...}            │
                                      │ }                            │
                                      └───────────┬──────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
    ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
    │  Email Gateway            │ │  Push Gateway             │ │  WhatsApp Gateway         │
    │                           │ │                           │ │                           │
    │  • AWS SES               │ │  • Firebase FCM           │ │  • Twilio API             │
    │  • Template: .hbs        │ │  • Device tokens          │ │  • Template: .js          │
    │  • HTML responsive       │ │  • APNs fallback          │ │  • Formatted text         │
    └─────────────┬─────────────┘ └─────────────┬─────────────┘ └─────────────┬─────────────┘
                  │                             │                             │
                  ▼                             ▼                             ▼
    ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
    │  john@email.com           │ │  📱 Dispositivo móvil     │ │  📱 +57 300 123 4567     │
    │                           │ │                           │ │                           │
    │  🎉 Invitación a evento  │ │  🔔 Notificación         │ │  💬 Mensaje WhatsApp     │
    │  "Te invita: María"       │ │  "Te han invitado..."     │ │  "Te invita: María"       │
    └───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
                  │                             │                             │
                  └─────────────────────────────┴─────────────────────────────┘
                                                  │
                                                  ▼
                                    ┌────────────────────────────┐
                                    │   Usuario recibe y decide  │
                                    │   Aceptar / Rechazar       │
                                    └────────────┬───────────────┘
                                                 │
                      ┌──────────────────────────┴──────────────────────────┐
                      │                                                     │
                      ▼                                                     ▼
        ┌─────────────────────────────┐                   ┌─────────────────────────────┐
        │  PUT /invitations/{id}      │                   │  PUT /invitations/{id}      │
        │  { status: "accepted" }     │                   │  { status: "rejected" }     │
        └──────────────┬────────────────┘                   └─────────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────┐
        │  Lambda: updateInvitationStatusHandler      │
        │                                             │
        │  1. Actualiza estado en EventInvitations    │
        │  2. Si status="accepted":                   │
        │     └─▶ Crea registro en EventGuests       │
        │         (Usuario confirmado para evento)     │
        └─────────────────────────────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────────────┐
        │  DynamoDB: EventGuests                      │
        │                                             │
        │  • PK: EVENT#{eventId}                      │
        │  • SK: GUEST#{userId}                       │
        │  • status: "confirmed"                      │
        │  • invitationId: {invId}                    │
        └─────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Estados

```
                    ┌──────────────────────┐
                    │  Invitación enviada  │
                    │   status: "pending"  │
                    └──────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
    ┌──────────────────┐  ┌─────────┐  ┌──────────┐
    │   "accepted"     │  │ expired │  │ rejected │
    │                  │  │         │  │          │
    │  ✅ Agregado a   │  │ ⏱️ 30   │  │ ❌ No    │
    │   EventGuests    │  │  días   │  │  asiste  │
    └──────────────────┘  └─────────┘  └──────────┘
```

---

## 🗄️ Modelo de Datos

### EventInvitations

```json
{
  "PK": "EVENT#event-123",
  "SK": "USER#user-456#inv-789",
  "invitationId": "inv-789",
  "eventId": "event-123",
  "userId": "user-456",
  "invitedBy": "organizer-id",
  "inviterName": "María González",
  "status": "pending",
  "channels": ["email", "push", "whatsapp"],
  "message": "Te esperamos!",
  "createdAt": "2025-12-12T10:00:00Z",
  "updatedAt": "2025-12-12T10:00:00Z",
  "expiresAt": "2026-01-11T10:00:00Z"
}
```

### EventGuests (creado al aceptar)

```json
{
  "PK": "EVENT#event-123",
  "SK": "GUEST#user-456",
  "guestId": "user-456",
  "eventId": "event-123",
  "userId": "user-456",
  "invitedBy": "organizer-id",
  "invitationId": "inv-789",
  "status": "confirmed",
  "createdAt": "2025-12-12T11:00:00Z",
  "updatedAt": "2025-12-12T11:00:00Z"
}
```

---

## 🔌 Integración entre Lambdas

```
┌─────────────────────────────────┐
│   aws-lambda-guests             │
│                                 │
│   • sendEventInvitations        │
│   • getEventInvitations         │
│   • updateInvitationStatus      │
│                                 │
└────────────┬────────────────────┘
             │ Invoke (async)
             │
             ▼
┌─────────────────────────────────┐
│   aws-lambda-notifications      │
│                                 │
│   • triggerNotification         │
│   • dispatchNotification        │
│   • emailNotification           │
│   • pushNotification            │
│   • whatsappNotification        │
│   • inAppNotification           │
│                                 │
└─────────────────────────────────┘
```

---

## 📊 Capacidad y Escalabilidad

- **Invitaciones por evento**: Ilimitadas
- **Usuarios por invitación**: Ilimitados
- **Grupos por invitación**: Ilimitados
- **Canales simultáneos**: 4 (email, push, whatsapp, inApp)
- **Procesamiento**: Asíncrono y en paralelo
- **Timeout**: 30 segundos por Lambda
- **Reintentos**: 3 intentos automáticos

---

## 🔒 Seguridad y Validaciones

```
┌─────────────────────────────────────────────────┐
│  1. Validación de entrada                       │
│     • eventId requerido                         │
│     • invitedBy requerido                       │
│     • users o groups requerido                  │
│                                                 │
│  2. Verificación de existencia                  │
│     • Evento existe en DynamoDB                 │
│     • Invitador existe en Client                │
│     • Grupos existen en FavoriteGroups          │
│                                                 │
│  3. Prevención de duplicados                    │
│     • Query antes de insert                     │
│     • Update si existe                          │
│     • Set de userIds únicos                     │
│                                                 │
│  4. Autorización                                │
│     • Solo el invitador puede enviar            │
│     • Solo el invitado puede aceptar/rechazar   │
│                                                 │
│  5. Expiración                                  │
│     • TTL de 30 días                            │
│     • Limpieza automática de DynamoDB           │
└─────────────────────────────────────────────────┘
```

---

## 📈 Monitoreo y Observabilidad

```
┌──────────────────────────────────────┐
│  CloudWatch Metrics                  │
│                                      │
│  • Invitations.Sent                  │
│  • Invitations.Accepted              │
│  • Invitations.Rejected              │
│  • Invitations.Expired               │
│  • Notifications.Delivered           │
│  • Notifications.Failed              │
│  • Lambda.Duration                   │
│  • Lambda.Errors                     │
│  • Lambda.Throttles                  │
└──────────────────────────────────────┘
```

---

## 🎯 Casos de Uso Soportados

1. **Invitación Individual**

   ```
   1 organizador → 1 usuario → 1-4 canales
   ```

2. **Invitación Grupal**

   ```
   1 organizador → N usuarios (via grupo) → 1-4 canales
   ```

3. **Invitación Mixta**

   ```
   1 organizador → [usuarios + grupos] → 1-4 canales
   ```

4. **Recordatorios**

   ```
   Re-envío a usuarios con status="pending"
   ```

5. **Estadísticas**
   ```
   Dashboard con tasas de aceptación/rechazo
   ```

---

**Diseño completado: Sistema de Invitaciones a Eventos**
