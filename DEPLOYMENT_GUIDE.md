# DoEvents Serverless Deployment Guide

## Problemas resueltos en esta versión:

1. **Eliminación de dependencias circulares**: aws-global-websocket-gateway ya no usa rutas relativas
2. **Handlers independientes**: Cada servicio puede desplegarse independientemente
3. **Configuración por stages**: Soporte para dev, staging, production
4. **Variables de entorno**: Configuración flexible para diferentes ambientes

## Arquitectura de despliegue:

### 1. aws-lambda-notifications

- **Service**: notifications
- **Stage**: dev, staging, prod
- **Functions**: APIs REST + WebSocket handlers
- **Dependencies**: DynamoDB, SES, SNS, Firebase

### 2. aws-lambda-chats

- **Service**: chat-room-events
- **Stage**: dev, staging, prod
- **Functions**: APIs REST + WebSocket handlers
- **Dependencies**: DynamoDB, S3, Firebase

### 3. aws-global-websocket-gateway

- **Service**: global-websocket-gateway
- **Stage**: dev, staging, prod
- **Functions**: WebSocket gateway + Lambda invokers
- **Dependencies**: Invoca functions de los otros servicios

## Orden de despliegue:

### Paso 1: Desplegar notifications

```bash
cd aws-lambda-notifications
npm install
serverless deploy --stage dev
```

### Paso 2: Desplegar chats

```bash
cd aws-lambda-chats
npm install
serverless deploy --stage dev
```

### Paso 3: Desplegar gateway

```bash
cd aws-global-websocket-gateway
npm install
serverless deploy --stage dev
```

## Variables de entorno por servicio:

### Local (.env files):

- `WS_API_ENDPOINT=http://localhost:3010` (para desarrollo local)

### Production (serverless.yml):

- `STAGE=dev|staging|prod`
- `AWS_REGION=us-east-1`

## Testing endpoints:

Después del despliegue, obtendrás URLs como:

- WebSocket: `wss://xxxxx.execute-api.us-east-1.amazonaws.com/dev`
- REST API notifications: `https://xxxxx.execute-api.us-east-1.amazonaws.com/dev`
- REST API chats: `https://xxxxx.execute-api.us-east-1.amazonaws.com/dev`

## Configuración local vs producción:

### Local:

- Usa rutas relativas (funciona con serverless offline)
- Servicios en diferentes puertos (3010, 3020, 3030)

### Producción:

- Gateway invoca Lambda functions remotas
- Cada servicio tiene su propio API Gateway endpoint
- Variables de entorno configuran nombres de funciones

## Próximos pasos:

1. Resolver problema con npm/Node.js
2. Instalar serverless framework
3. Configurar AWS credentials
4. Ejecutar despliegues en orden
5. Actualizar .env files con URLs de producción
6. Testing integral
