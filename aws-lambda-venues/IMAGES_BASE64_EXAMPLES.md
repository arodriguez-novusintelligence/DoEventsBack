# Ejemplos de Uso - Sistema de Imágenes con Base64

## 📤 Crear Venue con Imágenes (Base64)

### Request Completo

```json
POST /venues
Content-Type: application/json

{
  "name": "Estadio Nacional",
  "ownerUserId": "user-123",
  "isCertified": true,
  "city": "Santiago",
  "country": "Chile",
  "capacity": 50000,
  "type": "stadium",
  "address": "Av. Grecia 2001",
  "images": [
    {
      "fileName": "estadio-principal.jpg",
      "base64": "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCz/9k="
    },
    {
      "fileName": "estadio-vista-aerea.png",
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    }
  ],
  "categories": [
    {
      "name": "VIP",
      "color": "#FFD700",
      "level": 1,
      "sections": [
        {
          "name": "Palco Norte",
          "rows": 5,
          "seatsPerRow": 20,
          "seats": []
        }
      ]
    }
  ]
}
```

### Response

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-uuid-123",
    "name": "Estadio Nacional",
    "ownerUserId": "user-123",
    "isCertified": true,
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-uuid-123/img-uuid-1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue-uuid-123/img-uuid-2.png",
    "categoryCount": 1,
    "city": "Santiago",
    "country": "Chile",
    "capacity": 50000,
    "type": "stadium",
    "status": "draft",
    "createdAt": "2025-11-07T...",
    "updatedAt": "2025-11-07T..."
  }
}
```

---

## 📸 Agregar Imagen a Venue Existente

### Request

```json
POST /venues/{venueId}/images
Content-Type: application/json

{
  "fileName": "nueva-vista.jpg",
  "base64": "/9j/4AAQSkZJRgABAQEAYABgAAD..."
}
```

### Response

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-uuid-123/img-uuid-3.jpg",
  "venueId": "venue-uuid-123"
}
```

---

## 🔄 Convertir Imagen a Base64

### JavaScript (Node.js)

```javascript
const fs = require("fs");

// Desde archivo
function imageToBase64(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  return imageBuffer.toString("base64");
}

const base64Image = imageToBase64("./estadio.jpg");
console.log(base64Image);
```

### JavaScript (Browser)

```javascript
// Desde input file
function handleFileSelect(event) {
  const file = event.target.files[0];
  const reader = new FileReader();

  reader.onload = function (e) {
    const base64 = e.target.result.split(",")[1]; // Quitar el prefix data:image/...

    // Enviar al API
    fetch(`/venues/${venueId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        base64: base64,
      }),
    });
  };

  reader.readAsDataURL(file);
}

// HTML
// <input type="file" accept="image/*" onchange="handleFileSelect(event)">
```

### Python

```python
import base64

def image_to_base64(file_path):
    with open(file_path, 'rb') as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

base64_image = image_to_base64('estadio.jpg')
print(base64_image)
```

### Bash (Linux/Mac)

```bash
base64 -w 0 estadio.jpg > estadio.txt
```

### PowerShell (Windows)

```powershell
$imageBytes = [System.IO.File]::ReadAllBytes("C:\path\to\estadio.jpg")
$base64String = [System.Convert]::ToBase64String($imageBytes)
$base64String | Out-File -FilePath "estadio-base64.txt"
```

---

## 🧪 Ejemplo Completo con cURL

### 1. Convertir imagen a base64

```bash
# Linux/Mac
BASE64_IMAGE=$(base64 -w 0 estadio.jpg)

