function buildResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
}

function buildErrorResponse(statusCode, errorCode, message, details = null) {
  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
  };

  if (details) {
    errorResponse.error.details = details;
  }

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify(errorResponse),
  };
}

module.exports = {
  buildResponse,
  buildErrorResponse,
};
