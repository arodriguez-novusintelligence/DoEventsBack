<!--
title: 'AWS Lambda DatosBancarios - NodeJS'
description: 'API REST para gestión de datos bancarios usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda DatosBancarios - NodeJS

Este proyecto implementa una API REST para la gestión de datos bancarios utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para crear, consultar, actualizar y obtener datos bancarios por usuario, así como documentación Swagger para facilitar la integración.

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
  `doc/swagger-bank-details.yml`

Puedes visualizar la documentación en [Swagger Editor Online](https://editor.swagger.io/) cargando el archivo mencionado.

#### Servir Swagger Docs localmente

Este es el link de la documentacion swagger para visualizarlo " [swagger](https://sai5phua09.execute-api.us-east-1.amazonaws.com/dev/doc) "

Si deseas servir la documentación localmente, puedes usar el siguiente script:

```js
// src/swaggerDocs.js
const fs = require('fs');
const path = require('path');

exports.swaggerDocs = async (event) => {
  try {
    const requestPath = (event.rawPath || event.path || '').toLowerCase();

    // Si piden el YAML
    if (requestPath.endsWith('/doc/swagger-bank-details.yml')) {
      const yamlPath = path.join(__dirname, '../doc/swagger-bank-details.yml');
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
        <title>Datos Bancarios API Docs</title>
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
              url: window.location.origin + stage + '/doc/swagger-bank-details.yml',
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
- `BANK_DATA_TABLE_NAME` — Nombre de la tabla de datos bancarios en DynamoDB.
- `REGION` — Región de AWS.
- `STAGE` — Entorno de despliegue (dev, prod, etc).

Ejemplo en `serverless.yml`:
```yaml
environment:
  BANK_DATA_TABLE_NAME: ${env:BANK_DATA_TABLE_NAME}
  REGION: ${env:AWS_REGION}
  STAGE: ${env:STAGE}
```

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de datos bancarios.

// https://www.planttext.com?text=bPBDJi904CVl-nGJJd0W4EEfIGr2aH0r4Byu3-sIh7HtczqjsiVnwC6JZy2BERksK3GUxA7fpFpcup-TaNLeN2bpXgdJ1XvjYKPenWfoYrGKg1nqhenMZgiCkfT5CLZnTQy3QA5ndyANopdCqF4Nh095zcnrYjoWN6SOGMeuWMDKsmGT1lexT8edbKAfat406eEnE8Qfskq_D6GSDjh8ClUpUoj3fosiKQNUOo6EMQqC-XU7kIEOQ5dat25Km7qfRDLX1zMK4aH4i5pSFy20wcwf0qAtm2hNcFLOY7kmaJPNEvrIkLAbOl-fQdyhmu-_D3hb5gNWoccQeA5etFghLV49Sq6U88qnp1qaGULk_qO1yW4znxHcJn7CI7YJUDn9m1i8-gr64wqsmaWCW_-eMk_XZjkYv7GxS3OSmk8wK8ST7FTxwo638Bco-Cpzhzc_lmgd6SyjhmK8zOU4NytEgTdK66t-qOy7tbyf6z6RJlqB

![Diagrama de Secuencia](https://www.planttext.com/plantuml/png/bPBDJi904CVl-nGJJd0W4EEfIGr2aH0r4Byu3-sIh7HtczqjsiVnwC6JZy2BERksK3GUxA7fpFpcup-TaNLeN2bpXgdJ1XvjYKPenWfoYrGKg1nqhenMZgiCkfT5CLZnTQy3QA5ndyANopdCqF4Nh095zcnrYjoWN6SOGMeuWMDKsmGT1lexT8edbKAfat406eEnE8Qfskq_D6GSDjh8ClUpUoj3fosiKQNUOo6EMQqC-XU7kIEOQ5dat25Km7qfRDLX1zMK4aH4i5pSFy20wcwf0qAtm2hNcFLOY7kmaJPNEvrIkLAbOl-fQdyhmu-_D3hb5gNWoccQeA5etFghLV49Sq6U88qnp1qaGULk_qO1yW4znxHcJn7CI7YJUDn9m1i8-gr64wqsmaWCW_-eMk_XZjkYv7GxS3OSmk8wK8ST7FTxwo638Bco-Cpzhzc_lmgd6SyjhmK8zOU4NytEgTdK66t-qOy7tbyf6z6RJlqB)

### Script PlantUML

@startuml
actor Usuario
participant "Frontend (App/Web)" as Frontend
participant "API Gateway" as APIGW
participant "Lambda: DatosBancarios" as Lambda
participant "DynamoDB" as DB

== Envío de datos bancarios ==
Usuario -> Frontend: Completa y envía formulario bancario
Frontend -> APIGW: POST /bank-data (payload)
APIGW -> Lambda: Invoca función Lambda (payload)

== Procesamiento en Lambda ==
Lambda -> Lambda: Valida datos
alt Datos válidos
    Lambda -> DB: Guarda/actualiza datos bancarios
    DB --> Lambda: Confirmación
    Lambda -> APIGW: Respuesta 200 OK
    APIGW -> Frontend: Muestra mensaje de éxito
else Datos inválidos
    Lambda -> APIGW: Respuesta 400 Error
    APIGW -> Frontend: Muestra mensaje de error
end

@enduml