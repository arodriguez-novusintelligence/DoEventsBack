const AWS = require("aws-sdk");
const {
  canAssignCoAdmins,
  notifyCoAdminAssigned,
} = require("./coAdminUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos-qa";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-qa";

async function getUserName(userId) {
  try {
    const res = await dynamodb
      .get({ TableName: CLIENT_TABLE, Key: { id: userId } })
      .promise();
    const u = res.Item;
    if (!u) return "Usuario";
    return (
      [u.nombre, u.apellido].filter(Boolean).join(" ").trim() ||
      u.username ||
      "Usuario"
    );
  } catch {
    return "Usuario";
  }
}

exports.assignEventCoAdmin = async (event) => {
  let response;
  try {
    const eventId = event.pathParameters?.eventId || event.pathParameters?.id;
    const body = JSON.parse(event.body || "{}");
    const ownerUserId = String(body.ownerUserId || body.userId || "").trim();
    const coAdminUserId = String(
      body.coAdminUserId || body.targetUserId || "",
    ).trim();

    if (!eventId || !ownerUserId || !coAdminUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "eventId, ownerUserId y coAdminUserId son requeridos",
        }),
      };
    }
    if (ownerUserId === coAdminUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No puedes designarte a ti mismo como co-admin",
        }),
      };
    }

    const existing = await dynamodb
      .get({ TableName: EVENTS_TABLE, Key: { id: eventId } })
      .promise();

    if (!existing.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Evento no encontrado" }),
      };
    }

    const eventItem = existing.Item;
    const eventOwnerId = eventItem.userId || eventItem.createdBy;
    if (!canAssignCoAdmins(ownerUserId, eventOwnerId)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Solo el creador puede designar co-administradores",
        }),
      };
    }

    const coAdminIds = Array.isArray(eventItem.coAdminIds)
      ? [...eventItem.coAdminIds]
      : [];
    if (!coAdminIds.includes(coAdminUserId)) {
      coAdminIds.push(coAdminUserId);
    }

    const now = new Date().toISOString();
    await dynamodb
      .update({
        TableName: EVENTS_TABLE,
        Key: { id: eventId },
        UpdateExpression: "SET coAdminIds = :coAdminIds, updatedAt = :now",
        ExpressionAttributeValues: {
          ":coAdminIds": coAdminIds,
          ":now": now,
        },
      })
      .promise();

    const assignedByName = await getUserName(ownerUserId);
    await notifyCoAdminAssigned({
      targetUserId: coAdminUserId,
      entityType: "EVENT",
      entityId: eventId,
      entityName: eventItem.nombre || "Evento",
      assignedByUserId: ownerUserId,
      assignedByName,
    });

    response = {
      statusCode: 200,
      body: JSON.stringify({ success: true, coAdminIds }),
    };
  } catch (error) {
    console.error("assignEventCoAdmin error:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Error interno" }),
    };
  }
  return response;
};
