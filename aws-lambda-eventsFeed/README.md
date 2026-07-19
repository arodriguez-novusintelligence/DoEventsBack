<!--
title: 'AWS Lambda eventsFeed - NodeJS'
description: 'API REST para gestión de eventos usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda eventsFeed - NodeJS

Este proyecto implementa una API REST para la gestión de eventos utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para crear, consultar, actualizar y obtener eventos por usuario, así como documentación Swagger para facilitar la integración.

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
  `doc/swagger-events-feed.yml`

Puedes visualizar la documentación en [Swagger Editor Online](https://editor.swagger.io/) cargando el archivo mencionado.

#### Servir Swagger Docs localmente

Este es el link de la documentación swagger para visualizarlo: "[swagger](https://zppjl1rbw9.execute-api.us-east-1.amazonaws.com/dev/doc)"

Si deseas servir la documentación localmente, puedes usar el siguiente script:

```js
// src/swaggerDocs.js
const fs = require('fs');
const path = require('path');

exports.swaggerDocs = async (event) => {
  try {
    const requestPath = (event.rawPath || event.path || '').toLowerCase();

    if (requestPath.endsWith('/doc/swagger-events-feed.yml')) {
      const yamlPath = path.join(__dirname, '../doc/swagger-events-feed.yml');
      const yaml = fs.readFileSync(yamlPath, 'utf8');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/yaml',
          'Access-Control-Allow-Origin': '*'
        },
        body: yaml
      };
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Events Feed API Docs</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
        <script>
          (function() {
            var pathParts = window.location.pathname.split('/');
            var stage = (pathParts.length > 1 && pathParts[1] && pathParts[1] !== 'doc') 
              ? '/' + pathParts[1] 
              : '';
            SwaggerUIBundle({
              url: window.location.origin + stage + '/doc/swagger-events-feed.yml',
              dom_id: '#swagger-ui'
            });
          })();
        </script>
      </body>
      </html>
    `;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*'
      },
      body: html
    };
  } catch (err) {
    console.error('Error sirviendo Swagger UI', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
```

---

## Variables de entorno

El proyecto utiliza variables de entorno para parametrizar recursos y configuraciones.  
Asegúrate de definirlas en tu entorno o en el archivo `serverless.yml`.

**Variables comunes:**
- `EVENTS_FEED_TABLE_NAME` — Nombre de la tabla de eventos en DynamoDB.
- `REGION` — Región de AWS.
- `STAGE` — Entorno de despliegue (dev, prod, etc).

Ejemplo en `serverless.yml`:
```yaml
environment:
  EVENTS_FEED_TABLE_NAME: ${env:EVENTS_FEED_TABLE_NAME}
  REGION: ${env:AWS_REGION}
  STAGE: ${env:STAGE}
```

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de eventos.

// https://www.planttext.com?text=bPA_Ri8m4CRtI7c74nCC25HrYfIgX012RGNgF-OZEIHNiHtP3ctwDXqxTEeZy6ArJGY8gaEp93x_lhllBdUj3IfJyI8CC3DImPEkK34P1c5GsXkMiHA5WSvKIM58vD0TbULWHUjU1r338Nn6ZvPpcA6XLwmzPi-prHbpYtoTOmIq9M7qb2Ztw3vyngQrG2xJn1Dfujp5CKp4TlSb8QTz3Wbn70PD0z2_Qir5C9QyBCWWr41EXB2HYbU59rjz6BHTMhNt7C5oyV080m_qDzOaT4ki2ubvBmmyujX3BtEnbPbDNecCxRv54p-LUEDB9JFIo9btJItd_3UV9qcViM0sagEHsYN0ma3g3h3TVTWh5mNx79Lf4i7CZY77WVshbTM_OzkZGzC4-YSLnb9icEBeJPydQ-PmJxgioAuBN0o7iBZPO-q4ZhE-SvH2u2Gqlf0Rx-xpZRdIL6Xgh3Fnb_bVzIvjlObIKlsd9Eq5VZN3uDg-xPB_0000

![Diagrama de Secuencia](https://www.planttext.com/plantuml/png/bPA_Ri8m4CRtI7c74nCC25HrYfIgX012RGNgF-OZEIHNiHtP3ctwDXqxTEeZy6ArJGY8gaEp93x_lhllBdUj3IfJyI8CC3DImPEkK34P1c5GsXkMiHA5WSvKIM58vD0TbULWHUjU1r338Nn6ZvPpcA6XLwmzPi-prHbpYtoTOmIq9M7qb2Ztw3vyngQrG2xJn1Dfujp5CKp4TlSb8QTz3Wbn70PD0z2_Qir5C9QyBCWWr41EXB2HYbU59rjz6BHTMhNt7C5oyV080m_qDzOaT4ki2ubvBmmyujX3BtEnbPbDNecCxRv54p-LUEDB9JFIo9btJItd_3UV9qcViM0sagEHsYN0ma3g3h3TVTWh5mNx79Lf4i7CZY77WVshbTM_OzkZGzC4-YSLnb9icEBeJPydQ-PmJxgioAuBN0o7iBZPO-q4ZhE-SvH2u2Gqlf0Rx-xpZRdIL6Xgh3Fnb_bVzIvjlObIKlsd9Eq5VZN3uDg-xPB_0000)

### Script PlantUML

@startuml
actor Usuario

participant "Frontend (App/Web)" as Frontend
participant "API Gateway" as APIGW
participant "Lambda: eventsFeed" as Lambda
participant "DynamoDB" as DB

== Envío de evento ==
Usuario -> Frontend: Completa y envía formulario de evento
Frontend -> APIGW: POST /event-feed (payload)
APIGW -> Lambda: Invoca función Lambda (payload)

== Procesamiento en Lambda ==
Lambda -> Lambda: Valida datos

alt Datos válidos
    Lambda -> DB: Guarda/actualiza evento
    DB --> Lambda: Confirmación
    Lambda -> APIGW: Respuesta 200 OK
    APIGW -> Frontend: Muestra mensaje de éxito
else Datos inválidos
    Lambda -> APIGW: Respuesta 400 Error
    APIGW -> Frontend: Muestra mensaje de error
end

@enduml