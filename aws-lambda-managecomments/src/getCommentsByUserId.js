const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const PROFILE_BUCKET = "doeventprofileimagesbucket";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveProfileImage = (imageValue, platform) => {
  if (!imageValue) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(imageValue)) {
    return imageValue;
  }

  try {
    return s3.getSignedUrl("getObject", {
      Bucket: PROFILE_BUCKET,
      Key: imageValue,
      Expires: 3600,
    });
  } catch (err) {
    return imageValue;
  }
};

exports.handler = async (event) => {
  try {
    const { userId } = event.pathParameters;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "userId es obligatorio",
        }),
      };
    }

    const params = {
      TableName: process.env.PROFILE_COMMENTS_TABLE || "ProfileComments",
      IndexName: "userIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false, // Ordenar por fecha más reciente primero
    };

    const result = await dynamodb.query(params).promise();

    // Resolver la URL de imagen de perfil para cada comentario
    const signedItems = await Promise.all(
      result.Items.map(async (item) => {
        if (item.userImage) {
          item.signedUserImage = resolveProfileImage(
            item.userImage,
            item.userPlatform,
          );
        }

        if (item.reply && item.reply.userImage) {
          item.reply.signedUserImage = resolveProfileImage(
            item.reply.userImage,
            item.reply.userPlatform,
          );
        }
        return item;
      })
    );
    result.Items = signedItems;
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Comentarios obtenidos exitosamente",
        data: result.Items,
        count: result.Items.length,
      }),
    };
  } catch (error) {
    console.error("Error obteniendo comentarios:", error);
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
