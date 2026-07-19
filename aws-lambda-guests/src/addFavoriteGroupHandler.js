const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId } = event.pathParameters;
    const body = JSON.parse(event.body);

    // Validaciones
    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    if (!body.name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    const groupId = uuidv4();
    const now = new Date().toISOString();

    // Construir el item para la tabla FavoriteGroups
    const item = {
      userId, // Partition key
      groupId, // Sort key (RANGE key)
      groupName: body.name, // Nombre del grupo
      color: body.color || "#000000",
      order: body.order || 0,
      userIds: body.userIds || [],
      tags: body.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    console.log("Item to save:", JSON.stringify(item));

    await dynamodb
      .put({
        TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
        Item: item,
      })
      .promise();

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        groupName: body.name,
        message: "Favorite group created successfully",
      }),
    };
  } catch (error) {
    console.error("Error in addFavoriteGroupHandler:", error);
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
