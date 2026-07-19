# 🚀 Guía de Despliegue - Sistema de Eventos Actualizado

## 📋 Resumen de Cambios

### 1. **Variables de Entorno** ✅

Se agregó en `serverless.yml`:

```yaml
NOTIFICATIONS_LAMBDA: aws-lambda-notifications-dev-triggerNotification
```

### 2. **Nuevos Global Secondary Indexes (GSI)**

#### Script de Configuración

**Archivo**: `add-gsi-to-eventos.js`

**Índices a crear**:

- `slug-index`: Para búsqueda por slug (URLs amigables)
- `venueId-index`: Para búsqueda de eventos por venue

**Cómo ejecutar**:

```bash
cd aws-lambda-manageevents
node add-gsi-to-eventos.js
```

**Tiempo estimado**: 5-10 minutos por índice

**Verificación**:

```bash
# Ver estado de los índices en AWS CLI
aws dynamodb describe-table --table-name Eventos --region us-east-1 --query "Table.GlobalSecondaryIndexes"
```

---

### 3. **Nuevos Endpoints**

#### 3.1 Obtener Evento por Slug

- **Path**: `GET /events/slug/{slug}`
- **Handler**: `src/getEventBySlug.js`
- **Uso**: Obtener eventos usando URL amigable
- **Ejemplo**:
  ```bash
  GET https://api.example.com/events/slug/festival-musica-2024-a1b2c3d4
  ```

#### 3.2 Obtener Eventos por Venue

- **Path**: `GET /events/venue/{venueId}`
- **Handler**: `src/getEventsByVenue.js`
- **Query Parameters**:
  - `status` (opcional): Filtrar por estado
  - `limit` (opcional): Límite de resultados (default: 50)
- **Ejemplo**:
  ```bash
  GET https://api.example.com/events/venue/venue-123?status=Publicado&limit=20
  ```

---

### 4. **Mejoras en createEvent.js**

#### Validación de Unicidad de Slug

Se agregó validación automática:

1. Genera slug desde el nombre del evento
2. Verifica si el slug ya existe en la base de datos
3. Si existe, agrega un sufijo único (`-a1b2c3d4`)
4. Garantiza URLs únicas para cada evento

**Flujo**:

```javascript
Nombre: "Festival de Música 2024"
   ↓
Slug inicial: "festival-musica-2024"
   ↓
¿Ya existe? → NO → Usar "festival-musica-2024"
            → SÍ → Usar "festival-musica-2024-a1b2c3d4"
```

---

## 🔧 Pasos de Despliegue

### Pre-requisitos

- AWS CLI configurado
- Serverless Framework instalado (`npm i -g serverless`)
- Node.js 18.x o superior
- Credenciales AWS con permisos de DynamoDB y Lambda

### Paso 1: Crear GSI en DynamoDB

```bash
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-manageevents

# Instalar dependencias si es necesario
npm install @aws-sdk/client-dynamodb

# Ejecutar script de creación de índices
node add-gsi-to-eventos.js
```

**Salida esperada**:

```
🚀 Iniciando actualización de tabla Eventos
📊 Tabla: Eventos

📋 Índices existentes:
  - Ninguno (o lista de existentes)

🔧 Agregando slug-index...
✅ slug-index agregado exitosamente
   ⏳ El índice se está creando en segundo plano (puede tardar varios minutos)

⏳ Esperando 10 segundos antes de agregar el siguiente índice...

🔧 Agregando venueId-index...
✅ venueId-index agregado exitosamente
   ⏳ El índice se está creando en segundo plano (puede tardar varios minutos)

✅ Script completado exitosamente
```

### Paso 2: Verificar Estado de los Índices

```bash
# Esperar 5-10 minutos y verificar
aws dynamodb describe-table --table-name Eventos --region us-east-1 --query "Table.GlobalSecondaryIndexes[*].[IndexName,IndexStatus]" --output table
```

**Esperar hasta que ambos índices tengan estado `ACTIVE`**

### Paso 3: Desplegar Lambda Functions

