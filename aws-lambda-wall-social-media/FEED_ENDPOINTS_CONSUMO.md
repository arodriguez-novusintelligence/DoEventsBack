# Guía de consumo API Feed (v1)

Documento de referencia para frontend/QA con endpoints disponibles, cómo consumirlos y respuestas esperadas.

## 1) Entorno y base URL

- **Servicio**: `aws-lambda-wall-social-media`
- **Stage desplegado**: `dev`
- **Base URL dev**: `https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev`

> En otros stages: `https://<api-id>.execute-api.us-east-1.amazonaws.com/<stage>`

---

## 2) Convenciones generales

### Headers recomendados

- `Authorization: Bearer <token>`
- `Content-Type: application/json`
- `If-None-Match: <etag>` (solo para `GET /v1/feed/home` opcional)

> `GET /v1/feed/home` también puede consultarse sin `Authorization` ni `x-user-id`. En ese caso, `viewerState` vuelve en estado neutro (`liked=false`, `reposted=false`, `hidden=false`, `notInterested=false`) y no se aplican filtros personalizados del usuario.

### Formato de error

```json
{
  "error": {
    "code": "FEED_PUBLICATION_NOT_FOUND",
    "message": "La publicación no existe",
    "details": null
  }
}
```

### Estados HTTP más usados

- `200`: OK
- `201`: creado
- `304`: sin cambios (ETag)
- `400`: request inválido
- `401`: no autenticado
- `403`: sin permiso
- `404`: recurso no encontrado
- `500`: error interno

### Notas funcionales

- Paginación por cursor (`nextCursor`, `hasMore`) en timeline y comentarios.
- `viewerState` y `stats` vuelven actualizados para reconciliación frontend.
- `clientRequestId` debe enviarse en **todas las mutaciones críticas** para idempotencia explícita.
- Posts, reposts y comentarios soportan menciones de usuarios y eventos.
- Las menciones embebidas detectadas automáticamente desde `description`, `opinion` o `text` siguen aplicando solo para `@userId`.
- Para mencionar eventos debes enviar `mentions` explícito con `type: "event"` y `eventId`.
- El backend devuelve `mentions` enriquecido con `type`, `mentionType`, offsets (`start`, `end`) y `metadata` para deep-link/frontend tanto de usuarios como de eventos.

---

## 3) Endpoints v1 disponibles (feed)

1. `GET /v1/feed/home`
2. `POST /v1/feed/publications`
3. `GET /v1/feed/publications/{publicationId}`
4. `PUT /v1/feed/publications/{publicationId}`
5. `DELETE /v1/feed/publications/{publicationId}`
6. `POST /v1/feed/reposts`
7. `PUT /v1/feed/publications/{publicationId}/like`
8. `POST /v1/feed/publications/{publicationId}/share`
9. `PUT /v1/feed/publications/{publicationId}/hide`
10. `PUT /v1/feed/publications/{publicationId}/not-interested`
11. `POST /v1/feed/publications/{publicationId}/report`
12. `GET /v1/feed/publications/{publicationId}/comments`
13. `POST /v1/feed/publications/{publicationId}/comments`
14. `PUT /v1/feed/comments/{commentId}`
15. `DELETE /v1/feed/comments/{commentId}`
16. `PUT /v1/feed/comments/{commentId}/like`
17. `POST /v1/media/upload-url`
18. `GET /v1/feed/publications/{publicationId}/likes`
19. `GET /v1/feed/users/{userId}/likes`
20. `GET /v1/feed/users/{userId}/publications`
21. `GET /v1/feed/publications/{publicationId}/reposts`
22. `GET /v1/feed/search`

---

## 4) Definición por endpoint

## 4.1 Home feed

### `GET /v1/feed/home?cursor=<string>&limit=<int>&include=services,nearby`

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/home?limit=20&include=services,nearby" \
  -H "Authorization: Bearer <token>"
