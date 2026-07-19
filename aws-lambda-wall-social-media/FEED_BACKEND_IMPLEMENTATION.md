# Feed Backend Implementado (v1)

Este documento resume la implementación backend del feed social en `aws-lambda-wall-social-media`, incluyendo CRUD, timeline mixto y media pública en S3.

## Endpoints implementados

### Timeline
- `GET /v1/feed/home?cursor=<string>&limit=<int>&include=services,nearby`
  - Responde `items` mixtos (`publication` + `services-section`), `nearbyHighlights`, `nextCursor`, `hasMore`, `serverTime`.
  - Incluye `ETag` y soporta `If-None-Match`.

### Publicaciones
- `POST /v1/feed/publications`
- `GET /v1/feed/publications/{publicationId}`
- `PUT /v1/feed/publications/{publicationId}`
- `DELETE /v1/feed/publications/{publicationId}`
- `POST /v1/feed/reposts`
- `PUT /v1/feed/publications/{publicationId}/like`
- `POST /v1/feed/publications/{publicationId}/share`

### Comentarios
- `GET /v1/feed/publications/{publicationId}/comments?cursor=<string>&limit=<int>`
- `POST /v1/feed/publications/{publicationId}/comments`
- `PUT /v1/feed/comments/{commentId}`
- `DELETE /v1/feed/comments/{commentId}`
- `PUT /v1/feed/comments/{commentId}/like`

### Media
- `POST /v1/media/upload-url`
  - Genera `mediaId`, `uploadUrl` (presigned PUT), `publicUrl`.

---

## Reglas de negocio cubiertas

- `visibility`: `PUBLIC | PRIVATE`.
- Repost crea nueva publicación (`isRepost=true`) y aumenta `reposts` del origen.
- `viewerState` actualizado en respuestas de timeline/detalle.
- Comentarios con jerarquía de 1 nivel (`parentCommentId`), y respuestas incrementan `replies` del padre.
- Idempotencia soportada en mutaciones críticas mediante `clientRequestId` (`FeedIdempotency`).
- Publicaciones soportan **una o múltiples imágenes/videos** vía `mediaIds`, y se pueden actualizar con `PUT`.
<<<<<<< HEAD
we- Base64 inline sigue soportado para casos pequeños, pero para varias imágenes el flujo recomendado es `upload-url` + `mediaIds` para evitar `413 Payload Too Large` en el gateway.
=======
- Base64 inline sigue soportado para casos pequeños, pero para varias imágenes el flujo recomendado es `upload-url` + `mediaIds` para evitar `413 Payload Too Large` en el gateway.
>>>>>>> apple-callback-checkouts-refactor-gateway

---

## Tablas DynamoDB creadas

Definidas en `serverless.yml` bajo `resources`:

1. `FeedPublications`
   - PK: `id`
   - GSI: `visibility-sortKey-index`

2. `FeedTimeline` (**tabla de relación y ordenamiento global**)
   - PK: `id` (`<sourceType>_<sourceId>`)
   - GSI: `feedScope-sortKey-index`
   - Mezcla y ordena por creación (`sortKey = createdAt#id`) eventos, publicaciones y servicios.

3. `FeedPublicationLikes`
   - PK: `publicationId`, SK: `userId`

4. `FeedPublicationReposts`
   - PK: `publicationId`, SK: `userId`

5. `FeedComments`
   - PK: `id`
   - GSI: `publicationId-sortKey-index`

6. `FeedCommentLikes`
   - PK: `commentId`, SK: `userId`

7. `FeedShares`
   - PK: `id`

8. `FeedMedia`
   - PK: `id`

9. `FeedIdempotency`
   - PK: `id`
   - TTL: `expiresAt`

---

## Bucket S3 (media pública)

- Variable: `FEED_MEDIA_BUCKET` (default `doevent-feed-media`)
- `upload-url` genera PUT firmado y URL pública final:
  - `https://<bucket>.s3.amazonaws.com/feed/<userId>/<mediaId>.<ext>`
- Permisos agregados en IAM de la lambda para `s3:PutObject` y `s3:GetObject` sobre `doevent-feed-media/*`.

> Nota: la visibilidad pública final depende de política pública del bucket (bucket policy) o mecanismo CDN.

---

## Archivos principales agregados

- `src/feedCommon.js`
- `src/feedHandlers.js`
- `serverless.yml` (rutas, permisos, tablas)

