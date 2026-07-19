# Backoffice QA — arquitectura

## Propósito
API administrativa para el panel `/admin` del frontend. Consulta tablas existentes de DoEvents (usuarios, eventos, órdenes, lugares, servicios) y registra auditoría en DynamoDB.

## Endpoints (`https://api-qa.doeventsapp.com/backoffice/*`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dashboard` | KPIs: usuarios, eventos, órdenes, ingresos, lugares, servicios, actividad reciente |
| GET | `/activity` | Feed de auditoría global |
| GET | `/users/search?q=` | Búsqueda de usuarios |
| GET | `/users/{userId}` | Detalle con conteos de eventos y órdenes |
| PATCH | `/users/{userId}` | Actualizar plan, rol, estado, contraseña |

## Autorización
- Header `Authorization` (Cognito) o `X-User-Id` en QA.
- El usuario debe tener `platformRole = admin` en `Client-qa`.

## Tablas DynamoDB

| Tabla | Uso |
|-------|-----|
| `Client-qa` | Perfiles, plan, rol admin |
| `Eventos-qa` | Conteos y métricas (GSI `userIdIndex`) |
| `Orders-qa` | Ingresos y órdenes por usuario (GSI `user_id-created_at-index`) |
| `Venues-qa` | Total lugares publicados |
| `ServiceProviders-qa` | Total servicios |
| `doevents-backoffice-qa-users` | Auditoría y actividad admin |

### Esquema auditoría (`doevents-backoffice-qa-users`)
- `PK=ACTIVITY#GLOBAL`, `SK={iso}#{uuid}` — feed global
- `PK=AUDIT#{userId}`, `SK=ACTION#{timestamp}` — historial por usuario

## Notificaciones
Al bloquear usuario se dispara `ADMIN_BAN_CONFIRMATION` vía `NOTIFICATIONS_API`.

## Despliegue
```bash
cd DoEventsBack/aws-lambda-backoffice
npm install
npm run deploy:qa
```

Crear tablas QA si no existen:
```bash
node scripts/create-qa-tables.js
```

Mapear en API Gateway custom domain: base path `backoffice` → stage `qa` del servicio `aws-lambda-backoffice`.
