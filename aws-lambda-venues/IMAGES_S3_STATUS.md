# 📸 Configuración de Imágenes en Venues

## ✅ Respuestas a tus preguntas:

### 1. ¿En qué bucket estás guardando?
**Bucket:** `doevent-venue-images`
- **Región:** `us-east-1`
- **Estado:** ✅ El bucket **EXISTE y tienes acceso**

### 2. ¿Estás guardando el key de la imagen en S3?
**Sí**, la estructura del key es:
```
venues/{venueId}/{imageId}.{extension}
```

**Ejemplo:**
```
venues/a1b2c3d4-e5f6-7890/f12345ab-cdef.jpg
```

**Metadata guardada en S3:**
- `venueId`: ID del venue
- `uploadedAt`: Timestamp de subida
- `originalFileName`: Nombre original del archivo

### 3. ¿Tienes permisos para cargar imágenes?
**Sí**, el `serverless.yml` tiene los permisos configurados:
```yaml
- Effect: Allow
  Action:
    - s3:PutObject      # ✅ Subir imágenes
    - s3:PutObjectAcl   # ✅ Configurar permisos
    - s3:GetObject      # ✅ Leer imágenes
    - s3:DeleteObject   # ✅ Eliminar imágenes
  Resource:
    - arn:aws:s3:::doevent-venue-images/*
```

### 4. ¿El bucket existe?
**Sí**, verificado con `aws s3api head-bucket`:
```
BucketArn: arn:aws:s3:::doevent-venue-images
BucketRegion: us-east-1
Status: ✅ Existe y tienes acceso
```

---

## 📝 Cómo Funciona el Sistema de Imágenes

### Opción 1: Una sola imagen
```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA..."
}
```

### Opción 2: Múltiples imágenes
```json
{
  "images": [
    {
      "fileName": "teatro-exterior.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    },
    {
      "fileName": "teatro-interior.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEA..."
    }
  ]
}
```

### Proceso de Subida:
1. **Recibe base64** desde el request
2. **Genera UUID** único para la imagen
3. **Sube a S3** con:
   - Key: `venues/{venueId}/{imageId}.{extension}`
   - ACL: `public-read` (imagen pública)
   - ContentType: detectado automáticamente
4. **Genera URL pública**:
   ```
   https://doevent-venue-images.s3.amazonaws.com/venues/{venueId}/{imageId}.jpg
   ```
5. **Guarda en DynamoDB** en el campo `images` como string separado por comas:
   ```
   "images": "https://bucket.s3.../img1.jpg,https://bucket.s3.../img2.jpg"
   ```

### Formatos Soportados:
- ✅ JPG/JPEG
- ✅ PNG
- ✅ GIF
- ✅ WEBP
- ✅ SVG
- ✅ BMP
- ✅ TIFF
- ✅ ICO

---

## 🔧 Handlers que Usan Imágenes

### 1. `createVenueHandler.js`
- Procesa imágenes al crear venue
- Sube a S3 y guarda URLs en campo `images`

### 2. `updateVenueHandler.js`
- Procesa nuevas imágenes
- **Mantiene** imágenes existentes
- **Agrega** nuevas URLs al campo `images`

### 3. `uploadVenueImageHandler.js`
- Endpoint dedicado: `POST /venues/{venueId}/images`
- Agrega imágenes a venue existente

---

## ✅ Todo está Configurado Correctamente

| Componente | Estado | Detalle |
|------------|--------|---------|
| Bucket S3 | ✅ | `doevent-venue-images` existe |
| Permisos IAM | ✅ | PutObject, GetObject, DeleteObject |
| Variable de entorno | ✅ | `VENUE_IMAGES_BUCKET` configurada |
| Keys en S3 | ✅ | Estructura `venues/{venueId}/{imageId}.ext` |
| URLs públicas | ✅ | ACL `public-read` configurado |
| Metadata | ✅ | venueId, uploadedAt, originalFileName |

---

## 📋 Ejemplo Completo de Uso

### Crear venue con imágenes:
```bash
POST /venues
Content-Type: application/json

{
  "name": "Teatro Municipal",
  "ownerUserId": "user-123",
  "hasSeating": true,
  "images": [
    {
      "fileName": "exterior.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEAYABgAAD..."
    },
    {
      "fileName": "interior.png",
      "base64": "iVBORw0KGgoAAAANSUhEUgAABAA..."
    }
  ]
}
```

### Response:
```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "a1b2c3d4-e5f6-7890",
    "name": "Teatro Municipal",
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4-e5f6-7890/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/a1b2c3d4-e5f6-7890/img2.png"
  }
}
```

---

## 🎉 Conclusión

**TODO ESTÁ FUNCIONANDO CORRECTAMENTE:**
- ✅ Bucket existe y es accesible
- ✅ Permisos configurados correctamente
- ✅ Keys de S3 bien estructurados
- ✅ Sistema de subida implementado
- ✅ URLs públicas funcionando

**No hay problemas con las imágenes** - puedes usarlas sin inconvenientes.
