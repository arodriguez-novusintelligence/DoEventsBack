# Actualización: Campo isCertified e Imágenes

## 🆕 Cambios Implementados

### 1. Campo `isCertified`

Se agregó el campo **`isCertified`** a la tabla **Venues** para identificar lugares certificados:

- **Tipo**: Boolean
- **Valor por defecto**: `false`
- **Propósito**: Marcar venues como lugares certificados/oficiales

#### Ejemplo en createVenue:

```json
{
  "name": "Estadio Nacional",
  "ownerUserId": "user-123",
  "isCertified": true,
  "city": "Santiago",
  ...
}
```

#### Ejemplo en updateVenue:

```json
{
  "isCertified": true
}
```

---

### 2. Sistema de Imágenes Públicas

Se implementó un sistema completo para gestionar imágenes de venues en S3 con acceso público.

#### 📦 Bucket S3: `doevent-venue-images`

**Características:**

- ✅ Imágenes públicas (sin necesidad de firmar URLs)
- ✅ Estructura organizada por venue
- ✅ URLs permanentes
- ✅ CORS habilitado para subidas desde navegador

**Estructura del Bucket:**

```
doevent-venue-images/
└── venues/
    ├── {venueId-1}/
    │   ├── {imageId-1}.jpg
    │   ├── {imageId-2}.png
    │   └── {imageId-3}.jpg
    └── {venueId-2}/
        └── {imageId-4}.jpg
```

---

## 🔧 Configuración del Bucket S3

### Opción 1: Script Automatizado (Recomendado)

Ejecutar el script PowerShell incluido:

```powershell
cd aws-lambda-venues
.\setup-s3-bucket.ps1
```

Este script configura automáticamente:

- ✅ Crea el bucket
- ✅ Deshabilita bloqueo de acceso público
- ✅ Aplica política de lectura pública
- ✅ Configura CORS
- ✅ Habilita versionado
- ✅ Verifica la configuración

### Opción 2: Manual

Ver el archivo `S3_BUCKET_SETUP.md` para instrucciones detalladas paso a paso.

---

## 📤 Subir Imágenes al Venue

### Endpoint: `POST /venues/{venueId}/images`

**Request:**

```json
{
  "fileName": "estadio-vista-principal.jpg",
  "imageBase64": "/9j/4AAQSkZJRgABAQEAYABgAAD..."
}
```

**Response:**

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/abc-123/def-456.jpg",
  "venueId": "abc-123"
}
```

**Proceso:**

1. La imagen se sube a S3 con ACL `public-read`
2. Se genera una URL pública permanente
3. La URL se agrega automáticamente al campo `images` del venue
4. El campo `images` almacena URLs separadas por comas

---

## 🖼️ Obtener Imágenes del Venue

Las imágenes se devuelven en el campo `images` al consultar un venue:

### Endpoint: `GET /venues/{venueId}`

**Response:**

```json
{
  "venueId": "abc-123",
  "name": "Estadio Nacional",
  "isCertified": true,
  "images": "https://doevent-venue-images.s3.amazonaws.com/venues/abc-123/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/abc-123/img2.jpg",
  ...
}
```

**En el Cliente:**

```javascript
// Convertir string de imágenes a array
const venue = await fetch(`/venues/${venueId}`).then((r) => r.json());
const imageUrls = venue.images ? venue.images.split(",") : [];

