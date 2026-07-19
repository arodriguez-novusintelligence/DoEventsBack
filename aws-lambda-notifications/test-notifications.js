const AWS = require("aws-sdk");

// Configurar AWS
AWS.config.update({ region: "us-east-1" });
const lambda = new AWS.Lambda();

async function testNotifications() {
  console.log("🧪 Iniciando prueba de notificaciones...");

  const testPayload = {
    eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
    templateKey: "EVENT_CANCELLED",
    eventData: {
      eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
      eventName: "Evento de Prueba",
      originalStartDate: "2025-11-01",
      originalEndDate: "2025-11-01",
      reason: "Prueba de notificaciones",
      venue: "Lugar de Prueba",
    },
  };

  try {
    console.log(
      "📤 Enviando payload de prueba:",
      JSON.stringify(testPayload, null, 2)
    );

    const result = await lambda
      .invoke({
        FunctionName: "notifications-dev-notifyEventAffectedUsers",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(testPayload),
      })
      .promise();

    console.log("📥 Resultado recibido:");
    console.log("StatusCode:", result.StatusCode);

    if (result.Payload) {
      const response = JSON.parse(result.Payload);
      console.log("Response:", JSON.stringify(response, null, 2));
    }

    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, "base64").toString();
      console.log("🔍 Logs de ejecución:");
      console.log(logs);
    }
  } catch (error) {
    console.error("❌ Error en prueba:", error);
  }
}

// Función para probar notificaciones individuales
async function testIndividualNotifications() {
  console.log("🧪 Probando notificaciones individuales...");

  const testUser = {
    id: "42c2e4a4-0",
    name: "Usuario de Prueba",
    email: "visbalgomez@gmail.com",
    telefono: "+573158929677",
  };

  const templateKey = "EVENT_CANCELLED";
  const eventData = {
    eventId: "f3a2a56-4978-462a-824e-ab2390a81e27",
    eventName: "Evento de Prueba",
    originalStartDate: "2025-11-01",
    originalEndDate: "2025-11-01",
    reason: "Prueba de notificaciones",
    venue: "Lugar de Prueba",
  };

  // 1. Probar Push Notification
  console.log("🔔 Probando Push Notification...");
  try {
    const pushResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-pushNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            userId: testUser.id,
            templateKey: templateKey,
            userData: { name: testUser.name },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    console.log("📱 Push result:", JSON.parse(pushResult.Payload));
  } catch (error) {
    console.error("❌ Error push:", error.message);
  }

  // 2. Probar WhatsApp Notification
  console.log("📱 Probando WhatsApp Notification...");
  try {
    const whatsappResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-whatsappNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: testUser.telefono,
            templateKey: templateKey,
            userData: { userName: testUser.name, userId: testUser.id },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    console.log("📱 WhatsApp result:", JSON.parse(whatsappResult.Payload));
  } catch (error) {
    console.error("❌ Error WhatsApp:", error.message);
  }

  // 3. Probar InApp Notification
  console.log("📱 Probando InApp Notification...");
  try {
    const inAppResult = await lambda
      .invoke({
        FunctionName: "global-websocket-gateway-dev-inAppNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            userId: testUser.id,
            templateKey: templateKey,
            userData: { name: testUser.name },
            eventData: eventData,
          }),
          requestContext: {
            stage: "dev",
            domainName: "ajojxxqr14.execute-api.us-east-1.amazonaws.com",
          },
        }),
      })
      .promise();

    console.log("📱 InApp result:", JSON.parse(inAppResult.Payload));
  } catch (error) {
    console.error("❌ Error InApp:", error.message);
  }
}

// Función para probar notificaciones de evento reprogramado
async function testRescheduledNotifications() {
  console.log("🔄 Probando notificaciones de EVENTO REPROGRAMADO...");

  const testUser = {
    id: "42c2e4a4-0",
    name: "Usuario de Prueba",
    email: "visbalgomez@gmail.com",
    telefono: "+573158929677",
  };

  const templateKey = "EVENT_RESCHEDULED";
  const eventData = {
    eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
    eventName: "Concierto de Rock Reprogramado",
    originalStartDate: "2025-11-01",
    originalEndDate: "2025-11-01",
    newStartDate: "2025-11-15",
    newEndDate: "2025-11-15",
    reason: "Por motivos de logística se reprogramó el evento",
    venue: "Arena Central",
  };

  // 1. Probar Email Notification para Rescheduled
  console.log("📧 Probando Email Notification RESCHEDULED...");
  try {
    const emailResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-emailNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: testUser.email,
            templateKey: templateKey,
            userData: { userName: testUser.name, userId: testUser.id },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    console.log(
      "📧 Email RESCHEDULED result:",
      JSON.parse(emailResult.Payload)
    );
  } catch (error) {
    console.error("❌ Error Email RESCHEDULED:", error.message);
  }

  // 2. Probar WhatsApp Notification para Rescheduled
  console.log("📱 Probando WhatsApp Notification RESCHEDULED...");
  try {
    const whatsappResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-whatsappNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: testUser.telefono,
            templateKey: templateKey,
            userData: { userName: testUser.name, userId: testUser.id },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    console.log(
      "📱 WhatsApp RESCHEDULED result:",
      JSON.parse(whatsappResult.Payload)
    );
  } catch (error) {
    console.error("❌ Error WhatsApp RESCHEDULED:", error.message);
  }

  // 3. Probar Push Notification para Rescheduled
  console.log("🔔 Probando Push Notification RESCHEDULED...");
  try {
    const pushResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-pushNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            userId: testUser.id,
            templateKey: templateKey,
            userData: { name: testUser.name },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    console.log("📱 Push RESCHEDULED result:", JSON.parse(pushResult.Payload));
  } catch (error) {
    console.error("❌ Error push RESCHEDULED:", error.message);
  }

  // 4. Probar InApp Notification para Rescheduled
  console.log("📱 Probando InApp Notification RESCHEDULED...");
  try {
    const inAppResult = await lambda
      .invoke({
        FunctionName: "global-websocket-gateway-dev-inAppNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            userId: testUser.id,
            templateKey: templateKey,
            userData: { name: testUser.name },
            eventData: eventData,
          }),
          requestContext: {
            stage: "dev",
            domainName: "ajojxxqr14.execute-api.us-east-1.amazonaws.com",
          },
        }),
      })
      .promise();

    console.log(
      "📱 InApp RESCHEDULED result:",
      JSON.parse(inAppResult.Payload)
    );
  } catch (error) {
    console.error("❌ Error InApp RESCHEDULED:", error.message);
  }
}