```

**Response 200 (esperado)**

```json
{
  "items": [
    {
      "id": "pub_123",
      "listItemType": "publication",
      "type": "post",
      "author": {
        "id": "usr_1",
        "name": "Camila Dias",
        "avatarUrl": "https://...",
        "isFollowing": false
      },
      "createdAt": "2026-03-09T14:20:00.000Z",
      "title": "Mi publicación",
      "description": "Texto",
      "media": [{ "url": "https://...", "kind": "image" }],
      "locationLabel": "Medellín",
      "dateLabel": "Mar 10 - 7:00 PM",
      "priceLabel": "$50.000",
      "mentions": [],
      "isRepost": false,
      "repostOf": null,
      "stats": { "likes": 10, "comments": 5, "reposts": 3, "shares": 2 },
      "viewerState": {
        "liked": false,
        "reposted": false,
        "canEdit": false,
        "canDelete": false
      }
    },
    {
      "id": "services_174...",
      "listItemType": "services-section",
      "title": "Servicios recomendados para tu evento",
      "services": [
        {
          "id": "svc_1",
          "name": "Daniel Arroyave",
          "role": "Cantante",
          "ratingLabel": "5.0",
          "username": "@darromel",
          "description": "...",
          "imageUrl": "https://..."
        }
      ]
    }
  ],
  "nearbyHighlights": [
    {
      "id": "evt_1",
      "title": "Evento",
      "schedule": "2026-03-10",
      "location": "Medellín",
      "imageUrl": "https://..."
    }
  ],
  "nextCursor": "eyJmZWVkU2NvcGUiOiJIT01FI1BVQkxJQyIsInNvcnRLZXkiOiI...",
  "hasMore": true,
  "serverTime": "2026-03-09T14:22:00.000Z"
}
```

**Response 304**
- Cuando se envía `If-None-Match` y no hay cambios.

---

## 4.2 Crear publicación

### `POST /v1/feed/publications`

**Qué espera la publicación**

- Requerido:
  - `type`: `post | event | service` (si no se envía, se usa `post`)
  - autenticación (`Authorization`) o `x-user-id`
- Opcional:
  - `title`
  - `description`
  - `mentions`
  - `visibility`: `PUBLIC | PRIVATE`
  - `locationLabel`
  - `dateLabel`
  - `priceLabel`
  - `clientRequestId`

**Regla de menciones**

- Si en `description` envías texto como `Hola @usr_2 y @usr_3`, el backend detecta automáticamente esas menciones.
- También puedes enviar `mentions` explícito para conservar offsets o metadata UI.
- Si quieres mencionar eventos, debes enviarlos explícitamente en `mentions` con `type: "event"` y `eventId`.
- Si envías `mentions` explícito, ese arreglo se toma como fuente de verdad y el backend no agrega menciones extra parseadas desde el texto.
- El backend consolida ambas fuentes y responde en `publication.mentions` con este shape:

```json
[
  {
    "type": "user",
    "mentionType": "user",
    "targetId": "usr_2",
    "userId": "usr_2",
    "eventId": null,
    "tag": "@usr_2",
    "start": 5,
    "end": 11,
    "name": "Camila Dias",
    "title": null,
    "username": "@camidias",
    "avatarUrl": "https://...",
    "role": "cliente",
    "description": "",
    "imageUrl": null,
    "locationLabel": "",
    "dateLabel": "",
    "slug": null,
    "metadata": {
      "userId": "usr_2",
      "name": "Camila Dias",
      "username": "@camidias",
      "avatarUrl": "https://...",
      "role": "cliente",
      "description": ""
    }
  },
  {
    "type": "event",
    "mentionType": "event",
    "targetId": "evt_9",
    "userId": null,
    "eventId": "evt_9",
    "tag": "@expo_clasicos",
    "start": 15,
    "end": 29,
    "name": "Exposición de carros clásicos",
    "title": "Exposición de carros clásicos",
    "username": null,
    "avatarUrl": null,
    "role": "event",
    "description": "Exhibición abierta al público",
    "imageUrl": "https://...",
    "locationLabel": "Bogotá, Cundinamarca",
    "dateLabel": "20260320 - 19:00",
    "slug": "exposicion-carros-clasicos",
    "metadata": {
      "eventId": "evt_9",
      "title": "Exposición de carros clásicos",
      "description": "Exhibición abierta al público",
      "imageUrl": "https://...",
      "locationLabel": "Bogotá, Cundinamarca",
      "dateLabel": "20260320 - 19:00",
      "slug": "exposicion-carros-clasicos"
    }
  }
]
```
- Media opcional:
  - `mediaIds`: arreglo de IDs previamente generados por `POST /v1/media/upload-url`
  - o imagen/video/media inline enviada desde frontend en cualquiera de estos campos:
    - `imageBase64`
    - `videoBase64`
    - `photoBase64`
    - `fotoBase64`
    - `imageBase64s`
    - `videoBase64s`
    - `photoBase64s`
    - `fotoBase64s`
    - `images`
    - `videos`
    - `photos`
    - `media`
    - `mediaItems`
    - `attachments`
    - `files`
    - `fileList`
    - `items`
    - `uploadResults`
    - `uploads`
    - `uploadedItems`
    - `image`
    - `video`
    - `imagen`
    - `photo`
    - `foto`

  **Wrappers soportados dentro de cada item de media**

  - `response`
  - `result`
  - `payload`
  - `data`
  - `file`
  - `originFileObj`
  - `asset`

  Además, cada item puede traer cualquiera de estas referencias:

  - `mediaId` / `feedMediaId`
  - `s3Key` / `key`
  - `publicUrl` / `url` / `accessUrl`
  - `base64` / `imageBase64` / `photoBase64`

**Regla de media**

- La imagen/video es opcional.
- Si el frontend no envía media, la publicación se crea normalmente.
- Si el frontend sí envía imagen/video/media y no se puede procesar, el backend responde `400 FEED_MEDIA_NOT_RESOLVED` para no guardar la publicación silenciosamente sin media.
- Se soporta media mixta: imágenes y videos en la misma publicación.
- Si el frontend envía varias imágenes/videos inline en base64 dentro del body, puede recibir `413 Payload Too Large` antes de llegar a la Lambda.
- Ese `413` viene del gateway por tamaño del request, no del handler del feed.
- Para varias imágenes/videos, el flujo soportado es: `POST /v1/media/upload-url` → subir archivos a S3 → enviar `mediaIds` o `items` en `createPublication`/`updatePublication`.

**Request**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "post",
    "title": "Título",
    "description": "Contenido con @usr_2 y @expo_clasicos",
    "mediaIds": ["med_1"],
    "mentions": [
      {
        "type": "user",
        "userId": "usr_2",
        "start": 14,
        "end": 20
      },
      {
        "type": "event",
        "eventId": "evt_9",
        "tag": "@expo_clasicos",
        "start": 23,
        "end": 38,
        "metadata": {
          "source": "mention-picker"
        }
      }
    ],
    "visibility": "PUBLIC",
    "clientRequestId": "mob-1711111111-abc"
  }'
```

**Ejemplo enviando imagen inline**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "post",
    "title": "Título con imagen",
    "description": "Contenido",
    "imageBase64": "<base64>",
    "visibility": "PUBLIC",
    "clientRequestId": "mob-1711111111-img"
  }'
```

**Ejemplo inline solo para pruebas o payloads pequeños**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "post",
    "title": "Título con varias imágenes",
    "description": "Contenido",
    "images": ["<base64-1>", "<base64-2>"],
    "visibility": "PUBLIC"
  }'
```

