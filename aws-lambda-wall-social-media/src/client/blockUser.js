const AWS = require("aws-sdk");
const { resolveTableName } = require("./resolveQaTable");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mensaje: "JSON inválido" }),
    };
  }

  const { id_usuario_bloqueado, id_cliente, estado } = body;
  if (!id_usuario_bloqueado || !id_cliente || !estado) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mensaje: "Parámetros faltantes" }),
    };
  }

  const tableName = resolveTableName("DYNAMODB_BLOCKUSER_TABLE", "BlockUser");

  try {
    await dynamodb
      .put({
        TableName: tableName,
        Item: {
          id_usuario_bloqueado,
          id_cliente,
          estado,
          fecha_bloqueo: new Date().toISOString(),
        },
      })
      .promise();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ mensaje: "Estado actualizado correctamente" }),
    };
  } catch (error) {
    console.error("blockUser:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Error interno al actualizar el estado" }),
    };
  }
};
