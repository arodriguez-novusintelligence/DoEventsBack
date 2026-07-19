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
  // Parsear datos del grupo
  const body = JSON.parse(event.body);
  const params = {
    TableName: process.env.EVENT_GROUPS_TABLE || "EventGroups",
    Key: {
      PK: `EVENT#${eventId}`,
      SK: `GROUP#${groupId}`,
    },
    UpdateExpression:
      "set #name = :name, #color = :color, #updatedAt = :updatedAt",
    ExpressionAttributeNames: {
      "#name": "name",
      "#color": "color",
      "#updatedAt": "updatedAt",
    },
    ExpressionAttributeValues: {
      ":name": body.name,
      ":color": body.color,
      ":updatedAt": new Date().toISOString(),
    },
    ReturnValues: "ALL_NEW",
  };
  const result = await dynamodb.update(params).promise();
  return {
    statusCode: 200,
    body: JSON.stringify({ group: result.Attributes }),
  };
};
