# 🔍 Guía de Depuración: Imágenes en Clonación de Venues

## Problema Reportado
Al clonar un venue con imagen, el campo `images` está vacío en el response.

## Cambios Implementados (23 de enero 2026)

### 1. Logs de Depuración Agregados
Se agregaron logs detallados en `cloneVenueForEventHandler.js` para rastrear el flujo de procesamiento de imágenes:

```
🖼️ Iniciando procesamiento de imágenes...
📦 body.imageBase64: Presente/No presente
📦 body.images: Array con X elementos/No presente
➕ Agregando X imágenes del array
➕ Agregando imageBase64 al procesamiento
✅ Total de imágenes a procesar: X
⬆️ Processing X images...
✅ Image uploaded successfully: https://...
📊 Total de imágenes subidas: X
🔗 URLs generadas: [...]
📝 Venue a guardar - images field: ...
📝 Base venue images: ...
```

### 2. Deployment
- **Fecha:** 23 de enero 2026
- **Duración:** 82 segundos
- **Función:** cloneVenueForEvent actualizada con logs
- **Versión:** Nueva versión desplegada

## Cómo Depurar

### Opción 1: Ver Logs en CloudWatch

1. Ir a AWS CloudWatch Console
2. Navegar a Log Groups → `/aws/lambda/aws-lambda-venues-dev-cloneVenueForEvent`
3. Abrir el último log stream
4. Buscar los emojis de los logs:
   - 🖼️ → Inicio del procesamiento de imágenes
   - ❌ → Error al subir imagen
   - ✅ → Imagen subida exitosamente

### Opción 2: Usar Script de Prueba

```bash
cd aws-lambda-venues
node test-clone-with-image.js
```

Este script:
- Usa una imagen de prueba (1x1 pixel rojo PNG)
- Clona el venue "Teatro Metropolitan"
- Imprime la respuesta completa
- Muestra si la URL de imagen se generó

### Opción 3: Prueba Manual con cURL

```bash
curl -X POST https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/clone-for-event \
  -H "Content-Type: application/json" \
  -d '{
    "baseVenueId": "5f728a8a-299b-4541-9c2f-d22cb143d3ad",
    "eventId": "test-event-123",
    "name": "Teatro Test",
    "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
  }'
```

## Posibles Causas del Problema

### 1. No se está enviando `imageBase64` o `images` en el request
**Verificar:**
```json
{
  "baseVenueId": "...",
  "eventId": "...",
  "imageBase64": "data:image/png;base64,..." // ← Debe estar presente
}
```

O alternativamente:
```json
{
  "baseVenueId": "...",
  "eventId": "...",
  "images": [
    {
      "fileName": "venue.jpg",
      "base64": "/9j/4AAQSkZ..."
    }
  ]
}
```

### 2. El venue base no tiene imágenes
Si no envías imágenes nuevas, se copian del venue base. Si el base también está vacío, el resultado será vacío.

**Solución:** Siempre enviar `imageBase64` al clonar.

### 3. Permisos S3 Incorrectos
La función Lambda necesita permisos de escritura en el bucket `doevent-venue-images`.

**Verificar en serverless.yml:**
```yaml
iamRoleStatements:
  - Effect: Allow
    Action:
      - s3:PutObject
      - s3:PutObjectAcl
    Resource: "arn:aws:s3:::doevent-venue-images/*"
```

### 4. Bucket S3 no existe
El bucket `doevent-venue-images` debe existir en us-east-1.

**Verificar:**
```bash
aws s3 ls s3://doevent-venue-images/ --region us-east-1
```

### 5. Imagen base64 mal formada
La imagen debe estar en formato:
```
data:image/[tipo];base64,[data]
```

O solo el data sin el prefijo:
```
/9j/4AAQSkZJRgABAQEA...
```

## Ejemplo Completo de Request

```json
{
  "baseVenueId": "5f728a8a-299b-4541-9c2f-d22cb143d3ad",
  "eventId": "71640b75-fb19-4895-bb26-72da6f66557e",
  "name": "Teatro Metropolitan - Concierto Rock 2026",
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...",
  "ticketCategories": [
    {
      "id": "cat-vip-1",
      "categoria": "VIP",
      "cantidadTickets": 100,
      "valor": 200000,
      "costo": 70000,
      "moneda": "COP"
    }
  ]
}
```

## Ejemplo de Response Exitoso

```json
{
  "message": "Venue cloned successfully for event",
  "venue": {
    "venueId": "nuevo-venue-id",
    "name": "Teatro Metropolitan - Concierto Rock 2026",
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/nuevo-venue-id/abc-123.jpg",
    "eventId": "71640b75-fb19-4895-bb26-72da6f66557e",
    "baseVenueId": "5f728a8a-299b-4541-9c2f-d22cb143d3ad"
  }
}
```

## Siguiente Paso

**Realiza una nueva clonación con estos logs activados y revisa CloudWatch.**

Los logs te dirán exactamente:
1. Si las imágenes llegan al handler
2. Si se procesan correctamente
3. Si se suben a S3
4. Qué URL se genera
5. Si hay algún error en el proceso

---

**Última actualización:** 23 de enero 2026
**Estado:** Logs de depuración desplegados y listos para usar
