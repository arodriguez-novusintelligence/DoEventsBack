const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const { getProfileImageUrl } = require("./utils/imageUrlHelper");

// Función para procesar un solo usuario
async function processSingleUser(userId, targetUserId) {
  const now = new Date().toISOString();

  // 1. Buscar si el usuario ya existe en Client
  console.log(`Checking if user ${targetUserId} exists in Client table...`);
  const clientResult = await dynamodb
    .get({
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: { id: targetUserId },
    })
    .promise();

  if (!clientResult.Item) {
    return {
      success: false,
      targetUserId,
      error: "User not found in Client table",
    };
  }

  // Usuario existe en Client
  console.log(`User ${targetUserId} found in Client table`);

  const clientEmail = clientResult.Item.email
    ? clientResult.Item.email.trim().toLowerCase()
    : undefined;
  const clientUsername = (clientResult.Item.user || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  // Buscar si ya existe en FavoriteUsers (por id de plataforma, email o @username)
  console.log(`Checking if user is already in FavoriteUsers...`);
  const favoriteResult = await dynamodb
    .query({
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    })
    .promise();

  const existingFavorite = favoriteResult.Items?.find((item) => {
    if (item.invitedUserId === targetUserId) return true;
    if (
      clientEmail
      && item.email
      && item.email.trim().toLowerCase() === clientEmail
    ) {
      return true;
    }
    const itemUser = (item.username || item.user || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    return Boolean(clientUsername && itemUser && itemUser === clientUsername);
  });

  let favoriteId;
  let wasCreated = false;

  if (existingFavorite) {
    favoriteId = existingFavorite.favoriteId;

    const mergedName =
      (existingFavorite.name && existingFavorite.name.length >= (clientResult.Item.name || "").length)
        ? existingFavorite.name
        : (clientResult.Item.name || existingFavorite.name || "");
    const mergedLastName =
      (existingFavorite.lastName && existingFavorite.lastName.length >= (clientResult.Item.lastName || "").length)
        ? existingFavorite.lastName
        : (clientResult.Item.lastName || existingFavorite.lastName || "");

    console.log(
      `User already exists in FavoriteUsers (favoriteId: ${favoriteId}), merging profile...`
    );
    await dynamodb
      .update({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Key: {
          userId,
          favoriteId,
        },
        UpdateExpression:
          "SET isFavorite = :isFavorite, invitedUserId = :invitedUserId, #name = :name, lastName = :lastName, email = :email, phone = :phone, phoneIndicative = :phoneIndicative, phoneNumber = :phoneNumber, username = :username, #user = :user, profileImageUrl = :profileImageUrl, originType = :originType, groupIds = :groupIds, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#name": "name",
          "#user": "user",
        },
        ExpressionAttributeValues: {
          ":isFavorite": true,
          ":invitedUserId": targetUserId,
          ":name": mergedName,
          ":lastName": mergedLastName,
          ":email": clientResult.Item.email || existingFavorite.email || "",
          ":phone": clientResult.Item.phone || existingFavorite.phone || "",
          ":phoneIndicative": clientResult.Item.phoneIndicative || clientResult.Item.indicativo || existingFavorite.phoneIndicative || "",
          ":phoneNumber": clientResult.Item.phoneNumber || clientResult.Item.telefono || existingFavorite.phoneNumber || "",
          ":username": clientResult.Item.user || existingFavorite.username || "",
          ":user": clientResult.Item.user || existingFavorite.user || "",
          ":profileImageUrl": clientResult.Item.fotoPerfilUrl || existingFavorite.profileImageUrl || "",
          ":originType": "REGISTERED",
          ":groupIds": [],
          ":updatedAt": now,
        },
      })
      .promise();

    wasCreated = false;
  } else {
    // No existe en FavoriteUsers, crear nuevo registro
    favoriteId = uuidv4();
    const invitedUserId = targetUserId;

    console.log(`Creating new entry in FavoriteUsers with data from Client...`);

    // Guardar la clave/URL original de la foto de perfil
    const profileImageUrl = clientResult.Item.fotoPerfilUrl || "";

    const item = {
      userId, // Partition key (dueño)
      favoriteId, // Sort key
      invitedUserId, // ID del usuario en Client
      name: clientResult.Item.name || "",
      lastName: clientResult.Item.lastName || "",
      email: clientResult.Item.email || "",
      phone: clientResult.Item.phone || "",
      phoneIndicative: clientResult.Item.phoneIndicative || clientResult.Item.indicativo || "",
      phoneNumber: clientResult.Item.phoneNumber || clientResult.Item.telefono || "",
      username: clientResult.Item.user || "",
      profileImageUrl, // Guardar la clave S3 o URL externa
      originType: "REGISTERED",
      isFavorite: true,
      groupIds: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    await dynamodb
      .put({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Item: item,
      })
      .promise();

    wasCreated = true;
  }

  return {
    success: true,
    favoriteId,
    invitedUserId: targetUserId,
    isFavorite: true,
    wasCreated,
  };
}

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId } = event.pathParameters; // Dueño de la lista
    const body = JSON.parse(event.body);

    // Validaciones
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    // Soportar tanto targetUserId (uno) como targetUserIds (varios)
    let targetUserIds = [];

    if (body.targetUserId) {
      targetUserIds = [body.targetUserId];
    } else if (body.targetUserIds && Array.isArray(body.targetUserIds)) {
      targetUserIds = body.targetUserIds;
    } else {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          error: "targetUserId or targetUserIds is required",
          message:
            "Provide either targetUserId (string) or targetUserIds (array)",
        }),
      };
    }

    if (targetUserIds.length === 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ error: "At least one user ID is required" }),
      };
    }

    console.log(`Processing ${targetUserIds.length} users...`);

    // Procesar cada usuario
    const results = await Promise.all(
      targetUserIds.map((targetUserId) =>
        processSingleUser(userId, targetUserId)
      )
    );

    // Separar éxitos y errores
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const created = successful.filter((r) => r.wasCreated).length;
    const updated = successful.filter((r) => !r.wasCreated).length;

    return {
      statusCode: successful.length > 0 ? (failed.length > 0 ? 207 : 200) : 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: `Processed ${targetUserIds.length} user(s)`,
        summary: {
          total: targetUserIds.length,
          successful: successful.length,
          failed: failed.length,
          created,
          updated,
        },
        results: successful,
        errors: failed.length > 0 ? failed : undefined,
      }),
    };
  } catch (error) {
    console.error("Error in addFavoriteHandler:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
