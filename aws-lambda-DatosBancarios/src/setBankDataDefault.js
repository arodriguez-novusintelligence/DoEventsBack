const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const normalizeBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "si", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return defaultValue;
};

const unsetDefaultBankDataForUser = async (userID, exceptId) => {
  const paramsUserId = {
    TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
    IndexName: "UserIdIndex",
    KeyConditionExpression: "userID = :userID",
    ExpressionAttributeValues: {
      ":userID": userID,
    },
  };

  const data = await dynamodb.query(paramsUserId).promise();
  const items = data.Items || [];

  await Promise.all(
    items
      .filter((item) => item?.id !== exceptId && item?.isDefault === true)
      .map((item) =>
        dynamodb
          .update({
            TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
            Key: { id: item.id },
            UpdateExpression: "SET isDefault = :isDefault, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":isDefault": false,
              ":updatedAt": new Date().toISOString(),
            },
          })
          .promise()
      )
  );
};

exports.setBankDataDefault = async (event) => {
  try {
    const bankDataId = event?.pathParameters?.id;
    if (!bankDataId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El id del dato bancario es obligatorio",
        }),
      };
    }

    const body = event?.body ? JSON.parse(event.body) : {};
    const userID = body.userID || body.userId || body.usuarioId || null;
    const isDefault = normalizeBoolean(body.isDefault, true);

    const current = await dynamodb
      .get({
        TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
        Key: { id: bankDataId },
      })
      .promise();

    if (!current.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Dato bancario no encontrado",
        }),
      };
    }

    const ownerUserID = current.Item.userID;
    if (!ownerUserID) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El registro no tiene userID asociado",
        }),
      };
    }

    if (userID && userID !== ownerUserID) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: "No puedes modificar un dato bancario de otro usuario",
        }),
      };
    }

    if (isDefault) {
      await unsetDefaultBankDataForUser(ownerUserID, bankDataId);
    }

    await dynamodb
      .update({
        TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
        Key: { id: bankDataId },
        UpdateExpression: "SET isDefault = :isDefault, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":isDefault": isDefault,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: isDefault
          ? "Dato bancario marcado como predeterminado"
          : "Dato bancario desmarcado como predeterminado",
        data: {
          id: bankDataId,
          userID: ownerUserID,
          isDefault,
        },
      }),
    };
  } catch (error) {
    console.error("Error al actualizar predeterminado:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "No se pudo actualizar el predeterminado",
        error: error.message,
      }),
    };
  }
};
