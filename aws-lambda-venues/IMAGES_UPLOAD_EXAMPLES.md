# Sistema de Imágenes para Venues - Guía Completa

## 📸 Resumen

El sistema de venues soporta la subida de imágenes en formato base64 con almacenamiento en S3. Las imágenes se devuelven como URLs públicas en las consultas.

## 🪣 Bucket S3

**Nombre:** `doevent-venue-images`
**Región:** us-east-1
**ACL:** public-read (las imágenes son públicas)
**Estructura:**

```
doevent-venue-images/
  └─ venues/
      └─ {venueId}/
          ├─ {imageId}.jpg
          ├─ {imageId}.png
          └─ {imageId}.webp
```

## 🎯 Formatos Soportados

El sistema acepta múltiples formatos de imagen:

| Extensión | Content-Type  | Soportado |
| --------- | ------------- | --------- |
| jpg/jpeg  | image/jpeg    | ✅        |
| png       | image/png     | ✅        |
| gif       | image/gif     | ✅        |
| webp      | image/webp    | ✅        |
| svg       | image/svg+xml | ✅        |
| bmp       | image/bmp     | ✅        |
| tiff      | image/tiff    | ✅        |
| ico       | image/x-icon  | ✅        |

---

## 📤 Subir Imágenes

### Método 1: Array de Imágenes (Recomendado para múltiples)

```json
{
  "name": "Estadio Nacional",
  "ownerUserId": "user_123",
  "latitude": 4.6536,
  "longitude": -74.0574,
  "capacity": 50000,
  "images": [
    {
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "fileName": "estadio-principal.jpg"
    },
    {
      "base64": "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      "fileName": "estadio-vista-aerea.png"
    },
    {
      "base64": "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
      "fileName": "estadio-nocturna.webp"
    }
  ],
  "floors": [...]
}
```

### Método 2: Imagen Única con Data URI

```json
{
  "name": "Teatro Municipal",
  "ownerUserId": "user_456",
  "latitude": 4.5981,
  "longitude": -74.0758,
  "capacity": 1000,
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL...",
  "floors": [...]
}
```

### Método 3: Imagen Única sin Data URI

```json
{
  "name": "Coliseo Cerrado",
  "ownerUserId": "user_789",
  "latitude": 4.6285,
  "longitude": -74.0725,
  "capacity": 15000,
  "imageBase64": "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL...",
  "floors": [...]
}
```

**Nota:** Si no se especifica el tipo de imagen en el Data URI, el sistema asume JPG por defecto.

---

## 📥 Respuestas con Imágenes

