# Resumen de Cambios - ManageEvents v2.0.0

**Fecha:** Diciembre 2025  
**Servicio:** aws-lambda-manageevent  
**Estado:** ✅ Desplegado en AWS

---

## 📋 Cambios Realizados

### 1. Campos Eliminados del Modelo de Eventos

Los siguientes campos fueron **completamente removidos** de la tabla `Eventos`:

#### ❌ `ubicacion` (Objeto completo)

- **Antes:** `{ latitude, longitude, timezone, address }`
- **Ahora:** Usar campos individuales existentes: `pais`, `ciudad`, `departamento`, `direccion`, `timezone`
- **Razón:** Simplificación del modelo. Geolocalización precisa no es necesaria actualmente.

#### ❌ `tags` (Array)

- **Antes:** `tags: ["tag1", "tag2"]`
- **Ahora:** Usar campo `Hashtags` que ya existía
- **Razón:** Duplicación innecesaria de funcionalidad.

#### ❌ `media` (Objeto)

- **Antes:** `{ images: [], videos: [] }`
- **Ahora:**
  - Imágenes: Tabla `imagenes` con GSI `eventIdIndex`
  - Video: Campo `video` (string único)
- **Razón:** Imágenes ya tienen tabla dedicada. No duplicar información.

#### ❌ `entranceData` (Objeto)

- **Antes:** `{ types: [{ name, price, quantity }] }`
- **Ahora:** **Crear tabla y lambda independiente**
- **Tablas relacionadas:** `Tickets`, `TicketsDistribution`
- **Endpoint deprecado:** `GET /getEventsEntrance/{id}` → retorna `410 Gone`
- **Razón:** Lógica compleja que merece microservicio independiente.

---

### 2. Campos Ahora Opcionales

Los siguientes campos que antes eran **obligatorios** ahora son **opcionales**:

#### ✅ `faq` (Opcional)

- **Tipo:** `Array<{ question: string, answer: string }>`
- **Uso:** Incluir solo si el evento tiene preguntas frecuentes
- **Ejemplo:**

```json
{
  "faq": [
    {
      "question": "¿Hay parqueadero?",
      "answer": "Sí, disponible"
    }
  ]
}
```

#### ✅ `policies` (Opcional)

- **Tipo:** `Array<{ title: string, description: string }>`
- **Uso:** Incluir solo si el evento tiene políticas específicas
- **Ejemplo:**

```json
{
  "policies": [
    {
      "title": "Política de reembolso",
      "description": "Reembolso 100% hasta 7 días antes"
    }
  ]
}
```

---

### 3. Archivos Modificados

#### ✅ `src/createEvent.js`

- Removido destructuring de: `ubicacion`, `tags`, `media`, `entranceData`
- Agregado destructuring de: `faq`, `policies` (opcionales)
- Actualizado objeto `newEvent` para incluir `faq` y `policies` solo si existen
- Removida lógica de extracción de timezone desde `ubicacion`

#### ✅ `src/updateEvent.js`

- Removido de `DatosActualizar`: `ubicacion`, `tags`, `media`, `entranceData`
- Agregado a `DatosActualizar`: `faq`, `policies` (opcionales)

#### ✅ `src/getEventsByFilter.js`

- Removida función `haversineDistance` (cálculo de distancia geográfica)
- Removidos parámetros: `latitude`, `longitude`, `distanciaMax`
- Removida lógica de filtrado por distancia geográfica
- Simplificado ordenamiento: solo por `fechaIni`

#### ✅ `src/getEventEntrances.js`

- Endpoint completamente deprecado
- Retorna `410 Gone` con mensaje de error
- Mensaje: "Este endpoint está deprecado. Las entradas del evento ahora se manejan en una lambda independiente."

#### ✅ `MANAGEEVENTS_API.md`

- Documentación completa actualizada
- Sección de campos opcionales con `faq` y `policies`
- Sección de campos eliminados claramente marcada
- Ejemplos de request/response actualizados
- Tabla resumen de todos los endpoints disponibles
- Base URL actualizada: `https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`

---

## 🚀 Despliegue

### Estado

✅ **Desplegado exitosamente en AWS**

### Información del Deploy

- **Fecha:** Diciembre 1, 2025
- **Stack:** `aws-lambda-manageevent-dev`
- **Región:** `us-east-1`
- **Duración:** 250 segundos

### Funciones Desplegadas

- ✅ 21 funciones Lambda actualizadas
- ✅ 21 endpoints HTTP API configurados
- ✅ Tamaño de cada función: ~20 MB

---

## 📊 Endpoints Disponibles

### Base URL

`https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com`

### Endpoints Activos (21)

