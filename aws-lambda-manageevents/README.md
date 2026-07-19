# AWS Lambda - Manage Events

Servicio de gestión de eventos para la plataforma DoEvents. Incluye funcionalidades para crear, actualizar, publicar, cancelar y reprogramar eventos, así como gestionar calificaciones, favoritos, validación de reembolsos y **agenda de eventos con FAQ**.

## 📋 Funcionalidades

### Gestión de Eventos

- ✅ Crear eventos
- ✅ Actualizar eventos
- ✅ Publicar eventos
- ✅ Duplicar eventos
- ✅ Eliminar eventos
- ✅ Cancelar eventos
- ✅ Reprogramar eventos
- ✅ Obtener eventos por ID, usuario o filtros
- ✅ Gestionar favoritos (likes)
- ✅ **🆕 Agregar FAQ (Preguntas Frecuentes)**
- ✅ **🆕 Gestionar agenda por días (EventDays)**

### Calificaciones y Estadísticas

- ✅ Agregar calificaciones a eventos
- ✅ Obtener calificaciones de eventos
- ✅ Obtener estadísticas de eventos de usuario

### Órdenes y Entradas

- ✅ Obtener lista de órdenes
- ✅ Obtener información de entradas

### Validación de Reembolsos

- ✅ Validar si un usuario puede solicitar reembolso
- ✅ Políticas configurables por evento (30, 7, 1, 0, N días)
- ✅ Cálculo automático de días faltantes
- ✅ Evaluación caso a caso para eventos especiales

---

## 🚀 Endpoints Principales

| Método | Endpoint                      | Descripción                |
| ------ | ----------------------------- | -------------------------- |
| POST   | `/createEvent`                | Crear nuevo evento         |
| GET    | `/getEvents/{id}`             | Obtener evento por ID      |
| GET    | `/getUserEvents/{userId}`     | Obtener eventos de usuario |
| PUT    | `/updateEvent/{id}`           | Actualizar evento          |
| POST   | `/publishEvent`               | Publicar evento            |
| POST   | `/cancelEvent`                | Cancelar evento            |
| POST   | `/rescheduleEvent`            | Reprogramar evento         |
| POST   | `/canRequestRefund/{eventId}` | Validar reembolso          |

---

## 🆕 Nuevo Servicio: Validación de Reembolsos

### Descripción

Servicio que valida si un usuario puede solicitar reembolso para un evento basándose en políticas de tiempo configurables.

### Endpoint

```
POST /canRequestRefund/{eventId}
```

### Request

```json
{
  "currentDate": "20251101" // Formato YYYYMMDD
}
```

### Response

```json
{
  "success": true,
  "data": {
    "eventId": "...",
    "eventName": "...",
    "eventDate": "20251224",
    "currentDate": "20251101",
    "daysUntilEvent": 53,
    "refundCategory": "30",
    "canRequestRefund": true,
    "requiresManualReview": false,
    "reason": "Puedes solicitar reembolso. Faltan 53 días para el evento (mínimo requerido: 30 días)"
  }
}
```

### Categorías de Reembolso

| Categoría | Descripción                             |
| --------- | --------------------------------------- |
| `30`      | Requiere mínimo 30 días de anticipación |
| `7`       | Requiere mínimo 7 días de anticipación  |
| `1`       | Requiere mínimo 1 día de anticipación   |
| `0`       | Evaluación caso a caso (manual)         |
| `N`       | No permite reembolsos                   |

### Documentación Completa

- 📄 [Documentación detallada](./doc/canRequestRefund-API.md)
- 📄 [Resumen del servicio](./REFUND_SERVICE_SUMMARY.md)
- 📄 [Especificación OpenAPI](./doc/swagger-manageevents.yml)

---

## 🧪 Testing

### Pruebas Locales (sin desplegar)

```bash
node test-canRequestRefund-local.js
```

### Pruebas en AWS Lambda

```bash
node test-canRequestRefund.js
```

### Otras pruebas disponibles

```bash
node test-event-operations.js
node test-reschedule-integration.js
node test-getEventCalifications.js
```

---

## 📦 Deployment

### Deploy a desarrollo

```bash
serverless deploy --stage dev
```

### Deploy a producción

```bash
serverless deploy --stage prod
```

### Verificar logs

```bash
# Todos los logs
serverless logs -f canRequestRefund --stage dev --tail

# O usando AWS CLI
aws logs tail /aws/lambda/aws-lambda-manageevent-dev-canRequestRefund --follow
```

---

## 🛠️ Desarrollo Local

### Ejecutar en modo desarrollo

```bash
serverless dev
```

### Invocar función localmente

```bash
serverless invoke local -f canRequestRefund --data '{"pathParameters":{"eventId":"..."},"body":"{\"currentDate\":\"20251101\"}"}'
```

---

## 📋 Configuración

### Variables de Entorno

```yaml
EVENTS_TABLE: Eventos
ORDERS_TABLE: Orders
IMAGE_TABLE: imagenes
IMAGE_BUCKET: doeventimageeventbucket
AWS_REGION: us-east-1
```

### Permisos IAM Requeridos

- DynamoDB: Read/Write en tablas Eventos, Orders, Tickets, etc.
- S3: Read/Write en buckets de imágenes
- Lambda: Invoke para notificaciones
- CloudWatch: Logs

---

## 📚 Documentación Adicional

### Guías de API
- [Swagger/OpenAPI](./doc/swagger-manageevents.yml)
- [API de Calificaciones](./doc/getEventCalifications-API.md)
- [API de Reembolsos](./doc/canRequestRefund-API.md)
- [Modelo de Datos Actualizado](./MODELO_EVENT_ACTUALIZADO.md)

### **🆕 FAQ y EventDays**
- [Guía Completa: FAQ y EventDays](./FAQ_EVENTDAYS_GUIDE.md) - Guía detallada de uso
- [Resumen de Cambios](./RESUMEN_CAMBIOS_FAQ_EVENTDAYS.md) - Resumen ejecutivo
- [Ejemplos de Requests](./REQUEST_EXAMPLES_FAQ_EVENTDAYS.md) - Ejemplos prácticos
- [Tests: test-faq-eventdays.js](./test-faq-eventdays.js) - Suite de pruebas

---

## 🔧 Tecnologías

- **Runtime**: Node.js 20.x
- **Framework**: Serverless Framework v4
- **AWS Services**: Lambda, API Gateway, DynamoDB, S3
- **SDK**: AWS SDK v3 (@aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb)

---

## 📝 Notas

- La función de validación de reembolsos requiere que los eventos tengan el campo `categoriaReembolso` configurado
- Las fechas deben estar en formato YYYYMMDD (sin separadores)
- Los campos `faq` y `eventDays` son opcionales y soportan estructuras complejas
- Se recomienda configurar CloudWatch Logs con retención de 14 días

---

## 🤝 Contribución

Para agregar nuevas funcionalidades:

1. Crear el archivo en `src/nombreFuncion.js`
2. Agregar el endpoint en `serverless.yml`
3. Documentar en `doc/swagger-manageevents.yml`
4. Crear tests en `test-nombreFuncion.js`

---

## 📞 Soporte

Para reportar problemas o solicitar funcionalidades, contacta al equipo de desarrollo.

---

**Última actualización**: Enero 2026  
**Versión**: 1.0.0
