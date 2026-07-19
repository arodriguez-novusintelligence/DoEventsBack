const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Elimina un grupo global de favoritos
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId, groupId } = event.pathParameters;

    // Validaciones
    if (!userId || !groupId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "userId and groupId are required",
        }),
      };
    }

    // Eliminar el grupo directamente usando las claves
    await dynamodb
      .delete({
        TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
        Key: {
          userId: userId,
          groupId: groupId,
        },
      })
      .promise();

    console.log(`Group ${groupId} deleted successfully for user ${userId}`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Favorite group deleted successfully",
        deleted: true,
        groupId,
      }),
    };
  } catch (error) {
    console.error("Error in removeFavoriteGroupHandler:", error);
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
