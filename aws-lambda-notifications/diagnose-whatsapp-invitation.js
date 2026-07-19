const AWS = require("aws-sdk");
const buildEventInvitationTemplate = require("./src/templates/whatsapp/event_invitation");

const DEFAULTS = {
  region: process.env.AWS_REGION || "us-east-1",
  guestsFunction:
    process.env.GUESTS_FUNCTION || "aws-lambda-guests-dev-sendEventInvitations",
  triggerLogGroup:
    process.env.TRIGGER_LOG_GROUP || "/aws/lambda/notifications-dev-triggerNotification",
  guestsLogGroup:
    process.env.GUESTS_LOG_GROUP || "/aws/lambda/aws-lambda-guests-dev-sendEventInvitations",
  webhookLogGroup:
    process.env.WEBHOOK_LOG_GROUP || "/aws/lambda/notifications-dev-whatsappWebhook",
  waitSeconds: Number(process.env.WAIT_SECONDS || 120),
  pollMs: Number(process.env.POLL_MS || 8000),
};

function printUsage() {
  console.log(`
Uso:
  node diagnose-whatsapp-invitation.js --event-id <id> --user-id <id> --invited-by <id> [opciones]

Opciones:
  --event-id <id>         EventId a invitar
  --user-id <id>          UserId destinatario
  --invited-by <id>       UserId que invita
  --wait-seconds <n>      Tiempo maximo de espera para callback webhook
  --region <aws-region>   Region AWS (default: us-east-1)
  --guests-function <fn>  Lambda de invitaciones
  --help                  Muestra esta ayuda

Ejemplo:
  npm run diag:whatsapp-invite -- --event-id b6d59643-081f-40bf-abde-3cd4e64f333b --user-id f393b6ec-7 --invited-by 42c2e4a4-0 --wait-seconds 45
`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNestedJson(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function extractJsonAfterMarker(message, marker) {
  const markerIndex = message.indexOf(marker);
  if (markerIndex < 0) return null;

  const jsonStart = message.indexOf("{", markerIndex);
  if (jsonStart < 0) return null;

  const maybeJson = message.slice(jsonStart).trim();
  return parseNestedJson(maybeJson);
}

async function fetchAllLogEvents(cloudWatchLogs, params) {
  const events = [];
  let nextToken;

  do {
    const response = await cloudWatchLogs
      .filterLogEvents({
        ...params,
        nextToken,
      })
      .promise();

    events.push(...(response.events || []));
    nextToken = response.nextToken;
  } while (nextToken);

  return events;
}

function filterEventsByText(events, ...needles) {
  return events.filter((event) => {
    const message = String(event.message || "");
    return needles.every((needle) => message.includes(needle));
  });
}

function getLatestMessage(events, predicate) {
  return [...events]
    .reverse()
    .find((event) => predicate(String(event.message || "")));
}

function extractRequestId(message) {
  const match = String(message || "").match(
    /\d{4}-\d{2}-\d{2}T[^\t\n]*\t([a-f0-9\-]{36})\t/i
  );
  return match ? match[1] : null;
}

function extractAcceptedInfo(message) {
  const acceptedMatch = message.match(
    /"id":"(wamid[^"]+)","message_status":"accepted"/
  );

  if (!acceptedMatch) return null;

  return {
    wamid: acceptedMatch[1],
    accepted: true,
  };
}

function extractMetaError(message) {
  const body = extractJsonAfterMarker(message, "WhatsApp API response:");
  const responseBody = parseNestedJson(body && body.responseBody);

  if (!responseBody || !responseBody.error) return null;

  return {
    code: responseBody.error.code,
    message: responseBody.error.message,
    details: responseBody.error.error_data && responseBody.error.error_data.details,
  };
}

function isFilled(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function buildTemplateFieldSummary(metadata = {}) {
  return {
    favoriteUserName: isFilled(metadata.favoriteUserName),
    inviterName: isFilled(metadata.inviterName),
    eventName: isFilled(metadata.eventName),
    link: isFilled(metadata.link),
    eventImage: isFilled(metadata.eventImage),
  };
}

function parseInvitationPayloadFromGuestsLog(message) {
  const raw = extractJsonAfterMarker(message, '📦 Payload:');
  const body = raw && parseNestedJson(raw.body);
  return body && body.metadata ? body.metadata : null;
}

function extractAcceptedInfoFromGuestsResponse(message) {
  const acceptedMatch = String(message || "").match(
    /wamid[^\\"]+/ 
  );
  const hasAccepted = String(message || "").includes(
    '\\"message_status\\":\\"accepted\\"'
  );

  if (!acceptedMatch || !hasAccepted) return null;

  return {
    wamid: acceptedMatch[0],
    accepted: true,
  };
}

async function findWebhookStatus(dynamodb, wamid) {
  if (!wamid) return null;

  const response = await dynamodb
    .scan({
      TableName: "WhatsAppWebhookLogs",
      FilterExpression: "contains(messageId, :mid)",
      ExpressionAttributeValues: {
        ":mid": wamid,
      },
    })
    .promise();

  return (response.Items || [])[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const eventId = args["event-id"];
  const userId = args["user-id"];
  const invitedBy = args["invited-by"];

  if (!eventId || !userId || !invitedBy) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const config = {
    ...DEFAULTS,
    region: args.region || DEFAULTS.region,
    waitSeconds: Number(args["wait-seconds"] || DEFAULTS.waitSeconds),
    guestsFunction: args["guests-function"] || DEFAULTS.guestsFunction,
  };

  AWS.config.update({ region: config.region });

  const lambda = new AWS.Lambda();
  const cloudWatchLogs = new AWS.CloudWatchLogs();
  const dynamodb = new AWS.DynamoDB.DocumentClient();

  const startedAt = Date.now();
  console.log("=== WhatsApp Invitation Diagnostic ===");
  console.log(
    JSON.stringify(
      {
        region: config.region,
        eventId,
        userId,
        invitedBy,
        waitSeconds: config.waitSeconds,
        guestsFunction: config.guestsFunction,
      },
      null,
      2
    )
  );

  const invokePayload = {
    pathParameters: { eventId },
    body: JSON.stringify({
      invitedBy,
      channels: ["push", "whatsapp", "email", "inApp"],
      users: [userId],
    }),
  };

  const invokeResponse = await lambda
    .invoke({
      FunctionName: config.guestsFunction,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(invokePayload),
    })
    .promise();

  const lambdaPayload = parseNestedJson(invokeResponse.Payload) || {};
  const lambdaBody = parseNestedJson(lambdaPayload.body) || {};

  console.log("\n1. Resultado de invocacion");
  console.log(
    JSON.stringify(
      {
        statusCode: lambdaPayload.statusCode,
        message: lambdaBody.message,
        notificationsSent: lambdaBody.notificationsSent,
        channels: lambdaBody.channels,
      },
      null,
      2
    )
  );

  let acceptedInfo = null;
  let metaError = null;
  let templateMetadata = null;
  let builtComponents = null;
  let webhookItem = null;
  let webhookLogCount = 0;
  let acceptedTimestamp = null;

  const deadline = startedAt + config.waitSeconds * 1000;

  while (Date.now() <= deadline) {
    const guestEvents = await fetchAllLogEvents(cloudWatchLogs, {
      logGroupName: config.guestsLogGroup,
      startTime: startedAt - 60000,
      limit: 200,
    });
    const guestEventsForInvocation = filterEventsByText(guestEvents, eventId);

    const guestRequest = getLatestMessage(
      guestEventsForInvocation,
      (message) =>
        message.includes("Event:") &&
        message.includes(eventId) &&
        message.includes(userId)
    );
    const guestRequestId = extractRequestId(
      guestRequest && guestRequest.message
    );
    const correlatedGuestEvents = guestRequestId
      ? filterEventsByText(guestEvents, guestRequestId)
      : guestEventsForInvocation;

    const payloadMessage = getLatestMessage(
      correlatedGuestEvents,
      (message) =>
        message.includes("📦 Payload:") && message.includes(userId)
    );
    const acceptedMessage = getLatestMessage(
      correlatedGuestEvents,
      (message) =>
        message.includes("📄 Response body:") &&
        message.includes('\\"message_status\\":\\"accepted\\"')
    );
    const errorMessage = getLatestMessage(
      correlatedGuestEvents,
      (message) =>
        message.includes("📄 Response body:") &&
        message.includes('\\"error\\"')
    );

    if (payloadMessage && !templateMetadata) {
      templateMetadata = parseInvitationPayloadFromGuestsLog(
        String(payloadMessage.message || "")
      );
    }

    if (templateMetadata && !builtComponents) {
      const localComponents = buildEventInvitationTemplate(templateMetadata);
      builtComponents = {
        header: localComponents.find((item) => item.type === "header")?.parameters || [],
        body: localComponents.find((item) => item.type === "body")?.parameters || [],
      };
    }

    if (acceptedMessage && !acceptedInfo) {
      acceptedInfo = extractAcceptedInfoFromGuestsResponse(
        String(acceptedMessage.message || "")
      );
      acceptedTimestamp = acceptedMessage.timestamp;
    }

    if (errorMessage && !metaError) {
      metaError = extractMetaError(String(errorMessage.message || ""));
    }

    if (acceptedInfo && !webhookItem) {
      webhookItem = await findWebhookStatus(dynamodb, acceptedInfo.wamid);

      const webhookEvents = await fetchAllLogEvents(cloudWatchLogs, {
        logGroupName: config.webhookLogGroup,
        startTime: startedAt,
        limit: 100,
      });

      webhookLogCount = webhookEvents.length;

      if (webhookItem) break;
    }

    if (metaError) break;

    await delay(config.pollMs);
  }

  console.log("\n2. Validacion de payload de plantilla");
  console.log(
    JSON.stringify(
      {
        metadataFound: !!templateMetadata,
        fieldSummary: buildTemplateFieldSummary(templateMetadata || {}),
        metadataSample: templateMetadata
          ? {
              favoriteUserName: templateMetadata.favoriteUserName,
              inviterName: templateMetadata.inviterName,
              eventName: templateMetadata.eventName,
              link: templateMetadata.link,
              eventImage: templateMetadata.eventImage,
              phoneNumber: templateMetadata.phoneNumber,
              phone: templateMetadata.phone,
            }
          : null,
      },
      null,
      2
    )
  );

  console.log("\n3. Componentes construidos");
  console.log(
    JSON.stringify(
      {
        found: !!builtComponents,
        headerCount: builtComponents && builtComponents.header ? builtComponents.header.length : 0,
        bodyCount: builtComponents && builtComponents.body ? builtComponents.body.length : 0,
        bodyPreview:
          builtComponents && Array.isArray(builtComponents.body)
            ? builtComponents.body.map((item) => item.text)
            : [],
      },
      null,
      2
    )
  );

  console.log("\n4. Resultado de envio a Meta");
  console.log(
    JSON.stringify(
      metaError
        ? { accepted: false, error: metaError }
        : {
            accepted: !!acceptedInfo,
            wamid: acceptedInfo && acceptedInfo.wamid,
            acceptedAt: acceptedTimestamp ? new Date(acceptedTimestamp).toISOString() : null,
          },
      null,
      2
    )
  );

  console.log("\n5. Callback webhook");
  console.log(
    JSON.stringify(
      {
        found: !!webhookItem,
        webhookLogCount,
        item: webhookItem
          ? {
              messageId: webhookItem.messageId,
              status: webhookItem.status,
              timestamp: webhookItem.timestamp,
            }
          : null,
      },
      null,
      2
    )
  );

  console.log("\n6. Diagnostico");
  if (metaError) {
    console.log(
      "Meta rechazo el mensaje. Revisar templateName, idioma o aprobacion de plantilla."
    );
    return;
  }

  if (acceptedInfo && !webhookItem) {
    console.log(
      "Meta acepto el envio, pero no aparecio callback webhook en la ventana observada. El backend de envio esta bien; falta trazabilidad o entrega final desde Meta."
    );
    return;
  }

  if (acceptedInfo && webhookItem) {
    console.log(
      `Meta acepto el envio y el webhook reporto estado ${webhookItem.status}.`
    );
    return;
  }

  console.log(
    "No se encontro evidencia suficiente del envio en logs. Aumenta --wait-seconds o revisa retencion/latencia de CloudWatch."
  );
}

main().catch((error) => {
  console.error("Diagnostic failed:", error && error.message ? error.message : error);
  process.exitCode = 1;
});