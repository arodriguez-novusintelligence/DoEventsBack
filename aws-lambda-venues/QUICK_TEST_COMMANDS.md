# 🚀 Comandos Rápidos de Prueba

## 1️⃣ Desplegar la Lambda actualizada
```powershell
# Navegar al directorio
cd c:\Users\jessi\LambdasEventos\aws-application-lambda-doEvents\aws-lambda-venues

# Instalar dependencias (si no están instaladas)
npm install

# Desplegar
serverless deploy --stage dev --region us-east-1
```

---

## 2️⃣ Probar con curl/PowerShell

### Prueba 1: Actualizar con imagen única
```powershell
$venueId = "TU_VENUE_ID"
$apiUrl = "https://TU_API_URL.com/venues/$venueId"

# Imagen de prueba (pixel rojo 1x1)
$base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

$body = @{
    name = "Venue Actualizado con Imagen"
    capacity = 5000
    imageBase64 = "data:image/png;base64,$base64Image"
} | ConvertTo-Json

Invoke-RestMethod -Uri $apiUrl -Method Put -Body $body -ContentType "application/json" -Headers @{
    "Authorization" = "Bearer TU_TOKEN"
}
```

### Prueba 2: Actualizar con múltiples imágenes
```powershell
$venueId = "TU_VENUE_ID"
$apiUrl = "https://TU_API_URL.com/venues/$venueId"

$body = @{
    name = "Venue con Múltiples Imágenes"
    images = @(
        @{
            base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
            fileName = "imagen1.png"
        },
        @{
            base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
            fileName = "imagen2.png"
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri $apiUrl -Method Put -Body $body -ContentType "application/json" -Headers @{
    "Authorization" = "Bearer TU_TOKEN"
}
```

---

## 3️⃣ Verificar Logs
```powershell
# Ver logs en tiempo real
aws logs tail /aws/lambda/aws-lambda-venues-dev-updateVenue --follow --format short

# Ver últimos logs
aws logs tail /aws/lambda/aws-lambda-venues-dev-updateVenue --since 10m
```

---

## 4️⃣ Verificar S3
```powershell
# Listar imágenes de un venue
aws s3 ls s3://doevent-venue-images/venues/TU_VENUE_ID/ --recursive

# Descargar una imagen para verificar
aws s3 cp s3://doevent-venue-images/venues/TU_VENUE_ID/uuid-xxx.jpg ./test-image.jpg
```

---

## 5️⃣ Verificar DynamoDB
```powershell
# Obtener el venue actualizado
aws dynamodb get-item `
  --table-name Venues `
  --key '{\"venue_id\": {\"S\": \"TU_VENUE_ID\"}}' `
  --query 'Item.images.S' `
  --output text
```

---

## 6️⃣ Test con Postman

### Request:
```
PUT {{baseUrl}}/venues/{{venueId}}
Content-Type: application/json
Authorization: Bearer {{token}}
```

### Body (opción 1 - imagen única):
```json
{
  "name": "Teatro Municipal Renovado",
  "capacity": 1200,
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD..."
}
```

### Body (opción 2 - múltiples imágenes):
```json
{
  "name": "Estadio Nacional",
  "images": [
    {
      "base64": "iVBORw0KGgoAAAANS...",
      "fileName": "estadio-exterior.jpg"
    },
    {
      "base64": "R0lGODlhAQABAIAAA...",
      "fileName": "estadio-interior.png"
    }
  ]
}
```

---

## 7️⃣ Verificar URL Pública de Imagen
```powershell
# Probar que la imagen sea accesible
$imageUrl = "https://doevent-venue-images.s3.amazonaws.com/venues/venue_123/uuid-xxx.jpg"
Invoke-WebRequest -Uri $imageUrl -Method Head
```

---

## 🔥 Script Completo de Prueba End-to-End

```powershell
# Variables
$venueId = "venue_test_123"
$apiUrl = "https://tu-api.execute-api.us-east-1.amazonaws.com/dev/venues/$venueId"
$token = "TU_TOKEN_JWT"

# 1. Crear venue (si no existe)
Write-Host "📝 Creando venue de prueba..." -ForegroundColor Cyan
$createBody = @{
    name = "Venue de Prueba"
    ownerUserId = "test-user-123"
    latitude = 4.6536
    longitude = -74.0574
    capacity = 1000
} | ConvertTo-Json

try {
    $venue = Invoke-RestMethod -Uri "https://tu-api.execute-api.us-east-1.amazonaws.com/dev/venues" `
        -Method Post `
        -Body $createBody `
        -ContentType "application/json" `
        -Headers @{ "Authorization" = "Bearer $token" }
    $venueId = $venue.venue.venueId
    Write-Host "✅ Venue creado: $venueId" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Error al crear venue (puede que ya exista)" -ForegroundColor Yellow
}

# 2. Actualizar con imagen
Write-Host "📸 Actualizando venue con imagen..." -ForegroundColor Cyan
$updateBody = @{
    name = "Venue Actualizado con Imagen"
    imageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
} | ConvertTo-Json

$updated = Invoke-RestMethod -Uri $apiUrl `
    -Method Put `
    -Body $updateBody `
    -ContentType "application/json" `
    -Headers @{ "Authorization" = "Bearer $token" }

Write-Host "✅ Venue actualizado" -ForegroundColor Green

# 3. Verificar resultado
Write-Host "🔍 Obteniendo venue actualizado..." -ForegroundColor Cyan
$result = Invoke-RestMethod -Uri $apiUrl `
    -Method Get `
    -Headers @{ "Authorization" = "Bearer $token" }

Write-Host "📊 Imágenes del venue:" -ForegroundColor Cyan
if ($result.venue.imageUrls) {
    $result.venue.imageUrls | ForEach-Object {
        Write-Host "  📷 $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️ No se encontraron imágenes" -ForegroundColor Yellow
}

# 4. Verificar en S3
Write-Host "🪣 Verificando en S3..." -ForegroundColor Cyan
aws s3 ls s3://doevent-venue-images/venues/$venueId/ --recursive

Write-Host "`n✅ Prueba completada!" -ForegroundColor Green
```

---

## 📋 Checklist de Verificación

Después de ejecutar las pruebas, verificar:

- [ ] Lambda desplegada sin errores
- [ ] Logs muestran "📸 Detectadas X imágenes..."
- [ ] Logs muestran "✅ Imagen subida: https://..."
- [ ] S3 contiene los archivos de imagen
- [ ] URLs de imágenes son accesibles públicamente
- [ ] DynamoDB tiene el campo `images` actualizado
- [ ] GET /venues/{id} retorna `imageUrls` y `mainImage`
- [ ] No hay errores 500 en las respuestas

---

**Estado:** ✅ Listo para pruebas
**Última actualización:** 16 de enero de 2026
