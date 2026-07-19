/**
 * Script de prueba para verificar la consulta a la tabla Client
 *
 * Uso: node test-client-query.js
 */

const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: "us-east-1" });

async function testClientQuery() {
  const targetUserId = "42c2e4a4-0"; // El ID del usuario de prueba

  console.log("🧪 Iniciando prueba de consulta a tabla Client\n");
  console.log(`📋 User ID a consultar: ${targetUserId}\n`);

  try {
    // 1. Consultar el usuario en Client
    console.log("🔍 Consultando tabla Client...");
    const clientResult = await dynamodb
      .get({
        TableName: "Client",
        Key: { id: targetUserId },
      })
      .promise();

    if (!clientResult.Item) {
      console.log("❌ Usuario NO encontrado en tabla Client");
      return;
    }

    console.log("✅ Usuario encontrado en tabla Client\n");
    console.log("📦 Datos completos del usuario:");
    console.log(JSON.stringify(clientResult.Item, null, 2));

    console.log("\n📊 Mapeo de campos para FavoriteUsers:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const mappedData = {
      name: clientResult.Item.name || "",
      lastName: clientResult.Item.lastName || "",
      email: clientResult.Item.email || "",
      phone: clientResult.Item.phone || "",
      username: clientResult.Item.user || "",
      profileImageUrl: clientResult.Item.fotoPerfilUrl || "",
    };

    console.log(`✓ name:            "${mappedData.name}"`);
    console.log(`✓ lastName:        "${mappedData.lastName}"`);
    console.log(`✓ email:           "${mappedData.email}"`);
    console.log(`✓ phone:           "${mappedData.phone}"`);
    console.log(`✓ username:        "${mappedData.username}"`);
    console.log(`✓ profileImageUrl: "${mappedData.profileImageUrl}"`);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Verificar campos vacíos
    const emptyFields = Object.entries(mappedData)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (emptyFields.length > 0) {
      console.log(`\n⚠️  Campos vacíos: ${emptyFields.join(", ")}`);
    } else {
      console.log("\n✅ Todos los campos tienen valores");
    }

    console.log("\n🎉 Prueba completada exitosamente");
  } catch (error) {
    console.error("\n❌ Error durante la prueba:", error.message);
    console.error("Stack:", error.stack);
  }
}

// Ejecutar prueba
testClientQuery()
  .then(() => {
    console.log("\n✅ Script finalizado");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Error fatal:", error);
    process.exit(1);
  });