# Windows PowerShell
$imageBytes = [System.IO.File]::ReadAllBytes("estadio.jpg")
$BASE64_IMAGE = [System.Convert]::ToBase64String($imageBytes)
```

### 2. Crear archivo JSON

```bash
cat > create-venue.json << EOF
{
  "name": "Estadio Nacional",
  "ownerUserId": "user-123",
  "isCertified": true,
  "city": "Santiago",
  "country": "Chile",
  "images": [
    {
      "fileName": "estadio.jpg",
      "base64": "$BASE64_IMAGE"
    }
  ]
}
EOF
```

### 3. Enviar request

```bash
curl -X POST https://your-api.com/dev/venues \
  -H "Content-Type: application/json" \
  -d @create-venue.json
```

---

## 🎨 Ejemplo con Postman

1. **Crear nueva request POST**: `/venues`
2. **Body → raw → JSON**:

```json
{
  "name": "Mi Venue",
  "ownerUserId": "user-123",
  "isCertified": false,
  "images": [
    {
      "fileName": "imagen.jpg",
      "base64": "{{base64_image}}"
    }
  ]
}
```

3. **Pre-request Script** para cargar imagen:

```javascript
const fs = require("fs");
const path = require("path");

// Ruta a tu imagen
const imagePath = path.join(__dirname, "test-image.jpg");
const imageBuffer = fs.readFileSync(imagePath);
const base64Image = imageBuffer.toString("base64");

pm.variables.set("base64_image", base64Image);
```

---

## ⚠️ Limitaciones de Tamaño

### API Gateway Limits

- **Payload máximo**: 10 MB
- **Timeout**: 30 segundos

### Recomendaciones

- ✅ **Imágenes pequeñas/medianas**: Subir directamente en base64
- ⚠️ **Imágenes grandes (>5MB)**: Considerar pre-signed URLs para subida directa a S3
- 💡 **Optimización**: Comprimir imágenes antes de convertir a base64

### Cálculo de Tamaño

```
Tamaño Base64 ≈ Tamaño Original × 1.37
```

Ejemplo:

- Imagen JPEG: 2 MB
- Base64: ~2.74 MB
- Total request con JSON: ~2.8 MB ✅ OK

---

## 🔍 Obtener Imágenes del Venue

### Request

```bash
GET /venues/{venueId}
```

### Response

```json
{
  "venueId": "venue-123",
  "name": "Estadio Nacional",
  "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-123/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue-123/img2.png",
  ...
}
```

### Procesar en el Cliente

```javascript
// Obtener venue
const venue = await fetch("/venues/venue-123").then((r) => r.json());

// Convertir string a array de URLs
const imageUrls = venue.images ? venue.images.split(",") : [];

// Mostrar imágenes
imageUrls.forEach((url, index) => {
  const img = document.createElement("img");
  img.src = url; // Acceso público directo
  img.alt = `${venue.name} - Imagen ${index + 1}`;
  document.getElementById("gallery").appendChild(img);
});
```

---

## 📝 Validaciones

El sistema valida:

- ✅ Extensiones permitidas: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- ✅ Base64 válido
- ✅ Nombre de archivo presente
- ✅ Venue existe (para agregar imágenes)

### Manejo de Errores

```javascript
try {
  const response = await fetch("/venues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(venueData),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("Error:", error.message);
  }

  const result = await response.json();
  console.log("Imágenes subidas:", result.venue.images.split(","));
} catch (error) {
  console.error("Error de red:", error);
}
```

---

## 🎯 Mejores Prácticas

1. **Comprimir antes de codificar**: Usa herramientas como ImageMagick, sharp, etc.
2. **Formatos recomendados**: JPEG para fotos, PNG para logos/transparencias, WebP para web
3. **Nombres descriptivos**: `estadio-vista-principal.jpg` mejor que `IMG_1234.jpg`
4. **Batch upload**: Envía múltiples imágenes en un solo request cuando crees el venue
5. **Lazy loading**: Carga imágenes bajo demanda en el cliente
6. **CDN**: Considera CloudFront para distribución global

---

## 🚀 Script de Prueba Completo

Ver archivo: `test-venue-images.js`

```bash
node test-venue-images.js ruta/a/tu/imagen.jpg
```

Genera todos los comandos curl necesarios para probar el sistema.
