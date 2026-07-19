const AWS = require("aws-sdk");

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION || "us-east-1",
});

function parseEventBody(event) {
  if (!event || event.body == null) return {};
  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body || "{}");
    } catch {
      return {};
    }
  }
  return event.body || {};
}

// Handler for inAppNotification
exports.inAppNotificationHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `notifications-${stage}-inAppNotificationHandler`;

    const params = {
      FunctionName: functionName,
      Payload: JSON.stringify(event),
      InvocationType: "RequestResponse",
    };

    const result = await lambda.invoke(params).promise();

    if (result.StatusCode === 200) {
      const response = JSON.parse(result.Payload);
      return response;
    } else {
      console.error("Lambda invocation failed:", result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
  } catch (error) {
    console.error("Error invoking inAppNotification lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send in-app notification" }),
    };
  }
};

// Handler for emailNotification
exports.emailNotificationHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `notifications-${stage}-emailNotificationHandler`;

    const params = {
      FunctionName: functionName,
      Payload: JSON.stringify(event),
      InvocationType: "RequestResponse",
    };

    const result = await lambda.invoke(params).promise();

    if (result.StatusCode === 200) {
      const response = JSON.parse(result.Payload);
      return response;
    } else {
      console.error("Lambda invocation failed:", result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
  } catch (error) {
    console.error("Error invoking emailNotification lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send email notification" }),
    };
  }
};

// Handler for whatsappNotification
exports.whatsappNotificationHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `notifications-${stage}-whatsappNotificationHandler`;

    const params = {
      FunctionName: functionName,
      Payload: JSON.stringify(event),
      InvocationType: "RequestResponse",
    };

    const result = await lambda.invoke(params).promise();

    if (result.StatusCode === 200) {
      const response = JSON.parse(result.Payload);
      return response;
    } else {
      console.error("Lambda invocation failed:", result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
  } catch (error) {
    console.error("Error invoking whatsappNotification lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send WhatsApp notification" }),
    };
  }
};

// Generic notification router used by chat payloads
exports.sendNotificationHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `notifications-${stage}-triggerNotification`;
    const body = parseEventBody(event);

    const normalizedType = String(body.type || "").trim().toLowerCase();
    const normalizedStatus = String(body.status || "").trim().toLowerCase();

    const isMessageAnnouncement =
      normalizedType === "message-announcement" ||
      normalizedType === "messageannouncement" ||
      normalizedStatus === "message-announcement";

    const isChatReport =
      normalizedType === "chat-room-report" ||
      normalizedStatus === "report-user-notification";

    const payload = isMessageAnnouncement
      ? {
          templateKey: "CHAT_USER_ANNOUNCEMENT",
          channels: ["push", "inApp", "email"],
          metadata: {
            userId: body.userId,
            eventName: body.eventName || body.params?.eventName || "Chat",
            message:
              body.message ||
              body.params?.message ||
              body.params?.announcement ||
              body.params?.text ||
              "Anuncio importante",
            roomId: body.params?.roomId || body.roomId,
            senderName:
              body.params?.senderName ||
              body.params?.sender?.name ||
              body.senderName ||
              "Administrador",
            type: "message-announcement",
            status: body.status || "announcement-notification",
          },
        }
      : isChatReport
      ? {
          templateKey: "ADMIN_USER_REPORTED",
          channels: ["push", "inApp", "email"],
          metadata: {
            userId: body.userId,
            eventName: body.eventName || "Chat",
            roomId: body.params?.roomId || body.roomId,
            reportedBy:
              body.params?.userSenderReport?.name ||
              body.params?.userSenderReport?.id ||
              "Usuario",
            reportedUser:
              body.params?.reported?.name ||
              body.params?.reported?.id ||
              "Usuario",
            reportedMessage: body.params?.reported?.message || body.message,
            type: body.type || "chat-room-report",
            status: body.status || "report-user-notification",
          },
        }
      : {
          templateKey: body.templateKey || body.triggerId,
          channels: body.channels,
          metadata: {
            userId: body.userId,
            eventName: body.eventName || "Chat",
            ...body.metadata,
          },
        };

    if (!payload.templateKey || !payload.metadata?.userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "templateKey y userId son requeridos para sendNotification",
        }),
      };
    }

    const params = {
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      InvocationType: "RequestResponse",
    };

    const result = await lambda.invoke(params).promise();

    if (result.StatusCode === 200) {
      const response = JSON.parse(result.Payload);
      return response;
    }

    console.error("Lambda invocation failed:", result);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  } catch (error) {
    console.error("Error invoking sendNotification lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send notification" }),
    };
  }
};
