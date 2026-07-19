const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "sa-east-1",
});

const FOLLOWERS_TABLE =
  process.env.FOLLOWERS_TABLE ||
  process.env.DYNAMODB_FOLLOWERS_TABLE ||
  "Followers-dev";

function idCandidates(raw) {
  const id = String(raw ?? "").trim();
  if (!id) return [];
  const candidates = [id];
  if (id.length === 36 && id.includes("-")) {
    const shortId = id.substring(0, 10);
    if (shortId !== id) candidates.push(shortId);
  }
  return [...new Set(candidates)];
}

/**
 * ¿El viewer sigue al owner con solicitud aceptada?
 */
async function isViewerFollowingUser(ownerId, viewerId) {
  if (!ownerId || !viewerId || ownerId === viewerId) return false;

  const ownerIds = idCandidates(ownerId);
  const viewerIds = idCandidates(viewerId);

  for (const resolvedViewerId of viewerIds) {
    for (const resolvedOwnerId of ownerIds) {
      const relation = await dynamodb
        .get({
          TableName: FOLLOWERS_TABLE,
          Key: { follow_id: `${resolvedViewerId}_${resolvedOwnerId}` },
          ProjectionExpression: "#status, blocked_at",
          ExpressionAttributeNames: { "#status": "status" },
        })
        .promise()
        .catch((error) => {
          console.warn("isViewerFollowingUser warning", error?.message || error);
          return { Item: null };
        });

      if (
        relation?.Item?.status === "accepted" &&
        !relation?.Item?.blocked_at
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Chat directo sin invitación: perfil público del destino o seguimiento aceptado.
 */
async function canOpenDirectChatWithoutInvite(requesterId, targetId, targetData) {
  if (!requesterId || !targetId || requesterId === targetId) return false;
  if (targetData?.isPublicProfile !== false) return true;
  return isViewerFollowingUser(targetId, requesterId);
}

module.exports = {
  isViewerFollowingUser,
  canOpenDirectChatWithoutInvite,
};
