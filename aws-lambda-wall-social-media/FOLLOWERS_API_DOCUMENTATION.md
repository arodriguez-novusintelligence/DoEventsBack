# Documentación de APIs de Gestión de Seguidores

Este documento describe todas las APIs disponibles para gestionar el flujo completo de vida de los seguidores en el sistema.

## Tabla de Contenidos

1. [Seguir Usuario](#seguir-usuario)
2. [Dejar de Seguir](#dejar-de-seguir)
3. [Responder Solicitud de Seguimiento](#responder-solicitud-de-seguimiento)
4. [Obtener Lista de Seguidores](#obtener-lista-de-seguidores)
5. [Obtener Lista de Usuarios Seguidos](#obtener-lista-de-usuarios-seguidos)
6. [Obtener Número de Seguidores](#obtener-número-de-seguidores)
7. [Obtener Número de Usuarios Seguidos](#obtener-número-de-usuarios-seguidos)
8. [Obtener Solicitudes Pendientes](#obtener-solicitudes-pendientes)
9. [Obtener Estado de Seguimiento](#obtener-estado-de-seguimiento)

---

## Seguir Usuario

**Endpoint:** `POST /client/follow`

**Descripción:** Permite a un usuario seguir a otro usuario. Si el perfil es privado, se envía una solicitud de seguimiento. Si es público, se sigue directamente.

**Notificaciones:**

- Si el perfil es privado, el usuario objetivo recibe notificación `push` e `inApp` de nueva solicitud.
- Si el perfil es público, el usuario objetivo recibe notificación `push` e `inApp` de nuevo seguidor.

**Body:**

```json
{
  "userId": "user123",
  "follow_userId": "user456"
}
```

**Respuestas:**

**Perfil Público (200):**

```json
{
  "message": "Usuario seguido exitosamente",
  "status": "accepted"
}
```

**Perfil Privado (200):**

```json
{
  "message": "Solicitud de seguimiento enviada. Esperando aprobación del usuario.",
  "status": "pending"
}
```

**Error (400):**

```json
{
  "message": "No puedes seguirte a ti mismo"
}
```

---

## Dejar de Seguir

**Endpoint:** `POST /client/unfollow`

**Descripción:** Permite a un usuario dejar de seguir a otro usuario.

**Body:**

```json
{
  "userId": "user123",
  "follow_userId": "user456"
}
```

**Respuesta (200):**

```json
{
  "message": "Has dejado de seguir al usuario exitosamente"
}
```

---

## Responder Solicitud de Seguimiento

**Endpoint:** `POST /client/follow/respond`

**Descripción:** Permite a un usuario aceptar o rechazar una solicitud de seguimiento.

**Notificaciones:**

- Cuando se acepta la solicitud, el usuario que la había enviado recibe notificación `push` e `inApp`.
- Cuando se rechaza la solicitud, no se envía notificación automática.

**Body:**

```json
{
  "follow_id": "user123_user456",
  "action": "accept"
}
```

**Valores de action:** `"accept"` o `"reject"`

**Respuesta Aceptar (200):**

```json
{
  "message": "Solicitud de seguimiento aceptada exitosamente",
  "status": "accepted"
}
```

**Respuesta Rechazar (200):**

```json
{
  "message": "Solicitud de seguimiento rechazada exitosamente",
  "status": "rejected"
}
```

---

## Obtener Lista de Seguidores

**Endpoint:** `GET /users/{userId}/followers`

**Descripción:** Obtiene la lista de usuarios que siguen a un perfil específico. Las URLs de las imágenes de perfil se firman automáticamente para acceso seguro.

**Parámetros de Query:**

- `limit` (opcional): Número máximo de resultados (default: 20)
- `lastKey` (opcional): Para paginación

**Respuesta (200):**

```json
{
  "followers": [
    {
      "user": {
        "id": "user123",
        "name": "Juan",
        "lastName": "Pérez",
        "user": "juanperez",
        "fotoPerfilUrl": "fotosPerfil/juanperez.jpg",
        "description": "Descripción del usuario"
      },
      "followed_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1,
  "lastKey": null
}
```

---

## Obtener Lista de Usuarios Seguidos

**Endpoint:** `GET /users/{userId}/following`

**Descripción:** Obtiene la lista de usuarios que sigue un perfil específico. Las URLs de las imágenes de perfil se firman automáticamente para acceso seguro.

**Parámetros de Query:**

- `limit` (opcional): Número máximo de resultados (default: 20)
- `lastKey` (opcional): Para paginación

**Respuesta (200):**

```json
{
  "following": [
    {
      "user": {
        "id": "user456",
        "name": "María",
        "lastName": "García",
        "user": "mariagarcia",
        "fotoPerfilUrl": "fotosPerfil/mariagarcia.jpg",
        "description": "Descripción del usuario",
        "isPublicProfile": true
      },
      "followed_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1,
  "lastKey": null
}
```

---

## Obtener Número de Seguidores

**Endpoint:** `GET /users/{userId}/followers/count`

**Descripción:** Obtiene el número total de seguidores de un usuario y verifica si el usuario consultante sigue al usuario consultado.

**Parámetros de Query:**

- `userIdViewer` (opcional): ID del usuario que está consultando para verificar si sigue al usuario consultado

**Respuesta (200):**

```json
{
  "userId": "user123",
  "followers_count": 150,
  "isFollowing": true
}
```

---

## Obtener Número de Usuarios Seguidos

**Endpoint:** `GET /users/{userId}/following/count`

**Descripción:** Obtiene el número total de usuarios que sigue un usuario y verifica si el usuario consultante sigue al usuario consultado.

**Parámetros de Query:**

- `userIdViewer` (opcional): ID del usuario que está consultando para verificar si sigue al usuario consultado

**Respuesta (200):**

```json
{
  "userId": "user123",
  "following_count": 75,
  "isFollowing": true
}
```

---

## Obtener Solicitudes Pendientes

**Endpoint:** `GET /users/{userId}/follow-requests`

**Descripción:** Obtiene las solicitudes de seguimiento pendientes para un usuario. Las URLs de las imágenes de perfil se firman automáticamente para acceso seguro.

**Parámetros de Query:**

- `limit` (opcional): Número máximo de resultados (default: 20)
- `lastKey` (opcional): Para paginación

**Respuesta (200):**

```json
{
  "pending_requests": [
    {
      "follow_id": "user789_user123",
      "user": {
        "id": "user789",
        "name": "Carlos",
        "lastName": "López",
        "user": "carloslopez",
        "fotoPerfilUrl": "fotosPerfil/carloslopez.jpg",
        "description": "Descripción del usuario"
      },
      "requested_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1,
  "lastKey": null
}
```

---

## Obtener Estado de Seguimiento

**Endpoint:** `GET /follow/{follow_id}`

**Descripción:** Obtiene el estado de una relación de seguimiento específica.

**Respuesta (200):**

```json
{
  "follow_id": "user123_user456",
  "userId": "user123",
  "follow_userId": "user456",
  "status": "accepted",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Estados de Seguimiento

- **`pending`**: Solicitud de seguimiento pendiente (perfiles privados)
- **`accepted`**: Seguimiento aceptado/activo
- **`rejected`**: Solicitud rechazada (el registro se elimina)

## Validaciones Implementadas

1. **Validación de usuarios**: Se verifica que ambos usuarios existan en la tabla Client
2. **Auto-seguimiento**: No se permite seguirse a sí mismo
3. **Duplicados**: Se previene seguir al mismo usuario múltiples veces
4. **Perfiles privados**: Se manejan solicitudes de seguimiento
5. **Perfiles públicos**: Se siguen directamente

## Estructura de la Tabla Followers

```json
{
  "follow_id": "userId_follow_userId",
  "userId": "ID del usuario que sigue",
  "follow_userId": "ID del usuario seguido",
  "status": "pending|accepted",
  "timestamp": "Fecha de creación",
  "updated_at": "Fecha de actualización (opcional)"
}
```

## Índices de DynamoDB Utilizados

La tabla `Followers` utiliza los siguientes índices globales secundarios (GSI):

- **`userIdIndex`**: Índice en el campo `userId` para consultas eficientes de usuarios seguidos
- **`followUserIdIndex`**: Índice en el campo `follow_userId` para consultas eficientes de seguidores

## Gestión de Imágenes S3

- **Bucket:** `doeventprofileimagesbucket`
- **Firma de URLs:** Las URLs de las imágenes de perfil se firman automáticamente con una validez de 1 hora
- **Fallback:** Si hay error al firmar la URL, se devuelve la URL original como respaldo
- **APIs que incluyen firma:** `getFollowers`, `getFollowing`, `getPendingFollowRequests`

## Notas de Implementación

- Todas las APIs incluyen validación de parámetros
- Se implementa paginación para listas grandes
- Los errores se manejan de forma consistente
- Se incluye logging para debugging
- Las respuestas incluyen información relevante del usuario
- Se utilizan índices GSI para optimizar las consultas de DynamoDB
- Las consultas usan `query` en lugar de `scan` para mejor rendimiento
- Las URLs de imágenes se firman automáticamente para acceso seguro
- Se incluye verificación de seguimiento en las APIs de conteo
