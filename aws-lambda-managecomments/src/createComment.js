const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamodb = new AWS.DynamoDB.DocumentClient();

const getUserData = async (userId) => {
  try {
    const userResult = await dynamodb
      .get({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        ProjectionExpression: "#usr, fotoPerfilUrl, #platform",
        ExpressionAttributeNames: { "#usr": "user", "#platform": "platform" },
      })
      .promise();

    if (!userResult.Item) {
      return { userName: "Usuario desconocido", userImage: null, userPlatform: null };
    }

    let userImageUrl = null;
    if (userResult.Item.fotoPerfilUrl) {
      userImageUrl = userResult.Item.fotoPerfilUrl;
    }

    return {
      userName: userResult.Item.user || "Usuario sin nombre",
      userImage: userImageUrl,
      userPlatform: userResult.Item.platform || userResult.Item.PLATFORM || null,
    };
  } catch (error) {
    console.error("Error obteniendo datos del usuario:", error);
    return { userName: "Usuario desconocido", userImage: null, userPlatform: null };
  }
};

exports.handler = async (event) => {
  try {
    const { userId, targetUserId, comment, liked } = JSON.parse(event.body);

    if (!userId || !targetUserId || !comment) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "userId, targetUserId y comment son obligatorios",
        }),
      };
    }

    // Obtener datos del usuario que comenta
    const userData = await getUserData(userId);

    const commentId = uuidv4();
    const createdAt = new Date().toISOString();

    const newComment = {
      id: commentId,
      userId: targetUserId, // El usuario al que se le hace el comentario
      commenterId: userId, // El usuario que hace el comentario
      userName: userData.userName,
      userImage: userData.userImage,
      userPlatform: userData.userPlatform,
      comment,
      createdAt,
      liked: liked === true ? true : false, // Solo true o false, por defecto false
      likedBy: liked === true ? userId : null, // Solo puede dar like el mismo usuario que comenta
      isEdited: false, // Inicialmente no está editado
      editedAt: null, // No tiene fecha de edición inicial
      reply: null,
    };

    await dynamodb
      .put({
        TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
        Item: newComment,
      })
      .promise();

    return {
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        message: "Comentario creado exitosamente",
        data: newComment,
      }),
    };
  } catch (error) {
    console.error("Error creando comentario:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
};
