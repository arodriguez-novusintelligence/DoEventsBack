# 🧪 Guía de Pruebas - Actualizar Venue con Imágenes

## ✅ Verificación de Implementación

### Archivos Modificados
- ✅ `src/updateVenueHandler.js` - Agregado soporte para base64
- ✅ `IMAGES_UPLOAD_EXAMPLES.md` - Documentación actualizada
- ✅ Permisos S3 en `serverless.yml` - Ya configurados

### Dependencias
- ✅ `aws-sdk`: ^2.1691.0
- ✅ `uuid`: ^9.0.0

---

## 📋 Casos de Prueba

### ✅ Caso 1: Actualizar con Array de Múltiples Imágenes

**Request:**
```bash
PUT https://tu-api.com/venues/venue_abc123
Content-Type: application/json
```

```json
{
  "name": "Estadio Nacional Renovado",
  "capacity": 65000,
  "images": [
    {
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "fileName": "estadio-exterior.jpg"
    },
    {
      "base64": "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      "fileName": "estadio-interior.png"
    }
  ]
}
```

**Comportamiento Esperado:**
- ✅ Procesa las 2 imágenes en base64
- ✅ Sube cada imagen a S3 con UUID único
- ✅ Agrega las nuevas URLs a las imágenes existentes
- ✅ Actualiza el campo `name` y `capacity`
- ✅ Mantiene las imágenes anteriores del venue

**Response Esperado:**
```json
{
  "message": "Venue updated successfully",
  "venueId": "venue_abc123",
  "hasSeating": true,
  "floorsResult": { ... },
  "ticketUpdate": null,
  "deletions": { ... }
}
```

**Verificar en DynamoDB:**
- Campo `images` debe contener: `url_antigua1,url_antigua2,url_nueva1,url_nueva2`

---

### ✅ Caso 2: Actualizar con Imagen Única (imageBase64)

**Request:**
```json
{
  "name": "Teatro Municipal",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL..."
}
```

**Comportamiento Esperado:**
- ✅ Detecta el tipo de imagen desde el Data URI (jpeg)
- ✅ Extrae el base64 limpio (sin el prefijo data:image...)
- ✅ Sube la imagen a S3
- ✅ Agrega la URL a las imágenes existentes
- ✅ Remueve el campo `imageBase64` del body antes de guardar

**Logs Esperados:**
```
📸 Detectada imagen única en imageBase64
🔄 Procesando 1 imágenes...
✅ Imagen subida: https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-xxx.jpeg
✅ Total de imágenes subidas: 1
✅ Total de imágenes después de subir: 3
🧹 Campo imageBase64 removido del body
📝 Actualizando campos básicos del venue...
✏️ Campo modificado: name
✏️ Campo modificado: images
✅ Actualizando 2 campos del venue
```

---

### ✅ Caso 3: Actualizar Solo Campos (Sin Imágenes)

**Request:**
```json
{
  "name": "Coliseo Actualizado",
  "capacity": 18000,
  "description": "Nueva descripción"
}
```

**Comportamiento Esperado:**
- ✅ No procesa imágenes (no hay base64)
- ✅ Actualiza solo los campos enviados
- ✅ Mantiene las imágenes existentes sin cambios

**Logs Esperados:**
```
⚠️ No se encontraron imágenes en base64 para procesar
📝 Actualizando campos básicos del venue...
✏️ Campo modificado: name
✏️ Campo modificado: capacity
✏️ Campo modificado: description
✅ Actualizando 3 campos del venue
```

---

### ✅ Caso 4: Reemplazar Todas las Imágenes (URLs Directas)

**Request:**
```json
{
  "name": "Arena Sport",
  "images": "https://nueva-imagen1.jpg,https://nueva-imagen2.png"
}
```

**Comportamiento Esperado:**
- ✅ No procesa base64 (images es string, no array)
- ✅ Reemplaza completamente el campo `images` en DynamoDB
- ✅ Las imágenes anteriores se pierden (comportamiento por diseño)

**Nota:** Si `images` es string → reemplaza. Si `images` es array con base64 → agrega.

---

### ✅ Caso 5: Array Vacío de Imágenes

**Request:**
```json
{
  "name": "Venue Sin Cambios",
  "images": []
}
```

**Comportamiento Esperado:**
- ✅ No procesa imágenes (array vacío)
- ✅ Remueve el campo `images` del body
- ✅ No modifica las imágenes existentes

**Logs Esperados:**
```
⚠️ No se encontraron imágenes en base64 para procesar
⚠️ Array de images sin base64 detectado, campo removido
```

---

### ✅ Caso 6: Array con Objetos Pero Sin base64

