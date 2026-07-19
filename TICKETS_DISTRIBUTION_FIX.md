# TROUBLESHOOTING: TicketsDistribution no se estaban creando al clonar venues

## Problema Detectado
Al clonar un venue para un evento (usando `cloneVenueForEvent`), las distribuciones de tickets NO se estaban creando en la tabla `TicketsDistribution`, a pesar de que:
- ✅ El venue se clonaba correctamente
- ✅ Las categorías se creaban en `Venue_Category`
- ✅ Los asientos se clonaban en `Venue_Seat`
- ✅ El registro de `Tickets` se creaba con las categorías y sus `distributionId`
- ❌ **PERO** las distribuciones NO se guardaban en `TicketsDistribution`

### Ejemplo del Problema
- **EventId**: `45969122-45ff-4d0f-81c2-e178237e66a2`
- **Venue clonado**: `f89839d3-26d7-4e44-8c67-fa8ed26c445d`
- **TicketId creado**: `7e70b3d2-a`
- **Categorías**: 5 categorías con 540 tickets totales
- **Resultado**: 0 distribuciones en `TicketsDistribution`

## Causa Raíz

El archivo `aws-lambda-venues/serverless.yml` **NO incluía permisos IAM** para la tabla `TicketsDistribution`.

```yaml
# ❌ ANTES (sin permisos para TicketsDistribution)
- arn:aws:dynamodb:${self:provider.region}:*:table/Tickets
- arn:aws:dynamodb:${self:provider.region}:*:table/Tickets/index/*
- arn:aws:dynamodb:${self:provider.region}:*:table/Eventos
- arn:aws:dynamodb:${self:provider.region}:*:table/Eventos/index/*
```

### Por qué falló silenciosamente

El código en `cloneVenueForEventHandler.js` tiene un **try-catch que captura el error** pero NO lo lanza, permitiendo que la clonación del venue continúe:

```javascript
try {
  const distributionsCreated = await generateTicketsDistribution(
    eventId,
    newVenueId,
    ticketId,
    allTicketCategories,
    now,
    seatsMapping,
  );
  console.log(`✅ ${distributionsCreated} distribuciones creadas en TicketsDistribution`);
} catch (distError) {
  console.error("❌ ERROR CRÍTICO en generateTicketsDistribution:", distError);
  // ⚠️ No lanza el error - el venue se crea pero sin distribuciones
  console.error("⚠️ El venue se creó pero las distribuciones fallaron");
}
```

### Error Real de DynamoDB
```
AccessDeniedException: User is not authorized to perform: dynamodb:BatchWriteItem on resource: arn:aws:dynamodb:us-east-1:*:table/TicketsDistribution
```

## Solución Aplicada

### 1. Añadir permisos IAM para TicketsDistribution

**Archivo**: `aws-lambda-venues/serverless.yml`

```yaml
# ✅ DESPUÉS (con permisos para TicketsDistribution)
- arn:aws:dynamodb:${self:provider.region}:*:table/Tickets
- arn:aws:dynamodb:${self:provider.region}:*:table/Tickets/index/*
- arn:aws:dynamodb:${self:provider.region}:*:table/TicketsDistribution
- arn:aws:dynamodb:${self:provider.region}:*:table/TicketsDistribution/index/*
- arn:aws:dynamodb:${self:provider.region}:*:table/Eventos
- arn:aws:dynamodb:${self:provider.region}:*:table/Eventos/index/*
```

### 2. Despliegue del servicio

```bash
cd aws-lambda-venues
serverless deploy
```

**Resultado**: ✅ Service deployed to stack aws-lambda-venues-dev

### 3. Crear distribuciones faltantes manualmente

Para el evento que ya se había creado sin distribuciones, se ejecutó un script de recuperación:

**Script**: `create-missing-distributions.js`

```javascript
// 1. Lee el registro de Tickets existente
// 2. Genera las distribuciones basadas en las categorías
// 3. Guarda en TicketsDistribution usando batchWrite
```

