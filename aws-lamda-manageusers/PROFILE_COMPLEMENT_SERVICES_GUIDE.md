# Servicios complementarios de perfil (Manage Users)

Este documento describe los nuevos servicios para:

1. Galeria de imagenes de perfil (distintas de la foto de perfil principal).
2. Imagen de portada del perfil.
3. Favoritos de perfiles.
4. Enriquecimiento de consulta de perfil con portada y conteo de favoritos recibidos.

Todos los servicios usan la tabla Client y FavoriteUsers, y para imagenes usan cargue directo a S3 mediante URL firmada de tipo PUT, devolviendo tambien la URL publica final.

Nota: en entornos donde el bucket no tiene lectura publica, tambien se devuelve signedUrl para lectura segura desde frontend.

## Base URL

Usar la base de aws-lambda-manageusers en el stage correspondiente.

## Flujo recomendado para imagenes (S3 directo)

1. Solicitar URL(s) firmada(s) al backend.
2. Subir archivo directamente a S3 con HTTP PUT al uploadUrl.
3. Confirmar o actualizar metadata en Client con el endpoint de upsert.

## 1) Galeria de imagenes del perfil

### 1.1 Generar URL(s) de carga para galeria

Metodo: POST
Ruta: /users/{userId}/profile-images/upload-urls

Body ejemplo:

```json
{
  "expiresInSeconds": 900,
  "files": [
    {
      "imageId": "opcional",
      "fileName": "foto1.jpg",
      "contentType": "image/jpeg"
    },
    {
      "fileName": "foto2.png",
      "contentType": "image/png"
    }
  ]
}
```

Respuesta:

```json
{
  "userId": "u123",
  "expiresInSeconds": 900,
  "files": [
    {
      "imageId": "uuid",
      "key": "profiles/u123/gallery/uuid.jpg",
      "uploadUrl": "https://...signed...",
      "publicUrl": "https://doeventprofileimagesbucket.s3.amazonaws.com/profiles/u123/gallery/uuid.jpg",
      "signedUrl": "https://...signed-get...",
      "method": "PUT",
      "contentType": "image/jpeg"
    }
  ]
}
```

### 1.2 Crear/actualizar una o varias imagenes de galeria en perfil

Metodo: PUT
Ruta: /users/{userId}/profile-images

Body ejemplo:

```json
{
  "images": [
    {
      "imageId": "uuid-1",
      "key": "profiles/u123/gallery/uuid-1.jpg",
      "caption": "Concierto"
    },
    {
      "imageId": "uuid-2",
      "publicUrl": "https://doeventprofileimagesbucket.s3.amazonaws.com/profiles/u123/gallery/uuid-2.png",
      "caption": "Backstage"
    }
  ]
}
```

Notas:

- Si imageId existe en profileGallery, se actualiza.
- Si no existe, se agrega.
- Puede enviarse key o publicUrl/url.

### 1.3 Listar todas las imagenes de galeria del perfil

Metodo: GET
Ruta: /users/{userId}/profile-images

Respuesta:

