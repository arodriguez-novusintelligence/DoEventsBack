const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getProfileS3Client, resolveProfileAvatarUrl } = require("./profileAvatarUrl");

const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";
const { clientIdCandidates } = require("./clientUserLookup");

const s3 = getProfileS3Client();

function idsMatch(a, b) {
  if (!a || !b) return false;
  const left = String(a).trim();
  const right = String(b).trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const shortLeft = left.length === 36 && left.includes("-") ? left.substring(0, 10) : left;
  const shortRight = right.length === 36 && right.includes("-") ? right.substring(0, 10) : right;
  return shortLeft === shortRight;
}

function resolveDisplayName(userData) {
  return (
    userData?.name
    || [userData?.firstName, userData?.lastName].filter(Boolean).join(" ")
    || [userData?.nombre, userData?.apellido].filter(Boolean).join(" ")
    || userData?.nombre
    || userData?.user
    || userData?.username
    || userData?.email
    || "Usuario"
  );
}

function resolveUsername(userData) {
  const raw = String(userData?.username || userData?.user || "").replace(/^@/, "").trim();
  if (raw && !/\s/.test(raw)) return raw;
  return undefined;
}

function resolveClientAvatarRef(userData) {
  return (
    userData?.fotoPerfilUrl
    || userData?.profileImageUrl
    || userData?.imagen
    || userData?.avatar
    || null
  );
}

function participantFromClient(userData) {
  if (!userData?.id) return null;
  const username = resolveUsername(userData);
  const avatarRef = resolveClientAvatarRef(userData);
  return {
    id: userData.id,
    name: resolveDisplayName(userData),
    ...(username ? { username } : {}),
    avatar: resolveProfileAvatarUrl(s3, avatarRef, userData.platform),
  };
}

async function getClientRecord(rawId) {
  for (const key of clientIdCandidates(rawId)) {
    const result = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: key },
        ProjectionExpression:
          "id, #N, fotoPerfilUrl, profileImageUrl, imagen, avatar, #PLTFM, #U, email, nombre, apellido, firstName, lastName, username",
        ExpressionAttributeNames: {
          "#N": "name",
          "#PLTFM": "platform",
          "#U": "user",
        },
      })
      .promise();
    if (result.Item) return result.Item;
  }
  return null;
}

async function resolveParticipantsDetails(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(participantIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const resolved = await Promise.all(
    uniqueIds.map(async (rawId) => {
      const client = await getClientRecord(rawId);
      return participantFromClient(client) || { id: rawId };
    }),
  );

  return participantIds.map((rawId) => {
    const match = resolved.find((entry) => idsMatch(entry.id, rawId));
    return match || { id: rawId };
  });
}

function findParticipantById(participants, rawId) {
  if (!rawId) return undefined;
  return participants.find((entry) => idsMatch(entry.id, rawId));
}

function filterParticipantsByIds(participants, ids) {
  return participants.filter((entry) => ids.some((id) => idsMatch(id, entry.id)));
}

module.exports = {
  idsMatch,
  resolveDisplayName,
  participantFromClient,
  getClientRecord,
  resolveParticipantsDetails,
  findParticipantById,
  filterParticipantsByIds,
};
