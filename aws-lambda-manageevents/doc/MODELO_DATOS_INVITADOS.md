# 🗄️ Modelo de Datos DynamoDB - Gestión de Invitados

## 📊 Arquitectura General

El sistema maneja **3 tipos de invitados**:

1. **Usuarios registrados** (ya existen en tabla `Client`)
2. **Invitados no registrados** (creados manualmente)
3. **Contactos importados** (desde dispositivo)

---

## 🏗️ Tablas de DynamoDB

### **Tabla 1: `EventGuests-{stage}`** (Principal)

Almacena todos los invitados de eventos, sean usuarios registrados o no.

#### Estructura de la Tabla

| Atributo        | Tipo    | Descripción                                                    |
| --------------- | ------- | -------------------------------------------------------------- |
| **PK**          | String  | `EVENT#{eventId}`                                              |
| **SK**          | String  | `GUEST#{guestId}`                                              |
| GSI1PK          | String  | `USER#{userId}` (si es usuario registrado) o `GUEST#{guestId}` |
| GSI1SK          | String  | `EVENT#{eventId}`                                              |
| GSI2PK          | String  | `EVENT#{eventId}#CATEGORY#{favoritos\|otros}`                  |
| GSI2SK          | String  | `#GUEST#{guestId}`                                             |
| guestId         | String  | ID único del invitado (UUID)                                   |
| eventId         | String  | ID del evento                                                  |
| userId          | String  | ID del usuario en Client (null si no registrado)               |
| guestType       | String  | `REGISTERED` \| `MANUAL` \| `IMPORTED`                         |
| name            | String  | Nombre completo                                                |
| username        | String  | Username o handle                                              |
| phone           | String  | Teléfono (puede ser null)                                      |
| email           | String  | Email (puede ser null)                                         |
| profileImageUrl | String  | URL de la imagen de perfil                                     |
| isFavorite      | Boolean | true = Favoritos, false = Otros                                |
| tags            | List    | Array de tags: `["Familia", "VIP"]`                            |
| groupIds        | List    | Array de IDs de grupos: `["group_123", "group_456"]`           |
| metadata        | Map     | Datos adicionales del contacto importado                       |
| createdAt       | String  | ISO 8601 timestamp                                             |
| updatedAt       | String  | ISO 8601 timestamp                                             |
| createdBy       | String  | ID del usuario que lo creó                                     |

#### Índices

##### Primary Key

- **PK**: `EVENT#{eventId}`
- **SK**: `GUEST#{guestId}`

##### GSI1 - `UserEventsIndex`

Permite consultar todos los eventos donde un usuario es invitado.

- **GSI1PK**: `USER#{userId}` o `GUEST#{guestId}`
- **GSI1SK**: `EVENT#{eventId}`
- Proyección: ALL

**Queries soportados:**

```typescript
// Obtener todos los eventos donde un usuario es invitado
GSI1PK = "USER#user123";
```

##### GSI2 - `EventCategoryIndex`

Permite consultar invitados por categoría (Favoritos/Otros).

- **GSI2PK**: `EVENT#{eventId}#CATEGORY#{favoritos|otros}`
- **GSI2SK**: `#GUEST#{guestId}`
- Proyección: ALL

**Queries soportados:**

```typescript
// Obtener solo favoritos de un evento
GSI2PK = "EVENT#evento_12345#CATEGORY#favoritos";

// Obtener solo "otros" de un evento
GSI2PK = "EVENT#evento_12345#CATEGORY#otros";
```

---

### **Tabla 2: `EventGroups-{stage}`**

Almacena los grupos de invitados por evento.

#### Estructura de la Tabla

| Atributo   | Tipo   | Descripción                           |
| ---------- | ------ | ------------------------------------- |
| **PK**     | String | `EVENT#{eventId}`                     |
| **SK**     | String | `GROUP#{groupId}`                     |
| GSI1PK     | String | `EVENT#{eventId}#ORDER`               |
| GSI1SK     | Number | `orden` (0, 1, 2, ...)                |
| groupId    | String | ID único del grupo (UUID)             |
| eventId    | String | ID del evento                         |
| name       | String | Nombre del grupo                      |
| color      | String | Color hex: `#FF9AA2`                  |
| order      | Number | Orden de visualización (0, 1, 2, ...) |
| guestCount | Number | Cantidad de invitados (denormalizado) |
| createdAt  | String | ISO 8601 timestamp                    |
| updatedAt  | String | ISO 8601 timestamp                    |
| createdBy  | String | ID del usuario que lo creó            |

#### Índices

##### Primary Key

- **PK**: `EVENT#{eventId}`
- **SK**: `GROUP#{groupId}`

##### GSI1 - `EventGroupOrderIndex`