> Para varias imágenes reales desde frontend, se recomienda no enviar base64 inline. Usa `mediaIds`.

**Ejemplo recomendado para varias imágenes**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "post",
    "title": "Título con varias imágenes",
    "description": "Contenido",
    "mediaIds": ["med_1", "med_2"],
    "visibility": "PUBLIC"
  }'
```

**Ejemplo recomendado para media mixta (imágenes + videos)**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "post",
    "title": "Título con media mixta",
    "description": "Contenido con imágenes y videos",
    "mediaIds": ["med_img_1", "med_vid_1", "med_img_2"],
    "visibility": "PUBLIC"
  }'
```

**Response 201**

```json
{
  "publication": {
    "id": "pub_999",
    "listItemType": "publication",
    "type": "post",
    "mentions": [
      {
        "type": "user",
        "mentionType": "user",
        "targetId": "usr_2",
        "userId": "usr_2",
        "eventId": null,
        "tag": "@usr_2",
        "start": 14,
        "end": 20,
        "name": "Usuario",
        "title": null,
        "username": "@usr_2",
        "avatarUrl": null,
        "role": null,
        "description": "",
        "imageUrl": null,
        "locationLabel": "",
        "dateLabel": "",
        "slug": null,
        "metadata": {
          "userId": "usr_2",
          "name": "Usuario",
          "username": "@usr_2",
          "avatarUrl": null,
          "role": null,
          "description": ""
        }
      },
      {
        "type": "event",
        "mentionType": "event",
        "targetId": "evt_9",
        "userId": null,
        "eventId": "evt_9",
        "tag": "@expo_clasicos",
        "start": 23,
        "end": 38,
        "name": "Exposición de carros clásicos",
        "title": "Exposición de carros clásicos",
        "username": null,
        "avatarUrl": null,
        "role": "event",
        "description": "Exhibición abierta al público",
        "imageUrl": "https://...",
        "locationLabel": "Bogotá, Cundinamarca",
        "dateLabel": "20260320 - 19:00",
        "slug": "exposicion-carros-clasicos",
        "metadata": {
          "eventId": "evt_9",
          "title": "Exposición de carros clásicos",
          "description": "Exhibición abierta al público",
          "imageUrl": "https://...",
          "locationLabel": "Bogotá, Cundinamarca",
          "dateLabel": "20260320 - 19:00",
          "slug": "exposicion-carros-clasicos",
          "source": "mention-picker"
        }
      }
    ],
    "stats": { "likes": 0, "comments": 0, "reposts": 0, "shares": 0 },
    "viewerState": { "liked": false, "reposted": false, "canEdit": true, "canDelete": true }
  }
}
```

---

## 4.3 Obtener publicación

### `GET /v1/feed/publications/{publicationId}`

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "publication": {
    "id": "pub_999",
    "listItemType": "publication",
    "type": "post",
    "stats": { "likes": 0, "comments": 0, "reposts": 0, "shares": 0 },
    "viewerState": { "liked": false, "reposted": false, "canEdit": true, "canDelete": true }
  }
}
```

---

## 4.4 Actualizar publicación

### `PUT /v1/feed/publications/{publicationId}`

**Regla importante**

- Si vas a actualizar una publicación con varias imágenes, evita enviar base64 inline en el `PUT`.
- Si vas a actualizar una publicación con varias imágenes/videos, evita enviar base64 inline en el `PUT`.
- Si el body supera el límite del gateway, la petición falla con `413 Payload Too Large` antes de ejecutar la Lambda.
- Para múltiples imágenes/videos, usa `POST /v1/media/upload-url` y luego envía `mediaIds` o `items` ya resueltos.
- Si en el `PUT` envías nuevos `mediaIds`/`items`, el backend **agrega** esos archivos a la media existente por defecto.
- Si quieres quitar archivos puntuales, envía `removeMediaIds` con los `mediaId` actuales.
- Si quieres reemplazar toda la galería, envía `replaceMedia: true` y la colección final en `mediaIds` o `items`.
- Si quieres dejar la publicación sin media, envía `clearMedia: true`.
- El frontend debe evitar mandar el mismo archivo repetido en varias llaves (`mediaIds`, `items`, `media`, etc.). El backend deduplica por `mediaId`/`s3Key`, pero la responsabilidad del set final sigue siendo del frontend.
- Para actualizar menciones, vuelve a enviar `mentions` completo. El backend toma ese arreglo como fuente de verdad.
- En `PUT` también puedes mezclar menciones de usuarios y eventos con el mismo esquema explicado arriba.

**Request**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Título actualizado",
    "description": "Contenido actualizado con @usr_2 y @expo_clasicos",
    "mentions": [
      { "type": "user", "userId": "usr_2", "start": 25, "end": 31 },
      { "type": "event", "eventId": "evt_9", "tag": "@expo_clasicos", "start": 34, "end": 49 }
    ],
    "mediaIds": ["med_1","med_2"],
    "visibility": "PUBLIC"
  }'
```

**Response 200**

