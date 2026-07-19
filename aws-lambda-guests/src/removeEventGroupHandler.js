const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const { eventId, groupId } = event.pathParameters;
  // Verificar que el evento existe
  const eventParams = {
    TableName: process.env.EVENTS_ALT_TABLE || "Events",
    Key: { id: eventId },
  };
  const eventData = await dynamodb.get(eventParams).promise();
  if (!eventData.Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: "Event not found" }),
    };
  }
  // Eliminar grupo
  const params = {
    TableName: process.env.EVENT_GROUPS_TABLE || "EventGroups",
    Key: {
      PK: `EVENT#${eventId}`,
      SK: `GROUP#${groupId}`,
    },
  };
  await dynamodb.delete(params).promise();
  return {
    statusCode: 200,
    body: JSON.stringify({ deleted: true }),
  };
};