// Usar las URLs directamente (son públicas)
imageUrls.forEach((url) => {
  const img = document.createElement("img");
  img.src = url; // No requiere firma
  document.body.appendChild(img);
});
```

---

## 🔒 Seguridad

### Control de Acceso:

1. **Lectura (GET)**: Pública para todos los objetos
2. **Escritura (PUT)**: Solo lambdas autorizadas
3. **Validación**: Solo extensiones permitidas (.jpg, .jpeg, .png, .gif, .webp)

### Permisos IAM Lambda:

El `serverless.yml` ya incluye los permisos necesarios:

```yaml
- Effect: Allow
  Action:
    - s3:PutObject
    - s3:PutObjectAcl
    - s3:GetObject
    - s3:DeleteObject
  Resource:
    - arn:aws:s3:::doevent-venue-images/*
```

---

## 📝 Ejemplo Completo: Crear Venue con Imagen

### 1. Crear el venue

```bash
POST /venues
{
  "name": "Estadio Monumental",
  "ownerUserId": "user-123",
  "isCertified": true,
  "city": "Lima",
  "country": "Peru",
  "capacity": 80000
}
```

**Response:**

```json
{
  "venueId": "venue-abc-123",
  "message": "Venue created successfully"
}
```

### 2. Subir imagen

```bash
POST /venues/venue-abc-123/images
{
  "fileName": "estadio-principal.jpg",
  "imageBase64": "base64-encoded-image-data..."
}
```

**Response:**

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-abc-123/img-uuid.jpg",
  "venueId": "venue-abc-123"
}
```

### 3. Consultar venue con imágenes

```bash
GET /venues/venue-abc-123
```

**Response:**

```json
{
  "venueId": "venue-abc-123",
  "name": "Estadio Monumental",
  "ownerUserId": "user-123",
  "isCertified": true,
  "city": "Lima",
  "country": "Peru",
  "capacity": 80000,
  "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-abc-123/img-uuid.jpg",
  "status": "draft",
  ...
}
```

---

## 🎯 Filtrar Venues Certificados

### Endpoint: `GET /venues?isCertified=true`

Lista solo venues certificados (útil para mostrar lugares oficiales).

---

## 💡 Mejoras Futuras Recomendadas

1. **CloudFront CDN**: Distribuir imágenes globalmente con menor latencia
2. **Compresión automática**: Lambda para redimensionar/optimizar imágenes
3. **Thumbnails**: Generar miniaturas automáticamente
4. **Watermarks**: Agregar marcas de agua a imágenes no certificadas
5. **Image Moderation**: AWS Rekognition para validar contenido

---

## 📊 Costos Estimados S3

- **Almacenamiento**: ~$0.023/GB/mes
- **Transferencia**: 100GB/mes gratis, luego $0.09/GB
- **Requests GET**: $0.0004 por 1,000 requests

**Ejemplo**: 1,000 venues × 5 imágenes × 2MB = 10GB → **~$0.23/mes** + transferencia

---

## 🔍 Troubleshooting

### Error: Access Denied al subir imagen

**Solución**: Verificar permisos IAM del Lambda y bucket policy

```bash
aws s3api get-bucket-policy --bucket doevent-venue-images
```

### Error: Imagen no se ve pública

**Solución**: Verificar bloqueo de acceso público

```bash
aws s3api get-public-access-block --bucket doevent-venue-images
```

Debe retornar todos los valores en `false`.

### Error: CORS al subir desde navegador

**Solución**: Verificar configuración CORS

```bash
aws s3api get-bucket-cors --bucket doevent-venue-images
```

---

## 📚 Archivos Relacionados

- `S3_BUCKET_SETUP.md` - Guía detallada de configuración S3
- `setup-s3-bucket.ps1` - Script automatizado de configuración
- `bucket-policy.json` - Política de acceso público
- `cors-config.json` - Configuración CORS
- `lifecycle-policy.json` - Política de limpieza automática
- `src/uploadVenueImageHandler.js` - Handler para subir imágenes

---

## ✅ Checklist de Despliegue

- [ ] Ejecutar `setup-s3-bucket.ps1` para crear bucket S3
- [ ] Verificar que las imágenes son accesibles públicamente
- [ ] Crear tablas DynamoDB con campo `isCertified`
- [ ] Desplegar lambdas: `serverless deploy`
- [ ] Probar subida de imagen de prueba
- [ ] Verificar URL pública de imagen
- [ ] Documentar URLs base para el frontend

---

Para más detalles sobre la configuración de S3, ver: **`S3_BUCKET_SETUP.md`**
