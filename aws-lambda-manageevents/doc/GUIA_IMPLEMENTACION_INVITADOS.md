# 🚀 Guía Rápida - Implementación Sistema de Invitados

## 📋 Resumen Ejecutivo

### Tablas a Crear en DynamoDB

1. **EventGuests-dev** - Invitados de eventos (registrados, manuales, importados)
2. **EventGroups-dev** - Grupos de invitados
3. **EventGroupMembers-dev** - Relación muchos-a-muchos (grupos ↔ invitados)

### Características del Sistema

- ✅ Soporte para usuarios registrados (referencia a tabla Client)
- ✅ Invitados no registrados (creados manualmente)
- ✅ Contactos importados desde dispositivo
- ✅ Gestión de favoritos vs otros
- ✅ Grupos con colores y orden personalizable
- ✅ Imágenes de perfil (S3 + CloudFront)
- ✅ Relación muchos-a-muchos (un invitado en varios grupos)

---

## 📊 Diagrama de Relaciones

```
┌─────────────────┐
│  Client (exist) │ ─────┐
└─────────────────┘      │
                         │ (userId - opcional)
                         ↓
┌──────────────────────────────────────────┐
│          EventGuests                     │
│  ┌────────────────────────────────────┐  │
│  │ PK: EVENT#evento_123               │  │
│  │ SK: GUEST#guest_abc                │  │
│  │ userId: user_123 (si registrado)   │  │
│  │ guestType: REGISTERED|MANUAL|...   │  │
│  │ isFavorite: true|false             │  │
│  │ groupIds: ["group_1", "group_2"]   │  │
│  │ profileImageUrl: "s3://..."        │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
         │                     │
         │                     │
         ↓                     ↓
┌──────────────────┐   ┌──────────────────────┐
│  EventGroups     │   │ EventGroupMembers    │
│  ┌────────────┐  │   │  ┌────────────────┐  │
│  │ GROUP#123  │  │   │  │ PK: GROUP#123  │  │
│  │ Familia    │  │   │  │ SK: GUEST#abc  │  │
│  │ #FF9AA2    │  │   │  │                │  │
│  │ order: 0   │  │   │  └────────────────┘  │
│  └────────────┘  │   └──────────────────────┘
└──────────────────┘
```

---

## 🎯 Decisiones de Diseño Clave

### 1. ¿Por qué 3 tablas separadas?

| Tabla                 | Razón                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **EventGuests**       | Una fila = un invitado. Permite queries eficientes por evento y categoría (favoritos/otros) |
| **EventGroups**       | Una fila = un grupo. Permite ordenamiento y gestión independiente                           |
| **EventGroupMembers** | Relación M:N flexible. Un invitado puede estar en múltiples grupos sin duplicar datos       |

### 2. ¿Por qué denormalizar datos de Client?

**Ventajas:**

- ⚡ Queries más rápidas (no JOINs)
- 📸 Snapshot del invitado al momento de agregarlo
- 🔄 Eventos mantienen datos históricos aunque el usuario cambie su perfil

**Desventaja:**

- Los cambios en Client NO se reflejan automáticamente
- **Solución:** Lambda trigger opcional o endpoint de sincronización manual

### 3. ¿Por qué GSI EventCategoryIndex?

Permite queries eficientes:

```typescript
// Sin GSI: Scan completo + filtro en aplicación ❌
const allGuests = await scanTable();
const favorites = allGuests.filter((g) => g.isFavorite);

// Con GSI: Query directo ✅
GSI2PK = "EVENT#evento_123#CATEGORY#favoritos";
```

**Ahorro:** ~90% en RCUs para eventos con >100 invitados

---

## 🛠️ Comandos de Implementación

### Paso 1: Crear las Tablas

Agrega esto a `serverless.yml` en la sección `resources`:

```yaml
resources:
  Resources:
    # ========================================
    # Tabla 1: EventGuests
    # ========================================
    EventGuestsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: EventGuests-${self:provider.stage}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: PK
            AttributeType: S
          - AttributeName: SK
            AttributeType: S
          - AttributeName: GSI1PK
            AttributeType: S
          - AttributeName: GSI1SK
            AttributeType: S
          - AttributeName: GSI2PK
            AttributeType: S
          - AttributeName: GSI2SK
            AttributeType: S
        KeySchema:
          - AttributeName: PK
            KeyType: HASH
          - AttributeName: SK
            KeyType: RANGE
        GlobalSecondaryIndexes:
          - IndexName: UserEventsIndex
            KeySchema:
              - AttributeName: GSI1PK
                KeyType: HASH
              - AttributeName: GSI1SK
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
          - IndexName: EventCategoryIndex
            KeySchema:
              - AttributeName: GSI2PK
                KeyType: HASH
              - AttributeName: GSI2SK
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
        StreamSpecification:
          StreamViewType: NEW_AND_OLD_IMAGES
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
        Tags:
          - Key: Environment
            Value: ${self:provider.stage}

    # ========================================
    # Tabla 2: EventGroups
    # ========================================
    EventGroupsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: EventGroups-${self:provider.stage}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: PK
            AttributeType: S
          - AttributeName: SK
            AttributeType: S
          - AttributeName: GSI1PK
            AttributeType: S
          - AttributeName: GSI1SK
            AttributeType: N
        KeySchema:
          - AttributeName: PK
            KeyType: HASH
          - AttributeName: SK
            KeyType: RANGE
        GlobalSecondaryIndexes:
          - IndexName: EventGroupOrderIndex
            KeySchema:
              - AttributeName: GSI1PK
                KeyType: HASH
              - AttributeName: GSI1SK
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
        Tags:
          - Key: Environment
            Value: ${self:provider.stage}

    # ========================================
    # Tabla 3: EventGroupMembers
    # ========================================
    EventGroupMembersTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: EventGroupMembers-${self:provider.stage}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: PK
            AttributeType: S
          - AttributeName: SK
            AttributeType: S
          - AttributeName: GSI1PK
            AttributeType: S
          - AttributeName: GSI1SK
            AttributeType: S
          - AttributeName: GSI2PK
            AttributeType: S
          - AttributeName: GSI2SK
            AttributeType: S
        KeySchema:
          - AttributeName: PK
            KeyType: HASH
          - AttributeName: SK
            KeyType: RANGE
        GlobalSecondaryIndexes:
          - IndexName: GuestGroupsIndex
            KeySchema:
              - AttributeName: GSI1PK
                KeyType: HASH
              - AttributeName: GSI1SK
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
          - IndexName: EventGroupGuestsIndex
            KeySchema:
              - AttributeName: GSI2PK
                KeyType: HASH
              - AttributeName: GSI2SK
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
        PointInTimeRecoverySpecification:
          PointInTimeRecoveryEnabled: true
        Tags:
          - Key: Environment
            Value: ${self:provider.stage}

    # ========================================
    # S3 Bucket para imágenes
    # ========================================
    GuestImagesBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: doevents-guest-images-${self:provider.stage}
        CorsConfiguration:
          CorsRules:
            - AllowedOrigins:
                - "*"
              AllowedMethods:
                - GET
                - PUT
                - POST
                - DELETE
              AllowedHeaders:
                - "*"
              MaxAge: 3000
        PublicAccessBlockConfiguration:
          BlockPublicAcls: false
          BlockPublicPolicy: false
          IgnorePublicAcls: false
          RestrictPublicBuckets: false
        LifecycleConfiguration:
          Rules:
            - Id: DeleteTempImages
              Status: Enabled
              Prefix: imported/
              ExpirationInDays: 7
        Tags:
          - Key: Environment
            Value: ${self:provider.stage}
```

### Paso 2: Agregar Variables de Entorno

En `serverless.yml` → `provider.environment`:

```yaml
provider:
  environment:
    EVENT_GUESTS_TABLE: EventGuests-${self:provider.stage}
    EVENT_GROUPS_TABLE: EventGroups-${self:provider.stage}
    EVENT_GROUP_MEMBERS_TABLE: EventGroupMembers-${self:provider.stage}
    CLIENT_TABLE: Client-${self:provider.stage}
    GUEST_IMAGES_BUCKET: doevents-guest-images-${self:provider.stage}
    STAGE: ${self:provider.stage}
```

### Paso 3: Agregar Permisos IAM

En `serverless.yml` → `provider.iamRoleStatements`:

```yaml
provider:
  iamRoleStatements:
    # Permisos DynamoDB
    - Effect: Allow
      Action:
        - dynamodb:Query
        - dynamodb:Scan
        - dynamodb:GetItem
        - dynamodb:PutItem
        - dynamodb:UpdateItem
        - dynamodb:DeleteItem
        - dynamodb:BatchGetItem
        - dynamodb:BatchWriteItem
      Resource:
        - arn:aws:dynamodb:${aws:region}:*:table/EventGuests-${self:provider.stage}
        - arn:aws:dynamodb:${aws:region}:*:table/EventGuests-${self:provider.stage}/index/*
        - arn:aws:dynamodb:${aws:region}:*:table/EventGroups-${self:provider.stage}
        - arn:aws:dynamodb:${aws:region}:*:table/EventGroups-${self:provider.stage}/index/*
        - arn:aws:dynamodb:${aws:region}:*:table/EventGroupMembers-${self:provider.stage}
        - arn:aws:dynamodb:${aws:region}:*:table/EventGroupMembers-${self:provider.stage}/index/*
        - arn:aws:dynamodb:${aws:region}:*:table/Client-${self:provider.stage}

    # Permisos S3
    - Effect: Allow
      Action:
        - s3:PutObject
        - s3:GetObject
        - s3:DeleteObject
      Resource:
        - arn:aws:s3:::doevents-guest-images-${self:provider.stage}/*

    - Effect: Allow
      Action:
        - s3:ListBucket
      Resource:
        - arn:aws:s3:::doevents-guest-images-${self:provider.stage}
```

### Paso 4: Desplegar

```bash
cd aws-lambda-manageevents
serverless deploy --stage dev --verbose
```

---

## 📝 Ejemplos de Datos

### EventGuests - Usuario Registrado

```json
{
  "PK": "EVENT#evento_12345",
  "SK": "GUEST#guest_abc123",
  "GSI1PK": "USER#user_real_123",
  "GSI1SK": "EVENT#evento_12345",
  "GSI2PK": "EVENT#evento_12345#CATEGORY#favoritos",
  "GSI2SK": "#GUEST#guest_abc123",
  "guestId": "guest_abc123",
  "eventId": "evento_12345",
  "userId": "user_real_123",
  "guestType": "REGISTERED",
  "name": "Ana Ruiz",
  "username": "anaruiz",
  "phone": "+573001234567",
  "email": "ana@example.com",
  "profileImageUrl": "https://cdn.doevents.com/users/ana.jpg",
  "isFavorite": true,
  "tags": ["Familia", "VIP"],
  "groupIds": ["group_abc", "group_xyz"],
  "createdAt": "2025-10-27T10:30:00.000Z",
  "updatedAt": "2025-10-27T10:30:00.000Z",
  "createdBy": "user_organizer_456"
}
```

### EventGuests - Invitado Manual

```json
{
  "PK": "EVENT#evento_12345",
  "SK": "GUEST#guest_xyz789",
  "GSI1PK": "GUEST#guest_xyz789",
  "GSI1SK": "EVENT#evento_12345",
  "GSI2PK": "EVENT#evento_12345#CATEGORY#otros",
  "GSI2SK": "#GUEST#guest_xyz789",
  "guestId": "guest_xyz789",
  "eventId": "evento_12345",
  "userId": null,
  "guestType": "MANUAL",
  "name": "Pedro López",
  "username": "pedrolopez",
  "phone": "+573009876543",
  "email": null,
  "profileImageUrl": null,
  "isFavorite": false,
  "tags": ["Staff"],
  "groupIds": ["group_xyz"],
  "createdAt": "2025-10-27T11:00:00.000Z",
  "updatedAt": "2025-10-27T11:00:00.000Z",
  "createdBy": "user_organizer_456"
}
```