1. `POST /createEvent` - Crear evento
2. `GET /getEvents/{id}` - Obtener evento por ID
3. `GET /events/slug/{slug}` - Obtener evento por slug
4. `GET /getUserEvents/{userId}` - Eventos de usuario
5. `GET /getUserEventsStats/{userId}` - Estadísticas de eventos
6. `PUT /updateEvent/{id}` - Actualizar evento
7. `POST /addEventData` - Agregar datos al evento
8. `POST /publishEvent` - Publicar evento
9. `POST /eventLike` - Marcar/desmarcar favorito
10. `GET /getFavoriteUserEvents/{userId}` - Eventos favoritos
11. `POST /getEventsByFilter` - Filtrar eventos
12. `DELETE /deleteEvent/{id}` - Eliminar evento
13. `POST /duplicateEvent/{id}` - Duplicar evento
14. `POST /events/{eventId}/calification` - Agregar calificación
15. `GET /events/{eventId}/califications` - Obtener calificaciones
16. `POST /rescheduleEvent` - Reprogramar evento
17. `POST /cancelEvent` - Cancelar evento
18. `GET /ordersList/{userId}` - Lista de órdenes
19. `POST /canRequestRefund/{eventId}` - Validar reembolso
20. `GET /events/venue/{venueId}` - Eventos por venue
21. `GET /getEventsEntrance/{id}` - ⚠️ **DEPRECADO** (410 Gone)

---

## 🔄 Migración para Clientes API

### Cambios Requeridos en Clientes

#### 1. Remover campos eliminados de requests

**Antes:**

```json
{
  "nombre": "Mi Evento",
  "ubicacion": {
    "latitude": 4.6097,
    "longitude": -74.0817,
    "timezone": "America/Bogota"
  },
  "tags": ["música", "rock"],
  "media": {
    "images": ["url1"],
    "videos": ["url2"]
  },
  "entranceData": {
    "types": [...]
  }
}
```

**Ahora:**

```json
{
  "nombre": "Mi Evento",
  "pais": "Colombia",
  "ciudad": "Bogotá",
  "departamento": "Cundinamarca",
  "direccion": "Calle 100 #15-20",
  "timezone": "America/Bogota",
  "Hashtags": ["música", "rock"],
  "video": "https://youtube.com/watch?v=xxx"
}
```

#### 2. FAQ y Policies ahora opcionales

**Antes (Obligatorio):**

```json
{
  "faq": [...],
  "policies": [...]
}
```

**Ahora (Opcional):**

```json
{
  // Incluir solo si es necesario
  "faq": [...],
  "policies": [...]
}
```

#### 3. Filtros de geolocalización removidos

**Antes:**

```json
{
  "latitude": 4.6097,
  "longitude": -74.0817,
  "distanciaMax": 10
}
```

**Ahora:**

```json
{
  // Filtrar solo por categorías, tipos, fechas
  "categorias": [5, 8],
  "tiposEvento": ["1", "3"],
  "fechaIni": "01/05/2025"
}
```

#### 4. Endpoint de entradas deprecado

**Antes:**

```
GET /getEventsEntrance/{id}
```

**Ahora:**

- Endpoint retorna `410 Gone`
- **Acción requerida:** Crear/migrar a nueva lambda de entradas independiente
- Consultar tablas `Tickets` y `TicketsDistribution` directamente

---

## ✅ Validaciones Realizadas

- ✅ Compilación exitosa sin errores
- ✅ Deploy exitoso en AWS
- ✅ 21 endpoints funcionando
- ✅ Documentación actualizada
- ✅ Estructura de datos validada
- ✅ Retrocompatibilidad con campos opcionales

---

## ⚠️ Notas Importantes

### Para Desarrolladores Frontend

1. **FAQ y Policies:** Ahora pueden omitirse. Validar en UI si el campo existe antes de renderizar.

2. **Ubicación:** No más `latitude/longitude` en el objeto de evento. Usar campos individuales.

3. **Imágenes:** No vienen en el objeto del evento. Hacer request separado a tabla `imagenes`.

4. **Entradas:** Endpoint `/getEventsEntrance/{id}` está deprecado. Planear migración.

### Para Nuevos Desarrolladores

5. **Lambda de Entradas:** Se debe crear una lambda independiente para gestionar:

   - Tabla `Tickets` (GSI: `eventIdIndex`)
   - Tabla `TicketsDistribution` (GSI: `eventIdIndex`)
   - Lógica de inventario y distribución

6. **Geolocalización:** Si se necesita en el futuro, considerar tabla `EventLocations` independiente.

---

## 📚 Documentación Actualizada

### Archivo Principal

`MANAGEEVENTS_API.md` - Documentación completa con:

- ✅ Estructura de datos actualizada
- ✅ Todos los endpoints documentados
- ✅ Request/Response examples
- ✅ Campos eliminados claramente marcados
- ✅ Campos opcionales documentados
- ✅ Tabla resumen de endpoints
- ✅ Guías de migración

---

## 🎯 Próximos Pasos Recomendados

1. **Crear Lambda de Entradas Independiente**

   - Tabla dedicada o usar `Tickets`/`TicketsDistribution`
   - Endpoints CRUD para entradas
   - Lógica de inventario y ventas

2. **Considerar Tabla EventFAQ (Opcional)**

   - Si muchos eventos necesitan FAQ extenso
   - Relación `eventId` → `faqs[]`

3. **Considerar Tabla EventPolicies (Opcional)**

   - Si políticas varían por evento
   - Relación `eventId` → `policies[]`

4. **Actualizar Clientes Frontend/Mobile**
   - Remover referencias a campos eliminados
   - Adaptar a campos opcionales
   - Migrar lógica de entradas

---

## 📞 Contacto

Para dudas sobre estos cambios, contactar al equipo de backend de DoEvents.

**Última actualización:** Diciembre 1, 2025
