const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const dynamodb = new AWS.DynamoDB.DocumentClient();

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

function resolveProfileImageUrl(fotoPerfilUrl, platform) {
  if (!fotoPerfilUrl) return null;

  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  if (hasPlatform && isHttpUrl(fotoPerfilUrl)) {
    return fotoPerfilUrl;
  }

  const bucket =
    process.env.PROFILE_IMAGES_BUCKET || "doeventprofileimagesbucket";

  try {
    return s3.getSignedUrl("getObject", {
      Bucket: bucket,
      Key: fotoPerfilUrl,
      Expires: 3600,
    });
  } catch (error) {
    return fotoPerfilUrl;
  }
}

function acceptedStatusFilter() {
  return "(#status = :accepted OR attribute_not_exists(#status)) AND attribute_not_exists(blocked_at)";
}

async function queryFollowRelations({
  indexName,
  keyName,
  keyValue,
  status,
  limit = 50,
  lastKey,
}) {
  const targetLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const collected = [];
  let exclusiveStartKey = lastKey
    ? JSON.parse(decodeURIComponent(lastKey))
    : undefined;

  const isAccepted = status === "accepted";
  const filterExpression = isAccepted
    ? acceptedStatusFilter()
    : "#status = :status";

  while (collected.length < targetLimit) {
    const params = {
      TableName: process.env.DYNAMODB_FOLLOWERS_TABLE,
      IndexName: indexName,
      KeyConditionExpression: `${keyName} = :keyValue`,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: isAccepted
        ? {
            ":keyValue": keyValue,
            ":accepted": "accepted",
          }
        : {
            ":keyValue": keyValue,
            ":status": status,
          },
      Limit: Math.min(100, (targetLimit - collected.length) * 4 || 25),
      ExclusiveStartKey: exclusiveStartKey,
    };

    const result = await dynamodb.query(params).promise();
    collected.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
    if (!exclusiveStartKey) break;
  }

  return {
    items: collected.slice(0, targetLimit),
    lastKey: exclusiveStartKey
      ? encodeURIComponent(JSON.stringify(exclusiveStartKey))
      : null,
  };
}

async function loadClientUsers(userIds) {
  if (!userIds.length) return [];

  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const users = [];

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const batchResult = await dynamodb
      .batchGet({
        RequestItems: {
          [process.env.DYNAMODB_CLIENT_TABLE]: {
            Keys: chunk.map((id) => ({ id })),
          },
        },
      })
      .promise();

    users.push(
      ...(batchResult.Responses?.[process.env.DYNAMODB_CLIENT_TABLE] || []),
    );
  }

  return users;
}

function mapUserSummary(clientUser) {
  const signedFotoPerfilUrl = resolveProfileImageUrl(
    clientUser.fotoPerfilUrl,
    clientUser.platform,
  );

  return {
    id: clientUser.id,
    name: clientUser.nombre || clientUser.name || "",
    lastName: clientUser.apellido || clientUser.lastName || "",
    user: clientUser.user,
    fotoPerfilUrl: signedFotoPerfilUrl,
    avatarUrl: signedFotoPerfilUrl,
    description: clientUser.description,
    isPublicProfile: clientUser.isPublicProfile,
  };
}

module.exports = {
  CORS_HEADERS,
  queryFollowRelations,
  loadClientUsers,
  mapUserSummary,
  acceptedStatusFilter,
  resolveProfileImageUrl,
};
