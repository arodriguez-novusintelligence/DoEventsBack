# Endpoints y Requests - Gestión de Invitados y Invitaciones

## 1. Administración Global de Usuarios y Grupos

### 1.1. Consultar lista de favoritos

**GET** `/users/{userId}/favorites`

**Respuesta:**

```json
{
  "favorites": [
    {
      "favoriteId": "fav123",
      "name": "Juan Pérez",
      "email": "juan@example.com",
      "profileImageUrl": "https://...",
      "groupIds": ["grp001"]
    }
  ]
}
```

---

### 1.2. Consultar lista de "otros" (followers y following combinados)

**GET** `/users/{userId}/others`

**Respuesta:**

```json
{
  "others": [
    {
      "userId": "user456",
      "name": "Ana Ruiz",
      "isFollower": true,
      "isFollowing": false,
      "profileImageUrl": "https://..."
    },
    {
      "userId": "user789",
      "name": "Pedro López",
      "isFollower": false,
      "isFollowing": true,
      "profileImageUrl": "https://..."
    }
  ]
}
```

---

### 1.3. Agregar usuario a favoritos

**POST** `/users/{userId}/favorites`

**Body:**

```json
{
  "name": "Laura Martínez",
  "email": "laura@example.com",
  "phone": "+573001234567",
  "originType": "IMPORTED",
  "groupIds": ["grp002"]
}
```

**Respuesta:**

```json
{
  "favoriteId": "nuevoFavId"
}
```

---

### 1.4. Eliminar usuario de favoritos

**DELETE** `/users/{userId}/favorites/{favoriteId}`

**Respuesta:**

```json
{
  "deleted": true
}
```

---

### 1.5. Consultar grupos de usuarios

**GET** `/users/{userId}/groups`

**Respuesta:**

```json
{
  "groups": [
    {
      "groupId": "grp001",
      "name": "Familia",
      "color": "#FF9AA2",
      "order": 0,
      "userIds": ["fav123", "user456"]
    }
  ]
}
```

---

### 1.6. Crear grupo de usuarios (con cualquier tipo de usuario)

**POST** `/users/{userId}/groups`

**Body:**

```json
{
  "name": "Equipo de Proyecto",
  "color": "#77DD77",
  "order": 1,
  "userIds": ["fav123", "user456", "user789", "imported001", "manual002"],
  "tags": ["Proyecto", "VIP"]
}
```

**Respuesta:**

```json
{
  "groupId": "grupoProyecto001"
}
```

---

### 1.7. Consultar grupo y sus miembros

**GET** `/users/{userId}/groups/{groupId}`

**Respuesta:**

```json
{
  "group": {
    "groupId": "grupoProyecto001",
    "name": "Equipo de Proyecto",
    "color": "#77DD77",
    "order": 1,
    "tags": ["Proyecto", "VIP"],
    "userIds": ["fav123", "user456", "user789", "imported001", "manual002"],
    "members": [
      { "userId": "fav123", "name": "Juan Pérez", "isFavorite": true },
      { "userId": "user456", "name": "Ana Ruiz", "isFollower": true },
      { "userId": "user789", "name": "Pedro López", "isFollowing": true },
      {
        "userId": "imported001",
        "name": "Laura Martínez",
        "originType": "IMPORTED"
      },
      { "userId": "manual002", "name": "Carlos Díaz", "originType": "MANUAL" }
    ]
  }
}
```

---

### 1.8. Actualizar grupo de favoritos (individual)

**PUT** `/users/{userId}/groups/{groupId}`

**Body:**

```json
{
  "name": "Familia VIP",
  "color": "#FF5733",
  "order": 5,
  "userIds": ["user1", "user2", "user3"],
  "tags": ["importante", "favoritos"]
}
```

**Campos opcionales:**

- `name` (string) - Si se cambia, se actualizará el nombre del grupo
- `color` (string) - Color en formato hexadecimal
- `order` (number) - Orden de aparición del grupo
- `userIds` (array de strings) - Lista de IDs de usuarios en el grupo
- `tags` (array de strings) - Etiquetas del grupo

**Respuesta:**

```json
{
  "message": "Favorite group updated successfully",
  "group": {
    "groupId": "grp001",
    "groupName": "Familia VIP",
    "color": "#FF5733",
    "order": 5,
    "userIds": ["user1", "user2", "user3"],
    "tags": ["importante", "favoritos"],
    "updatedAt": "2025-12-02T..."
  }
}
```

---

### 1.9. Actualizar múltiples grupos en lote

**PUT** `/users/{userId}/groups/batch`

**Body:**

```json
{
  "groups": [
    {
      "groupId": "grp001",
      "name": "Familia",
      "color": "#FF9AA2",
      "order": 0,
      "userIds": ["user1", "user2"],
      "tags": ["personal"]
    },
    {
      "groupId": "grp002",
      "order": 1
    },
    {
      "groupId": "grp003",
      "name": "Trabajo",
      "color": "#77DD77",
      "order": 2,
      "userIds": ["user5", "user6", "user7"]
    }
  ]
}
```

**Campos requeridos por grupo:**

- `groupId` (string) - ID del grupo a actualizar

**Campos opcionales por grupo:**

- `name` (string) - Nuevo nombre del grupo
- `color` (string) - Nuevo color
- `order` (number) - Nueva posición (útil para reordenar)
- `userIds` (array) - Nueva lista de usuarios
- `tags` (array) - Nuevas etiquetas

**Notas:**

- Máximo 25 grupos por request
- Solo se actualizan los campos enviados
- Útil para reordenar múltiples grupos a la vez
- Si un grupo falla, los demás continúan procesándose

