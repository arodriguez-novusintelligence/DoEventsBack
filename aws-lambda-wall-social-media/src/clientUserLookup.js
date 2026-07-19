const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

function clientIdCandidates(raw) {
  const id = String(raw ?? "").trim();
  if (!id) return [];
  const candidates = [id];
  if (id.length === 36 && id.includes("-")) {
    const shortId = id.substring(0, 10);
    if (shortId !== id) candidates.push(shortId);
  }
  return [...new Set(candidates)];
}

async function getClientByUserId(raw, tableName) {
  const table = tableName || process.env.DYNAMODB_CLIENT_TABLE || "Client";
  for (const key of clientIdCandidates(raw)) {
    const result = await dynamodb
      .get({ TableName: table, Key: { id: key } })
      .promise();
    if (result.Item) return result.Item;
  }
  return null;
}

module.exports = { clientIdCandidates, getClientByUserId };