Permite consultar grupos ordenados.

- **GSI1PK**: `EVENT#{eventId}#ORDER`
- **GSI1SK**: `orden` (Number)
- Proyección: ALL

**Queries soportados:**

```typescript
// Obtener grupos de un evento ordenados
GSI1PK = "EVENT#evento_12345#ORDER"
SortKey ascendente por GSI1SK
```

---

### **Tabla 3: `EventGroupMembers-{stage}`**

Relación muchos-a-muchos entre grupos e invitados.

#### Estructura de la Tabla

| Atributo | Tipo   | Descripción                       |
| -------- | ------ | --------------------------------- |
| **PK**   | String | `GROUP#{groupId}`                 |
| **SK**   | String | `GUEST#{guestId}`                 |
| GSI1PK   | String | `GUEST#{guestId}`                 |
| GSI1SK   | String | `GROUP#{groupId}`                 |
| GSI2PK   | String | `EVENT#{eventId}#GROUP#{groupId}` |
| GSI2SK   | String | `#GUEST#{guestId}`                |
| groupId  | String | ID del grupo                      |
| guestId  | String | ID del invitado                   |
| eventId  | String | ID del evento                     |
| addedAt  | String | ISO 8601 timestamp                |
| addedBy  | String | ID del usuario que lo agregó      |

#### Índices

##### Primary Key

- **PK**: `GROUP#{groupId}`
- **SK**: `GUEST#{guestId}`

##### GSI1 - `GuestGroupsIndex`

Permite consultar todos los grupos de un invitado.

- **GSI1PK**: `GUEST#{guestId}`
- **GSI1SK**: `GROUP#{groupId}`
- Proyección: ALL

**Queries soportados:**

```typescript
// Obtener todos los grupos de un invitado
GSI1PK = "GUEST#guest_123";
```

##### GSI2 - `EventGroupGuestsIndex`

Permite consultar invitados de un grupo en un evento.

- **GSI2PK**: `EVENT#{eventId}#GROUP#{groupId}`
- **GSI2SK**: `#GUEST#{guestId}`
- Proyección: ALL

**Queries soportados:**

```typescript
// Obtener todos los invitados de un grupo
GSI2PK = "EVENT#evento_12345#GROUP#group_abc";
```

---

### **Tabla 4: `GuestImages-{stage}`** (Opcional - Solo si se requiere versionamiento)

Almacena imágenes de perfil de invitados no registrados.

#### Estructura de la Tabla

| Atributo   | Tipo    | Descripción                     |
| ---------- | ------- | ------------------------------- |
| **PK**     | String  | `GUEST#{guestId}`               |
| **SK**     | String  | `IMAGE#{timestamp}`             |
| imageUrl   | String  | URL en S3                       |
| imageKey   | String  | Key en S3 bucket                |
| imageType  | String  | `profile` \| `contact_imported` |
| uploadedAt | String  | ISO 8601 timestamp              |
| uploadedBy | String  | ID del usuario que lo subió     |
| isActive   | Boolean | true si es la imagen actual     |

**Nota:** Para simplificar, puedes almacenar solo `profileImageUrl` directamente en `EventGuests` y usar esta tabla solo si necesitas historial de imágenes.

---

## 🔄 Integración con Tabla Existente `Client-{stage}`

### Estructura esperada de Client (usuarios registrados)

```typescript
interface Client {
  id: string; // PK
  name: string;
  username: string;
  email: string;
  phone?: string;
  profileImageUrl?: string; // URL de la imagen de perfil
  createdAt: string;
  // ... otros campos
}
```

### Relación con EventGuests

Cuando un **usuario registrado** es invitado:

```typescript
{
  PK: "EVENT#evento_12345",
  SK: "GUEST#guest_abc123",
  guestId: "guest_abc123",
  eventId: "evento_12345",
  userId: "user_real_123",        // ← Referencia a Client.id
  guestType: "REGISTERED",
  name: "Ana Ruiz",               // Copiado de Client
  username: "anaruiz",            // Copiado de Client
  phone: "+573001234567",         // Copiado de Client
  email: "ana@example.com",       // Copiado de Client
  profileImageUrl: "https://...", // Copiado de Client.profileImageUrl
  isFavorite: true,
  tags: ["Familia"],
  groupIds: ["group_abc"],
  createdAt: "2025-10-27T10:30:00.000Z",
  updatedAt: "2025-10-27T10:30:00.000Z"
}
```

**Importante:**

- Los datos se **denormalizan** (copian de Client a EventGuests)
- Si el usuario actualiza su perfil en Client, los eventos NO se actualizan automáticamente
- Opción: Tener un Lambda trigger que sincronice cambios de Client → EventGuests

---