```json
{
  "userId": "u123",
  "count": 2,
  "profileGallery": [
    {
      "imageId": "uuid-1",
      "key": "profiles/u123/gallery/uuid-1.jpg",
      "url": "https://doeventprofileimagesbucket.s3.amazonaws.com/profiles/u123/gallery/uuid-1.jpg",
          "signedUrl": "https://...signed-get...",
      "caption": "Concierto",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### 1.4 Eliminar imagen de galeria

Metodo: DELETE
Ruta: /users/{userId}/profile-images/{imageId}

Acciones:

- Elimina el registro de profileGallery en Client.
- Elimina el objeto correspondiente en S3 cuando exista key.

## 2) Imagen de portada del perfil

### 2.1 Generar URL de carga para portada

Metodo: POST
Ruta: /users/{userId}/cover/upload-url

Body ejemplo:

```json
{
  "fileName": "cover.jpg",
  "contentType": "image/jpeg",
  "expiresInSeconds": 900
}
```

Respuesta:

```json
{
  "userId": "u123",
  "key": "profiles/u123/cover/cover.jpg",
  "uploadUrl": "https://...signed...",
  "publicUrl": "https://doeventprofileimagesbucket.s3.amazonaws.com/profiles/u123/cover/cover.jpg",
  "method": "PUT",
  "contentType": "image/jpeg",
  "expiresInSeconds": 900
}
```

### 2.2 Crear/actualizar portada en perfil

Metodo: PUT
Ruta: /users/{userId}/cover

Body ejemplo:

```json
{
  "key": "profiles/u123/cover/cover.jpg"
}
```

O:

```json
{
  "publicUrl": "https://doeventprofileimagesbucket.s3.amazonaws.com/profiles/u123/cover/cover.jpg"
}
```

Resultado en Client:

- profileCover: { key, url, updatedAt }
- coverImageUrl: url

### 2.3 Eliminar portada

Metodo: DELETE
Ruta: /users/{userId}/cover

Acciones:

- Elimina profileCover y coverImageUrl de Client.
- Elimina objeto en S3 si hay key resolvible.

## 3) Favoritos de perfiles

### 3.1 Marcar o desmarcar perfil como favorito

Metodo: PUT
Ruta: /users/{userId}/favorite-profiles/{targetUserId}

Body ejemplo:

```json
{
  "isFavorite": true
}
```

Para desmarcar:

```json
{
  "isFavorite": false
}
```

Comportamiento:

- Si existe registro en FavoriteUsers (PK userId, SK favoriteId=targetUserId), lo actualiza.
- Si no existe, crea registro usando datos actuales del usuario objetivo en Client.

### 3.2 Consultar perfiles favoritos de un userId

Metodo: GET
Ruta: /users/{userId}/favorite-profiles

Respuesta:

```json
{
  "userId": "u123",
  "count": 3,
  "favorites": [
    {
      "favoriteId": "u999",
      "invitedUserId": "u999",
      "name": "Ana",
      "lastName": "Perez",
      "username": "anap",
      "profileImageUrl": "fotosPerfil/anap.jpg",
      "isFavorite": true
    }
  ]
}
```

## 4) Servicio de consulta de perfil enriquecido

Servicio existente actualizado:

- GET /getUser/{id}

Nuevos campos devueltos:

- favoritesReceivedCount: total de favoritos recibidos.
- likesReceivedCount: alias del mismo conteo.
- coverImageUrl: URL publica de portada (si existe).
- coverImageSignedUrl: URL firmada de portada para render cuando el bucket no es publico.
- profileGallery: si existe, cada item sale con url publica resuelta.

Conteo de favoritos recibidos:

- Se intenta query por FavoriteUsers index GSI-followers (invitedUserId).
- Si no es posible, fallback con scan filtrando por isFavorite=true y (invitedUserId=id o favoriteId=id).

## Campos sugeridos en tabla Client

- profileGallery (Array)
- profileGalleryUpdatedAt (String ISO)
- profileCover (Object: key, url, updatedAt)
- coverImageUrl (String)

## Consideraciones de seguridad y permisos

Serverless actualizado con:

- s3:PutObject
- s3:GetObject
- s3:DeleteObject

Y recursos:

- arn:aws:s3:::doeventprofileimagesbucket
- arn:aws:s3:::doeventprofileimagesbucket/*

## Endpoints agregados

- POST /users/{userId}/profile-images/upload-urls
- PUT /users/{userId}/profile-images
- GET /users/{userId}/profile-images
- DELETE /users/{userId}/profile-images/{imageId}
- POST /users/{userId}/cover/upload-url
- PUT /users/{userId}/cover
- DELETE /users/{userId}/cover
- PUT /users/{userId}/favorite-profiles/{targetUserId}
- GET /users/{userId}/favorite-profiles

## Deploy

Desde la carpeta aws-lamda-manageusers:

```bash
npx serverless deploy --stage dev
```
