/**
 * Prueba templates de notificaciones en QA (us-east-2).
 *
 * Uso:
 *   node test-qa-notifications.js
 *   node test-qa-notifications.js --template EVENT_INVITATION --userId <uuid>
 *   node test-qa-notifications.js --api   (vía HTTP api-qa)
 *   node test-qa-notifications.js --channels email,inApp
 */

const AWS = require("aws-sdk");

const REGION = process.env.AWS_REGION || "us-east-2";
const STAGE = process.env.STAGE || "qa";
const LAMBDA_NAME =
  process.env.NOTIFICATIONS_LAMBDA || `notifications-${STAGE}-triggerNotification`;
const API_URL =
  process.env.NOTIFICATIONS_API ||
  "https://api-qa.doeventsapp.com/notifications/trigger-notification";

AWS.config.update({ region: REGION });
const lambda = new AWS.Lambda();

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  return {
    template: get("--template") || "EVENT_PUBLISHED",
    userId: get("--userId") || process.env.TEST_USER_ID || "42c2e4a4-0",
    channels: (get("--channels") || "email,inApp").split(",").map((c) => c.trim()),
    useApi: args.includes("--api"),
  };
}

function buildPayload(templateKey, userId, channels) {
  const base = {
    templateKey,
    triggerId: templateKey,
    userId,
    channels,
    metadata: {
      userId,
      eventId: "test-event-qa-001",
      eventName: "Evento QA Templates",
      eventSlug: "evento-qa-templates",
      eventDate: "20260615",
      eventStartTime: "19:00",
      eventLocation: "Medellín",
      eventCity: "Medellín",
      inviterName: "DoEvents QA",
      organizerName: "DoEvents QA",
      link: "https://qa.doeventsapp.com/events/test-event-qa-001",
      shareLink: "https://qa.doeventsapp.com/events/test-event-qa-001",
      message: "Prueba de templates QA",
    },
  };

  if (templateKey === "REFUND_APPROVED") {
    base.metadata = {
      ...base.metadata,
      refundAmount: "50.000",
      currency: "COP",
      ticketCount: 1,
      eventName: "Evento QA Templates",
    };
  }

  return base;
}

async function invokeLambda(payload) {
  const result = await lambda
    .invoke({
      FunctionName: LAMBDA_NAME,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({ body: JSON.stringify(payload) }),
    })
    .promise();

  const response = JSON.parse(result.Payload || "{}");
  return { statusCode: result.StatusCode, functionError: result.FunctionError, response };
}

async function invokeApi(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { statusCode: res.status, response: body };
}

async function main() {
  const { template, userId, channels, useApi } = parseArgs();
  const payload = buildPayload(template, userId, channels);

  console.log("🧪 Prueba notificaciones QA");
  console.log(`   Región: ${REGION}`);
  console.log(`   Destino: ${useApi ? API_URL : LAMBDA_NAME}`);
  console.log(`   Template: ${template}`);
  console.log(`   Usuario: ${userId}`);
  console.log(`   Canales: ${channels.join(", ")}`);
  console.log("");

  try {
    const result = useApi ? await invokeApi(payload) : await invokeLambda(payload);
    console.log("📥 Resultado:");
    console.log(JSON.stringify(result, null, 2));

    if (result.functionError) {
      process.exitCode = 1;
      return;
    }

    const body = result.response?.body
      ? (typeof result.response.body === "string"
        ? JSON.parse(result.response.body)
        : result.response.body)
      : result.response;

    if (body?.success === false || (result.statusCode && result.statusCode >= 400)) {
      console.error("\n❌ La notificación no se envió correctamente");
      process.exitCode = 1;
      return;
    }

    console.log("\n✅ Notificación disparada. Revisa email/WhatsApp/in-app del usuario.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exitCode = 1;
  }
}

main();
