<!--
title: 'AWS Lambda TipoEvento - NodeJS'
description: 'API REST para gestión de tipos de eventos con imágenes firmadas usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda TipoEvento - NodeJS

Este proyecto implementa una API REST para la gestión de tipos de eventos utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para crear, consultar y obtener imágenes firmadas de tipos de eventos, y documentación Swagger para facilitar la integración.

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
  `doc/swagger-event-type.yml`

Puedes visualizar la documentación en [Swagger Editor Online](https://editor.swagger.io/) cargando el archivo mencionado.

#### Servir Swagger Docs localmente

Este es el link de la documentación swagger para visualizarlo: "[swagger](https://oxh8ge1p63.execute-api.us-east-1.amazonaws.com/dev/doc)"

Si deseas servir la documentación localmente, puedes usar el siguiente script:

```js
// src/swaggerDocs.js
const fs = require('fs');
const path = require('path');

exports.swaggerDocs = async (event) => {
  try {
    const requestPath = (event.rawPath || event.path || '').toLowerCase();

    if (requestPath.endsWith('/doc/swagger-event-type.yml')) {
      const yamlPath = path.join(__dirname, '../doc/swagger-event-type.yml');
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
        <title>Event Type API Docs</title>
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
              url: window.location.origin + stage + '/doc/swagger-event-type.yml',
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

## Variables de entorno

El proyecto utiliza variables de entorno para parametrizar recursos y configuraciones.  
Asegúrate de definirlas en tu entorno o en el archivo `serverless.yml`.

**Variables comunes:**
- `TABLE_NAME` — Nombre de la tabla DynamoDB para tipos de eventos.
- `REGION` — Región de AWS.
- `S3` — bucket donde se guardan imagenes.

Ejemplo en `serverless.yml`:
```yaml
environment:
  TABLE_NAME: ${EventType}
  REGION: ${us-east-1}
  STAGE: ${aws-lambda-event-type}
```

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de tipos de eventos

// https://www.planttext.com?text=fLJ1JkCm4Br7oZ-CEC415L6qXqf5qAPKY28GAN2U9WEovDYMxNJfvt3al9_G7zk9auQI0WSuMPvvypnltYHdpgFrPI7Z23ElBTox4gtGSMGuBZ9XK7dOkx1QUL8vx9yRqtkanS4Ue8DDk8C-lxs4ANhwYwi0u_lqiOEPOR78SG1pOVHaIShh0At37MooKbZeP1GGoQYJJViXdlRZQ3Y4iINCnFgVWfp0CtbrKdW0XiCuQlJ1uMdR_G36kZ2IFCAJjaKf0o3J2aI1pwHWWOx-dCHHEmKk3fe6S7kJpg6NyQEUWepvob0SXMm5syYyL4kTCN-fwkOsEkjp6_c0Kd0amy9enwv83mbwxM2vVkLC5NilIli3cB8WljMznb7QXyCjkh5MJy8MzKosIvDHMve7_fnaCwWuIaOVI6wkjYiRwNVaJ4cyFt1yT1GWhUhtoLvN28kmVdiH5J59HuqUeJvJj4D-mkGJQxNzbfzgHDZ5QWkqSgNawjPyzxNxgPQyJ0nka9yQFPsmpwt3heTI_iZcQknjT-s3dNdFXFlG-uxbf8X5tz_D70HtStGxpbVPtzgscLtzCQnVUSE8ISyO5FuP_m40

![Diagrama de Secuencia](https://www.planttext.com/plantuml/png/fLJ1JkCm4Br7oZ-CEC415L6qXqf5qAPKY28GAN2U9WEovDYMxNJfvt3al9_G7zk9auQI0WSuMPvvypnltYHdpgFrPI7Z23ElBTox4gtGSMGuBZ9XK7dOkx1QUL8vx9yRqtkanS4Ue8DDk8C-lxs4ANhwYwi0u_lqiOEPOR78SG1pOVHaIShh0At37MooKbZeP1GGoQYJJViXdlRZQ3Y4iINCnFgVWfp0CtbrKdW0XiCuQlJ1uMdR_G36kZ2IFCAJjaKf0o3J2aI1pwHWWOx-dCHHEmKk3fe6S7kJpg6NyQEUWepvob0SXMm5syYyL4kTCN-fwkOsEkjp6_c0Kd0amy9enwv83mbwxM2vVkLC5NilIli3cB8WljMznb7QXyCjkh5MJy8MzKosIvDHMve7_fnaCwWuIaOVI6wkjYiRwNVaJ4cyFt1yT1GWhUhtoLvN28kmVdiH5J59HuqUeJvJj4D-mkGJQxNzbfzgHDZ5QWkqSgNawjPyzxNxgPQyJ0nka9yQFPsmpwt3heTI_iZcQknjT-s3dNdFXFlG-uxbf8X5tz_D70HtStGxpbVPtzgscLtzCQnVUSE8ISyO5FuP_m40)

### Script PlantUML

@startuml
actor Usuario
participant "Frontend (App/Web)" as Frontend
participant "API Gateway" as APIGW
participant "Lambda: TipoEvento" as Lambda
participant "DynamoDB" as DB
participant "S3" as S3
== Creación de tipo de evento ==
Usuario -> Frontend: Completa formulario con imagen base64
Frontend -> APIGW: POST /createEventType
APIGW -> Lambda: Invoca función Lambda
Lambda -> Lambda: Valida campos
alt Datos válidos
Lambda -> S3: Guarda imagen
S3 --> Lambda: Confirmación
Lambda -> DB: Guarda datos del evento
DB --> Lambda: OK
Lambda -> APIGW: Respuesta 200 OK
APIGW -> Frontend: Muestra éxito
else Datos inválidos
Lambda -> APIGW: Respuesta 400 Error
APIGW -> Frontend: Muestra error
end
== Consulta de eventos ==
Usuario -> Frontend: Solicita eventos
Frontend -> APIGW: GET /EventTypes/all
APIGW -> Lambda: Invoca función Lambda
Lambda -> DB: Consulta eventos
DB --> Lambda: Lista de eventos
Lambda -> S3: Genera URLs firmadas
S3 --> Lambda: URLs
Lambda -> APIGW: Respuesta 200 OK
APIGW -> Frontend: Muestra eventos con imágenes
@enduml