```bash
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-manageevents

# Desplegar
serverless deploy
```

**Salida esperada**:

```
✔ Service deployed to stack aws-lambda-manageevent-dev

endpoints:
  GET - https://xxx.execute-api.us-east-1.amazonaws.com/events/slug/{slug}
  GET - https://xxx.execute-api.us-east-1.amazonaws.com/events/venue/{venueId}
  ... (otros endpoints)

functions:
  getEventBySlug: aws-lambda-manageevent-dev-getEventBySlug
  getEventsByVenue: aws-lambda-manageevent-dev-getEventsByVenue
  ... (otras funciones)
```

---

## 🧪 Testing

### 1. Probar Creación de Evento con Slug

```bash
curl -X POST https://API_URL/createEvent \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Festival de Música Rock 2024",
    "descripcion": "El mejor festival del año",
    "fechaIni": "10/05/2025",
    "fechaFin": "12/05/2025",
    "horaIni": "18:00",
    "horaFin": "23:00",
    "ubicacion": {
      "country": "Colombia",
      "city": "Bogotá",
      "address": "Calle 100 #20-30",
      "timezone": "America/Bogota"
    },
    "venueId": "venue-123",
    "skipVenue": false,
    "userId": "user-123",
    "organizerName": "Rock Events CO",
    "email": "info@rockevents.com",
    "tipoEvento": "Concierto",
    "Categoria": "Música",
    "aforo": 5000,
    "modalidadEvt": "public",
    "clase": "Presencial"
  }'
```

**Respuesta esperada**:

```json
{
  "success": true,
  "statusCode": 201,
  "newEvent": {
    "id": "a1b2c3d4-...",
    "slug": "festival-musica-rock-2024",
    "nombre": "Festival de Música Rock 2024",
    ...
  }
}
```

### 2. Probar Slug Duplicado

Crear otro evento con el mismo nombre:

```bash
# Mismo request anterior
```

**Respuesta esperada**:

```json
{
  "slug": "festival-musica-rock-2024-e5f6g7h8",
  ...
}
```

### 3. Probar getEventBySlug

```bash
curl https://API_URL/events/slug/festival-musica-rock-2024
```

**Respuesta esperada**:

```json
{
  "message": "Evento obtenido exitosamente",
  "evento": {
    "id": "a1b2c3d4-...",
    "slug": "festival-musica-rock-2024",
    "nombre": "Festival de Música Rock 2024",
    ...
  }
}
```

### 4. Probar getEventsByVenue

```bash
curl https://API_URL/events/venue/venue-123
```

**Respuesta esperada**:

```json
{
  "message": "Eventos obtenidos exitosamente",
  "venueId": "venue-123",
  "count": 2,
  "eventos": [
    {
      "id": "...",
      "nombre": "Festival de Música Rock 2024",
      "venueId": "venue-123"
    },
    ...
  ]
}
```

---

## 📊 Validación de GSI

### Verificar Datos en slug-index

```bash
aws dynamodb query \
  --table-name Eventos \
  --index-name slug-index \
  --key-condition-expression "slug = :slug" \
  --expression-attribute-values '{":slug":{"S":"festival-musica-rock-2024"}}' \
  --region us-east-1
```

### Verificar Datos en venueId-index

```bash
aws dynamodb query \
  --table-name Eventos \
  --index-name venueId-index \
  --key-condition-expression "venueId = :venueId" \
  --expression-attribute-values '{":venueId":{"S":"venue-123"}}' \
  --region us-east-1
```

---

## 🔍 Monitoreo y Logs

### CloudWatch Logs - Grupos relevantes

```
/aws/lambda/aws-lambda-manageevent-dev-getEventBySlug
/aws/lambda/aws-lambda-manageevent-dev-getEventsByVenue
/aws/lambda/aws-lambda-manageevent-dev-createEvent
```

### Verificar Logs

```bash
# Ver logs de getEventBySlug
serverless logs -f getEventBySlug --tail

# Ver logs de getEventsByVenue
serverless logs -f getEventsByVenue --tail

# Ver logs de createEvent
serverless logs -f createEvent --tail
```