## 📁 Almacenamiento de Imágenes (S3)

### Bucket S3: `doevents-guest-images-{stage}`

#### Estructura de carpetas

```
doevents-guest-images-dev/
├── events/
│   ├── evento_12345/
│   │   ├── guests/
│   │   │   ├── guest_abc123.jpg
│   │   │   ├── guest_xyz789.png
│   │   │   └── ...
│   └── evento_67890/
│       └── guests/
│           └── ...
└── imported/
    ├── temp_contact_001.jpg  (imágenes temporales de contactos)
    └── ...
```

#### Política de acceso

- **Presigned URLs** para subir imágenes desde frontend
- **CloudFront** para CDN de imágenes públicas
- **Lifecycle policy**: Eliminar imágenes temporales después de 7 días

---

## 🎯 Patrones de Acceso y Queries

### 1. Obtener todos los invitados de un evento

```typescript
// Query en EventGuests
PK = "EVENT#evento_12345"
SK begins_with "GUEST#"
```

**Response:**

```json
[
  {
    "guestId": "guest_abc123",
    "name": "Ana Ruiz",
    "isFavorite": true,
    "guestType": "REGISTERED",
    "userId": "user_123"
  },
  {
    "guestId": "guest_xyz789",
    "name": "Pedro López",
    "isFavorite": false,
    "guestType": "MANUAL",
    "userId": null
  }
]
```

---

### 2. Obtener solo favoritos de un evento

```typescript
// Query en GSI2 (EventCategoryIndex)
GSI2PK = "EVENT#evento_12345#CATEGORY#favoritos";
```

---

### 3. Obtener todos los grupos de un evento (ordenados)

```typescript
// Query en EventGroups con GSI1
GSI1PK = "EVENT#evento_12345#ORDER"
SortBy GSI1SK ascending
```

**Response:**

```json
[
  {
    "groupId": "group_abc",
    "name": "Familia",
    "color": "#FF9AA2",
    "order": 0,
    "guestCount": 5
  },
  {
    "groupId": "group_xyz",
    "name": "Trabajo",
    "color": "#77DD77",
    "order": 1,
    "guestCount": 3
  }
]
```

---

### 4. Obtener invitados de un grupo específico

```typescript
// Paso 1: Query en EventGroupMembers
GSI2PK = "EVENT#evento_12345#GROUP#group_abc";

// Resultado: ["guest_abc123", "guest_xyz789", "guest_def456"]

// Paso 2: BatchGetItem en EventGuests
Keys = [
  { PK: "EVENT#evento_12345", SK: "GUEST#guest_abc123" },
  { PK: "EVENT#evento_12345", SK: "GUEST#guest_xyz789" },
  { PK: "EVENT#evento_12345", SK: "GUEST#guest_def456" },
];
```

---

### 5. Obtener todos los eventos donde un usuario es invitado

```typescript
// Query en GSI1 (UserEventsIndex)
GSI1PK = "USER#user_123";
```

**Response:**

```json
[
  {
    "eventId": "evento_12345",
    "guestId": "guest_abc",
    "isFavorite": true,
    "groupIds": ["group_abc"]
  },
  {
    "eventId": "evento_67890",
    "guestId": "guest_xyz",
    "isFavorite": false,
    "groupIds": []
  }
]
```

---

### 6. Agregar invitados a un grupo

```typescript
// Paso 1: Crear relaciones en EventGroupMembers
BatchWriteItem [
  {
    PK: "GROUP#group_abc",
    SK: "GUEST#guest_123",
    GSI1PK: "GUEST#guest_123",
    GSI1SK: "GROUP#group_abc",
    GSI2PK: "EVENT#evento_12345#GROUP#group_abc",
    GSI2SK: "#GUEST#guest_123",
    groupId: "group_abc",
    guestId: "guest_123",
    eventId: "evento_12345",
    addedAt: "2025-10-27T15:00:00.000Z"
  },
  // ... más invitados
]

// Paso 2: Actualizar EventGuests (agregar groupId al array)
UpdateItem {
  PK: "EVENT#evento_12345",
  SK: "GUEST#guest_123",
  UpdateExpression: "ADD groupIds :groupId",
  ExpressionAttributeValues: {
    ":groupId": ["group_abc"]
  }
}

// Paso 3: Incrementar contador en EventGroups
UpdateItem {
  PK: "EVENT#evento_12345",
  SK: "GROUP#group_abc",
  UpdateExpression: "ADD guestCount :inc",
  ExpressionAttributeValues: {
    ":inc": 1
  }
}
```

---

## 🚀 Scripts de Creación de Tablas

### Script 1: EventGuests

```javascript
// serverless.yml resources
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
      - Key: Service
        Value: EventGuests
```

---

### Script 2: EventGroups

