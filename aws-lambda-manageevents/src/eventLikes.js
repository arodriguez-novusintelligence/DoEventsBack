const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const FAV_TABLE = process.env.FAV_TABLE || "userFavoriteEvents";

exports.eventLikes = async (event) => {
  const { userId, eventId, like } = JSON.parse(event.body);
  const timestamp = new Date().toISOString();

  const params = {
    TableName: FAV_TABLE,
    Item: {
      userId,
      eventId,
      timestamp,
    },
    ConditionExpression:
      "attribute_not_exists(userId) AND attribute_not_exists(eventId)",
  };
  const paramsDelete = {
    TableName: FAV_TABLE,
    Key: {
      userId,
      eventId,
    },
    ConditionExpression:
      "attribute_exists(userId) AND attribute_exists(eventId)",
  };
  try {
    like
      ? await dynamoDb.put(params).promise()
      : await dynamoDb.delete(paramsDelete).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: like ? "Like agregado correctamente." : "Like eliminado",
      }),
    };
  } catch (err) {
    if (err.code === "ConditionalCheckFailedException") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: like
            ? "Ya existe el like para este evento."
            : "No existe el like para este evento.",
        }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: like ? "Error al agregar like." : "Error al eliminar like.",
        error: err.message,
      }),
    };
  }
};
