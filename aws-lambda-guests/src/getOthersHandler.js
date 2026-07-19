const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getProfileImageUrl } = require("./utils/imageUrlHelper");

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

    // Consultar followers (quienes me siguen)
    const followersParams = {
      TableName: process.env.FOLLOWERS_TABLE || "Followers",
      IndexName: "followUserIdIndex",
      KeyConditionExpression: "follow_userId = :userId",
      FilterExpression:
        "#status = :status AND attribute_not_exists(blocked_at)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":status": "accepted",
      },
    };

    // Consultar following (a quienes sigo)
    const followingParams = {
      TableName: process.env.FOLLOWERS_TABLE || "Followers",
      IndexName: "userIdIndex",
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "#status = :status",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":status": "accepted",
      },
    };

    // Consultar usuarios favoritos (para excluirlos)
    const favoritesParams = {
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "isFavorite = :isFavorite",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":isFavorite": true,
      },
    };

    const [followersData, followingData, favoritesData] = await Promise.all([
      dynamodb.query(followersParams).promise(),
      dynamodb.query(followingParams).promise(),
      dynamodb.query(favoritesParams).promise(),
    ]);

    // Crear un Set con los IDs de usuarios favoritos para excluirlos
    const favoriteUserIds = new Set();
    for (const fav of favoritesData.Items || []) {
      const favUserId = fav.invitedUserId || fav.favoriteId;
      if (favUserId) {
        favoriteUserIds.add(favUserId);
      }
    }
    console.log(
      `Found ${favoriteUserIds.size} favorite users to exclude:`,
      Array.from(favoriteUserIds),
    );

    // Unificar y marcar (excluyendo favoritos)
    const usersMap = {};
    for (const f of followersData.Items || []) {
      // Excluir si es favorito
      if (favoriteUserIds.has(f.userId)) {
        console.log(`Excluding follower ${f.userId} (is favorite)`);
        continue;
      }
      usersMap[f.userId] = {
        userId: f.userId,
        isFollower: true,
        isFollowing: false,
      };
    }
    for (const f of followingData.Items || []) {
      // Excluir si es favorito
      if (favoriteUserIds.has(f.follow_userId)) {
        console.log(`Excluding following ${f.follow_userId} (is favorite)`);
        continue;
      }
      if (usersMap[f.follow_userId]) {
        usersMap[f.follow_userId].isFollowing = true;
      } else {
        usersMap[f.follow_userId] = {
          userId: f.follow_userId,
          isFollower: false,
          isFollowing: true,
        };
      }
    }

    // Consultar usuarios no favoritos de FavoriteUsers
    const favoriteUsersParams = {
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      KeyConditionExpression: "userId = :userId",
      FilterExpression: "isFavorite = :isFavorite",
      ExpressionAttributeValues: {
        ":userId": userId,
        ":isFavorite": false,
      },
    };

    console.log(
      "Querying FavoriteUsers with params:",
      JSON.stringify(favoriteUsersParams),
    );

    try {
      const favoriteUsersData = await dynamodb
        .query(favoriteUsersParams)
        .promise();

      console.log(
        `Found ${
          favoriteUsersData.Items?.length || 0
        } non-favorite users in FavoriteUsers`,
      );

      for (const user of favoriteUsersData.Items || []) {
        // Usar invitedUserId o favoriteId como clave única del usuario
        const userIdKey = user.invitedUserId || user.favoriteId;
        console.log(
          `Processing FavoriteUsers entry: favoriteId=${user.favoriteId}, invitedUserId=${user.invitedUserId}, key=${userIdKey}`,
        );

        // Excluir si es favorito (isFavorite === true)
        if (user.isFavorite === true) {
          console.log(`Skipping user ${userIdKey} (is marked as favorite)`);
          continue;
        }

        if (!usersMap[userIdKey]) {
          usersMap[userIdKey] = {
            userId: userIdKey,
            favoriteId: user.favoriteId,
            name: user.name,
            lastName: user.lastName,
            username: user.username,
            phone: user.phone,
            phoneIndicative: user.phoneIndicative,
            phoneNumber: user.phoneNumber,
            email: user.email,
            profileImageUrl: user.profileImageUrl,
            originType: user.originType,
            isFollower: false,
            isFollowing: false,
            isFavorite: false,
          };
        } else {
          console.log(
            `User ${userIdKey} already in map (from Followers), skipping`,
          );
        }
      }
    } catch (error) {
      console.error("Error fetching favorite users:", error);
    }

    // Obtener datos de perfil desde Client
    const clientTable = "Client";
    const others = [];
    for (const user of Object.values(usersMap)) {
      // Solo buscar en Client si no tiene datos ya (usuarios de FavoriteUsers ya tienen datos)
      if (!user.name) {
        const clientParams = {
          TableName: clientTable,
          Key: { id: user.userId },
        };
        try {
          const clientData = await dynamodb.get(clientParams).promise();
          if (clientData.Item) {
            user.name = clientData.Item.name;
            user.lastName = clientData.Item.lastName;
            user.username = clientData.Item.user;
            user.email = clientData.Item.email || user.email;
            user.phone = clientData.Item.phone || user.phone;
            user.phoneIndicative =
              clientData.Item.phoneIndicative || user.phoneIndicative;
            user.phoneNumber = clientData.Item.phoneNumber || user.phoneNumber;
            user.profileImageUrl = getProfileImageUrl(
              clientData.Item.fotoPerfilUrl,
              clientData.Item.platform || clientData.Item.PLATFORM || null,
            );
          }
        } catch (e) {
          console.error("Error getting client data:", e);
        }
      } else {
        // Si ya tiene profileImageUrl pero necesita ser procesada (puede ser clave S3)
        if (user.profileImageUrl) {
          user.profileImageUrl = getProfileImageUrl(
            user.profileImageUrl,
            user.platform || user.PLATFORM || null,
          );
        }
      }
      // Normalizar email y teléfono compuesto
      if (user.email) {
        user.email = user.email.toLowerCase();
      }
      if (!user.phone && (user.phoneIndicative || user.phoneNumber)) {
        user.phone = `${user.phoneIndicative || ""}${user.phoneNumber || ""}`;
      }
      if (!user.username && user.userId) {
        user.username = user.userId;
      }
      // Asegurar que userId siempre esté presente
      if (!user.userId) {
        user.userId = user.favoriteId;
      }
      others.push(user);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ others }),
    };
  } catch (error) {
    console.error("Error in getOthersHandler:", error);
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