```javascript
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
      - Key: Service
        Value: EventGroups
```

---

### Script 3: EventGroupMembers

```javascript
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
      - Key: Service
        Value: EventGroupMembers
```

---

## 🔐 Permisos IAM Necesarios

```yaml
# serverless.yml - provider.iamRoleStatements
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
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/EventGuests-${self:provider.stage}
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/EventGuests-${self:provider.stage}/index/*
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/EventGroups-${self:provider.stage}
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/EventGroups-${self:provider.stage}/index/*
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/EventGroupMembers-${self:provider.stage}
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/EventGroupMembers-${self:provider.stage}/index/*
    - arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Client-${self:provider.stage}

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

---

## 📈 Estimación de Costos

### Escenario: Evento con 500 invitados, 10 grupos

| Tabla             | Items    | Tamaño promedio | Operaciones/día        | Costo mensual (aprox.) |
| ----------------- | -------- | --------------- | ---------------------- | ---------------------- |
| EventGuests       | 500      | 1 KB            | 1000 reads, 100 writes | $0.13                  |
| EventGroups       | 10       | 0.5 KB          | 500 reads, 50 writes   | $0.01                  |
| EventGroupMembers | 1500     | 0.3 KB          | 2000 reads, 200 writes | $0.20                  |
| **Total**         | **2010** | -               | -                      | **~$0.34/evento**      |

**Nota:** Precios en PAY_PER_REQUEST mode. Para eventos grandes (>10K invitados), considerar PROVISIONED mode.

---

## ✅ Ventajas de este Modelo

1. **✅ Single Table Design parcial**: Agrupa por evento en PK
2. **✅ Queries eficientes**: GSIs optimizados para casos de uso comunes
3. **✅ Denormalización controlada**: Datos de Client copiados a EventGuests
4. **✅ Escalabilidad**: Soporta millones de invitados/grupos
5. **✅ Flexibilidad**: Permite invitados registrados, manuales e importados
6. **✅ Relaciones M:N**: EventGroupMembers maneja grupos-invitados eficientemente
7. **✅ Búsqueda por categoría**: GSI2 permite filtrar Favoritos/Otros sin scan

---

## 🔄 Flujo de Sincronización con Client (Opcional)

### Opción 1: Lambda Trigger en DynamoDB Streams

```javascript
// Lambda que escucha cambios en Client table
exports.handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === "MODIFY") {
      const userId = record.dynamodb.Keys.id.S;
      const newImage = record.dynamodb.NewImage;

      // Buscar todos los EventGuests de este usuario
      const guests = await queryGuestsByUser(userId);

      // Actualizar datos denormalizados
      for (const guest of guests) {
        await updateGuest(guest.eventId, guest.guestId, {
          name: newImage.name?.S,
          username: newImage.username?.S,
          email: newImage.email?.S,
          phone: newImage.phone?.S,
          profileImageUrl: newImage.profileImageUrl?.S,
        });
      }
    }
  }
};
```

### Opción 2: Sincronización manual bajo demanda

Endpoint que sincroniza un usuario específico:

```
POST /api/users/{userId}/sync-guest-data
```

---

## 📝 Resumen de Tablas

| Tabla                  | Propósito                 | PK                | SK                | GSIs                                    |
| ---------------------- | ------------------------- | ----------------- | ----------------- | --------------------------------------- |
| **EventGuests**        | Invitados por evento      | `EVENT#{eventId}` | `GUEST#{guestId}` | UserEventsIndex, EventCategoryIndex     |
| **EventGroups**        | Grupos de invitados       | `EVENT#{eventId}` | `GROUP#{groupId}` | EventGroupOrderIndex                    |
| **EventGroupMembers**  | Relación grupos-invitados | `GROUP#{groupId}` | `GUEST#{guestId}` | GuestGroupsIndex, EventGroupGuestsIndex |
| **Client** (existente) | Usuarios registrados      | `id`              | -                 | -                                       |

---

## 🎯 Próximos Pasos

1. ✅ Crear tablas en DynamoDB (via serverless.yml)
2. ✅ Crear bucket S3 para imágenes
3. ✅ Implementar Lambdas CRUD:
   - `createGuest`
   - `getGuests`
   - `updateGuest`
   - `deleteGuest`
   - `toggleFavorite`
   - `importContacts`
   - `createGroup`
   - `updateGroup`
   - `deleteGroup`
   - `addGuestsToGroup`
   - `removeGuestFromGroup`
   - `reorderGroups`
4. ✅ Implementar presigned URLs para upload de imágenes
5. ✅ Crear endpoints API Gateway
6. ✅ Documentar API (Swagger)

---

_Modelo de datos diseñado el 27 de Octubre de 2025_