### Crear Venue - Response

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue_abc123",
    "name": "Estadio Nacional",
    "capacity": 50000,
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_002.png,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_003.webp",
    "floorCount": 2,
    "entranceCount": 3
  }
}
```

### Get Venue - Response con Imágenes Procesadas

```json
{
  "venue": {
    "venue_id": "venue_abc123",
    "name": "Estadio Nacional",
    "capacity": 50000,
    "latitude": 4.6536,
    "longitude": -74.0574,
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_002.png",
    "imageUrls": [
      "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg",
      "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_002.png"
    ],
    "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg",
    "floors": [...],
    "entrances": [...]
  }
}
```

### List Venues - Response con Imágenes

```json
{
  "venues": [
    {
      "venue_id": "venue_abc123",
      "name": "Estadio Nacional",
      "latitude": 4.6536,
      "longitude": -74.0574,
      "capacity": 50000,
      "distance": 5.23,
      "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_002.png",
      "imageUrls": [
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg",
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_002.png"
      ],
      "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img_001.jpg"
    },
    {
      "venue_id": "venue_xyz789",
      "name": "Teatro Municipal",
      "latitude": 4.5981,
      "longitude": -74.0758,
      "capacity": 1000,
      "distance": 8.45,
      "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_xyz789/img_001.jpg",
      "imageUrls": [
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_xyz789/img_001.jpg"
      ],
      "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_xyz789/img_001.jpg"
    }
  ],
  "count": 2,
  "lastEvaluatedKey": null,
  "hasMore": false,
  "filters": {
    "ownerUserId": null,
    "isTemplate": null,
    "status": null,
    "location": {
      "latitude": 4.6097,
      "longitude": -74.0817,
      "maxDistance": 10
    }
  }
}
```

---

## 🔍 Campos de Imagen en Responses

| Campo       | Tipo   | Descripción                                     |
| ----------- | ------ | ----------------------------------------------- |
| `images`    | string | URLs separadas por comas (campo original en DB) |
| `imageUrls` | array  | Array de URLs de todas las imágenes             |
| `mainImage` | string | URL de la primera imagen (principal)            |

---

## 💡 Ejemplos de Uso

### Ejemplo 1: Subir Venue con 3 Imágenes en Diferentes Formatos

```bash
POST /venues
Content-Type: application/json
```

```json
{
  "name": "Arena Multiusos",
  "ownerUserId": "user_123",
  "latitude": 4.6536,
  "longitude": -74.0574,
  "capacity": 20000,
  "description": "Arena para eventos múltiples",
  "images": [
    {
      "base64": "{{BASE64_JPG_DATA}}",
      "fileName": "arena-exterior.jpg"
    },
    {
      "base64": "{{BASE64_PNG_DATA}}",
      "fileName": "arena-interior.png"
    },
    {
      "base64": "{{BASE64_WEBP_DATA}}",
      "fileName": "arena-escenario.webp"
    }
  ],
  "floors": [
    {
      "name": "Planta Baja",
      "categories": [
        {
          "name": "Platea VIP",
          "color": "#FFD700",
          "seats": []
        }
      ]
    }
  ]
}
```

### Ejemplo 2: Buscar Venues Cercanos con Imágenes

```bash
GET /venues?latitude=4.6097&longitude=-74.0817&maxDistance=10&limit=20
```

**Response:**

```json
{
  "venues": [
    {
      "venue_id": "venue_001",
      "name": "Estadio A",
      "distance": 2.34,
      "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_001/img_main.jpg",
      "imageUrls": [
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_001/img_main.jpg",
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_001/img_side.png"
      ]
    }
  ],
  "count": 1,
  "hasMore": false
}
```

### Ejemplo 3: Convertir Imagen del Frontend a Base64

**JavaScript (Frontend):**

```javascript
// Función para convertir File a base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remover el prefijo data:image/...;base64,
      const base64 = reader.result.split(',')[1];
      resolve({
        base64: base64,
        fileName: file.name
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Uso
const fileInput = document.getElementById('venueImage');
const file = fileInput.files[0];
const imageData = await fileToBase64(file);

// Enviar al API
const requestBody = {
  name: "Mi Venue",
  ownerUserId: "user_123",
  latitude: 4.6536,
  longitude: -74.0574,
  capacity: 5000,
  images: [imageData],
  floors: [...]
};

fetch('https://api.example.com/venues', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(requestBody)
});
```

---

## ⚙️ Metadatos de S3

Cada imagen subida incluye metadatos:

```javascript
{
  Metadata: {
    venueId: "venue_abc123",
    uploadedAt: "2025-12-04T10:30:00.000Z",
    originalFileName: "estadio-principal.jpg"
  }
}
```

---

## 🚨 Manejo de Errores

### Error: Imagen Muy Grande

Si la imagen base64 supera los límites de API Gateway (10MB), el request fallará.

**Solución:**

- Comprimir imágenes antes de enviar
- Usar formatos eficientes como WebP
- Redimensionar imágenes en el frontend

### Error: Formato No Soportado

Si se envía un formato no reconocido, se usará `image/jpeg` como fallback.

**Ejemplo:**

```json
{
  "base64": "{{BASE64_DATA}}",
  "fileName": "archivo.xyz" // Extensión desconocida
}
```

Se guardará con Content-Type: `image/jpeg`

---

## 📊 Límites y Consideraciones

| Límite                       | Valor       | Notas                                    |
| ---------------------------- | ----------- | ---------------------------------------- |
| Tamaño máximo por imagen     | ~6MB base64 | API Gateway tiene límite de 10MB total   |
| Número de imágenes por venue | Ilimitado   | Pero considerar tiempo de upload         |
| Formatos soportados          | 8 formatos  | jpg, png, gif, webp, svg, bmp, tiff, ico |
| Región S3                    | us-east-1   | Mismo que DynamoDB                       |
| ACL                          | public-read | Imágenes accesibles públicamente         |

---

## 🔐 Seguridad

1. **Validación de Formato:** El sistema valida que la extensión del archivo esté en la lista de formatos permitidos
2. **URLs Públicas:** Las imágenes son públicas por defecto (ACL: public-read)
3. **Metadatos:** Se guardan metadatos para rastrear origen y fecha de upload
4. **Organización:** Cada venue tiene su propia carpeta en S3

---

## 🔄 Actualización de Imágenes

Para actualizar las imágenes de un venue, usa el endpoint `PUT /venues/{venueId}`:

```json
{
  "images": [
    {
      "base64": "{{NUEVA_IMAGEN_BASE64}}",
      "fileName": "nueva-imagen.jpg"
    }
  ]
}
```

**Nota:** Esto NO elimina las imágenes antiguas del S3, solo actualiza las referencias en DynamoDB.

---

## 📱 Ejemplo Completo: React Native

```javascript
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

async function uploadVenueWithImage() {
  // Seleccionar imagen
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    base64: true,
  });

  if (!result.canceled) {
    const image = result.assets[0];

    // Preparar request
    const venueData = {
      name: "Estadio desde App",
      ownerUserId: "user_mobile_123",
      latitude: 4.6536,
      longitude: -74.0574,
      capacity: 15000,
      images: [
        {
          base64: image.base64,
          fileName: image.fileName || "venue-image.jpg",
        },
      ],
      floors: [
        {
          name: "Planta Principal",
          categories: [],
        },
      ],
    };

    // Enviar al API
    const response = await fetch("https://api.example.com/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(venueData),
    });

    const data = await response.json();
    console.log("Venue creado:", data);
  }
}
```

---

## 🔄 Actualizar Venue con Imágenes

### Método 1: Actualizar con Array de Imágenes

**Endpoint:** `PUT /venues/{venueId}`

```json
{
  "name": "Estadio Nacional Renovado",
  "capacity": 60000,
  "images": [
    {
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAY...",
      "fileName": "estadio-renovado-2026.jpg"
    },
    {
      "base64": "R0lGODlhAQABAIAAAP///wAAACH5BAE...",
      "fileName": "nueva-tribuna.png"
    }
  ]
}
```

**Nota:** Las nuevas imágenes se **agregan** a las existentes. Si quieres reemplazar todas, envía el campo `images` como string de URLs.

### Método 2: Actualizar con Imagen Única

**Endpoint:** `PUT /venues/{venueId}`

```json
{
  "name": "Teatro Municipal Modernizado",
  "capacity": 1200,
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD..."
}
```

### Método 3: Reemplazar Todas las Imágenes

Si envías el campo `images` como string (URLs separadas por comas), reemplazará todas las existentes:

```json
{
  "name": "Arena Multiusos",
  "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_123/new_img_001.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_123/new_img_002.png"
}
```

### Método 4: Agregar Imagen sin Modificar Otros Campos

**Endpoint:** `POST /venues/{venueId}/images` (Endpoint específico)

```json
{
  "base64": "/9j/4AAQSkZJRgABAQEAYABgAAD...",
  "fileName": "imagen-adicional.jpg"
}
```

**Response:**

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-123.jpg",
  "venueId": "venue_abc123"
}
```

