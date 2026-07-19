// Script de prueba para los endpoints de grupos de favoritos
// Ejecutar con: node test-favorite-groups-update.js

const https = require("https");

// Configuración
const BASE_URL = "https://YOUR_API_GATEWAY_URL"; // Reemplazar con tu URL
const USER_ID = "test-user-123"; // Reemplazar con un userId real
const AUTH_TOKEN = "Bearer YOUR_TOKEN"; // Reemplazar con un token válido

// Helper para hacer requests
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_TOKEN,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Pruebas
async function runTests() {
  console.log("🧪 Iniciando pruebas de actualización de grupos\n");

  try {
    // 1. Crear grupos de prueba
    console.log("1️⃣ Creando grupos de prueba...");
    const group1 = await makeRequest("POST", `/users/${USER_ID}/groups`, {
      name: "Test Familia",
      color: "#FF0000",
      order: 0,
      userIds: ["user1", "user2"],
      tags: ["test"],
    });
    console.log("✅ Grupo 1 creado:", group1.body);

    const group2 = await makeRequest("POST", `/users/${USER_ID}/groups`, {
      name: "Test Amigos",
      color: "#00FF00",
      order: 1,
      userIds: ["user3", "user4"],
      tags: ["test"],
    });
    console.log("✅ Grupo 2 creado:", group2.body);

    const group3 = await makeRequest("POST", `/users/${USER_ID}/groups`, {
      name: "Test Trabajo",
      color: "#0000FF",
      order: 2,
      userIds: ["user5"],
      tags: ["test"],
    });
    console.log("✅ Grupo 3 creado:", group3.body);

    const groupId1 = group1.body.groupId;
    const groupId2 = group2.body.groupId;
    const groupId3 = group3.body.groupId;

    console.log("\n");

    // 2. Actualizar un grupo individual
    console.log("2️⃣ Actualizando grupo individual...");
    const updateSingle = await makeRequest(
      "PUT",
      `/users/${USER_ID}/groups/${groupId1}`,
      {
        color: "#FF5733",
        order: 10,
      }
    );
    console.log("✅ Grupo actualizado:", updateSingle.body);
    console.log("\n");

    // 3. Listar grupos
    console.log("3️⃣ Listando grupos...");
    const listGroups = await makeRequest("GET", `/users/${USER_ID}/groups`);
    console.log(
      "✅ Grupos actuales:",
      JSON.stringify(listGroups.body, null, 2)
    );
    console.log("\n");

    // 4. Actualización en lote - Solo reordenar
    console.log("4️⃣ Reordenando grupos en lote...");
    const batchReorder = await makeRequest(
      "PUT",
      `/users/${USER_ID}/groups/batch`,
      {
        groups: [
          { groupId: groupId3, order: 0 },
          { groupId: groupId1, order: 1 },
          { groupId: groupId2, order: 2 },
        ],
      }
    );
    console.log(
      "✅ Resultado batch reorder:",
      JSON.stringify(batchReorder.body, null, 2)
    );
    console.log("\n");

    // 5. Actualización en lote - Cambios múltiples
    console.log("5️⃣ Actualizando múltiples grupos con diferentes cambios...");
    const batchUpdate = await makeRequest(
      "PUT",
      `/users/${USER_ID}/groups/batch`,
      {
        groups: [
          {
            groupId: groupId1,
            name: "👨‍👩‍👧‍👦 Familia Actualizada",
            color: "#E74C3C",
            userIds: ["user1", "user2", "user6"],
          },
          {
            groupId: groupId2,
            color: "#3498DB",
            tags: ["amigos", "cercanos"],
          },
          {
            groupId: groupId3,
            userIds: ["user5", "user7", "user8"],
          },
        ],
      }
    );
    console.log(
      "✅ Resultado batch update:",
      JSON.stringify(batchUpdate.body, null, 2)
    );
    console.log("\n");

    // 6. Verificar cambios
    console.log("6️⃣ Verificando cambios finales...");
    const finalList = await makeRequest("GET", `/users/${USER_ID}/groups`);
    console.log(
      "✅ Estado final de grupos:",
      JSON.stringify(finalList.body, null, 2)
    );
    console.log("\n");

    // 7. Actualización con error (grupo inexistente)
    console.log("7️⃣ Probando actualización con error...");
    const batchWithError = await makeRequest(
      "PUT",
      `/users/${USER_ID}/groups/batch`,
      {
        groups: [
          { groupId: groupId1, order: 0 },
          { groupId: "grupo-inexistente", order: 1 },
          { groupId: groupId2, order: 2 },
        ],
      }
    );
    console.log(
      "✅ Resultado con error parcial:",
      JSON.stringify(batchWithError.body, null, 2)
    );
    console.log("\n");

    // 8. Limpiar - Eliminar grupos de prueba
    console.log("8️⃣ Limpiando grupos de prueba...");
    await makeRequest("DELETE", `/users/${USER_ID}/groups/${groupId1}`);
    console.log("✅ Grupo 1 eliminado");
    await makeRequest("DELETE", `/users/${USER_ID}/groups/${groupId2}`);
    console.log("✅ Grupo 2 eliminado");
    await makeRequest("DELETE", `/users/${USER_ID}/groups/${groupId3}`);
    console.log("✅ Grupo 3 eliminado");

    console.log("\n✅ Todas las pruebas completadas exitosamente!");
  } catch (error) {
    console.error("❌ Error durante las pruebas:", error);
  }
}

// Ejecutar pruebas
if (require.main === module) {
  runTests();
}

module.exports = { makeRequest };
