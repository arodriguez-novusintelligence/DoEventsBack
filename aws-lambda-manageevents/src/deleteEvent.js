const AWS = require("aws-sdk");

const dynamoDb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const EVENT_TABLE = process.env.EVENTS_TABLE || "Eventos";
const FAV_TABLE = process.env.FAV_TABLE || "userFavoriteEvents";

async function removeEventFavorites(eventId) {
  const favorites = [];
  let lastEvaluatedKey;

  do {
    const result = await dynamoDb
      .query({
        TableName: FAV_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    favorites.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  await Promise.all(
    favorites.map((item) =>
      dynamoDb
        .delete({
          TableName: FAV_TABLE,
          Key: {
            userId: item.userId,
            eventId: item.eventId,
          },
        })
        .promise()
        .catch((err) => {
          console.warn(
            "No se pudo eliminar favorito",
            item.userId,
            item.eventId,
            err?.message,
          );
        }),
    ),
  );
}

exports.handler = async (event) => {  const { id } = event.pathParameters || {};

  if (!id) {
    return { statusCode: 400, body: "Missing event id" };
  }

  const now = new Date().toISOString();

  const updateParams = {
    TableName: EVENT_TABLE,
    Key: { id },
    UpdateExpression:
      "set estatus = :deletedStatus, deletedAt = :deletedAt, updatedAt = :updatedAt",
    ExpressionAttributeValues: {
      ":deletedStatus": "DELETED",
      ":deletedAt": now,
      ":updatedAt": now,
    },
    ConditionExpression: "attribute_exists(id)",
    ReturnValues: "ALL_NEW",
  };

  try {
    const result = await dynamoDb.update(updateParams).promise();
    await removeEventFavorites(id);

    return {      statusCode: 200,
      body: JSON.stringify({
        message: "Event marked as deleted",
        data: {
          id: result.Attributes?.id,
          estatus: result.Attributes?.estatus,
          deletedAt: result.Attributes?.deletedAt,
        },
      }),
    };
  } catch (error) {
    if (error.code === "ConditionalCheckFailedException") {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Event not found" }),
      };
    }

    console.error("Error deleting event:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to delete event.",
        error: error.message,
      }),
    };
  }
};
