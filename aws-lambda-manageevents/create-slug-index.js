const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB();

/**
 * Script para crear el índice GSI slug-index en la tabla Eventos
 * Este índice permite buscar eventos por slug de manera eficiente
 */

async function createSlugIndex() {
  const params = {
    TableName: "Eventos",
    AttributeDefinitions: [
      {
        AttributeName: "slug",
        AttributeType: "S", // String
      },
    ],
    GlobalSecondaryIndexUpdates: [
      {
        Create: {
          IndexName: "slug-index",
          KeySchema: [
            {
              AttributeName: "slug",
              KeyType: "HASH", // Partition key
            },
          ],
          Projection: {
            ProjectionType: "ALL", // Incluir todos los atributos
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
      },
    ],
  };

  try {
    console.log("🚀 Creando índice slug-index en la tabla Eventos...");
    const result = await dynamodb.updateTable(params).promise();
    console.log("✅ Índice creado exitosamente!");
    console.log(
      "⏳ El índice estará disponible en unos minutos (estado: CREATING)"
    );
    console.log("\nDetalles del GSI:");
    console.log(
      JSON.stringify(result.TableDescription.GlobalSecondaryIndexes, null, 2)
    );
  } catch (error) {
    if (error.code === "ResourceInUseException") {
      console.log(
        "⚠️  La tabla está siendo actualizada. Espera unos minutos e intenta de nuevo."
      );
    } else if (error.message.includes("already exists")) {
      console.log("ℹ️  El índice slug-index ya existe en la tabla Eventos");
    } else {
      console.error("❌ Error al crear el índice:", error.message);
      console.error("Detalles:", error);
    }
  }
}

// Verificar el estado del índice
async function checkIndexStatus() {
  try {
    const params = {
      TableName: "Eventos",
    };

    const result = await dynamodb.describeTable(params).promise();
    const gsis = result.Table.GlobalSecondaryIndexes || [];
    const slugIndex = gsis.find((gsi) => gsi.IndexName === "slug-index");

    if (slugIndex) {
      console.log(
        `\n📊 Estado del índice slug-index: ${slugIndex.IndexStatus}`
      );
      console.log(`   - ItemCount: ${slugIndex.ItemCount || 0}`);
      console.log(`   - IndexSizeBytes: ${slugIndex.IndexSizeBytes || 0}`);

      if (slugIndex.IndexStatus === "ACTIVE") {
        console.log("✅ El índice está activo y listo para usar!");
        console.log(
          "\n🔧 Ahora puedes descomentar la validación de slug en createEvent.js"
        );
      } else {
        console.log("⏳ El índice aún se está creando. Espera unos minutos...");
      }
    } else {
      console.log("\n❌ El índice slug-index no existe todavía");
    }
  } catch (error) {
    console.error("Error al verificar estado:", error.message);
  }
}

// Ejecutar
(async () => {
  await createSlugIndex();
  console.log("\n⏱️  Esperando 5 segundos antes de verificar estado...\n");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await checkIndexStatus();
})();
