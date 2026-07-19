<!--
title: 'AWS Lambda GetPlaces - NodeJS'
description: 'API REST para consulta de países, estados y ciudades usando AWS Lambda, API Gateway y Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorName: 'DoEventsBack Team'
-->

# AWS Lambda GetPlaces - NodeJS

Este proyecto implementa una API REST para la consulta de países, estados y ciudades utilizando AWS Lambda y API Gateway, desplegado con Serverless Framework.

Incluye endpoints para obtener listas de países, estados y ciudades, facilitando la integración en aplicaciones que requieren información geográfica.

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
  `doc/swagger-getplace.yml`

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
const swaggerDocument = yaml.load(fs.readFileSync('./doc/swagger-getplace.yml', 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(3000, () => {
  console.log('Swagger docs disponibles en http://localhost:3000/api-docs');
});
```

---

## Variables de entorno

El proyecto puede utilizar variables de entorno para parametrizar recursos y configuraciones.  
Asegúrate de definirlas en tu entorno o en el archivo `serverless.yml` si es necesario.

---

## Diagrama de Secuencia

El siguiente diagrama muestra el flujo de las solicitudes a la API de lugares.

// https://www.planttext.com?text=fPF1QW8n48RlWNs7mPCUYjAZi5MHTbdQKgajdiSaBO4r2PkanOVggO_WYpM9crMqBOh7_UURoV_Fi6DZiRPkLMK4gLKrl1g7jL0PoOZs5K65HccXSrShQRbaq9retL_mPQy3Q2391_HaLaA1bd_YEcB-krWSC0-uMZ8SGi7jh4BAJIItQdW-ps6gf76LHM0SD6w-33UGvnbfJCBLJMjW27DL-TaURiYCj9uz5ntunsvVe4-LaxOM0Obog2StfVnG5E7DIIestxBHeVlExJIrzJBIoBl1pznen_qsuNemWAVxlT4xYu-1gFSS7gKC4vWw9MKYqsh-Zkj1oyrectfTiloysFFOVd7cnkylcQbm3Db9fstHTbN_N5bOVwjHJ7zsw6bilZXqyXjIZtt5_sW_

![Diagrama de Secuencia](https://www.planttext.com/plantuml/png/fPF1QW8n48RlWNs7mPCUYjAZi5MHTbdQKgajdiSaBO4r2PkanOVggO_WYpM9crMqBOh7_UURoV_Fi6DZiRPkLMK4gLKrl1g7jL0PoOZs5K65HccXSrShQRbaq9retL_mPQy3Q2391_HaLaA1bd_YEcB-krWSC0-uMZ8SGi7jh4BAJIItQdW-ps6gf76LHM0SD6w-33UGvnbfJCBLJMjW27DL-TaURiYCj9uz5ntunsvVe4-LaxOM0Obog2StfVnG5E7DIIestxBHeVlExJIrzJBIoBl1pznen_qsuNemWAVxlT4xYu-1gFSS7gKC4vWw9MKYqsh-Zkj1oyrectfTiloysFFOVd7cnkylcQbm3Db9fstHTbN_N5bOVwjHJ7zsw6bilZXqyXjIZtt5_sW_)

### Script PlantUML

@startuml
actor Usuario

participant "Frontend (App/Web)" as Frontend
participant "API Gateway" as APIGW
participant "Lambda: GetPlaces" as Lambda

== Consulta de países ==
Usuario -> Frontend: Solicita países
Frontend -> APIGW: GET /countries
APIGW -> Lambda: Invoca función Lambda (getCountries)
Lambda -> APIGW: Respuesta 200 OK
APIGW -> Frontend: Muestra países

== Consulta de estados ==
Usuario -> Frontend: Solicita estados de país
Frontend -> APIGW: GET /states?countryId=
APIGW -> Lambda: Invoca función Lambda (getStates)
Lambda -> APIGW: Respuesta 200 OK
APIGW -> Frontend: Muestra estados

== Consulta de ciudades ==
Usuario -> Frontend: Solicita ciudades de estado
Frontend -> APIGW: GET /cities?stateId=
APIGW -> Lambda: Invoca función Lambda (getCities)
Lambda -> APIGW: Respuesta 200 OK
APIGW -> Frontend: Muestra ciudades

@enduml