// Ejecutar las pruebas
async function main() {
  console.log("🚀 Iniciando prueba de LOS 4 CANALES para RESCHEDULED...\n");

  console.log("=== PRUEBA: Todos los canales para EVENT_RESCHEDULED ===");
  await testAllChannelsRescheduled();

  console.log("\n✅ Pruebas completadas");
}

// Función para probar todos los canales solo para rescheduled
async function testAllChannelsRescheduled() {
  console.log("� Probando TODOS los canales para EVENTO REPROGRAMADO...");

  const testUser = {
    id: "42c2e4a4-0",
    name: "Usuario de Prueba",
    email: "visbalgomez@gmail.com",
    telefono: "+573158929677",
  };

  const templateKey = "EVENT_RESCHEDULED";
  const eventData = {
    eventId: "3adf210f-716b-43fb-84b4-ece5e2119af2",
    eventName: "Concierto de Rock Reprogramado",
    originalStartDate: "2025-11-01",
    originalEndDate: "2025-11-01",
    newStartDate: "2025-11-15",
    newEndDate: "2025-11-15",
    reason: "Por motivos de logística se reprogramó el evento",
    venue: "Arena Central",
  };

  // 1. Probar Email Notification para Rescheduled
  console.log("📧 Probando Email Notification RESCHEDULED...");
  try {
    const emailResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-emailNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: testUser.email,
            templateKey: templateKey,
            userData: { userName: testUser.name, userId: testUser.id },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    const emailResponse = JSON.parse(emailResult.Payload);
    console.log("📧 Email RESCHEDULED result:", emailResponse);

    if (emailResponse.statusCode === 200) {
      console.log("✅ Email enviado exitosamente!");
    }
  } catch (error) {
    console.error("❌ Error Email RESCHEDULED:", error.message);
  }

  console.log("\n" + "-".repeat(50));

  // 2. Probar WhatsApp Notification para Rescheduled
  console.log("📱 Probando WhatsApp Notification RESCHEDULED...");
  try {
    const whatsappResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-whatsappNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            to: testUser.telefono,
            templateKey: templateKey,
            userData: { userName: testUser.name, userId: testUser.id },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    const whatsappResponse = JSON.parse(whatsappResult.Payload);
    console.log("📱 WhatsApp RESCHEDULED result:", whatsappResponse);

    if (whatsappResponse.statusCode === 200) {
      console.log("✅ WhatsApp enviado exitosamente!");
    }
  } catch (error) {
    console.error("❌ Error WhatsApp RESCHEDULED:", error.message);
  }

  console.log("\n" + "-".repeat(50));

  // 3. Probar Push Notification para Rescheduled
  console.log("🔔 Probando Push Notification RESCHEDULED...");
  try {
    const pushResult = await lambda
      .invoke({
        FunctionName: "notifications-dev-pushNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            userId: testUser.id,
            templateKey: templateKey,
            userData: { name: testUser.name },
            eventData: eventData,
          }),
        }),
      })
      .promise();

    const pushResponse = JSON.parse(pushResult.Payload);
    console.log("� Push RESCHEDULED result:", pushResponse);

    if (pushResponse.statusCode === 200) {
      console.log("✅ Push notification enviada exitosamente!");
    }
  } catch (error) {
    console.error("❌ Error push RESCHEDULED:", error.message);
  }

  console.log("\n" + "-".repeat(50));

  // 4. Probar InApp Notification para Rescheduled
  console.log("📱 Probando InApp Notification RESCHEDULED...");
  try {
    const inAppResult = await lambda
      .invoke({
        FunctionName: "global-websocket-gateway-dev-inAppNotificationHandler",
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({
          body: JSON.stringify({
            userId: testUser.id,
            templateKey: templateKey,
            userData: { name: testUser.name },
            eventData: eventData,
          }),
          requestContext: {
            stage: "dev",
            domainName: "ajojxxqr14.execute-api.us-east-1.amazonaws.com",
          },
        }),
      })
      .promise();

    const inAppResponse = JSON.parse(inAppResult.Payload);
    console.log("📱 InApp RESCHEDULED result:", inAppResponse);

    if (inAppResponse.statusCode === 200) {
      console.log("✅ InApp notification enviada exitosamente!");
    }
  } catch (error) {
    console.error("❌ Error InApp RESCHEDULED:", error.message);
  }

  console.log("\n🎯 Resumen: Probados los 4 canales para EVENT_RESCHEDULED");
}

main().catch(console.error);