**Resultado**:
```
✅ 5 distribuciones creadas en TicketsDistribution
📊 Total de tickets individuales: 540
```

## Verificación

### Comando para verificar distribuciones

```bash
node check-distributions.js
```

### Resultado esperado

```
📦 Buscando en tabla TicketsDistribution...
✅ Encontradas 5 distribuciones en TicketsDistribution

📝 Distribuciones encontradas:
  1. General (420 tickets)
  2. Palco (30 tickets)
  3. VIP (50 tickets)
  4. VIP (20 tickets)
  5. GENERAL (20 tickets)
```

## Comparación con managetickets

El servicio `aws-lambda-managetickets` que crea tickets directamente (no via venues) **SÍ tiene los permisos correctos** en su `serverless.yml`:

```yaml
# aws-lambda-managetickets/serverless.yml
Resource:
  - arn:aws:dynamodb:us-east-1:519010577666:table/TicketsDistribution
  - arn:aws:dynamodb:us-east-1:519010577666:table/TicketsDistribution/index/*
```

## Lecciones Aprendidas

1. **Permisos IAM son críticos**: Siempre verificar que el servicio Lambda tenga permisos para TODAS las tablas que usa.

2. **Error silencioso**: El try-catch sin re-throw oculta problemas. Considerar:
   - Loggear el error completo (incluyendo stack trace)
   - Devolver un indicador en la respuesta que las distribuciones fallaron
   - O lanzar el error si las distribuciones son críticas

3. **Testing**: Verificar que las distribuciones se crearon después de clonar un venue:
   ```sql
   SELECT * FROM TicketsDistribution WHERE eventId = '<eventId>'
   ```

4. **Estructura de distribuciones**: Comparada con `createTicket.js`, la estructura es correcta:
   ```javascript
   {
     id: distributionId,              // PK
     createDate: createDate,          // SK (clave compuesta)
     ticketId: ticketId,
     eventId: eventId,
     venueId: venueId,
     boletaId: category.id,
     categoryName: category.categoria,
     tickets: [...]                   // Array de ticket instances
   }
   ```

## Scripts de Utilidad Creados

1. **check-distributions.js**: Verifica si existen distribuciones para un evento
2. **scan-tickets.js**: Busca registros en tabla Tickets por eventId
3. **create-missing-distributions.js**: Crea distribuciones faltantes basadas en Tickets existente
4. **test-distribution-structure.js**: Simula la estructura de distribuciones sin escribir a DB

## Próximos Pasos

1. ✅ **Completado**: Añadir permisos para `TicketsDistribution` en `serverless.yml`
2. ✅ **Completado**: Desplegar servicio de venues
3. ✅ **Completado**: Crear distribuciones faltantes para el evento de prueba
4. ⏭️ **Siguiente**: Probar clonación de un nuevo venue y verificar que distribuciones se crean automáticamente
5. ⏭️ **Opcional**: Agregar logging más detallado y/o notificación si la creación de distribuciones falla

## Referencia Rápida

### Tabla TicketsDistribution
- **PK**: `id` (distributionId - UUID)
- **SK**: `createDate` (ISO timestamp)
- **Atributos**: ticketId, eventId, venueId, boletaId, categoryName, tickets[]

### Relaciones
```
Eventos (eventId)
  ├─> Venues (venue_id, eventId)
  │     ├─> Venue_Category (categoryId, venueId, eventId)
  │     └─> Venue_Seat (seatId, categoryId)
  ├─> Tickets (id, eventId)
  │     └─> boleta[] (categories con distributionId)
  └─> TicketsDistribution (id=distributionId, eventId)
        └─> tickets[] (ticket instances individuales)
```

---

**Fecha**: 2026-01-23  
**EventId de prueba**: 45969122-45ff-4d0f-81c2-e178237e66a2  
**Status**: ✅ RESUELTO
