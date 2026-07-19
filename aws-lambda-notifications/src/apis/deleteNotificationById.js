const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { userId, notificationId } = event.pathParameters;

    // Validar parámetros requeridos
    if (!userId || !notificationId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "userId and notificationId are required",
        }),
      };
    }

    // Eliminar la notificación específica usando timestamp como sort key
    const deleteParams = {
      TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
      Key: {
        userId: userId,
        timestamp: notificationId, // notificationId es el timestamp
      },
    };

    await dynamodb.delete(deleteParams).promise();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Notification deleted successfully",
        userId: userId,
        notificationId: notificationId,
      }),
    };
  } catch (error) {
    console.error("Error deleting notification:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to delete notification",
        message: error.message,
      }),
    };
  }
};
