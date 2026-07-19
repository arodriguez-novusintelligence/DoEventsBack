/**
 * Script para agregar Global Secondary Indexes a la tabla Eventos
 *
 * GSI que se agregarán:
 * 1. slug-index: Para búsqueda por slug (URL-friendly identifier)
 * 2. venueId-index: Para búsqueda de eventos por venue
 *
 * Uso: node add-gsi-to-eventos.js
 */

const {
  DynamoDBClient,
  UpdateTableCommand,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const dynamoDbClient = new DynamoDBClient({ region: "us-east-1" });
const TABLE_NAME = "Eventos";

async function checkExistingIndexes() {
  try {
    const command = new DescribeTableCommand({ TableName: TABLE_NAME });
    const response = await dynamoDbClient.send(command);

    const existingIndexes = response.Table.GlobalSecondaryIndexes || [];
    console.log("\n📋 Índices existentes:");
    if (existingIndexes.length === 0) {
      console.log("  - Ninguno");
    } else {
      existingIndexes.forEach((index) => {
        console.log(`  - ${index.IndexName} (${index.IndexStatus})`);
      });
    }

    return existingIndexes;
  } catch (error) {
    console.error("❌ Error al verificar índices existentes:", error.message);
    throw error;
  }
}

async function addSlugIndex() {
  console.log("\n🔧 Agregando slug-index...");

  try {
    const command = new UpdateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        {
          AttributeName: "slug",
          AttributeType: "S",
        },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: "slug-index",
            KeySchema: [
              {
                AttributeName: "slug",
                KeyType: "HASH",
              },
            ],
            Projection: {
              ProjectionType: "ALL",
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        },
      ],
    });

    await dynamoDbClient.send(command);
    console.log("✅ slug-index agregado exitosamente");
    console.log(
      "   ⏳ El índice se está creando en segundo plano (puede tardar varios minutos)"
    );
    return true;
  } catch (error) {
    if (error.name === "ResourceInUseException") {
      console.log(
        "⚠️  slug-index ya existe o la tabla está siendo actualizada"
      );
      return false;
    }
    console.error("❌ Error al agregar slug-index:", error.message);
    throw error;
  }
}

async function addVenueIdIndex() {
  console.log("\n🔧 Agregando venueId-index...");

  try {
    const command = new UpdateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        {
          AttributeName: "venueId",
          AttributeType: "S",
        },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: "venueId-index",
            KeySchema: [
              {
                AttributeName: "venueId",
                KeyType: "HASH",
              },
            ],
            Projection: {
              ProjectionType: "ALL",
            },
            ProvisionedThroughput: {
              ReadCapacityUnits: 5,
              WriteCapacityUnits: 5,
            },
          },
        },
      ],
    });

    await dynamoDbClient.send(command);
    console.log("✅ venueId-index agregado exitosamente");
    console.log(
      "   ⏳ El índice se está creando en segundo plano (puede tardar varios minutos)"
    );
    return true;
  } catch (error) {
    if (error.name === "ResourceInUseException") {
      console.log(
        "⚠️  venueId-index ya existe o la tabla está siendo actualizada"
      );
      return false;
    }
    console.error("❌ Error al agregar venueId-index:", error.message);
    throw error;
  }
}

async function waitForTableActive() {
  console.log("\n⏳ Esperando a que la tabla esté disponible...");

  let attempts = 0;
  const maxAttempts = 60; // 5 minutos máximo

  while (attempts < maxAttempts) {
    try {
      const command = new DescribeTableCommand({ TableName: TABLE_NAME });
      const response = await dynamoDbClient.send(command);

      if (response.Table.TableStatus === "ACTIVE") {
        const updatingIndexes =
          response.Table.GlobalSecondaryIndexes?.filter(
            (idx) => idx.IndexStatus !== "ACTIVE"
          ) || [];

        if (updatingIndexes.length === 0) {
          console.log("✅ Tabla y todos los índices están activos");
          return true;
        } else {
          console.log(
            `   Índices en construcción: ${updatingIndexes
              .map((i) => i.IndexName)
              .join(", ")}`
          );
        }
      }
    } catch (error) {
      console.error("Error al verificar estado:", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000)); // Esperar 5 segundos
    attempts++;
  }

  console.log(
    "⚠️  Tiempo de espera agotado. Los índices pueden seguir creándose en segundo plano."
  );
  return false;
}

async function main() {
  console.log("🚀 Iniciando actualización de tabla Eventos");
  console.log(`📊 Tabla: ${TABLE_NAME}`);

  try {
    // Verificar índices existentes
    const existingIndexes = await checkExistingIndexes();
    const existingIndexNames = existingIndexes.map((idx) => idx.IndexName);

    // Agregar slug-index si no existe
    if (!existingIndexNames.includes("slug-index")) {
      await addSlugIndex();
      // Esperar un poco antes del siguiente índice
      console.log(
        "⏳ Esperando 10 segundos antes de agregar el siguiente índice..."
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } else {
      console.log("\n✓ slug-index ya existe");
    }

    // Agregar venueId-index si no existe
    if (!existingIndexNames.includes("venueId-index")) {
      await addVenueIdIndex();
    } else {
      console.log("\n✓ venueId-index ya existe");
    }

    // Verificar estado final
    console.log("\n📊 Estado final:");
    await checkExistingIndexes();

    console.log("\n✅ Script completado exitosamente");
    console.log(
      "\n📝 Nota: Los índices pueden tardar varios minutos en estar completamente activos."
    );
    console.log("   Puedes verificar su estado en la consola de AWS DynamoDB.");
  } catch (error) {
    console.error("\n❌ Error durante la ejecución:", error);
    process.exit(1);
  }
}

// Ejecutar script
main();
