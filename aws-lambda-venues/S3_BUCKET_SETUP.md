# Configuración del Bucket S3 para Imágenes de Venues

Este documento describe los pasos para crear y configurar el bucket S3 que almacenará las imágenes de los venues con acceso público.

## 📋 Información del Bucket

- **Nombre del Bucket**: `doevent-venue-images`
- **Región**: `us-east-1`
- **Acceso**: Público (sin firma requerida)
- **Estructura**: `venues/{venueId}/{imageId}.{extension}`

---

## 🚀 Pasos de Configuración

### 1. Crear el Bucket S3

```bash
aws s3api create-bucket --bucket doevent-venue-images --region us-east-1
```

### 2. Deshabilitar el Bloqueo de Acceso Público

Por defecto, AWS bloquea todo acceso público. Necesitas deshabilitarlo:

```bash
aws s3api put-public-access-block \
  --bucket doevent-venue-images \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### 3. Aplicar Política de Bucket para Acceso Público de Lectura

Crea un archivo `bucket-policy.json` con el siguiente contenido:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::doevent-venue-images/*"
    }
  ]
}
```

Aplica la política:

```bash
aws s3api put-bucket-policy --bucket doevent-venue-images --policy file://bucket-policy.json
```

### 4. Configurar CORS (opcional, para subidas desde el navegador)

Crea un archivo `cors-config.json`:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

Aplica la configuración CORS:

```bash
aws s3api put-bucket-cors --bucket doevent-venue-images --cors-configuration file://cors-config.json
```

### 5. Habilitar Versionado (opcional, recomendado)

```bash
aws s3api put-bucket-versioning --bucket doevent-venue-images --versioning-configuration Status=Enabled
```

### 6. Configurar Lifecycle Policy (opcional, para limpieza automática)

Crea un archivo `lifecycle-policy.json`:

```json
{
  "Rules": [
    {
      "Id": "DeleteOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 30
      }
    }
  ]
}
```

Aplica la política:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket doevent-venue-images --lifecycle-configuration file://lifecycle-policy.json
```

---

## 🔒 Configuración Alternativa: PowerShell (Windows)

Si prefieres usar PowerShell en lugar de AWS CLI:

### 1. Crear el Bucket

```powershell
aws s3api create-bucket --bucket doevent-venue-images --region us-east-1
```

### 2. Deshabilitar Bloqueo Público

```powershell
$publicAccessBlock = @{
    BlockPublicAcls = $false
    IgnorePublicAcls = $false
    BlockPublicPolicy = $false
    RestrictPublicBuckets = $false
} | ConvertTo-Json -Compress

aws s3api put-public-access-block --bucket doevent-venue-images --public-access-block-configuration $publicAccessBlock
```

### 3. Aplicar Política de Bucket

```powershell
$bucketPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::doevent-venue-images/*"
    }
  ]
}
"@

$bucketPolicy | Out-File -FilePath bucket-policy.json -Encoding utf8
aws s3api put-bucket-policy --bucket doevent-venue-images --policy file://bucket-policy.json
```

---

## ✅ Verificación

### Verificar que el bucket existe:

```bash
aws s3api head-bucket --bucket doevent-venue-images
```

### Verificar la política de acceso público:

```bash
aws s3api get-bucket-policy --bucket doevent-venue-images
```

### Verificar configuración de bloqueo público:

```bash
aws s3api get-public-access-block --bucket doevent-venue-images
```

### Subir imagen de prueba y verificar acceso público:

```bash
# Subir imagen de prueba
aws s3 cp test-image.jpg s3://doevent-venue-images/test/test-image.jpg --acl public-read

# Verificar acceso público (debe devolver la imagen)
curl https://doevent-venue-images.s3.amazonaws.com/test/test-image.jpg
```

---

## 🔧 Uso en el Lambda

El handler `uploadVenueImageHandler.js` ya está configurado para:

1. Recibir una imagen en base64
2. Subirla a S3 con ACL `public-read`
3. Generar la URL pública: `https://doevent-venue-images.s3.amazonaws.com/venues/{venueId}/{imageId}.{ext}`
4. Actualizar el campo `images` del venue en DynamoDB

### Ejemplo de Request:

```bash
POST https://tu-api-gateway.execute-api.us-east-1.amazonaws.com/dev/venues/{venueId}/images
Content-Type: application/json

{
  "fileName": "venue-main.jpg",
  "imageBase64": "/9j/4AAQSkZJRgABAQEAYABgAAD..."
}
```

### Ejemplo de Response:

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/abc-123/def-456.jpg",
  "venueId": "abc-123"
}
```

---

## 📁 Estructura del Bucket

```
doevent-venue-images/
└── venues/
    ├── {venueId-1}/
    │   ├── {imageId-1}.jpg
    │   ├── {imageId-2}.png
    │   └── {imageId-3}.jpg
    ├── {venueId-2}/
    │   └── {imageId-4}.jpg
    └── ...
```

---

## 🛡️ Consideraciones de Seguridad

1. **Solo Lectura Pública**: La política permite solo `s3:GetObject`, no escritura pública
2. **Escritura por Lambda**: Solo las lambdas autenticadas pueden subir imágenes
3. **Validación de Tipos**: El handler valida extensiones de archivo (.jpg, .png, .gif, .webp)
4. **Organización por Venue**: Cada venue tiene su propia carpeta
5. **IDs Únicos**: Uso de UUIDs para evitar colisiones de nombres

---

## 💰 Costos Estimados

- **Almacenamiento S3**: ~$0.023/GB/mes
- **Transferencia de Datos**: Primeros 100GB/mes gratis, luego $0.09/GB
- **Requests GET**: $0.0004 por 1,000 requests

**Ejemplo**: 1,000 venues con 5 imágenes cada uno (2MB promedio) = 10GB → ~$0.23/mes + transferencia

---

## 🔄 Comandos de Limpieza (si necesitas empezar de nuevo)

```bash
# Eliminar todos los objetos del bucket
aws s3 rm s3://doevent-venue-images --recursive

# Eliminar el bucket
aws s3api delete-bucket --bucket doevent-venue-images --region us-east-1
```

---

## 📝 Notas Adicionales

- Las imágenes son **públicas por defecto** gracias al ACL `public-read`
- **No se requiere firma** de URLs para acceder a las imágenes
- Las URLs son permanentes mientras exista el objeto en S3
- Se recomienda implementar **CloudFront** en el futuro para mejor rendimiento y costos más bajos
