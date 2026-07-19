<!--
title: 'AWS Lambda Bancos - NodeJS'
description: 'API REST para gestión de bancos usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda Bancos - NodeJS

Este proyecto implementa una API REST para la gestión de bancos utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para crear, consultar y actualizar bancos, y documentación Swagger para facilitar la integración.

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
  `doc/swagger-Banks.yml`

Puedes visualizar la documentación en [Swagger Editor Online](https://editor.swagger.io/) cargando el archivo mencionado.

#### Servir Swagger Docs localmente

Este es el link de la documentacion swagger para visualizarla " [swagger](https://n0phik92fh.execute-api.us-east-1.amazonaws.com/dev/doc) "

Si deseas servir la documentación localmente, puedes usar el siguiente script:

```js
const fs = require('fs');
const path = require('path');

exports.swaggerDocs = async (event) => {
  try {
    const requestPath = (event.rawPath || event.path || '').toLowerCase();

    // Si piden el YAML
    if (requestPath.endsWith('/doc/swagger-banks.yml')) {
      const yamlPath = path.join(__dirname, '../doc/swagger-Banks.yml'); // carpeta correcta
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

    // HTML con detección de stage y carpeta correcta
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Bancos API Docs</title>
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
              url: window.location.origin + stage + '/doc/swagger-Banks.yml',
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
Sin Variables

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de bancos.

// https://www.planttext.com?text=nPJ1JW8n48RlVOe99pWeTn8C84X8D1AHS1vs2wbPsatRHT7uG9vz15xCeMMNLWXuyqRRRzg_tqxf68lQ5gkCOMALXgafK0l5SfeLYSXHMgZTQIKjbodKktdUdF5vemPee9oEuUvu14Eq_1KtZgBnS1OZzxYQfzY2H7FKFPI9kdun3hwjPavNBBcD-E5-V9ekyfI2H0NJmnIZNpX7mw7MtqXSgNwl1Mx5e-KaO-ss3-PNeTrcUqrmTLDPW1QCv59pWq0RAmCfps3k3geGmfqEOiUFasTekdK3TL_XHWtc4M8FDjpcQvKW-Bl5wbW0KbaPt1KPhYs2BFXQxTF4S9ddYPkyuDGDiFrw4rOrkTPA7x84r-ppTS6pDGUwR95PJECRbcvQyB3RK5DO9HT2hp0Hss_fTIhfIYygdQYCFYkb4dAXIEaPeyD19RJv8TBFG_QoIuui1kt4AYWsM2Rr1qDERsJKZ-3o_4fBy37F-ml1ymP3SkUlczW2C_5-MU0WtTdxKqTEOtzGTrrZV77Gbi4REZ8QFpaMeh7NwWRxHB_8VsZB3e7qH_W3

![Diagrama de Secuencia](https://www.planttext.com/plantuml/png/nPJ1JW8n48RlVOe99pWeTn8C84X8D1AHS1vs2wbPsatRHT7uG9vz15xCeMMNLWXuyqRRRzg_tqxf68lQ5gkCOMALXgafK0l5SfeLYSXHMgZTQIKjbodKktdUdF5vemPee9oEuUvu14Eq_1KtZgBnS1OZzxYQfzY2H7FKFPI9kdun3hwjPavNBBcD-E5-V9ekyfI2H0NJmnIZNpX7mw7MtqXSgNwl1Mx5e-KaO-ss3-PNeTrcUqrmTLDPW1QCv59pWq0RAmCfps3k3geGmfqEOiUFasTekdK3TL_XHWtc4M8FDjpcQvKW-Bl5wbW0KbaPt1KPhYs2BFXQxTF4S9ddYPkyuDGDiFrw4rOrkTPA7x84r-ppTS6pDGUwR95PJECRbcvQyB3RK5DO9HT2hp0Hss_fTIhfIYygdQYCFYkb4dAXIEaPeyD19RJv8TBFG_QoIuui1kt4AYWsM2Rr1qDERsJKZ-3o_4fBy37F-ml1ymP3SkUlczW2C_5-MU0WtTdxKqTEOtzGTrrZV77Gbi4REZ8QFpaMeh7NwWRxHB_8VsZB3e7qH_W3)

### Script PlantUML

@startuml
actor Usuario
participant "Frontend (App/Web)" as Frontend
participant "API Gateway" as APIGW
participant "Lambda: crearBanco.js" as CrearBanco
participant "Lambda: getBanco.js" as GetBanco
participant "Lambda: updateBanco.js" as UpdateBanco
database "DynamoDB: Bancos" as DynamoDB

== Crear Banco ==
Usuario -> Frontend : Ingresa datos del banco
Frontend -> APIGW : POST /bancos (datos banco)
APIGW -> CrearBanco : Invoca Lambda crearBanco.js
CrearBanco -> DynamoDB : Inserta nuevo banco
CrearBanco -> APIGW : Respuesta éxito/error
APIGW -> Frontend : Devuelve resultado
Frontend -> Usuario : Muestra confirmación

== Consultar Banco ==
Usuario -> Frontend : Solicita info de banco
Frontend -> APIGW : GET /bancos/{id}
APIGW -> GetBanco : Invoca Lambda getBanco.js
GetBanco -> DynamoDB : Consulta banco por ID
GetBanco -> APIGW : Devuelve datos banco
APIGW -> Frontend : Devuelve datos banco
Frontend -> Usuario : Muestra datos banco

== Actualizar Banco ==
Usuario -> Frontend : Edita datos del banco
Frontend -> APIGW : PUT /bancos/{id} (nuevos datos)
APIGW -> UpdateBanco : Invoca Lambda updateBanco.js
UpdateBanco -> DynamoDB : Actualiza banco
UpdateBanco -> APIGW : Respuesta éxito/error
APIGW -> Frontend : Devuelve resultado
Frontend -> Usuario : Muestra confirmación

@enduml