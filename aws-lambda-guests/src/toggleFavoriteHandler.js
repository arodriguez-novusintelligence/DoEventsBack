const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId, favoriteId } = event.pathParameters;
    const body = JSON.parse(event.body);

    if (!userId || !favoriteId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "userId and favoriteId are required" }),
      };
    }

    const isFavorite = body.isFavorite !== undefined ? body.isFavorite : true;
    const now = new Date().toISOString();

    // Primero, intentar verificar si el registro existe
    console.log(
      `Checking if favoriteId ${favoriteId} exists for user ${userId}...`
    );

    const getParams = {
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      Key: {
        userId: userId,
        favoriteId: favoriteId,
      },
    };

    const existingItem = await dynamodb.get(getParams).promise();

    if (existingItem.Item) {
      // El registro existe, actualizarlo
      console.log(
        `Favorite user exists, updating isFavorite to ${isFavorite}...`
      );

      const existingGroupIds = existingItem.Item.groupIds || [];
      const updateParams = {
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Key: {
          userId: userId,
          favoriteId: favoriteId,
        },
        UpdateExpression:
          "SET isFavorite = :isFavorite, groupIds = :groupIds, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":isFavorite": isFavorite,
          ":groupIds": isFavorite ? [] : existingGroupIds,
          ":updatedAt": now,
        },
        ReturnValues: "ALL_NEW",
      };

      const result = await dynamodb.update(updateParams).promise();

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Favorite status updated successfully",
          user: result.Attributes,
          action: "updated",
        }),
      };
    } else {
      // El registro NO existe, buscar en Client y crearlo
      console.log(
        `Favorite user not found, searching in Client table with id: ${favoriteId}...`
      );

      const clientResult = await dynamodb
        .get({
          TableName: process.env.CLIENT_TABLE || "Client",
          Key: { id: favoriteId },
        })
        .promise();

      if (!clientResult.Item) {
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "User not found",
            message: `User with id ${favoriteId} does not exist in Client table`,
          }),
        };
      }

      console.log(
        `User found in Client table, creating new FavoriteUsers entry...`
      );

      // Guardar la clave/URL original de la foto de perfil
      const profileImageUrl = clientResult.Item.fotoPerfilUrl || "";

      const newItem = {
        userId, // Partition key (dueño)
        favoriteId, // Sort key
        invitedUserId: favoriteId, // ID del usuario en Client
        name: clientResult.Item.name || "",
        lastName: clientResult.Item.lastName || "",
        email: clientResult.Item.email || "",
        phone: clientResult.Item.phone || "",
        username: clientResult.Item.user || "",
        profileImageUrl, // Guardar la clave S3 o URL externa
        originType: "REGISTERED",
        isFavorite: isFavorite,
        groupIds: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
      };

      await dynamodb
        .put({
          TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
          Item: newItem,
        })
        .promise();

      return {
        statusCode: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Favorite user created successfully",
          user: newItem,
          action: "created",
        }),
      };
    }
  } catch (error) {
    console.error("Error in toggleFavoriteHandler:", error);
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
