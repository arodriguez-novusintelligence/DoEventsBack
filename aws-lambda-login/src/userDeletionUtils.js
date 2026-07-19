const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();

function table(name, fallback) {
  return process.env[name] || fallback;
}

async function findFacebookUser(facebookUserId) {
  const platformUserId = String(facebookUserId);
  const result = await dynamodb
    .query({
      TableName: table("CLIENT_TABLE", "Client"),
      IndexName: "PlatformUserIdIndex",
      KeyConditionExpression: "platformUserId = :platformUserId",
      ExpressionAttributeValues: {
        ":platformUserId": platformUserId,
      },
    })
    .promise();

  return (result.Items || []).find((user) => user.platform === "FACEBOOK") || null;
}

async function deleteUserPreferences(userId) {
  try {
    await dynamodb
      .delete({
        TableName: table("USER_PREFERENCES_TABLE", "UserPreferences"),
        Key: { UserId: userId },
      })
      .promise();
  } catch (error) {
    console.error("deleteUserPreferences:", userId, error.message);
  }
}

async function deleteFavoriteUsersOwned(userId) {
  const favoriteTable = table("FAVORITE_USERS_TABLE", "FavoriteUsers");
  let lastKey;

  do {
    const result = await dynamodb
      .query({
        TableName: favoriteTable,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ExclusiveStartKey: lastKey,
      })
      .promise();

    for (const item of result.Items || []) {
      await dynamodb
        .delete({
          TableName: favoriteTable,
          Key: {
            userId: item.userId,
            favoriteId: item.favoriteId,
          },
        })
        .promise();
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function clearFavoriteUsersInvitedReferences(userId) {
  const favoriteTable = table("FAVORITE_USERS_TABLE", "FavoriteUsers");
  let lastKey;
  const now = new Date().toISOString();

  do {
    const result = await dynamodb
      .scan({
        TableName: favoriteTable,
        FilterExpression: "invitedUserId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
        ExclusiveStartKey: lastKey,
      })
      .promise();

    for (const item of result.Items || []) {
      await dynamodb
        .update({
          TableName: favoriteTable,
          Key: {
            userId: item.userId,
            favoriteId: item.favoriteId,
          },
          UpdateExpression:
            "REMOVE invitedUserId, username, profileImageUrl SET originType = :manual, updatedAt = :now",
          ExpressionAttributeValues: {
            ":manual": "MANUAL",
            ":now": now,
          },
        })
        .promise();
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function deleteClientUser(userId) {
  await dynamodb
    .delete({
      TableName: table("CLIENT_TABLE", "Client"),
      Key: { id: userId },
    })
    .promise();
}

exports.deleteFacebookUserByPlatformId = async (facebookUserId) => {
  const user = await findFacebookUser(facebookUserId);
  if (!user) {
    return { found: false, deleted: false };
  }

  const userId = user.id;

  await deleteUserPreferences(userId);
  await deleteFavoriteUsersOwned(userId);
  await clearFavoriteUsersInvitedReferences(userId);
  await deleteClientUser(userId);

  return {
    found: true,
    deleted: true,
    userId,
    email: user.email || null,
  };
};