```json
{
  "publication": {
    "id": "pub_999",
    "title": "Título actualizado",
    "description": "Contenido actualizado con @usr_2 y @expo_clasicos",
    "mentions": [
      {
        "type": "user",
        "mentionType": "user",
        "targetId": "usr_2",
        "userId": "usr_2",
        "eventId": null,
        "tag": "@usr_2",
        "start": 25,
        "end": 31,
        "name": "Usuario",
        "title": null,
        "username": "@usr_2",
        "avatarUrl": null,
        "role": null,
        "description": "",
        "imageUrl": null,
        "locationLabel": "",
        "dateLabel": "",
        "slug": null,
        "metadata": {
          "userId": "usr_2",
          "name": "Usuario",
          "username": "@usr_2"
        }
      },
      {
        "type": "event",
        "mentionType": "event",
        "targetId": "evt_9",
        "userId": null,
        "eventId": "evt_9",
        "tag": "@expo_clasicos",
        "start": 34,
        "end": 49,
        "name": "Exposición de carros clásicos",
        "title": "Exposición de carros clásicos",
        "username": null,
        "avatarUrl": null,
        "role": "event",
        "description": "Exhibición abierta al público",
        "imageUrl": "https://...",
        "locationLabel": "Bogotá, Cundinamarca",
        "dateLabel": "20260320 - 19:00",
        "slug": "exposicion-carros-clasicos",
        "metadata": {
          "eventId": "evt_9",
          "title": "Exposición de carros clásicos"
        }
      }
    ]
  }
}
```

**Ejemplo recomendado para update con varias imágenes**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Título actualizado",
    "description": "Contenido actualizado",
    "items": [
      { "mediaId": "med_1", "publicUrl": "https://...", "accessUrl": "https://..." },
      { "mediaId": "med_2", "publicUrl": "https://...", "accessUrl": "https://..." }
    ],
    "visibility": "PUBLIC"
  }'
```

**Ejemplo para agregar nuevos archivos sin perder los existentes**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Título actualizado",
    "mediaIds": ["med_nuevo_1", "med_nuevo_2"]
  }'
```

**Ejemplo para eliminar media puntual**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "removeMediaIds": ["med_actual_1"]
  }'
```

**Ejemplo para reemplazar toda la galería**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "replaceMedia": true,
    "mediaIds": ["med_final_1", "med_final_2"]
  }'
```

**Ejemplo para limpiar toda la media**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "clearMedia": true
  }'
```

---

## 4.5 Eliminar publicación

### `DELETE /v1/feed/publications/{publicationId}`

**Ejemplo**

```bash
curl -X DELETE "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_999" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "publicationId": "pub_999",
  "deleted": true
}
```

---

## 4.6 Crear repost

### `POST /v1/feed/reposts`

- `opinion` soporta menciones de usuarios y eventos.
- Las menciones de usuario se pueden detectar automáticamente desde `@userId`; las de evento deben enviarse explícitamente en `mentions`.
- La respuesta del `repostPublication` incluye `mentions` con el mismo shape de una publicación normal.

**Request**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/reposts" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourcePublicationId": "pub_123",
    "title": "Mi primer evento: Exposición de carros clásicos",
    "opinion": "Estoy organizando una exposición con @usr_9 y @expo_clasicos",
    "mentions": [
      { "type": "user", "userId": "usr_9", "start": 39, "end": 45 },
      { "type": "event", "eventId": "evt_9", "tag": "@expo_clasicos", "start": 48, "end": 63 }
    ],
    "visibility": "PUBLIC",
    "mediaIds": [],
    "clientRequestId": "mob-1711111111-rp"
  }'
```

**Response 201**

```json
{
  "repostPublication": {
    "id": "pub_999",
    "listItemType": "publication",
    "type": "post",
    "mentions": [
      {
        "type": "user",
        "mentionType": "user",
        "targetId": "usr_9",
        "userId": "usr_9",
        "eventId": null,
        "tag": "@usr_9",
        "start": 39,
        "end": 45,
        "name": "Usuario",
        "title": null,
        "username": "@usr_9",
        "avatarUrl": null,
        "role": null,
        "description": "",
        "imageUrl": null,
        "locationLabel": "",
        "dateLabel": "",
        "slug": null,
        "metadata": {
          "userId": "usr_9",
          "username": "@usr_9"
        }
      },
      {
        "type": "event",
        "mentionType": "event",
        "targetId": "evt_9",
        "userId": null,
        "eventId": "evt_9",
        "tag": "@expo_clasicos",
        "start": 48,
        "end": 63,
        "name": "Exposición de carros clásicos",
        "title": "Exposición de carros clásicos",
        "username": null,
        "avatarUrl": null,
        "role": "event",
        "description": "Exhibición abierta al público",
        "imageUrl": "https://...",
        "locationLabel": "Bogotá, Cundinamarca",
        "dateLabel": "20260320 - 19:00",
        "slug": "exposicion-carros-clasicos",
        "metadata": {
          "eventId": "evt_9",
          "title": "Exposición de carros clásicos"
        }
      }
    ],
    "isRepost": true,
    "repostOf": { "publicationId": "pub_123" },
    "stats": { "likes": 0, "comments": 0, "reposts": 0, "shares": 0 },
    "viewerState": { "liked": false, "reposted": true }
  },
  "sourcePublication": {
    "id": "pub_123",
    "listItemType": "publication",
    "type": "post",
    "author": {
      "id": "usr_2",
      "name": "Sebastian",
      "avatarUrl": "https://...",
      "isFollowing": false
    },
    "createdAt": "2026-03-09T20:52:39.369Z",
    "title": "Que sitio tan genial",
    "description": "Los eventos son muy divertidos",
    "media": [],
    "locationLabel": "",
    "dateLabel": "",
    "priceLabel": "",
    "mentions": [],
    "isRepost": false,
    "repostOf": null,
    "stats": { "likes": 0, "comments": 0, "reposts": 18, "shares": 0 },
    "viewerState": {
      "liked": false,
      "reposted": true,
      "canEdit": false,
      "canDelete": false
    }
  }
}
```

---

## 4.7 Like/unlike publicación

### `PUT /v1/feed/publications/{publicationId}/like`

