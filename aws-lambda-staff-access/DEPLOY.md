# Despliegue Staff Access

## Tabla DynamoDB (creada por Serverless)

Al desplegar, **Serverless crea automáticamente** la tabla con el esquema correcto:

- **Nombre:** `StaffAccess`
- **Partition Key:** `userId` (String)
- **Sort Key:** `sk` (String), valores como `eventId#gateId`
- **GSI:** `AdminEventIndex`
  - Partition Key: `eventId` (String)
  - Sort Key: `gateId` (String)

No hace falta crear la tabla a mano. Si ya existía una tabla `StaffAccess` con otro esquema, bórrala en DynamoDB antes de desplegar para que Serverless cree la nueva con el esquema correcto.

## Opcional

- **USERS_TABLE:** por defecto `Client` (para enriquecer la vista admin con nombre/email). Definir en `serverless.yml` si usas otra tabla.
- **NOTIFICATIONS_FUNCTION:** se rellena con `notifications-{stage}-triggerNotification` para enviar notificaciones al asignar staff.

## Comandos

```bash
npm install
npm run build
npm run deploy
# o: npx serverless deploy --stage dev
```

## Verificación

- Tras `npm run build` debe existir `dist/handler.js`.
- Tras el deploy verás las URLs:
  - POST `staff-access/assignments`
  - GET `staff-access/admin/events/{eventId}`
  - GET `staff-access/staff/{userId}`
