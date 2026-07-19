const AWS = require("aws-sdk");

const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION || "us-east-1",
});

// Handler for joinRoom
exports.joinRoomHandler = async (event, context) => {
  try {
    // Get the stage from environment or default to 'dev'
    const stage = process.env.STAGE || "dev";
    const functionName = `chat-room-events-${stage}-joinRoom`;

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
    console.error("Error invoking joinRoom lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to join room" }),
    };
  }
};

// Handler for sendChatMessage
exports.sendChatMessageHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `chat-room-events-${stage}-sendChatMessage`;

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
    console.error("Error invoking sendChatMessage lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send message" }),
    };
  }
};

// Handler for sendChatMessageAssets
exports.sendChatMessageAssetsHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `chat-room-events-${stage}-sendChatMessageAssets`;

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
    console.error("Error invoking sendChatMessageAssets lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send message with assets" }),
    };
  }
};

// Handler for editChatMessage
exports.editChatMessageHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `chat-room-events-${stage}-editChatMessage`;

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
    console.error("Error invoking editChatMessage lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to edit message" }),
    };
  }
};

// Handler for reactChatMessage
exports.reactChatMessageHandler = async (event, context) => {
  try {
    const stage = process.env.STAGE || "dev";
    const functionName = `chat-room-events-${stage}-reactChatMessage`;

    const params = {
      FunctionName: functionName,
      Payload: JSON.stringify(event),
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
    console.error("Error invoking reactChatMessage lambda:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to react to message" }),
    };
  }
};
