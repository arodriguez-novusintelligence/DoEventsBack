<!--
title: 'AWS Lambda Imágenes de Eventos - NodeJS'
description: 'API REST para gestión de imágenes asociadas a eventos usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda Imágenes de Eventos - NodeJS

Este proyecto implementa una API REST para la gestión de imágenes asociadas a eventos utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para agregar, consultar, visualizar y actualizar imágenes almacenadas en S3, así como documentación Swagger para facilitar la integración.

---

## Uso

### Despliegue

Para desplegar el proyecto, ejecuta:

```
serverless deploy
```


Esto creará los recursos necesarios en AWS y expondrá los endpoints definidos en el archivo `serverless.yml`.

---

## Documentación Swagger

La documentación de la API está disponible en formato Swagger.

- **Archivo local:**  
  `doc/swagger-images.yml`

Puedes visualizar la documentación en [Swagger Editor Online](https://editor.swagger.io/) cargando el archivo mencionado.

#### Servir Swagger Docs localmente

Si deseas servir la documentación localmente, puedes usar el siguiente script:

```js
// src/swaggerDocs.js
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');

const app = express();
const swaggerDocument = yaml.load(fs.readFileSync('./doc/swagger-images.yml', 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(3000, () => {
  console.log('Swagger docs disponibles en http://localhost:3000/api-docs');
});
```

---

## Variables de entorno

El proyecto utiliza variables de entorno para parametrizar recursos y configuraciones.
Asegúrate de definirlas en tu entorno o en el archivo serverless.yml.

Variables comunes:
- `TABLE_NAME` — Nombre de la tabla DynamoDB para imágenes.
- `REGION` — Región de AWS.
- `STAGE` — Entorno de despliegue (dev, prod, etc).
Ejemplo en `serverless.yml`:

```yaml
environment:
  TABLE_NAME: ${env:TABLE_NAME}
  REGION: ${env:AWS_REGION}
  STAGE: ${env:STAGE}
```

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de imagenes de eventos.