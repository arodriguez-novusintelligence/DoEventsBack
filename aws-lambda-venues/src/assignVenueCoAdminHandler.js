const AWS = require("aws-sdk");
const { tableName, respond, handleOptions } = require("./venueSocialUtils");
const {
  canAssignCoAdmins,
  notifyCoAdminAssigned,
} = require("./coAdminUtils");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const VENUE_TABLE = () => tableName("VENUE_TABLE", "Venues");
const CLIENT_TABLE = () => tableName("CLIENT_TABLE", "Client");

async function getUserName(userId) {
  try {
    const res = await dynamodb.get({ TableName: CLIENT_TABLE(), Key: { id: userId } }).promise();
    const u = res.Item;
    if (!u) return "Usuario";
    return [u.nombre, u.apellido].filter(Boolean).join(" ").trim() || u.username || "Usuario";
  } catch {
    return "Usuario";
  }
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const venueId = event.pathParameters?.venueId;
    const body = JSON.parse(event.body || "{}");
    const ownerUserId = String(body.ownerUserId || body.userId || "").trim();
    const coAdminUserId = String(body.coAdminUserId || body.targetUserId || "").trim();

    if (!venueId || !ownerUserId || !coAdminUserId) {
      return respond(400, { error: "venueId, ownerUserId y coAdminUserId son requeridos" });
    }
    if (ownerUserId === coAdminUserId) {
      return respond(400, { error: "No puedes designarte a ti mismo como co-admin" });
    }

    const existing = await dynamodb
      .get({ TableName: VENUE_TABLE(), Key: { venue_id: venueId } })
      .promise();

    if (!existing.Item) {
      return respond(404, { error: "Lugar no encontrado" });
    }

    const venue = existing.Item;
    if (!canAssignCoAdmins(ownerUserId, venue.ownerUserId)) {
      return respond(403, { error: "Solo el creador puede designar co-administradores" });
    }

    const coAdminIds = Array.isArray(venue.coAdminIds) ? [...venue.coAdminIds] : [];
    if (!coAdminIds.includes(coAdminUserId)) {
      coAdminIds.push(coAdminUserId);
    }

    const now = new Date().toISOString();
    await dynamodb
      .update({
        TableName: VENUE_TABLE(),
        Key: { venue_id: venueId },
        UpdateExpression: "SET coAdminIds = :coAdminIds, updatedAt = :now",
        ExpressionAttributeValues: { ":coAdminIds": coAdminIds, ":now": now },
      })
      .promise();

    const assignedByName = await getUserName(ownerUserId);
    await notifyCoAdminAssigned({
      targetUserId: coAdminUserId,
      entityType: "VENUE",
      entityId: venueId,
      entityName: venue.name || "Lugar",
      assignedByUserId: ownerUserId,
      assignedByName,
    });

    return respond(200, { success: true, coAdminIds });
  } catch (error) {
    console.error("assignVenueCoAdminHandler error:", error);
    return respond(500, { error: error.message || "Error interno" });
  }
};
