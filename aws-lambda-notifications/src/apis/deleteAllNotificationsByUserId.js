const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { userId } = event.pathParameters;

    // Validar parámetro requerido
    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    // Primero, obtener todas las notificaciones del usuario
    const queryParams = {
      TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    const result = await dynamodb.query(queryParams).promise();
    const notifications = result.Items;

    if (notifications.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "No notifications found for this user",
          userId: userId,
          deletedCount: 0,
        }),
      };
    }

    // Eliminar todas las notificaciones en batch
    const deletePromises = notifications.map((notification) => {
      const deleteParams = {
        TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
        Key: {
          userId: notification.userId,
          timestamp: notification.timestamp,
        },
      };
      return dynamodb.delete(deleteParams).promise();
    });

    await Promise.all(deletePromises);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "All notifications deleted successfully",
        userId: userId,
        deletedCount: notifications.length,
      }),
    };
  } catch (error) {
    console.error("Error deleting notifications:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to delete notifications",
        message: error.message,
      }),
    };
  }
};