**Request**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/like" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "liked": true, "clientRequestId": "mob-1711111111-like-pub" }'
```

**Response 200**

```json
{
  "publicationId": "pub_123",
  "viewerState": { "liked": true },
  "stats": { "likes": 120 }
}
```

---

## 4.8 Share publicación (tracking)

### `POST /v1/feed/publications/{publicationId}/share`

**Request**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/share" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "native",
    "clientRequestId": "mob-1711111111-sh"
  }'
```

**Response 200**

```json
{
  "publicationId": "pub_123",
  "stats": { "shares": 33 },
  "shareUrl": "https://doevents.app/p/pub_123"
}
```

---

## 4.9 Listar comentarios

### `PUT /v1/feed/publications/{publicationId}/hide`

Oculta el item del feed para el usuario actual.

- Soporta `publicationId` de publicaciones y también ids de eventos materializados en feed.
- El item oculto deja de salir en `GET /v1/feed/home` para ese usuario.
- Es un estado **propio del usuario que está viendo el feed**. No oculta la publicación para otros usuarios.

**Request**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/hide" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "hidden": true, "clientRequestId": "mob-hide-1" }'
```

**Deshacer ocultar**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/hide" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "hidden": false }'
```

**Response 200**

```json
{
  "publicationId": "pub_123",
  "targetType": "publication",
  "viewerState": {
    "hidden": true
  }
}
```

---

## 4.10 Marcar como no me interesa

### `PUT /v1/feed/publications/{publicationId}/not-interested`

Marca el item del feed como no interesante para el usuario actual.

- Soporta `publicationId` de publicaciones y también ids de eventos materializados en feed.
- El item marcado deja de salir en `GET /v1/feed/home` para ese usuario.
- Es un estado **propio del usuario que está viendo el feed**. No afecta el feed de otros usuarios.

**Request**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/not-interested" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "notInterested": true, "clientRequestId": "mob-ni-1" }'
```

**Deshacer no me interesa**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/not-interested" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "notInterested": false }'
```

**Response 200**

```json
{
  "publicationId": "pub_123",
  "targetType": "publication",
  "viewerState": {
    "notInterested": true
  }
}
```

---

## 4.11 Reportar publicación

### `POST /v1/feed/publications/{publicationId}/report`

Este reporte aplica solo a publicaciones.

**Request**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/report" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "spam",
    "details": "Contenido repetitivo",
    "clientRequestId": "mob-report-1"
  }'
```

**Response 201**

```json
{
  "reportId": "rep_123",
  "publicationId": "pub_123",
  "reported": true
}
```

---

## 4.12 Listar comentarios

### `GET /v1/feed/publications/{publicationId}/comments?cursor=<string>&limit=<int>&parentCommentId=<id|null>`

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/comments?limit=20" \
  -H "Authorization: Bearer <token>"
```

**Formas de listar respuestas/comentarios**

- Sin `parentCommentId`: devuelve comentarios raíz y respuestas mezclados (cada item trae `parentCommentId`).
- `parentCommentId=null`: devuelve solo comentarios raíz.
- `parentCommentId=<commentId>`: devuelve solo respuestas de ese comentario padre.

**Ejemplos**

```bash
# Solo raíces
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/comments?limit=20&parentCommentId=null" \
  -H "Authorization: Bearer <token>"

# Solo respuestas del comentario com_1
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/comments?limit=20&parentCommentId=com_1" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "items": [
    {
      "id": "com_1",
      "publicationId": "pub_123",
      "parentCommentId": null,
      "user": {
        "id": "usr_2",
        "name": "Daniela",
        "avatarUrl": "https://..."
      },
      "text": "Gran post",
      "mentions": [],
      "createdAt": "2026-03-09T14:21:00.000Z",
      "stats": { "likes": 2, "replies": 1 },
      "viewerState": { "liked": false }
    }
  ],
  "nextCursor": "eyJpZCI6ImNvbV8xIn0=",
  "hasMore": true,
  "total": 42
}
```

---

## 4.13 Crear comentario/respuesta

### `POST /v1/feed/publications/{publicationId}/comments`

- `text` soporta menciones de usuarios y eventos.
- Las menciones de usuario se pueden detectar automáticamente desde `@userId`; las de evento deben enviarse explícitamente en `mentions`.
- La respuesta devuelve `comment.mentions` con offsets y `metadata` para renderizar taps/deep-links.

**Request**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/comments" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Comentario para @usr_2 y @expo_clasicos",
    "mentions": [
      { "type": "user", "userId": "usr_2", "start": 16, "end": 22 },
      { "type": "event", "eventId": "evt_9", "tag": "@expo_clasicos", "start": 25, "end": 40 }
    ],
    "parentCommentId": null,
    "clientRequestId": "mob-1711111111-cm"
  }'
```

**Response 201**

```json
{
  "comment": {
    "id": "com_999",
    "publicationId": "pub_123",
    "parentCommentId": null,
    "mentions": [
      {
        "type": "user",
        "mentionType": "user",
        "targetId": "usr_2",
        "userId": "usr_2",
        "eventId": null,
        "tag": "@usr_2",
        "start": 16,
        "end": 22,
        "name": "Usuario",
        "title": null,
        "username": "@usr_2",
        "avatarUrl": null,
        "role": null,
        "description": "",
        "imageUrl": null,
        "locationLabel": "",
        "dateLabel": "",
        "slug": null,
        "metadata": {
          "userId": "usr_2",
          "username": "@usr_2"
        }
      },
      {
        "type": "event",
        "mentionType": "event",
        "targetId": "evt_9",
        "userId": null,
        "eventId": "evt_9",
        "tag": "@expo_clasicos",
        "start": 25,
        "end": 40,
        "name": "Exposición de carros clásicos",
        "title": "Exposición de carros clásicos",
        "username": null,
        "avatarUrl": null,
        "role": "event",
        "description": "Exhibición abierta al público",
        "imageUrl": "https://...",
        "locationLabel": "Bogotá, Cundinamarca",
        "dateLabel": "20260320 - 19:00",
        "slug": "exposicion-carros-clasicos",
        "metadata": {
          "eventId": "evt_9",
          "title": "Exposición de carros clásicos"
        }
      }
    ]
  },
  "publicationStats": {
    "comments": 43
  }
}
```

---

## 4.14 Editar comentario

### `PUT /v1/feed/comments/{commentId}`

**Request**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/comments/com_999" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Comentario editado para @usr_2 y @expo_clasicos",
    "mentions": [
      { "type": "user", "userId": "usr_2", "start": 24, "end": 30 },
      { "type": "event", "eventId": "evt_9", "tag": "@expo_clasicos", "start": 33, "end": 48 }
    ]
  }'
```

