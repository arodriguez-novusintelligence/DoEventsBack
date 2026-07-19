const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getClientByUserId } = require("./clientUserLookup");

const {
  buildNotificationActor,
  invokeFollowNotification,
} = require("./followNotifications");

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const { userId, follow_userId } = JSON.parse(event.body || "{}");

  if (!userId || !follow_userId) {
    return respond(400, {
      message: "Parámetros faltantes: userId y follow_userId son requeridos",
    });
  }

  if (userId === follow_userId) {
    return respond(400, { message: "No puedes seguirte a ti mismo" });
  }

  try {
    const [followerUser, targetUser] = await Promise.all([
      getClientByUserId(userId),
      getClientByUserId(follow_userId),
    ]);

    if (!followerUser) {
      return respond(404, { message: "Usuario seguidor no encontrado" });
    }

    if (!targetUser) {
      return respond(404, { message: "Usuario a seguir no encontrado" });
    }

    const resolvedFollowerId = String(followerUser.id || userId).trim();
    const resolvedTargetId = String(targetUser.id || follow_userId).trim();

    const followId = `${resolvedFollowerId}_${resolvedTargetId}`;
    const existingFollow = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: followId },
      })
      .promise();

    if (existingFollow.Item) {
      if (existingFollow.Item.status === "blocked") {
        return respond(403, {
          message: "No puedes seguir a este usuario. Has sido bloqueado.",
        });
      }
      if (existingFollow.Item.status === "pending") {
        return respond(200, {
          message: "Solicitud de seguimiento enviada. Esperando aprobación del usuario.",
          status: "pending",
        });
      }
      return respond(409, { message: "Ya sigues a este usuario" });
    }

    const reverseFollowId = `${resolvedTargetId}_${resolvedFollowerId}`;
    const reverseFollow = await dynamodb
      .get({
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Key: { follow_id: reverseFollowId },
      })
      .promise();

    if (reverseFollow.Item && reverseFollow.Item.status === "blocked") {
      return respond(403, {
        message: "No puedes seguir a este usuario. Has sido bloqueado.",
      });
    }

    if (!targetUser.isPublicProfile) {
      const followRequestParams = {
        TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
        Item: {
          follow_id: followId,
          userId: resolvedFollowerId,
          follow_userId: resolvedTargetId,
          status: "pending",
          timestamp: new Date().toISOString(),
        },
      };

      await dynamodb.put(followRequestParams).promise();

      await invokeFollowNotification("FOLLOW_REQUEST_RECEIVED", resolvedTargetId, {
        ...buildNotificationActor(resolvedFollowerId, followerUser),
        followId,
        status: "pending",
      });

      return respond(200, {
        message: "Solicitud de seguimiento enviada. Esperando aprobación del usuario.",
        status: "pending",
      });
    }

    const followParams = {
      TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
      Item: {
        follow_id: followId,
        userId: resolvedFollowerId,
        follow_userId: resolvedTargetId,
        status: "accepted",
        timestamp: new Date().toISOString(),
      },
    };

    await dynamodb.put(followParams).promise();

    await invokeFollowNotification("FOLLOW_USER_STARTED_FOLLOWING", resolvedTargetId, {
      ...buildNotificationActor(resolvedFollowerId, followerUser),
      followId,
      status: "accepted",
    });

    return respond(200, {
      message: "Usuario seguido exitosamente",
      status: "accepted",
    });
  } catch (error) {
    console.error("Error en followUser:", error);
    return respond(500, { error: "Error interno del servidor", message: error.message });
  }
};