---

## ⚠️ Troubleshooting

### Error: "Index not found: slug-index"

**Causa**: Los GSI aún no están activos

**Solución**:

```bash
# Verificar estado
aws dynamodb describe-table --table-name Eventos --region us-east-1 --query "Table.GlobalSecondaryIndexes[*].IndexStatus"

# Esperar hasta que muestre "ACTIVE"
```

### Error: "Slug duplicado detectado"

**Esperado**: El sistema automáticamente agregará sufijo único

**Verificar**:

```javascript
// En logs CloudWatch verás:
⚠️  Slug duplicado detectado. Nuevo slug: festival-musica-2024-a1b2c3d4
```

### Error: "venueId es obligatorio cuando skipVenue es false"

**Causa**: No se envió venueId en el request cuando skipVenue=false

**Solución**:

```json
{
  "skipVenue": false,
  "venueId": "venue-123",  // ← Agregar este campo
  ...
}
```

---

## 📝 Próximos Pasos (Pendientes)

### 1. EventBridge Scheduler para publishAt

Crear una regla de EventBridge que:

- Consulte eventos con `publishAt` <= fecha actual
- Cambie su estado a "Publicado"
- Dispare notificaciones

**Script sugerido**: `setup-eventbridge-scheduler.js`

### 2. Template de Notificación

Crear template en `aws-lambda-notifications`:

**Archivo**: `src/templates/email/event_published.hbs`

```handlebars
<html>
  <head>
    <title>Evento Publicado</title>
  </head>
  <body>
    <h1>¡Tu evento está publicado!</h1>
    <p>Hola {{organizerName}},</p>
    <p>Tu evento
      <strong>{{eventName}}</strong>
      ha sido publicado exitosamente.</p>
    <p><a href="{{eventUrl}}">Ver evento</a></p>
  </body>
</html>
```

### 3. Migración de Eventos Existentes

Si hay eventos sin slug:

```javascript
// Script: migrate-existing-events.js
// Iterar sobre todos los eventos sin slug
// Generar slug y actualizar
```

---

## 📚 Documentación Relacionada

- [MODELO_EVENT_ACTUALIZADO.md](./MODELO_EVENT_ACTUALIZADO.md) - Modelo completo de eventos
- [serverless.yml](./serverless.yml) - Configuración de Serverless Framework
- [createEvent.js](./src/createEvent.js) - Handler de creación de eventos
- [getEventBySlug.js](./src/getEventBySlug.js) - Handler de búsqueda por slug
- [getEventsByVenue.js](./src/getEventsByVenue.js) - Handler de búsqueda por venue

---

## ✅ Checklist de Despliegue

- [ ] Ejecutar `add-gsi-to-eventos.js`
- [ ] Verificar que ambos GSI tengan estado `ACTIVE`
- [ ] Ejecutar `serverless deploy`
- [ ] Probar endpoint `GET /events/slug/{slug}`
- [ ] Probar endpoint `GET /events/venue/{venueId}`
- [ ] Crear evento de prueba con slug
- [ ] Crear evento duplicado (verificar sufijo único)
- [ ] Verificar logs en CloudWatch
- [ ] Documentar URLs de endpoints en wiki del equipo
- [ ] Notificar a frontend sobre nuevos endpoints

---

## 🎯 Resultados Esperados

Después del despliegue completo:

1. ✅ Eventos tienen slugs únicos automáticamente
2. ✅ Se pueden buscar eventos por slug: `/events/slug/mi-evento-2024`
3. ✅ Se pueden listar eventos por venue: `/events/venue/venue-123`
4. ✅ Validación de unicidad de slug funciona
5. ✅ Notificaciones al publicar eventos (integración con aws-lambda-notifications)
6. ✅ Todos los campos del modelo EVENT implementados

---

**Fecha de última actualización**: Enero 2025
**Versión**: 1.0.0
**Autor**: Sistema de Eventos DoEvents
