const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getProfileImageUrl } = require("./utils/imageUrlHelper");

// Función para obtener datos de un usuario desde Client
async function getUserFromClient(userId) {
  try {
    console.log(`Searching user ${userId} in Client table...`);
    const result = await dynamodb
      .get({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId }, // Client usa 'id' como partition key, no 'userId'
      })
      .promise();

    console.log(`Client query result for ${userId}:`, JSON.stringify(result));

    if (result.Item) {
      const signedPhoto = getProfileImageUrl(
        result.Item.fotoPerfilUrl || result.Item.Photo,
        result.Item.platform || result.Item.PLATFORM || null,
      );
      return {
        userId: result.Item.id, // El id de Client
        name: result.Item.name || result.Item.Name || "",
        lastName: result.Item.lastName || result.Item.LastName || "",
        email: result.Item.email || result.Item.Email || "",
        phone: result.Item.phone || result.Item.Phone || "",
        username:
          result.Item.username ||
          result.Item.Username ||
          result.Item.user ||
          "",
        profileImageUrl: signedPhoto,
        originType: "REGISTERED",
      };
    }
    console.log(`User ${userId} not found in Client table`);
    return null;
  } catch (error) {
    console.error(`Error getting user ${userId} from Client:`, error);
    return null;
  }
}

// Función para obtener datos de un usuario desde FavoriteUsers
async function getUserFromFavoriteUsers(ownerId, favoriteId) {
  try {
    console.log(
      `Searching favoriteId ${favoriteId} for owner ${ownerId} in FavoriteUsers table...`
    );

    // Get directo usando las claves de la tabla
    const getParams = {
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      Key: {
        userId: ownerId, // Partition key
        favoriteId: favoriteId, // Sort key
      },
    };

    console.log("FavoriteUsers get params:", JSON.stringify(getParams));

    const result = await dynamodb.get(getParams).promise();

    console.log(`FavoriteUsers get result:`, JSON.stringify(result));

    if (result.Item) {
      const user = result.Item;
      const signedPhotoWithPlatform = getProfileImageUrl(
        user.profileImageUrl,
        user.platform || user.PLATFORM || null,
      );
      return {
        userId: user.invitedUserId || user.favoriteId, // Usar invitedUserId si existe, sino favoriteId
        favoriteId: user.favoriteId,
        name: user.name || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
        username: user.username || "",
        profileImageUrl: signedPhotoWithPlatform,
        originType: user.originType || "MANUAL",
        isFavorite: user.isFavorite || false,
      };
    }
    console.log(
      `User with favoriteId ${favoriteId} not found in FavoriteUsers for owner ${ownerId}`
    );
    return null;
  } catch (error) {
    console.error(
      `Error getting favoriteId ${favoriteId} from FavoriteUsers:`,
      error
    );
    return null;
  }
}

// Función para enriquecer userIds con datos completos
async function enrichUserIds(userIds, ownerId) {
  console.log(
    `Enriching ${userIds.length} users for owner ${ownerId}:`,
    userIds
  );
  const enrichedUsers = [];

  for (const userIdOrFavoriteId of userIds) {
    console.log(`Processing ID: ${userIdOrFavoriteId}`);

    // Intentar primero desde Client (usuarios registrados)
    let userData = await getUserFromClient(userIdOrFavoriteId);

    // Si no está en Client, buscar en FavoriteUsers usando favoriteId
    if (!userData) {
      console.log(
        `ID ${userIdOrFavoriteId} not in Client, trying FavoriteUsers with favoriteId...`
      );
      userData = await getUserFromFavoriteUsers(ownerId, userIdOrFavoriteId);
    }

    if (userData) {
      console.log(
        `User ${userIdOrFavoriteId} found:`,
        JSON.stringify(userData)
      );
      enrichedUsers.push(userData);
    } else {
      // Si no se encuentra en ninguna tabla, devolver solo el ID
      console.log(
        `ID ${userIdOrFavoriteId} NOT FOUND in any table, returning placeholder`
      );
      enrichedUsers.push({
        userId: userIdOrFavoriteId,
        name: "Usuario no encontrado",
        originType: "UNKNOWN",
      });
    }
  }

  console.log(`Enrichment complete: ${enrichedUsers.length} users processed`);
  return enrichedUsers;
}

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId } = event.pathParameters;

    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    // Query para obtener todos los grupos del usuario
    const params = {
      TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    console.log("Query params:", JSON.stringify(params));

    const result = await dynamodb.query(params).promise();

    console.log(`Found ${result.Items.length} groups for user ${userId}`);

    // Ordenar por el campo order
    const sortedGroups = result.Items.sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    // Formatear la respuesta y enriquecer con datos de usuarios
    const groupsPromises = sortedGroups.map(async (item) => {
      const users = await enrichUserIds(item.userIds || [], userId); // userId del path parameter

      return {
        groupId: item.groupId,
        groupName: item.groupName,
        color: item.color,
        order: item.order || 0,
        users, // Array de objetos de usuario con datos completos
        userIds: item.userIds || [], // Mantener los IDs originales
        tags: item.tags || [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    const groups = await Promise.all(groupsPromises);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groups,
        total: groups.length,
      }),
    };
  } catch (error) {
    console.error("Error in getFavoriteGroupsHandler:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