**Response 200**

```json
{
  "commentId": "com_999",
  "text": "Comentario editado para @usr_2 y @expo_clasicos",
  "mentions": [
    {
      "type": "user",
      "mentionType": "user",
      "targetId": "usr_2",
      "userId": "usr_2",
      "eventId": null,
      "tag": "@usr_2",
      "start": 24,
      "end": 30,
      "name": "Usuario",
      "title": null,
      "username": "@usr_2",
      "avatarUrl": null,
      "role": null,
      "description": "",
      "imageUrl": null,
      "locationLabel": "",
      "dateLabel": "",
      "slug": null,
      "metadata": {
        "userId": "usr_2",
        "username": "@usr_2"
      }
    },
    {
      "type": "event",
      "mentionType": "event",
      "targetId": "evt_9",
      "userId": null,
      "eventId": "evt_9",
      "tag": "@expo_clasicos",
      "start": 33,
      "end": 48,
      "name": "Exposición de carros clásicos",
      "title": "Exposición de carros clásicos",
      "username": null,
      "avatarUrl": null,
      "role": "event",
      "description": "Exhibición abierta al público",
      "imageUrl": "https://...",
      "locationLabel": "Bogotá, Cundinamarca",
      "dateLabel": "20260320 - 19:00",
      "slug": "exposicion-carros-clasicos",
      "metadata": {
        "eventId": "evt_9",
        "title": "Exposición de carros clásicos"
      }
    }
  ],
  "updated": true
}
```

---

## 4.15 Eliminar comentario

### `DELETE /v1/feed/comments/{commentId}`

**Ejemplo**

```bash
curl -X DELETE "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/comments/com_999" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "commentId": "com_999",
  "deleted": true,
  "deletedCommentIds": ["com_999", "com_reply_1"],
  "deletedRepliesCount": 1,
  "publicationStats": {
    "comments": 12
  }
}
```

Si `commentId` es un comentario padre, `deletedCommentIds` incluirá también sus respuestas directas.

---

## 4.16 Like/unlike comentario

### `PUT /v1/feed/comments/{commentId}/like`

**Request**

```bash
curl -X PUT "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/comments/com_1/like" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "liked": true, "clientRequestId": "mob-1711111111-like-com" }'
```

**Response 200**

```json
{
  "commentId": "com_1",
  "viewerState": { "liked": true },
  "stats": { "likes": 9 }
}
```

---

## 4.17 Obtener upload-url de media

### `POST /v1/media/upload-url`

Este endpoint soporta tanto imágenes como videos.

**Request**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/media/upload-url" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "contentType": "image/jpeg" }'
```

**Response 200**

```json
{
  "mediaId": "med_1",
  "uploadUrl": "https://s3-presigned-url",
  "publicUrl": "https://doevent-feed-media.s3.amazonaws.com/feed/usr_xxx/med_xxx.jpeg"
}
```

**Request múltiple**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/media/upload-url" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "contentType": "image/jpeg", "fileName": "foto-1.jpg" },
      { "contentType": "image/png", "fileName": "foto-2.png" }
    ]
  }'
```

**Response 200 múltiple**

```json
{
  "items": [
    {
      "mediaId": "med_1",
      "uploadUrl": "https://s3-presigned-url-1",
      "accessUrl": "https://s3-signed-read-1",
      "publicUrl": "https://.../med_1.jpg",
      "contentType": "image/jpeg",
      "fileName": "foto-1.jpg"
    },
    {
      "mediaId": "med_2",
      "uploadUrl": "https://s3-presigned-url-2",
      "accessUrl": "https://s3-signed-read-2",
      "publicUrl": "https://.../med_2.png",
      "contentType": "image/png",
      "fileName": "foto-2.png"
    }
  ],
  "count": 2
}
```

**Request múltiple mixto (imagen + video)**

```bash
curl -X POST "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/media/upload-url" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "contentType": "image/jpeg", "fileName": "foto-1.jpg" },
      { "contentType": "video/mp4", "fileName": "video-1.mp4" }
    ]
  }'
```

---

## 5) Flujo recomendado de consumo frontend

1. Solicitar media con `POST /v1/media/upload-url`.
2. Si son varios archivos, enviar `items[]` en una sola llamada o hacer una llamada por archivo.
3. Subir cada archivo al `uploadUrl` correspondiente (HTTP `PUT` con el `Content-Type` indicado).
4. Crear publicación/repost enviando `mediaIds`.
5. Si el usuario oculta o marca como no interesante un item, este deja de salir en `GET /v1/feed/home` para ese usuario.
6. Alternativamente, también puedes enviar los objetos de respuesta en `media`, `files`, `fileList`, `items` o `uploadResults`; el backend ahora resuelve wrappers como `response`, `payload` y `data`.
7. Pintar timeline con `GET /v1/feed/home` y paginar con `nextCursor`.
8. Aplicar interacciones (`like`, `share`, `hide`, `not-interested`, `comments`) usando los endpoints del feed.

