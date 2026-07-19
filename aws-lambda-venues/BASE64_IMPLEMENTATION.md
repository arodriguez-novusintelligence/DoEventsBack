## ✅ ACTUALIZACIÓN: Sistema de Imágenes con Base64

### 🎯 Cambios Implementados

#### 1. **createVenueHandler.js** - Procesamiento de Imágenes Integrado

- ✅ Ahora procesa array de imágenes en formato base64 durante la creación
- ✅ Sube automáticamente a S3 con ACL público
- ✅ Genera URLs públicas y las almacena en el campo `images`
- ✅ Maneja errores individuales sin interrumpir la creación del venue

**Formato de Request:**

```json
{
  "name": "Mi Venue",
  "ownerUserId": "user-123",
  "isCertified": true,
  "images": [
    {
      "fileName": "imagen1.jpg",
      "base64": "/9j/4AAQSkZJRg..."
    },
    {
      "fileName": "imagen2.png",
      "base64": "iVBORw0KGgo..."
    }
  ]
}
```

**Proceso:**

1. Recibe array de objetos `{ fileName, base64 }`
2. Para cada imagen:
   - Decodifica base64 a Buffer
   - Genera UUID único para el archivo
   - Sube a S3: `venues/{venueId}/{imageId}.{ext}`
   - Crea URL pública: `https://doevent-venue-images.s3.amazonaws.com/...`
3. Almacena todas las URLs separadas por comas en el campo `images`
4. Continúa con la creación del venue incluso si alguna imagen falla

#### 2. **uploadVenueImageHandler.js** - Actualizado para Base64

- ✅ Cambio de campo `imageBase64` → `base64`
- ✅ Consistencia con el formato de createVenue

**Formato de Request:**

```json
{
  "fileName": "nueva-imagen.jpg",
  "base64": "/9j/4AAQSkZJRg..."
}
```

---

### 📝 Formato Estándar de Imágenes

**Todos los endpoints usan el mismo formato:**

```javascript
{
  "fileName": "nombre-archivo.ext",  // Nombre con extensión
  "base64": "string-base64..."       // Imagen codificada en base64
}
```

**Extensiones soportadas:**

- `.jpg` / `.jpeg` → `image/jpeg`
- `.png` → `image/png`
- `.gif` → `image/gif`
- `.webp` → `image/webp`

---

### 🚀 Ejemplos de Uso

#### Crear Venue con Múltiples Imágenes

```bash
POST /venues
Content-Type: application/json

{
  "name": "Estadio Monumental",
  "ownerUserId": "user-123",
  "isCertified": true,
  "city": "Lima",
  "country": "Peru",
  "capacity": 80000,
  "images": [
    {
      "fileName": "vista-principal.jpg",
      "base64": "base64-string-1..."
    },
    {
      "fileName": "vista-aerea.jpg",
      "base64": "base64-string-2..."
    },
    {
      "fileName": "interior.png",
      "base64": "base64-string-3..."
    }
  ],
  "categories": [...]
}
```

**Response:**

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue-abc-123",
    "name": "Estadio Monumental",
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-abc-123/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue-abc-123/img2.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue-abc-123/img3.png",
    "isCertified": true,
    "categoryCount": 1,
    ...
  }
}
```

#### Agregar Imagen Individual

```bash
POST /venues/{venueId}/images
Content-Type: application/json

{
  "fileName": "nueva-foto.jpg",
  "base64": "base64-string..."
}
```

**Response:**

```json
{
  "message": "Image uploaded successfully",
  "imageUrl": "https://doevent-venue-images.s3.amazonaws.com/venues/venue-abc-123/img4.jpg",
  "venueId": "venue-abc-123"
}
```

---

### 🔧 Conversión a Base64

#### JavaScript (Node.js)

```javascript
const fs = require("fs");

function imageToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString("base64");
}

const base64 = imageToBase64("./imagen.jpg");
```

#### JavaScript (Browser)

```javascript
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Quitar el prefix "data:image/...;base64,"
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Usar con input file
const file = document.querySelector('input[type="file"]').files[0];
const base64 = await fileToBase64(file);
```

#### Python

```python
import base64

with open('imagen.jpg', 'rb') as f:
    base64_string = base64.b64encode(f.read()).decode('utf-8')
