exports.handler = async (event) => {
  try {
    const { requestContext = {}, body } = event;
    let messageData = {};
    if (typeof body === "string") {
      try {
        messageData = JSON.parse(body || "{}");
      } catch {
        messageData = {};
      }
    } else if (body && typeof body === "object") {
      messageData = body;
    }
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Dispatcher received message successfully",
        connectionId: requestContext.connectionId,
        routeKey: requestContext.routeKey,
        received: messageData,
      }),
    };
  } catch (error) {
    console.error("dispatcher:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
