const AWS = require("aws-sdk");
const lambdaRegion =
  process.env.AWS_REGION || process.env.DYNAMODB_REGION || "us-east-2";
const lambda = new AWS.Lambda({ region: lambdaRegion });

const NOTIFICATIONS_FUNCTION =
  process.env.NOTIFICATIONS_FUNCTION ||
  process.env.NOTIFICATIONS_LAMBDA ||
  "notifications-qa-triggerNotification";

async function triggerNotification({
  templateKey,
  userId,
  channels = ["push", "inApp", "email", "whatsapp"],
  metadata = {},
}) {
  if (!templateKey || !userId) return;
  try {
    await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_FUNCTION,
        InvocationType: "Event",
        Payload: JSON.stringify({
          body: JSON.stringify({
            templateKey,
            userId,
            channels,
            metadata: { userId, ...metadata },
          }),
        }),
      })
      .promise();
  } catch (err) {
    console.warn(`triggerNotification ${templateKey} failed:`, err.message);
  }
}

module.exports = { triggerNotification };
