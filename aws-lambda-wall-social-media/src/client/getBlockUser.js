const AWS = require("aws-sdk");
const { resolveTableName } = require("./resolveQaTable");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const clientId = String(event.pathParameters?.block_id || "").trim();
  if (!clientId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "block_id (id_cliente) es obligatorio" }),
    };
  }

  const tableName = resolveTableName("DYNAMODB_BLOCKUSER_TABLE", "BlockUser");
  const clientTable = resolveTableName("DYNAMODB_CLIENT_TABLE", "Client");

  try {
    let items = [];
    let lastKey;
    do {
      const page = await dynamodb
        .scan({
          TableName: tableName,
          FilterExpression: "id_cliente = :clientId AND #estado = :bloqueado",
          ExpressionAttributeNames: { "#estado": "estado" },
          ExpressionAttributeValues: {
            ":clientId": clientId,
            ":bloqueado": "bloqueado",
          },
          ExclusiveStartKey: lastKey,
        })
        .promise();
      items = items.concat(page.Items || []);
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    const blockedUsers = await Promise.all(
      items.map(async (entry) => {
        const blockedId = entry.id_usuario_bloqueado;
        if (!blockedId) return null;
        const userResult = await dynamodb
          .get({ TableName: clientTable, Key: { id: blockedId } })
          .promise();
        const user = userResult.Item || {};
        return {
          id: blockedId,
          name: user.name || user.user || user.nombre || blockedId,
          username: user.user || "",
          blockedAt: entry.fecha_bloqueo || null,
        };
      }),
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        users: blockedUsers.filter(Boolean),
        count: blockedUsers.filter(Boolean).length,
      }),
    };
  } catch (error) {
    console.error("getBlockUser:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Error al obtener usuarios bloqueados", error: error.message }),
    };
  }
};
