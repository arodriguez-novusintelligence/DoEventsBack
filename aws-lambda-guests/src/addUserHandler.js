const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const { normalizeContactCategory } = require("./utils/contactCategoryUtils");

function pickRicherName(a, b) {
  const na = (a || "").trim();
  const nb = (b || "").trim();
  if (!na || na === "Sin nombre") return nb && nb !== "Sin nombre" ? nb : na;
  if (!nb || nb === "Sin nombre") return na;
  return na.length >= nb.length ? na : nb;
}

function normalizePhoneDigits(phone, indicative, number) {
  const raw = phone || `${indicative || ""}${number || ""}`;
  return String(raw).replace(/\D/g, "");
}

function pickSingleGroupIds(existing, incoming) {
  const inc = (incoming || []).filter(Boolean);
  const ext = (existing || []).filter(Boolean);
  if (inc.length) return [inc[0]];
  if (ext.length) return [ext[0]];
  return [];
}

function findExistingContact(items, {
  normalizedEmail,
  composedPhone,
  derivedUsername,
}) {
  const username = derivedUsername
    ? String(derivedUsername).replace(/^@/, "").trim().toLowerCase()
    : "";
  const phoneDigits = normalizePhoneDigits(composedPhone);

  for (const item of items || []) {
    if (
      normalizedEmail
      && item.email
      && item.email.trim().toLowerCase() === normalizedEmail
    ) {
      return item;
    }
    const itemPhone = normalizePhoneDigits(item.phone, item.phoneIndicative, item.phoneNumber);
    if (phoneDigits.length >= 7 && itemPhone === phoneDigits) {
      return item;
    }
    const itemUser = (item.username || item.user || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    if (username && itemUser && itemUser === username) {
      return item;
    }
  }
  return null;
}

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { userId } = event.pathParameters;
    const body = JSON.parse(event.body);

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

    if (!body.name) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    const now = new Date().toISOString();
    const normalizedEmail = body.email
      ? body.email.trim().toLowerCase()
      : undefined;
    const phoneIndicative = body.phoneIndicative
      ? body.phoneIndicative.trim()
      : "";
    const phoneRaw = body.phone ? body.phone.trim() : "";
    const phoneNumber = body.phoneNumber
      ? String(body.phoneNumber).replace(/\D/g, "")
      : phoneRaw.replace(/\D/g, "");
    const indicativeDigits = phoneIndicative.replace(/\D/g, "");
    const composedPhone =
      indicativeDigits && phoneNumber
        ? `${indicativeDigits}${phoneNumber}`
        : phoneRaw.replace(/\D/g, "") || phoneNumber;
    const originType = body.originType || "MANUAL";
    const derivedUsername =
      body.user
      || body.username
      || (normalizedEmail ? normalizedEmail.split("@")[0] : undefined);

    const existingResult = await dynamodb
      .query({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
      })
      .promise();

    const existing = findExistingContact(existingResult.Items, {
      normalizedEmail,
      composedPhone,
      derivedUsername,
    });

    if (existing) {
      const favoriteId = existing.favoriteId;
      const invitedUserId = existing.invitedUserId;
      const mergedName = pickRicherName(existing.name, body.name);
      const mergedLastName = pickRicherName(existing.lastName, body.lastName)
        || body.lastName
        || existing.lastName;
      const preferBodyGroup = Boolean((body.groupIds || []).filter(Boolean).length);
      const mergedGroupIds = preferBodyGroup
        ? pickSingleGroupIds([], body.groupIds)
        : pickSingleGroupIds(existing.groupIds, body.groupIds);
      const category = normalizeContactCategory({
        isFavorite: preferBodyGroup
          ? false
          : (body.isFavorite !== undefined
            ? Boolean(body.isFavorite)
            : Boolean(existing.isFavorite)),
        groupIds: mergedGroupIds,
      });

      const updateParts = [
        "SET #name = :name",
        "updatedAt = :updatedAt",
        "isFavorite = :isFavorite",
        "groupIds = :groupIds",
      ];
      const expressionAttributeNames = { "#name": "name" };
      const expressionAttributeValues = {
        ":name": mergedName,
        ":updatedAt": now,
        ":isFavorite": category.isFavorite,
        ":groupIds": category.groupIds,
      };

      if (mergedLastName) {
        updateParts.push("lastName = :lastName");
        expressionAttributeValues[":lastName"] = mergedLastName;
      }
      if (normalizedEmail) {
        updateParts.push("#email = :email", "GSI2PK = :gsi2pk", "GSI2SK = :gsi2sk");
        expressionAttributeNames["#email"] = "email";
        expressionAttributeValues[":email"] = normalizedEmail;
        expressionAttributeValues[":gsi2pk"] = `EMAIL#${normalizedEmail}`;
        expressionAttributeValues[":gsi2sk"] = `USER#${userId}`;
      }
      if (phoneIndicative) {
        updateParts.push("phoneIndicative = :phoneIndicative");
        expressionAttributeValues[":phoneIndicative"] = phoneIndicative;
      }
      if (phoneNumber) {
        updateParts.push("phoneNumber = :phoneNumber");
        expressionAttributeValues[":phoneNumber"] = phoneNumber;
      }
      if (composedPhone) {
        updateParts.push("phone = :phone", "GSI1PK = :gsi1pk", "GSI1SK = :gsi1sk");
        expressionAttributeValues[":phone"] = composedPhone;
        expressionAttributeValues[":gsi1pk"] = `PHONE#${composedPhone}`;
        expressionAttributeValues[":gsi1sk"] = `USER#${userId}`;
      }
      if (derivedUsername && derivedUsername.trim() !== "") {
        updateParts.push("username = :username", "#user = :user");
        expressionAttributeNames["#user"] = "user";
        expressionAttributeValues[":username"] = derivedUsername;
        expressionAttributeValues[":user"] = derivedUsername;
      }

      await dynamodb
        .update({
          TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
          Key: { userId, favoriteId },
          UpdateExpression: updateParts.join(", "),
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        })
        .promise();

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          favoriteId,
          invitedUserId,
          updated: true,
          message: "User updated successfully",
        }),
      };
    }

    const favoriteId = uuidv4();
    const invitedUserId = uuidv4();
    const category = normalizeContactCategory({
      isFavorite: body.isFavorite !== undefined ? body.isFavorite : false,
      groupIds: body.groupIds || [],
    });
    const item = {
      userId,
      favoriteId,
      invitedUserId,
      name: body.name,
      originType,
      isFavorite: category.isFavorite,
      groupIds: category.groupIds,
      tags: body.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    if (body.lastName && body.lastName.trim() !== "") {
      item.lastName = body.lastName;
    }
    if (normalizedEmail) {
      item.email = normalizedEmail;
    }
    if (phoneIndicative) {
      item.phoneIndicative = phoneIndicative;
    }
    if (phoneNumber) {
      item.phoneNumber = phoneNumber;
    }
    if (composedPhone) {
      item.phone = composedPhone;
    }
    if (derivedUsername && derivedUsername.trim() !== "") {
      item.username = derivedUsername;
      item.user = derivedUsername;
    }
    if (body.profileImageUrl && body.profileImageUrl.trim() !== "") {
      item.profileImageUrl = body.profileImageUrl;
    }
    if (item.phone) {
      item.GSI1PK = `PHONE#${item.phone}`;
      item.GSI1SK = `USER#${userId}`;
    }
    if (item.email) {
      item.GSI2PK = `EMAIL#${item.email}`;
      item.GSI2SK = `USER#${userId}`;
    }

    console.log("Item to save:", JSON.stringify(item));

    await dynamodb
      .put({
        TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
        Item: item,
      })
      .promise();

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        favoriteId,
        invitedUserId,
        message: "User added successfully",
      }),
    };
  } catch (error) {
    console.error("Error in addUserHandler:", error);
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
