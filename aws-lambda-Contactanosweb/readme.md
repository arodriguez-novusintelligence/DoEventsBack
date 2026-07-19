<!--
title: 'AWS Lambda ContactanosWeb - NodeJS'
description: 'API REST para gestión de contactos web usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda ContactanosWeb - NodeJS

Este proyecto implementa una API REST para la gestión de solicitudes de contacto web utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para crear y consultar solicitudes de contacto, y documentación Swagger para facilitar la integración.

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
  `doc/swagger-contact-us-web.yml`

Puedes visualizar la documentación en [Swagger Editor Online](https://editor.swagger.io/) cargando el archivo mencionado.

#### Servir Swagger Docs localmente

Este es el link de la documentacion swagger para visualizarla " [swagger](https://pu63z778i4.execute-api.us-east-1.amazonaws.com/dev/doc) "

Si deseas servir la documentación localmente, puedes usar el siguiente script:

```js
// src/swaggerDocs.js
const fs = require('fs');
const path = require('path');

exports.swaggerDocs = async (event) => {
  try {
    const requestPath = (event.rawPath || event.path || '').toLowerCase();

    // Si piden el YAML
    if (requestPath.endsWith('/doc/swagger-contact-us-web.yml')) {
      const yamlPath = path.join(__dirname, '../doc/swagger-contact-us-web.yml');
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

    // HTML con detección de stage en el cliente
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Contact Us Web API Docs</title>
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
              url: window.location.origin + stage + '/doc/swagger-contact-us-web.yml',
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
- `CONTACTS_TABLE_NAME` — Nombre de la tabla de contactos en DynamoDB.
- `REGION` — Región de AWS.
- `STAGE` — Entorno de despliegue (dev, prod, etc).

Ejemplo en `serverless.yml`:
```yaml
environment:
    TABLE_NAME = process.env.TABLE_NAME;
    YOUR_EMAIL = process.env.SOURCE_EMAIL;
```

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de contacto web.

https://www.planttext.com?text=bL9DJy904BqtwN-OS2e70Z6UI31y50bH0n6Lyz0EoPhkRhFTelmSZnuy-HFuOywsfJGr7kobExDltinxE-FCeh6vJ7mF8wiDF6Sv6g5zB-MyY4IAoaBdrcXbISKGJDAqlwLTjmEOmJdTGa_MIrYWfJSy5Z2E5ziMvXxbBiOXH8OO6J4FHWMul6YXmwD2gSCf11esyqtPFPpwdk-DHZ1NXzENXfXWhutC4oV0HIMhrJ0Q-Lub37etzTX3c6cP9cGHZa2E11iClbUhvff2mn3MgyqJz2jY258y9XhZhkyLzmvu5hPK1nqnNwuYSVfMLRvPKio-DZgY3AKWnODIZNCZLyS6wGicWZCnMftnYoKMGdU4m-c3BrmE-BlKXTCXB5WtHxKPWJvh9OaYwPOrx6slqMYcrLuOYSNiRTRAYqVAqfnuWU1gC83LNGchZRYu_E1G1a6Iol2LtDESFj-5POifoQZI8DHVAdxrk-P-SsEq-KzBAWkATVMzCVzvxNy0


![Diagrama de Secuencia](https://www.planttext.com/plantuml/png/bL9DJy904BqtwN-OS2e70Z6UI31y50bH0n6Lyz0EoPhkRhFTelmSZnuy-HFuOywsfJGr7kobExDltinxE-FCeh6vJ7mF8wiDF6Sv6g5zB-MyY4IAoaBdrcXbISKGJDAqlwLTjmEOmJdTGa_MIrYWfJSy5Z2E5ziMvXxbBiOXH8OO6J4FHWMul6YXmwD2gSCf11esyqtPFPpwdk-DHZ1NXzENXfXWhutC4oV0HIMhrJ0Q-Lub37etzTX3c6cP9cGHZa2E11iClbUhvff2mn3MgyqJz2jY258y9XhZhkyLzmvu5hPK1nqnNwuYSVfMLRvPKio-DZgY3AKWnODIZNCZLyS6wGicWZCnMftnYoKMGdU4m-c3BrmE-BlKXTCXB5WtHxKPWJvh9OaYwPOrx6slqMYcrLuOYSNiRTRAYqVAqfnuWU1gC83LNGchZRYu_E1G1a6Iol2LtDESFj-5POifoQZI8DHVAdxrk-P-SsEq-KzBAWkATVMzCVzvxNy0)

### Script PlantUML

@startuml
actor Usuario
participant "Frontend (App/Web)" as Frontend
participant "API Gateway" as APIGW
participant "Lambda: createcontac" as Lambda
participant "DynamoDB (o SES)" as DB

== Envío de formulario de contacto ==
Usuario -> Frontend: Completa y envía formulario
Frontend -> APIGW: POST /contact (payload)
APIGW -> Lambda: Invoca función Lambda (payload)

== Procesamiento en Lambda ==
Lambda -> Lambda: Valida datos
alt Datos válidos
    Lambda -> DB: Guarda contacto (o envía email)
    DB --> Lambda: Confirmación
    Lambda -> APIGW: Respuesta 200 OK
    APIGW -> Frontend: Muestra mensaje de éxito
else Datos inválidos
    Lambda -> APIGW: Respuesta 400 Error
    APIGW -> Frontend: Muestra mensaje de error
end

@enduml