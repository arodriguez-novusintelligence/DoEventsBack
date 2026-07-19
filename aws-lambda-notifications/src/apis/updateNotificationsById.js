const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const { jsonResponse } = require("../utils/corsHeaders");

exports.handler = async (event) => {
  const notification = JSON.parse(event.body);
  const notificationId = event.pathParameters.id;

  if (!notificationId) {
    return jsonResponse(400, { message: "Notification ID is required" }, event);
  }

  if (!notification) {
    return jsonResponse(400, { message: "Notification is required" }, event);
  }

  if (!notification.userId || !notification.timestamp) {
    return jsonResponse(400, { message: "userId and timestamp are required" }, event);
  }

  // UPDATE NOTIFICATION
  const updateNotificationParams = {
    TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
    Key: {
      userId: notification.userId,
      timestamp: notification.timestamp
    },
    UpdateExpression: "set #read = :read, #type = :type, #message = :message, #status = :status",
    ExpressionAttributeNames: { "#read": "read", "#type": "type", "#message": "message", "#status": "status" },
    ExpressionAttributeValues: { ":read": true, ":type": notification.type, ":message": notification.message, ":status": notification.status },
  };

  // GET UPDATED NOTIFICATION
  const getNotificationParams = {
    TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
    Key: {
      userId: notification.userId,
      timestamp: notification.timestamp
    },
  };

  try {

    // UPDATE NOTIFICATION
    await dynamodb.update(updateNotificationParams).promise();

    // GET UPDATED NOTIFICATION
    const updatedNotification = await dynamodb.get(getNotificationParams).promise();

    // RETURN UPDATED NOTIFICATION
    return jsonResponse(200, updatedNotification, event);
  } catch (err) {
    console.error("Error updating notification:", err);
    return jsonResponse(500, { message: "Error updating notification" }, event);
  }
};