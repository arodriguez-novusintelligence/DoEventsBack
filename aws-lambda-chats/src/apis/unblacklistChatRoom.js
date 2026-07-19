const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();

exports.handler = async (event) => {
  const { userId, roomId, channelId } = JSON.parse(event.body);

  const roomData = await docClient
    .get({
      TableName: "Chats",
      Key: { roomId: roomId },
    })
    .promise();

  if (!roomData.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Sala no encontrada" }),
    };
  }

  const blacklist = roomData.Item.blacklist || [];

  // 2. Validar que el usuario está bloqueado
  if (!blacklist.includes(channelId)) {
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: "El usuario no está bloqueado en esta sala",
      }),
    };
  }

  // 3. Remover el usuario de blacklist
  const updatedBlacklist = blacklist.filter((id) => id !== userId);

  await docClient
    .update({
      TableName: "Chats",
      Key: { roomId: roomId },
      UpdateExpression: "SET blacklist = :updated",
      ExpressionAttributeValues: {
        ":updated": updatedBlacklist,
      },
    })
    .promise();

  // 4. Emitir evento para socket
  await eventBridge
    .putEvents({
      Entries: [
        {
          Source: "chatroom.unblacklist",
          DetailType: "UserUnblacklisted",
          Detail: JSON.stringify({ roomId, channelId }),
          EventBusName: "default",
        },
      ],
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Usuario desbloqueado y evento emitido" }),
  };
};