### Nota sobre `413 Payload Too Large`

- Si envías varias imágenes como base64 en `POST /v1/feed/publications` o `PUT /v1/feed/publications/{publicationId}`, el request puede superar el límite del gateway.
- En ese caso, la petición falla con `413` antes de ejecutar la Lambda.
- Para evitarlo:
  1. pide un `uploadUrl` por archivo,
  2. sube archivos directo a S3,
  3. envía solo `mediaIds` o `items` resueltos en create/update.

---

## 4.18 Listar personas que dieron like

### `GET /v1/feed/publications/{publicationId}/likes?cursor=<string>&limit=<int>`

- Soporta ids de publicaciones, eventos y servicios.
- Devuelve las personas que dieron like al item.

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/likes?limit=20" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "publicationId": "pub_123",
  "targetType": "publication",
  "items": [
    {
      "id": "usr_1",
      "name": "Camila Dias",
      "avatarUrl": "https://...",
      "username": "@camila",
      "role": "Cantante",
      "description": "...",
      "likedAt": "2026-03-12T12:00:00.000Z"
    }
  ],
  "total": 1,
  "hasMore": false,
  "nextCursor": null
}
```

---

## 4.19 Listar items a los que un usuario dio like

### `GET /v1/feed/users/{userId}/likes?cursor=<string>&limit=<int>`

- Devuelve publicaciones, eventos y servicios que el usuario ha marcado con like.

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/users/usr_1/likes?limit=20" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "userId": "usr_1",
  "items": [
    {
      "id": "pub_123",
      "type": "post",
      "viewerState": {
        "liked": true
      },
      "likedAt": "2026-03-12T12:00:00.000Z"
    }
  ],
  "total": 1,
  "hasMore": false,
  "nextCursor": null
}
```

## 4.20 Listar publicaciones de un usuario

### `GET /v1/feed/users/{userId}/publications?cursor=<string>&limit=<int>`

- Si el `viewerId` coincide con `{userId}`, devuelve también publicaciones privadas del usuario.
- Si consulta otro usuario, solo devuelve publicaciones públicas no eliminadas.

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/users/usr_1/publications?limit=20" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "userId": "usr_1",
  "items": [
    {
      "id": "pub_123",
      "type": "post",
      "title": "Mi publicación"
    }
  ],
  "total": 1,
  "hasMore": false,
  "nextCursor": null
}
```

---

## 4.21 Listar usuarios que hicieron repost

### `GET /v1/feed/publications/{publicationId}/reposts?cursor=<string>&limit=<int>`

**Ejemplo**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/publications/pub_123/reposts?limit=20" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "publicationId": "pub_123",
  "items": [
    {
      "id": "usr_2",
      "name": "Sebastian",
      "avatarUrl": "https://...",
      "username": "@sebastian",
      "repostedAt": "2026-03-12T12:10:00.000Z"
    }
  ],
  "total": 1,
  "hasMore": false,
  "nextCursor": null
}
```

---

## 4.22 Buscar publicaciones del feed

### `GET /v1/feed/search?q=<texto>&cursor=<string>&limit=<int>`

- Busca publicaciones públicas del feed por palabras clave.
- Si el término empieza con `@`, busca por usuario/autor.
- También busca por ubicación (`locationLabel`).

**Ejemplos**

```bash
curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/search?q=bogota&limit=20" \
  -H "Authorization: Bearer <token>"

curl -X GET "https://x98wiwlt71.execute-api.us-east-1.amazonaws.com/dev/v1/feed/search?q=@camila&limit=20" \
  -H "Authorization: Bearer <token>"
```

**Response 200**

```json
{
  "items": [
    {
      "id": "pub_123",
      "type": "post",
      "title": "Mi publicación"
    }
  ],
  "total": 1,
  "searchTerm": "bogota",
  "mode": "keyword",
  "hasMore": false,
  "nextCursor": null
}
```

---

## 6) Observaciones prácticas

- `visibility` válida: `PUBLIC | PRIVATE`.
- Repost soporta `title` y `opinion` opcionales.
- Comentarios soportan profundidad máxima de 1 nivel (`parentCommentId`).
- `hide` y `not-interested` filtran el item en el home feed del usuario actual.
- `hide`, `not-interested` y `block` son estados/relaciones por usuario visor; no cambian globalmente la publicación para todos.
- `report` del feed aplica solo a publicaciones.
- Si eliminas un comentario padre, el backend elimina también sus respuestas directas y limpia sus likes asociados.
- Para idempotencia, enviar `clientRequestId` único por acción móvil.
- Si el token no contiene `sub/userId`, el backend acepta `viewerId` en query/body como fallback (recomendado usar token válido en producción).

---

## 7) Flujos adicionales solicitados por frontend

## 7.1 Botón Seguir (card de usuario/servicio)

Estos endpoints viven en el mismo servicio social actual (legacy):

- `POST /client/follow`
- `POST /client/unfollow`

**Body requerido**

```json
{
  "userId": "usr_actor",
  "follow_userId": "usr_target"
}
```

**Respuestas típicas `POST /client/follow`**

- `200`: perfil público (`status: accepted`) o privado (`status: pending`)
- `400`: parámetros faltantes / no puedes seguirte a ti mismo
- `403`: bloqueado
- `404`: usuario no encontrado
- `409`: ya sigues al usuario

**Respuesta típica `POST /client/unfollow`**

```json
{
  "message": "Has dejado de seguir al usuario exitosamente"
}
```

## 7.2 Detalle de servicio al tocar card de `services-section`

Actualmente se consume desde microservicio de usuarios:

- Servicio: `aws-lambda-manageusers`
- Endpoint: `GET /getUser/{id}`