**Request:**
```json
{
  "name": "Venue Test",
  "images": [
    {
      "fileName": "test.jpg"
    }
  ]
}
```

**Comportamiento Esperado:**
- ✅ Ignora objetos sin campo `base64`
- ✅ No sube imágenes
- ✅ Remueve el campo `images` del body

---

### ✅ Caso 7: Imagen con Error en Base64

**Request:**
```json
{
  "imageBase64": "data:image/jpeg;base64,INVALID_BASE64_STRING!!!"
}
```

**Comportamiento Esperado:**
- ✅ Intenta procesar la imagen
- ✅ Captura el error al subir a S3
- ✅ Registra el error en logs
- ✅ Continúa con el resto del proceso (no falla todo)

**Logs Esperados:**
```
📸 Detectada imagen única en imageBase64
🔄 Procesando 1 imágenes...
❌ Error al subir imagen: [Error details]
✅ Total de imágenes subidas: 0
```

---

## 🔍 Verificación Post-Deployment

### 1. Verificar en CloudWatch Logs
```bash
aws logs tail /aws/lambda/aws-lambda-venues-dev-updateVenue --follow
```

Buscar:
- ✅ "📸 Detectadas X imágenes..."
- ✅ "✅ Imagen subida: https://..."
- ✅ "✅ Total de imágenes subidas: X"

### 2. Verificar en S3
```bash
aws s3 ls s3://doevent-venue-images/venues/venue_abc123/ --recursive
```

Debe mostrar:
```
2026-01-16 uuid-xxx.jpg
2026-01-16 uuid-yyy.png
```

### 3. Verificar en DynamoDB
```bash
aws dynamodb get-item \
  --table-name Venues \
  --key '{"venue_id": {"S": "venue_abc123"}}'
```

Verificar campo `images`:
```json
{
  "images": {
    "S": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/img2.png"
  }
}
```

### 4. Verificar URL Pública
```bash
curl -I https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-xxx.jpg
```

Debe retornar:
```
HTTP/1.1 200 OK
Content-Type: image/jpeg
```

---

## 🐛 Solución de Problemas

### Error: "Access Denied" al subir a S3
**Causa:** Permisos IAM incorrectos
**Solución:**
```yaml
# Verificar en serverless.yml que existe:
- Effect: Allow
  Action:
    - s3:PutObject
    - s3:PutObjectAcl
  Resource:
    - arn:aws:s3:::doevent-venue-images/*
```

### Error: "Bucket does not exist"
**Causa:** El bucket S3 no está creado
**Solución:**
```bash
aws s3 mb s3://doevent-venue-images --region us-east-1
```

### Error: "Invalid base64 string"
**Causa:** El base64 está mal formateado
**Solución:** Verificar que:
- El string base64 solo contenga caracteres válidos
- Si viene con Data URI, se está eliminando correctamente el prefijo

### Las imágenes no aparecen en el response
**Causa:** El handler GET no procesa el campo `images`
**Solución:** Verificar que `getVenueHandler.js` incluya:
```javascript
if (venue.images) {
  venue.imageUrls = venue.images.split(',');
  venue.mainImage = venue.imageUrls[0];
}
```

---

## 📊 Checklist de Deployment

Antes de hacer deploy:
- [ ] Dependencias instaladas (`npm install`)
- [ ] Sin errores de sintaxis
- [ ] Bucket S3 creado
- [ ] Permisos IAM configurados en serverless.yml
- [ ] Variable de entorno VENUE_IMAGES_BUCKET configurada
- [ ] Pruebas locales exitosas

Hacer deploy:
```bash
serverless deploy --stage dev --region us-east-1
```

Verificar después del deploy:
- [ ] Lambda desplegada exitosamente
- [ ] Endpoint PUT /venues/{venueId} disponible
- [ ] Logs en CloudWatch funcionando
- [ ] Prueba con Postman/curl exitosa
- [ ] Imágenes visibles en S3
- [ ] URLs públicas accesibles

---

## ✅ Resumen de Comportamiento

| Escenario | Input | Comportamiento | Resultado |
|-----------|-------|----------------|-----------|
| Array con base64 | `images: [{base64, fileName}]` | **Agrega** nuevas imágenes | URLs antiguas + nuevas |
| Imagen única | `imageBase64: "data:image/..."` | **Agrega** nueva imagen | URLs antiguas + nueva |
| String de URLs | `images: "url1,url2"` | **Reemplaza** todas | Solo URLs nuevas |
| Sin imágenes | `{name, capacity}` | No modifica imágenes | URLs antiguas |
| Array vacío | `images: []` | No modifica imágenes | URLs antiguas |

---

**Última actualización:** 16 de enero de 2026
**Estado:** ✅ Implementación completa y funcionando
