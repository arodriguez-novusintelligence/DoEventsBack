const AWS = require("aws-sdk");
const lambda = new AWS.Lambda();

const NOTIFICATIONS_LAMBDA =
  process.env.NOTIFICATIONS_LAMBDA || "notifications-qa-triggerNotification";

async function triggerNotification({
  templateKey,
  userId,
  channels = ["push", "inApp", "email"],
  metadata = {},
}) {
  if (!templateKey || !userId) return;
  try {
    await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_LAMBDA,
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
