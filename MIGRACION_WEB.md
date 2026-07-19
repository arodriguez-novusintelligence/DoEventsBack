# Migración Web - Cambios Backend (feature/migracionWEB)

Cambios en DoEventsBack para soportar DoEventsWEB en entorno QA.

## Cambios incluidos

### 1. Utilidad CORS (`shared/cors-web.js`)

Headers CORS para orígenes web:
- `http://localhost:5173` (dev local)
- `https://doeventsapp-pre.com` (QA)
- `https://doeventsapp.com` (prod)

Variable de entorno opcional:
```
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://doeventsapp-pre.com
```

### 2. Lambdas a actualizar (por fase)

| Lambda | Cambio | Prioridad |
|--------|--------|-----------|
| aws-lambda-login | CORS + redirect OAuth web | Alta (Fase 1) |
| aws-lambda-generateotp | CORS | Alta (Fase 1) |
| aws-lambda-createUser | CORS | Alta (Fase 1) |
| aws-lambda-updateUser | CORS | Alta (Fase 1) |
| aws-lambda-getUser | CORS | Alta (Fase 1) |
| aws-lambda-validateAuth | CORS | Alta (Fase 1) |
| aws-lambda-manageevents | CORS | Fase 2 |
| aws-lambda-chats | CORS | Fase 3 |

### 3. Uso en handlers

```javascript
const { withCors, handlePreflight } = require('../../shared/cors-web');

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  // ... lógica existente ...
  return withCors(event, {
    statusCode: 200,
    body: JSON.stringify(result),
  });
};
```

### 4. OAuth redirect URLs (login lambda)

Agregar en serverless.yml / variables de entorno QA:
```
APPLE_CALLBACK_LANDING_URL=https://doeventsapp-pre.com/apple-callback
GOOGLE_OAUTH_REDIRECT_URI=https://doeventsapp-pre.com/auth/callback
```

### 5. Despliegue QA (us-east-2)

Desplegar con stage `qa`:
```bash
cd aws-lambda-login
serverless deploy --stage qa --region us-east-2
```

Tablas DynamoDB: sufijo `-qa` (ej: `Client-qa`)
Lambdas: prefijo `qa-` (ej: `qa-aws-lambda-login`)

## API Gateway

El dominio `api-qa.doeventsapp.com` debe enrutar a las lambdas QA.
Verificar CORS a nivel API Gateway si las lambdas no lo manejan.
