// Diagnóstico simple para identificar el error 500
const AWS = require("aws-sdk");

// Configurar región
AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });

console.log("🔍 Iniciando diagnóstico de AWS SDK...");

// Test básico de DynamoDB
const dynamodb = new AWS.DynamoDB.DocumentClient();

const testDynamoDB = async () => {
  try {
    console.log("✅ AWS SDK cargado correctamente");
    console.log("📍 Región configurada:", AWS.config.region);

    // Test simple de listado de tablas
    const dynamodbService = new AWS.DynamoDB();
    const tables = await dynamodbService.listTables({ Limit: 5 }).promise();
    console.log("📊 Tablas disponibles:", tables.TableNames);

    return {
      success: true,
      region: AWS.config.region,
      tablesCount: tables.TableNames.length,
    };
  } catch (error) {
    console.error("❌ Error en DynamoDB:", error);
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
};

// Función de prueba simple
exports.diagnosticHandler = async (event) => {
  console.log("🧪 Ejecutando diagnóstico...");

  try {
    const dbTest = await testDynamoDB();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Diagnóstico completado",
        timestamp: new Date().toISOString(),
        environment: {
          nodeVersion: process.version,
          awsRegion: process.env.AWS_REGION,
          lambdaRuntime: process.env.AWS_LAMBDA_RUNTIME_API,
        },
        dynamoTest: dbTest,
      }),
    };
  } catch (error) {
    console.error("💥 Error general:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Diagnostic failed",
        message: error.message,
        stack: error.stack,
      }),
    };
  }
};

// Si se ejecuta localmente
if (require.main === module) {
  console.log("🏃‍♂️ Ejecutando diagnóstico local...");
  exports
    .diagnosticHandler({})
    .then((result) => {
      console.log("📋 Resultado:", JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error("💀 Error fatal:", error);
    });
}