```

#### Bash

```bash
base64 -w 0 imagen.jpg
```

#### PowerShell

```powershell
$bytes = [System.IO.File]::ReadAllBytes("imagen.jpg")
$base64 = [System.Convert]::ToBase64String($bytes)
```

---

### 📊 Características del Sistema

| Característica     | Detalle                                                         |
| ------------------ | --------------------------------------------------------------- |
| **Formato**        | Base64 string                                                   |
| **Campo archivo**  | `fileName` (con extensión)                                      |
| **Campo datos**    | `base64`                                                        |
| **Bucket**         | `doevent-venue-images`                                          |
| **ACL**            | `public-read`                                                   |
| **URL formato**    | `https://bucket.s3.amazonaws.com/venues/{venueId}/{uuid}.{ext}` |
| **Almacenamiento** | Campo `images` separado por comas                               |
| **Límite tamaño**  | ~10MB (API Gateway)                                             |
| **Extensiones**    | jpg, jpeg, png, gif, webp                                       |

---

### ⚠️ Límites y Recomendaciones

#### Tamaños

- **Límite API Gateway**: 10 MB payload total
- **Cálculo Base64**: Tamaño × 1.37
- **Recomendación**: Imágenes < 5 MB cada una

#### Ejemplo

```
Imagen original: 2 MB
Base64: ~2.74 MB
JSON total: ~2.8 MB ✅
```

#### Múltiples Imágenes

```
3 imágenes × 2 MB = 6 MB originales
Base64: ~8.2 MB
JSON total: ~8.5 MB ✅
```

#### Mejores Prácticas

1. ✅ Comprimir imágenes antes de codificar
2. ✅ Usar JPEG para fotos (mejor compresión)
3. ✅ Usar PNG solo para logos/transparencias
4. ✅ Considerar WebP para mejor calidad/tamaño
5. ✅ Validar tamaño antes de enviar
6. ⚠️ Evitar enviar >5 imágenes en un solo request

---

### 🧪 Testing

Ver archivo completo: **`IMAGES_BASE64_EXAMPLES.md`**

**Test rápido:**

```bash
node test-venue-images.js ruta/a/imagen.jpg
```

Esto generará:

- ✅ Comando para crear venue con imágenes
- ✅ JSON con base64 listo para usar
- ✅ Comandos curl de prueba
- ✅ Ejemplos de consulta

---

### 📚 Archivos Actualizados

```
aws-lambda-venues/
├── src/
│   ├── createVenueHandler.js       ✅ ACTUALIZADO (procesa base64)
│   └── uploadVenueImageHandler.js  ✅ ACTUALIZADO (campo "base64")
├── IMAGES_BASE64_EXAMPLES.md       ✅ NUEVO (guía completa)
├── test-venue-images.js            ✅ ACTUALIZADO (formato base64)
└── IMPLEMENTATION_SUMMARY.md       ✅ ACTUALIZADO
```

---

### 🔄 Flujo Completo

```
1. Cliente → Convierte imagen a base64
            ↓
2. Request → POST /venues con array images: [{fileName, base64}]
            ↓
3. Lambda  → Procesa cada imagen:
             - Decodifica base64
             - Genera UUID único
             - Sube a S3 con ACL público
             - Crea URL: https://bucket.s3.amazonaws.com/venues/{venueId}/{uuid}.ext
            ↓
4. DynamoDB → Guarda venue con campo images: "url1,url2,url3"
            ↓
5. Response → Retorna venue con URLs públicas
            ↓
6. Cliente  → Usa URLs directamente (sin firma)
```

---

### ✅ Ventajas del Sistema

1. **Una sola operación**: Crear venue + subir imágenes en un request
2. **URLs públicas**: No requiere firma para acceso
3. **Organización**: Imágenes agrupadas por venue
4. **Escalable**: Soporta múltiples imágenes
5. **Fallback**: Si una imagen falla, las demás se procesan
6. **Consistencia**: Mismo formato en todos los endpoints
7. **Simple**: Solo base64 + nombre de archivo

---

### 🎯 Próximos Pasos

1. **Configurar S3**:

   ```powershell
   cd aws-lambda-venues
   .\setup-s3-bucket.ps1
   ```

2. **Desplegar**:

   ```bash
   serverless deploy
   ```

3. **Probar creación con imágenes**:

   ```bash
   node test-venue-images.js test-image.jpg
   ```

4. **Verificar URLs públicas**:
   ```bash
   curl https://doevent-venue-images.s3.amazonaws.com/venues/{venueId}/{imageId}.jpg
   ```

---

### 📖 Documentación Completa

- **Configuración S3**: `S3_BUCKET_SETUP.md`
- **Ejemplos Base64**: `IMAGES_BASE64_EXAMPLES.md`
- **Guía General**: `IMAGES_AND_CERTIFIED.md`
- **Tests**: `test-venue-images.js`

---

¡Sistema de imágenes listo para usar! 🎉
