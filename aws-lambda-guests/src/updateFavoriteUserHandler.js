const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { normalizeContactCategory } = require("./utils/contactCategoryUtils");

// Actualiza los datos de un usuario en FavoriteUsers
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId, favoriteId } = event.pathParameters;
    const body = JSON.parse(event.body);

    if (!userId || !favoriteId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          error: "userId and favoriteId are required",
        }),
      };
    }

    // Normalizaciones y derivados
    const normalizedEmail = body.email
      ? body.email.trim().toLowerCase()
      : undefined;
    const phoneIndicative = body.phoneIndicative
      ? body.phoneIndicative.trim()
      : undefined;
    const phoneNumber = body.phoneNumber ? body.phoneNumber.trim() : undefined;
    const providedPhone = body.phone ? body.phone.trim() : undefined;
    const composedPhone =
      providedPhone ||
      (phoneIndicative || phoneNumber
        ? `${phoneIndicative || ""}${phoneNumber || ""}`
        : undefined);
    const providedUsername = body.username || body.user;

    // Construir la expresión de actualización dinámicamente
    const updateExpressionParts = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Campos permitidos para actualizar
    const allowedFields = {
      name: "#name",
      lastName: "#lastName",
      email: "#email",
      phone: "#phone",
      phoneIndicative: "#phoneIndicative",
      phoneNumber: "#phoneNumber",
      username: "#username",
      user: "#user",
      profileImageUrl: "#profileImageUrl",
      isFavorite: "#isFavorite",
      groupIds: "#groupIds",
      tags: "#tags",
      originType: "#originType",
    };

    // Validar y construir la actualización
    let hasUpdates = false;
    for (const [field, placeholder] of Object.entries(allowedFields)) {
      let value = body[field];

      if (field === "email" && normalizedEmail !== undefined) {
        value = normalizedEmail;
      }
      if (field === "phone" && composedPhone !== undefined) {
        value = composedPhone;
      }
      if (field === "phoneIndicative" && phoneIndicative !== undefined) {
        value = phoneIndicative;
      }
      if (field === "phoneNumber" && phoneNumber !== undefined) {
        value = phoneNumber;
      }
      if ((field === "username" || field === "user") && providedUsername) {
        value = providedUsername;
      }

      if (value !== undefined) {
        updateExpressionParts.push(`${placeholder} = :${field}`);
        expressionAttributeNames[placeholder] = field;
        expressionAttributeValues[`:${field}`] = value;
        hasUpdates = true;
      }
    }

    if (!hasUpdates) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          error: "No valid fields to update",
          message: "Provide at least one field to update",
          allowedFields: Object.keys(allowedFields),
        }),
      };
    }

    if (body.isFavorite !== undefined || body.groupIds !== undefined) {
      const category = normalizeContactCategory({
        isFavorite: body.isFavorite,
        groupIds: body.groupIds,
      });
      expressionAttributeValues[":isFavorite"] = category.isFavorite;
      expressionAttributeValues[":groupIds"] = category.groupIds;
      expressionAttributeNames["#isFavorite"] = "isFavorite";
      expressionAttributeNames["#groupIds"] = "groupIds";
      const withoutCategory = updateExpressionParts.filter(
        (part) => !part.startsWith("#isFavorite") && !part.startsWith("#groupIds"),
      );
      updateExpressionParts.length = 0;
      updateExpressionParts.push(...withoutCategory);
      if (!updateExpressionParts.some((p) => p.startsWith("#isFavorite"))) {
        updateExpressionParts.push("#isFavorite = :isFavorite");
      }
      if (!updateExpressionParts.some((p) => p.startsWith("#groupIds"))) {
        updateExpressionParts.push("#groupIds = :groupIds");
      }
    }

    // Agregar updatedAt automáticamente
    const now = new Date().toISOString();
    updateExpressionParts.push("#updatedAt = :updatedAt");
    expressionAttributeNames["#updatedAt"] = "updatedAt";
    expressionAttributeValues[":updatedAt"] = now;

    // Construir la expresión completa
    const updateExpression = `SET ${updateExpressionParts.join(", ")}`;

    console.log("Update expression:", updateExpression);
    console.log("Expression attribute names:", expressionAttributeNames);
    console.log("Expression attribute values:", expressionAttributeValues);

    // Ejecutar la actualización
    const params = {
      TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
      Key: {
        userId,
        favoriteId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
      ConditionExpression:
        "attribute_exists(userId) AND attribute_exists(favoriteId)",
    };

    const result = await dynamodb.update(params).promise();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "User updated successfully",
        user: result.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error in updateFavoriteUserHandler:", error);

    // Manejar caso específico de usuario no encontrado
    if (error.code === "ConditionalCheckFailedException") {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          error: "User not found",
          message: `User with favoriteId ${event.pathParameters.favoriteId} does not exist in FavoriteUsers`,
        }),
      };
    }

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
