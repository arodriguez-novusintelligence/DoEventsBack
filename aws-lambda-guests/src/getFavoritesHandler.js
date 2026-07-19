const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getProfileImageUrl } = require("./utils/imageUrlHelper");
const { sanitizeStoredContact } = require("./utils/contactCategoryUtils");
const { guestResponse } = require("./guestResponse");

// Consulta la lista de usuarios favoritos de un usuario (QA CORS)
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId } = event.pathParameters;

    if (!userId) {
      return guestResponse(400, { error: "userId is required" });
    }

    console.log(`Fetching favorites for userId: ${userId}`);

    // Consultar todos los usuarios del userId y filtrar por isFavorite = true
    const params = {
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "isFavorite = :isFavorite",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":isFavorite": true,
      },
    };

    const result = await dynamodb.query(params).promise();

    console.log(`Found ${result.Items.length} favorite users`);

    // Formatear la respuesta
    const favorites = result.Items.map((item) => {
      // Generar URL firmada de S3 o usar URL externa directamente
      const profileImageUrl = getProfileImageUrl(
        item.profileImageUrl,
        item.platform || item.PLATFORM || null,
      );

      return sanitizeStoredContact({
        favoriteId: item.favoriteId,
        invitedUserId: item.invitedUserId,
        name: item.name || "",
        lastName: item.lastName || "",
        email: item.email || "",
        phone: item.phone || "",
        phoneIndicative: item.phoneIndicative || "",
        phoneNumber: item.phoneNumber || "",
        username: item.username || item.user || "",
        user: item.user || item.username || "",
        profileImageUrl: profileImageUrl || "", // URL lista para usar (firmada o externa)
        originType: item.originType || "",
        groupIds: item.groupIds || [],
        tags: item.tags || [],
        isFavorite: item.isFavorite,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    });

    return guestResponse(200, {
      favorites,
      count: favorites.length,
    });
  } catch (error) {
    console.error("Error in getFavoritesHandler:", error);
    return guestResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};
