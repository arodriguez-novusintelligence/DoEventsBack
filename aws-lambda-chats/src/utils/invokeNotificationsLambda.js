const AWS = require("aws-sdk");
const lambdaRegion =
  process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-1";
const lambda = new AWS.Lambda({ region: lambdaRegion });

/** Mismos nombres que usa dispatchNotification (inApp camelCase). */
const CHAT_INVITE_ALL_CHANNELS = ["push", "inApp", "email", "whatsapp"];

/**
 * Invoca notifications-{stage}-triggerNotification (RequestResponse).
 * Payload: { templateKey, metadata, channels? } — si incluyes channels, deben coincidir con el template.
 */
async function invokeTriggerNotification(payload) {
  const stage = process.env.STAGE || "dev";
  const functionName =
    process.env.NOTIFICATIONS_FUNCTION ||
    `notifications-${stage}-triggerNotification`;

  const result = await lambda
    .invoke({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(payload),
    })
    .promise();

  if (result.FunctionError) {
    const errorPayload = JSON.parse(result.Payload || "{}");
    throw new Error(
      errorPayload.errorMessage || "Error al invocar notificaciones",
    );
  }

  const response = JSON.parse(result.Payload || "{}");
  const body =
    typeof response.body === "string" ? JSON.parse(response.body) : response.body;
  if (response.statusCode && response.statusCode >= 400) {
    throw new Error(body?.message || body?.error || "Error en notificaciones");
  }
  return body;
}

module.exports = { invokeTriggerNotification, CHAT_INVITE_ALL_CHANNELS };
