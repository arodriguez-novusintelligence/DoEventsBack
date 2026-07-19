const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const sendChatMessage = require("../gateways/sendChatMessage");

exports.handler = async (event) => {
  try {
    const { userId, roomId } = JSON.parse(event.body);

    // console.log("Exiting chat room:", {
    //   userId,
    //   roomId,
    //   chatId,
    // });

    // CREATE DYNAMODB QUERY PARAMETERS FOR ROOM
    const getRoomParams = {
      TableName: "Chats",
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": roomId,
      },
    };

    const roomResult = await docClient.query(getRoomParams).promise();
    const roomData = roomResult.Items.length > 0 ? roomResult.Items[0] : null;

    if (!roomData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Sala no encontrada" }),
      };
    }

    const participants = roomData.participants || [];

    if (!participants.includes(userId)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "El usuario no está en esta sala" }),
      };
    }

    const updatedParticipants = participants.filter((id) => id !== userId);

    await docClient
      .update({
        TableName: "Chats",
        Key: {
          id: roomData.id,
          updatedAt: roomData.updatedAt,
        },
        UpdateExpression: "SET #participants = :updatedParticipants",
        ExpressionAttributeNames: {
          "#participants": "participants",
        },
        ExpressionAttributeValues: {
          ":updatedParticipants": updatedParticipants,
        },
      })
      .promise();

    //  docClient.delete({
    //     TableName: 'UserChannels',
    //     Key: {
    //       channelId: item.channelId,
    //       connectionId: item.connectionId
    //     }
    //   }).promise()

    // CREATE NOTIFICATION PAYLOAD
    const messagePayload = {
      roomId: roomId,
      message: {
        action: "user-exit",
        text: `El usuario ${userId} ha salido de la sala.`,
        sender: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: "message-exit-user",
        deletedAt: null,
      },
    };

    // PRODUCTION
    // await lambda
    //   .invoke({
    //     FunctionName: "sendNotification",
    //     InvocationType: "Event",
    //     Payload: JSON.stringify(notificationPayload),
    //   })
    //   .promise();

    // TEMPORAL SOLO DESARROLLO
    await sendChatMessage.handler({
      body: JSON.stringify(messagePayload),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Usuario eliminado del chat y conexión borrada",
      }),
    };
  } catch (error) {
    console.error("Error al salir del chat:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" }),
    };
  }
};