### EventGuests - Contacto Importado

```json
{
  "PK": "EVENT#evento_12345",
  "SK": "GUEST#guest_import_001",
  "GSI1PK": "GUEST#guest_import_001",
  "GSI1SK": "EVENT#evento_12345",
  "GSI2PK": "EVENT#evento_12345#CATEGORY#otros",
  "GSI2SK": "#GUEST#guest_import_001",
  "guestId": "guest_import_001",
  "eventId": "evento_12345",
  "userId": null,
  "guestType": "IMPORTED",
  "name": "Juan Pérez",
  "username": "juanperez",
  "phone": "+573001111111",
  "email": "juan@example.com",
  "profileImageUrl": "https://s3.amazonaws.com/doevents-guest-images-dev/imported/contact_001.jpg",
  "isFavorite": false,
  "tags": ["Importado"],
  "groupIds": [],
  "metadata": {
    "importedFrom": "device_contacts",
    "originalContactId": "device_contact_123"
  },
  "createdAt": "2025-10-27T12:00:00.000Z",
  "updatedAt": "2025-10-27T12:00:00.000Z",
  "createdBy": "user_organizer_456"
}
```

### EventGroups

```json
{
  "PK": "EVENT#evento_12345",
  "SK": "GROUP#group_abc",
  "GSI1PK": "EVENT#evento_12345#ORDER",
  "GSI1SK": 0,
  "groupId": "group_abc",
  "eventId": "evento_12345",
  "name": "Familia",
  "color": "#FF9AA2",
  "order": 0,
  "guestCount": 5,
  "createdAt": "2025-10-27T09:00:00.000Z",
  "updatedAt": "2025-10-27T15:00:00.000Z",
  "createdBy": "user_organizer_456"
}
```

### EventGroupMembers

```json
{
  "PK": "GROUP#group_abc",
  "SK": "GUEST#guest_abc123",
  "GSI1PK": "GUEST#guest_abc123",
  "GSI1SK": "GROUP#group_abc",
  "GSI2PK": "EVENT#evento_12345#GROUP#group_abc",
  "GSI2SK": "#GUEST#guest_abc123",
  "groupId": "group_abc",
  "guestId": "guest_abc123",
  "eventId": "evento_12345",
  "addedAt": "2025-10-27T10:00:00.000Z",
  "addedBy": "user_organizer_456"
}
```

---

## 🔍 Queries Principales

### Query 1: Todos los invitados de un evento

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const params = {
  TableName: process.env.EVENT_GUESTS_TABLE,
  KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
  ExpressionAttributeValues: {
    ":pk": `EVENT#${eventId}`,
    ":sk": "GUEST#",
  },
};

const result = await docClient.send(new QueryCommand(params));
const guests = result.Items;
```

### Query 2: Solo favoritos de un evento

```typescript
const params = {
  TableName: process.env.EVENT_GUESTS_TABLE,
  IndexName: "EventCategoryIndex",
  KeyConditionExpression: "GSI2PK = :pk",
  ExpressionAttributeValues: {
    ":pk": `EVENT#${eventId}#CATEGORY#favoritos`,
  },
};

const result = await docClient.send(new QueryCommand(params));
const favorites = result.Items;
```

### Query 3: Grupos ordenados de un evento

```typescript
const params = {
  TableName: process.env.EVENT_GROUPS_TABLE,
  IndexName: "EventGroupOrderIndex",
  KeyConditionExpression: "GSI1PK = :pk",
  ExpressionAttributeValues: {
    ":pk": `EVENT#${eventId}#ORDER`,
  },
  ScanIndexForward: true, // Orden ascendente
};

