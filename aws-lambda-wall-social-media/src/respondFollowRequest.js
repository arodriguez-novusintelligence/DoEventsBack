const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const {
  buildNotificationActor,
  getUserById,
  invokeFollowNotification,
} = require("./followNotifications");

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const body = JSON.parse(event.body || "{}");
  const action = body.action; // 'accept' o 'reject'
  // Compatibilidad: follow_id directo, o construir desde follower + target
  let followId = body.follow_id;
  if (!followId && body.follow_userId && body.userId) {
    // userId = dueño del perfil (target), follow_userId = solicitante (follower)
    followId = `${body.follow_userId}_${body.userId}`;
  }
  if (!followId && body.followerId && body.userId) {
    followId = `${body.followerId}_${body.userId}`;
  }

  if (!followId || !action) {
    return respond(400, {
      message: "Parámetros faltantes: follow_id y action son requeridos",
    });
  }

  if (!["accept", "reject"].includes(action)) {
    return respond(400, { message: "Action debe ser 'accept' o 'reject'" });
  }

  try {
    const followRequest = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    if (!followRequest.Item) {
      return respond(404, {
        message: "Solicitud de seguimiento no encontrada",
      });
    }

    if (followRequest.Item.status !== "pending") {
      return respond(400, { message: "Esta solicitud ya fue procesada" });
    }

    if (action === "accept") {
      await dynamodb
        .update({
          TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
          Key: { follow_id: followId },
          UpdateExpression: "SET #status = :status, updated_at = :updated_at",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":status": "accepted",
            ":updated_at": new Date().toISOString(),
          },
        })
        .promise();

      const acceptedByUser = await getUserById(followRequest.Item.follow_userId);

      await invokeFollowNotification(
        "FOLLOW_REQUEST_ACCEPTED",
        followRequest.Item.userId,
        {
          ...buildNotificationActor(
            followRequest.Item.follow_userId,
            acceptedByUser || {},
          ),
          followId,
          status: "accepted",
        },
      );

      return respond(200, {
        message: "Solicitud de seguimiento aceptada exitosamente",
        status: "accepted",
      });
    }

    await dynamodb
      .delete({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    const rejectedByUser = await getUserById(followRequest.Item.follow_userId);

    await invokeFollowNotification(
      "FOLLOW_REQUEST_REJECTED",
      followRequest.Item.userId,
      {
        ...buildNotificationActor(
          followRequest.Item.follow_userId,
          rejectedByUser || {},
        ),
        followId,
        status: "rejected",
      },
    );

    return respond(200, {
      message: "Solicitud de seguimiento rechazada exitosamente",
      status: "rejected",
      follow_id: followId,
    });
  } catch (error) {
    console.error("Error en respondFollowRequest:", error);
    return respond(500, { error: "Error interno del servidor" });
  }
};
