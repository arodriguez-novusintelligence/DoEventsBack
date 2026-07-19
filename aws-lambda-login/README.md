<!--
title: 'AWS Simple HTTP Endpoint example in NodeJS'
description: 'This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorLink: 'https://github.com/serverless'
authorName: 'Serverless, Inc.'
authorAvatar: 'https://avatars1.githubusercontent.com/u/13742415?s=200&v=4'
-->

# Serverless Framework Node HTTP API on AWS

This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.

This template does not include any kind of persistence (database). For more advanced examples, check out the [serverless/examples repository](https://github.com/serverless/examples/) which includes Typescript, Mongo, DynamoDB and other examples.

## Usage

### Deployment

In order to deploy the example, you need to run the following command:

```
serverless deploy
```

After running deploy, you should see output similar to:

```
Deploying "serverless-http-api" to stage "dev" (us-east-1)

✔ Service deployed to stack serverless-http-api-dev (91s)

endpoint: GET - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/
functions:
  hello: serverless-http-api-dev-hello (1.6 kB)
```

_Note_: In current form, after deployment, your API is public and can be invoked by anyone. For production deployments, you might want to configure an authorizer. For details on how to do that, refer to [HTTP API (API Gateway V2) event docs](https://www.serverless.com/framework/docs/providers/aws/events/http-api).

### Invocation

After successful deployment, you can call the created application via HTTP:

```
curl https://xxxxxxx.execute-api.us-east-1.amazonaws.com/
```

Which should result in response similar to:

```json
{ "message": "Go Serverless v4! Your function executed successfully!" }
```

### Pruebas locales con Serverless Offline

Para levantar la API en local y probar sin desplegar:

```bash
npm install
npm run offline
```

La API quedará disponible en **http://localhost:3000**. Rutas (sin prefijo de stage):

- `POST http://localhost:3000/login`
- `POST http://localhost:3000/googleOAuth`
- `POST http://localhost:3000/appleOAuth`
- `GET/POST http://localhost:3000/apple-callback`

**Variables de entorno en local:**  
En AWS, `JWT_SECRET` se obtiene de SSM. Para offline, define un valor en tu entorno antes de arrancar, por ejemplo:

```bash
# Windows (PowerShell)
$env:JWT_SECRET="tu_secreto_para_desarrollo"

# Linux / macOS
export JWT_SECRET=tu_secreto_para_desarrollo
```

Luego ejecuta `npm run offline`. Si usas DynamoDB real, ten configuradas las credenciales de AWS (`aws configure` o variables `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).

### Local development (tunnel a AWS)

The easiest way to develop and test your function is to use the `dev` command:

```
serverless dev
```

This will start a local emulator of AWS Lambda and tunnel your requests to and from AWS Lambda, allowing you to interact with your function as if it were running in the cloud.

Now you can invoke the function as before, but this time the function will be executed locally. Now you can develop your function locally, invoke it, and see the results immediately without having to re-deploy.

When you are done developing, don't forget to run `serverless deploy` to deploy the function to the cloud.
