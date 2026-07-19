const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";

/** Client.id son los primeros 10 caracteres del rquid (UUID); a veces el front envía el UUID completo. */
function clientIdCandidates(raw) {
  const id = String(raw ?? "").trim();
  if (!id) return [];
  const candidates = [id];
  if (id.length === 36 && id.includes("-")) {
    const shortId = id.substring(0, 10);
    if (shortId !== id) candidates.push(shortId);
  }
  if (/^[a-f0-9]{8,10}-[a-z0-9]$/i.test(id)) {
    const base = id.split("-")[0];
    if (base && base !== id) candidates.push(base);
  }
  return [...new Set(candidates)];
}

function normalizeHandle(value) {
  return String(value || "").toLowerCase().replace(/[\s@._-]+/g, "");
}

async function getClientByUserId(raw) {
  for (const key of clientIdCandidates(raw)) {
    const result = await dynamodb
      .get({
        TableName: CLIENT_TABLE,
        Key: { id: key },
      })
      .promise();
    if (result.Item) return result.Item;
  }
  return null;
}

async function getClientByUsername(rawUsername) {
  const username = String(rawUsername || "").trim().replace(/^@/, "");
  if (!username) return null;

  const normalizedTarget = normalizeHandle(username);
  let lastEvaluatedKey;
  do {
    const page = await dynamodb
      .scan({
        TableName: CLIENT_TABLE,
        ProjectionExpression: "id, #user, email, nombre, apellido, fotoPerfilUrl, platform, phone, phoneNumber, indicativo",
        ExpressionAttributeNames: { "#user": "user" },
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    const match = (page.Items || []).find((item) => {
      const stored = String(item.user || "").trim();
      if (!stored) return false;
      if (stored.toLowerCase() === username.toLowerCase()) return true;
      return normalizeHandle(stored) === normalizedTarget;
    });
    if (match) return match;

    lastEvaluatedKey = page.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return null;
}

async function resolveClientUser(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const byId = await getClientByUserId(value);
  if (byId) return byId;
  return getClientByUsername(value);
}

module.exports = {
  clientIdCandidates,
  getClientByUserId,
  getClientByUsername,
  resolveClientUser,
};
