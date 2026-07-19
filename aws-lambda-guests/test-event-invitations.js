/**
 * Script de prueba para el sistema de invitaciones a eventos
 * Ejecutar con: node test-event-invitations.js
 */

const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({ region: "us-east-1" });

// Configuración
const EVENT_ID = "94f5c79e-d081-40c8-8cb6-2490b2da9359"; // Reemplazar con tu eventId
const ORGANIZER_ID = "cedef71c-c"; // Reemplazar con tu userId

// Test 1: Enviar invitaciones a usuarios individuales
async function testInviteUsers() {
  console.log("\n🧪 Test 1: Invitar usuarios individuales\n");

  const payload = {
    httpMethod: "POST",
    pathParameters: { eventId: EVENT_ID },
    body: JSON.stringify({
      invitedBy: ORGANIZER_ID,
      users: ["user-test-1", "user-test-2", "user-test-3"],
      channels: ["email", "push"],
      message: "¡Te invito a mi evento especial!",
    }),
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-sendEventInvitations",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ Response:", JSON.parse(response.body));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Test 2: Enviar invitaciones a grupos
async function testInviteGroups() {
  console.log("\n🧪 Test 2: Invitar grupos completos\n");

  const payload = {
    httpMethod: "POST",
    pathParameters: { eventId: EVENT_ID },
    body: JSON.stringify({
      invitedBy: ORGANIZER_ID,
      groups: ["group-vip", "group-amigos"],
      channels: ["email", "push", "whatsapp"],
    }),
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-sendEventInvitations",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ Response:", JSON.parse(response.body));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Test 3: Enviar invitaciones mixtas (usuarios + grupos)
async function testInviteMixed() {
  console.log("\n🧪 Test 3: Invitar usuarios + grupos\n");

  const payload = {
    httpMethod: "POST",
    pathParameters: { eventId: EVENT_ID },
    body: JSON.stringify({
      invitedBy: ORGANIZER_ID,
      users: ["special-user-1"],
      groups: ["group-team"],
      channels: ["email", "push", "whatsapp", "inApp"],
      message: "¡Evento imperdible, nos vemos allí!",
    }),
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-sendEventInvitations",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ Response:", JSON.parse(response.body));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Test 4: Obtener invitaciones del evento
async function testGetInvitations() {
  console.log("\n🧪 Test 4: Obtener invitaciones del evento\n");

  const payload = {
    httpMethod: "GET",
    pathParameters: { eventId: EVENT_ID },
    queryStringParameters: {},
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-getEventInvitations",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    const data = JSON.parse(response.body);
    console.log("✅ Total invitaciones:", data.stats.total);
    console.log("📊 Estadísticas:", data.stats);
    console.log("📋 Primeras 3 invitaciones:", data.invitations.slice(0, 3));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Test 5: Obtener invitaciones pendientes
async function testGetPendingInvitations() {
  console.log("\n🧪 Test 5: Obtener invitaciones pendientes\n");

  const payload = {
    httpMethod: "GET",
    pathParameters: { eventId: EVENT_ID },
    queryStringParameters: { status: "pending" },
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-getEventInvitations",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    const data = JSON.parse(response.body);
    console.log("✅ Invitaciones pendientes:", data.stats.pending);
    console.log("📋 Invitaciones:", data.invitations);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Test 6: Aceptar invitación
async function testAcceptInvitation() {
  console.log("\n🧪 Test 6: Aceptar invitación\n");

  const INVITATION_ID = "inv-test-123"; // Reemplazar con una invitationId real
  const USER_ID = "user-test-1";

  const payload = {
    httpMethod: "PUT",
    pathParameters: {
      eventId: EVENT_ID,
      invitationId: INVITATION_ID,
    },
    body: JSON.stringify({
      status: "accepted",
      userId: USER_ID,
    }),
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-updateInvitationStatus",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ Response:", JSON.parse(response.body));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Test 7: Rechazar invitación
async function testRejectInvitation() {
  console.log("\n🧪 Test 7: Rechazar invitación\n");

  const INVITATION_ID = "inv-test-456"; // Reemplazar con una invitationId real
  const USER_ID = "user-test-2";

  const payload = {
    httpMethod: "PUT",
    pathParameters: {
      eventId: EVENT_ID,
      invitationId: INVITATION_ID,
    },
    body: JSON.stringify({
      status: "rejected",
      userId: USER_ID,
    }),
  };

  try {
    const result = await lambda
      .invoke({
        FunctionName: "aws-lambda-guests-dev-updateInvitationStatus",
        Payload: JSON.stringify(payload),
      })
      .promise();

    const response = JSON.parse(result.Payload);
    console.log("✅ Response:", JSON.parse(response.body));
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Ejecutar todos los tests
async function runAllTests() {
  console.log("🚀 Iniciando tests del sistema de invitaciones\n");
  console.log("=".repeat(60));

  try {
    await testInviteUsers();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await testInviteGroups();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await testInviteMixed();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await testGetInvitations();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await testGetPendingInvitations();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Descomentar estos cuando tengas invitationIds reales
    // await testAcceptInvitation();
    // await new Promise(resolve => setTimeout(resolve, 2000));

    // await testRejectInvitation();

    console.log("\n" + "=".repeat(60));
    console.log("✅ Tests completados");
  } catch (error) {
    console.error("\n❌ Error ejecutando tests:", error);
  }
}

// Ejecutar
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testInviteUsers,
  testInviteGroups,
  testInviteMixed,
  testGetInvitations,
  testGetPendingInvitations,
  testAcceptInvitation,
  testRejectInvitation,
};