const result = await docClient.send(new QueryCommand(params));
const groups = result.Items;
```

### Query 4: Invitados de un grupo

```typescript
// Paso 1: Obtener IDs de invitados en el grupo
const membersParams = {
  TableName: process.env.EVENT_GROUP_MEMBERS_TABLE,
  IndexName: "EventGroupGuestsIndex",
  KeyConditionExpression: "GSI2PK = :pk",
  ExpressionAttributeValues: {
    ":pk": `EVENT#${eventId}#GROUP#${groupId}`,
  },
};

const membersResult = await docClient.send(new QueryCommand(membersParams));
const guestIds = membersResult.Items.map((item) => item.guestId);

// Paso 2: BatchGet de invitados
const guestsParams = {
  RequestItems: {
    [process.env.EVENT_GUESTS_TABLE]: {
      Keys: guestIds.map((guestId) => ({
        PK: `EVENT#${eventId}`,
        SK: `GUEST#${guestId}`,
      })),
    },
  },
};

const guestsResult = await docClient.send(new BatchGetCommand(guestsParams));
const guests = guestsResult.Responses[process.env.EVENT_GUESTS_TABLE];
```

---

## ✅ Checklist de Implementación

### Infraestructura

- [ ] Crear tablas DynamoDB (via serverless.yml)
- [ ] Crear bucket S3 para imágenes
- [ ] Configurar CloudFront para CDN (opcional)
- [ ] Configurar variables de entorno
- [ ] Configurar permisos IAM

### Backend (Lambdas)

- [ ] `createGuest` - Crear invitado manual
- [ ] `getGuests` - Obtener invitados de evento
- [ ] `updateGuest` - Actualizar datos de invitado
- [ ] `deleteGuest` - Eliminar invitado
- [ ] `toggleFavorite` - Marcar/desmarcar favorito
- [ ] `importContacts` - Importar contactos desde dispositivo
- [ ] `createGroup` - Crear grupo
- [ ] `getGroups` - Obtener grupos de evento
- [ ] `updateGroup` - Actualizar grupo
- [ ] `deleteGroup` - Eliminar grupo
- [ ] `addGuestsToGroup` - Agregar invitados a grupo
- [ ] `removeGuestFromGroup` - Quitar invitado de grupo
- [ ] `reorderGroups` - Reordenar grupos
- [ ] `uploadGuestImage` - Generar presigned URL para upload
- [ ] `getGuestImage` - Obtener URL de imagen

### API Gateway

- [ ] Configurar endpoints REST
- [ ] Configurar CORS
- [ ] Configurar validación de requests
- [ ] Configurar autenticación (Cognito/JWT)

### Documentación

- [ ] Swagger/OpenAPI spec
- [ ] Ejemplos de requests
- [ ] Guía de integración frontend

### Testing

- [ ] Tests unitarios de Lambdas
- [ ] Tests de integración
- [ ] Tests de carga (performance)

---

## 📈 Estimación de Tiempos

| Tarea                                | Tiempo estimado          |
| ------------------------------------ | ------------------------ |
| Crear tablas DynamoDB                | 1 hora                   |
| Configurar S3 + CloudFront           | 2 horas                  |
| Implementar Lambdas CRUD básico      | 8 horas                  |
| Implementar importación de contactos | 4 horas                  |
| Implementar upload de imágenes       | 3 horas                  |
| Configurar API Gateway               | 2 horas                  |
| Testing completo                     | 4 horas                  |
| Documentación                        | 2 horas                  |
| **Total**                            | **26 horas (~3-4 días)** |

---

## 🎯 Próximos Pasos Inmediatos

1. **Revisar y aprobar el modelo de datos**
2. **Agregar definiciones de tablas a serverless.yml**
3. **Desplegar infraestructura**: `serverless deploy --stage dev`
4. **Crear Lambda básico de prueba** (ej: getGuests)
5. **Probar query en DynamoDB** para validar GSIs
6. **Iterar y expandir funcionalidades**

---

_Guía creada el 27 de Octubre de 2025_