**Respuesta:**

```json
{
  "message": "Batch update completed",
  "summary": {
    "total": 3,
    "updated": 3,
    "failed": 0
  },
  "results": {
    "updated": [
      { "groupId": "grp001", "groupName": "Familia", "order": 0 },
      { "groupId": "grp002", "groupName": "Amigos", "order": 1 },
      { "groupId": "grp003", "groupName": "Trabajo", "order": 2 }
    ],
    "errors": []
  }
}
```

**Respuesta con errores parciales (HTTP 207):**

```json
{
  "message": "Batch update completed",
  "summary": {
    "total": 3,
    "updated": 2,
    "failed": 1
  },
  "results": {
    "updated": [
      { "groupId": "grp001", "groupName": "Familia", "order": 0 },
      { "groupId": "grp002", "groupName": "Amigos", "order": 1 }
    ],
    "errors": [
      {
        "groupId": "grp999",
        "error": "Group not found"
      }
    ]
  }
}
```

---

### 1.10. Crear usuario manual o importar contacto (versión simplificada)

**POST** `/users/{userId}/others`

**Body:**

```json
{
  "name": "Sofía Gómez",
  "phone": "+573004445566",
  "email": "sofia@example.com",
  "originType": "IMPORTED",
  "tags": ["Contacto", "Celular"]
}
```

**Respuesta:**

```json
{
  "userId": "imported003"
}
```

---

### 1.11. Crear usuario manual o importar contacto (versión completa)

**POST** `/users/{userId}/users`

**Body:**

```json
{
  "name": "Sofía Gómez",
  "phone": "+573004445566",
  "email": "sofia@example.com",
  "username": "sofiagomez",
  "originType": "IMPORTED",
  "isFavorite": false,
  "tags": ["Contacto", "Celular"]
}
```

**Campos obligatorios:**

- `name` (string, min 2 caracteres)

**Campos opcionales:**

- `phone` (string)
- `email` (string)
- `username` (string)
- `originType` (string: MANUAL, IMPORTED, REGISTERED)
- `isFavorite` (boolean, default: false)
- `tags` (array de strings)
- `groupIds` (array de strings)

**Respuesta:**

```json
{
  "favoriteId": "uuid-generado",
  "message": "User added successfully"
}
```

---

### 1.12. Marcar/Desmarcar usuario como favorito

**PUT** `/users/{userId}/users/{favoriteId}/favorite`

**Body:**

```json
{
  "isFavorite": true
}
```

**Campos obligatorios:**

- `isFavorite` (boolean)

**Respuesta:**

```json
{
  "message": "Favorite status updated successfully",
  "user": {
    "favoriteId": "uuid",
    "name": "Sofía Gómez",
    "isFavorite": true,
    "updatedAt": "2025-11-03T..."
  }
}
```

---

## 2. Gestión de Invitaciones a Eventos

### 2.1. Listar invitados de un evento

**GET** `/events/{eventId}/guests`

**Respuesta:**

```json
{
  "guests": [
    {
      "guestId": "abc123",
      "eventId": "evt001",
      "name": "Juan Pérez",
      "email": "juan@example.com",
      "isFavorite": true,
      "groupIds": ["grp001"]
    }
  ]
}
```

---

### 2.2. Agregar invitado a un evento

**POST** `/events/{eventId}/guests`

**Body:**

```json
{
  "name": "Ana Ruiz",
  "email": "ana@example.com",
  "phone": "+573001234567",
  "isFavorite": false,
  "groupIds": ["grp001", "grp002"],
  "originType": "REGISTERED"
}
```

**Respuesta:**

```json
{
  "guestId": "nuevoId"
}
```

---

### 2.3. Eliminar invitado de un evento

**DELETE** `/events/{eventId}/guests/{guestId}`

**Respuesta:**

```json
{
  "deleted": true
}
```

---

### 2.4. Listar grupos de invitados de un evento

**GET** `/events/{eventId}/groups`

**Respuesta:**

```json
{
  "groups": [
    {
      "groupId": "grp001",
      "eventId": "evt001",
      "name": "Familia",
      "color": "#FF9AA2",
      "order": 0,
      "guestIds": ["abc123", "def456"]
    }
  ]
}
```

---

### 2.5. Crear grupo de invitados en un evento

**POST** `/events/{eventId}/groups`

**Body:**

```json
{
  "name": "Amigos",
  "color": "#77DD77",
  "order": 1,
  "guestIds": ["abc123", "xyz789"]
}
```

**Respuesta:**

```json
{
  "groupId": "nuevoGrupoId"
}
```

---

### 2.6. Actualizar grupo de invitados

**PUT** `/events/{eventId}/groups/{groupId}`

**Body:**

```json
{
  "name": "Amigos VIP",
  "color": "#B19CD9"
}
```

**Respuesta:**

```json
{
  "group": {
    "groupId": "grp001",
    "name": "Amigos VIP",
    "color": "#B19CD9"
  }
}
```

---

### 2.7. Eliminar grupo de invitados

**DELETE** `/events/{eventId}/groups/{groupId}`

**Respuesta:**

```json
{
  "deleted": true
}
```

---

## Notas

- Todos los endpoints requieren autenticación y autorización adecuada.
- Los campos obligatorios y opcionales están indicados en los ejemplos de body.
- Los IDs pueden ser de favoritos, seguidores, seguidos, importados o manuales.
- Los endpoints de "others" permiten importar contactos y usuarios generales.
- Los endpoints de eventos gestionan invitados y grupos específicos de cada evento.