---

## ✅ Checklist de Implementación

- [x] Bucket S3 creado (`doevent-venue-images`)
- [x] Permisos IAM configurados
- [x] Handler CREATE soporta array de imágenes
- [x] Handler CREATE soporta imagen única con Data URI
- [x] Handler CREATE soporta imagen única sin Data URI
- [x] Handler UPDATE soporta array de imágenes
- [x] Handler UPDATE soporta imagen única (imageBase64)
- [x] Handler UPDATE agrega nuevas imágenes a las existentes
- [x] 8 formatos de imagen soportados
- [x] Metadatos guardados en S3
- [x] URLs públicas generadas
- [x] GetVenue devuelve `imageUrls` y `mainImage`
- [x] ListVenues devuelve `imageUrls` y `mainImage`
- [x] CORS configurado

---

## 🎯 Mejores Prácticas

1. **Comprimir antes de enviar:** Usar herramientas como Sharp o TinyPNG
2. **Usar WebP cuando sea posible:** Mejor compresión que JPG/PNG
3. **Mantener aspect ratio:** Redimensionar manteniendo proporciones
4. **Imágenes responsivas:** Subir diferentes tamaños si es necesario
5. **Nombres descriptivos:** Usar nombres de archivo significativos
6. **Validar en frontend:** Verificar tamaño y formato antes de enviar