**Contrato actual**
- Devuelve el item completo del usuario en tabla `Client` (incluye campos de perfil/rol/descripcion según disponibilidad).
- Si existe `fotoPerfilUrl`, puede retornar `fotoPerfilSignedUrl`.

**Ejemplo**

```bash
curl -X GET "<BASE_URL_MANAGEUSERS>/getUser/usr_123"
```

---

## 8) Idempotencia explícita (matriz)

Enviar `clientRequestId` único por intento de acción en móvil.

- `POST /v1/feed/publications` → soportada
- `POST /v1/feed/reposts` → soportada
- `POST /v1/feed/publications/{publicationId}/share` → soportada
- `POST /v1/feed/publications/{publicationId}/comments` → soportada
- `PUT /v1/feed/publications/{publicationId}/like` → soportada
- `PUT /v1/feed/publications/{publicationId}/hide` → soportada
- `PUT /v1/feed/publications/{publicationId}/not-interested` → soportada
- `POST /v1/feed/publications/{publicationId}/report` → soportada (solo publicaciones)
- `PUT /v1/feed/comments/{commentId}/like` → soportada

Si se repite mismo `clientRequestId` para la misma operación, el backend retorna el mismo resultado persistido.

---

## 9) Flujo completo de media upload

### 9.1 Endpoint
- `POST /v1/media/upload-url`

### 9.2 Reglas vigentes
- TTL presigned URL: **900 segundos** (15 min).
- MIME permitidos: `image/*` y `video/*`.
- Tamaño máximo: **no validado explícitamente en backend** (se recomienda controlar en app y/o política de bucket).
- Endpoint de finalize/confirm: **no existe actualmente** (estado inicial guardado como `PENDING_UPLOAD`).

### 9.3 Flujo
1. Solicitar `mediaId` + `uploadUrl` + `publicUrl`.
2. Hacer `PUT` directo a `uploadUrl` con el `Content-Type` correcto.
3. Usar `mediaId` en `createPublication`/`createRepost`/`updatePublication`.

---

## 10) Contrato estricto de cursor

### Timeline (`GET /v1/feed/home`)
- Orden: descendente por `sortKey`.
- `sortKey` interno: `createdAt#id` (desempate estable por `id`).
- `cursor`: token opaco base64 de `LastEvaluatedKey` de DynamoDB.

### Comentarios (`GET /v1/feed/publications/{publicationId}/comments`)
- Orden: descendente por `sortKey`.
- `sortKey` interno: `createdAt#seq`.

### Errores y validez
- Cursor inválido → `400 FEED_INVALID_CURSOR`.
- Expiración de cursor: no hay TTL explícito; puede perder validez si cambia estructura/estado de datos.

### Dedupe entre páginas
- Recomendado deduplicar en frontend por `id` al concatenar páginas.

---

## 11) Consistencia de contadores en repost

Al crear repost (`POST /v1/feed/reposts`):

- Se crea una nueva publicación con `isRepost=true`.
- El contador `repostsCount` de la publicación origen se incrementa con operación atómica de DynamoDB (`if_not_exists + :inc`).
- La respuesta incluye `sourcePublication` completa (mismo shape de publicación del feed), con `stats.reposts` actualizado y `viewerState.reposted=true`.

---

## 12) Catálogo de errores por endpoint y límites

### Errores frecuentes

- Timeline: `FEED_UNAUTHORIZED`, `FEED_INVALID_CURSOR`, `FEED_INTERNAL_ERROR`
- Publicaciones: `FEED_BAD_REQUEST`, `FEED_INVALID_VISIBILITY`, `FEED_PUBLICATION_NOT_FOUND`, `FEED_FORBIDDEN`
- Comentarios: `FEED_BAD_REQUEST`, `FEED_COMMENT_NOT_FOUND`, `FEED_COMMENT_DEPTH_NOT_ALLOWED`, `FEED_FORBIDDEN`
- Media: `FEED_INVALID_CONTENT_TYPE`, `FEED_UNAUTHORIZED`

### Rate limits

- No hay límites de negocio explícitos (ej. comments/min, reposts/min) implementados en este servicio.
- Se recomienda definir `Usage Plans`/WAF y límites de aplicación por endpoint en siguiente iteración.

---

## 13) Notificaciones de acciones feed

Estado actual:

- Este servicio de feed **sí dispara** notificaciones vía el microservicio `notifications`.
- Casos actuales:
  - nueva publicación pública → seguidores del autor;
  - like → dueño de la publicación/evento/servicio;
  - comentario → dueño del target;
  - respuesta → dueño del comentario padre;
  - repost → dueño de la publicación origen;
  - mención en publicación/repost/comentario → usuario mencionado.
- Las menciones de evento no disparan notificación; se almacenan y retornan para navegación/rendering.
- Las notificaciones por mención incluyen `publicationId` y, cuando aplica, `commentId` para navegación directa.

Recomendación de integración:

- Publicar evento asíncrono (SNS/SQS/EventBridge) al mutar feed (`like/comment/repost`) y procesarlo en `notifications`.
- Evitar acoplar notificación síncrona en la transacción principal del feed para mantener latencia baja.

---

## 14) Moderación y bloqueos

### Reportes (legacy social)

- `POST /report` (servicio social legacy)
  - Body esperado: `report_id`, `post_id`, `client_id`, `reason`.

### Soft delete

- Publicación: soft delete implementado (`deletedAt`).
- Comentario: delete físico actual (no soft delete).

### Bloqueo de usuario

- Endpoints legacy disponibles: `POST /client/block`, `POST /client/follower/block`, `POST /client/follower/unblock`.

> Si frontend requiere moderación full v1 (report publication/comment en `/v1/feed/*`), se recomienda agregar endpoints dedicados de moderación en siguiente sprint.
