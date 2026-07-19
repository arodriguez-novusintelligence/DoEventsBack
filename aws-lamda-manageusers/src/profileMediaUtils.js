const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const PROFILE_BUCKET =
  process.env.PROFILE_BUCKET || process.env.IMAGE_BUCKET || "doeventprofileimagesbucket";
const PROFILE_BUCKET_REGION =
  process.env.PROFILE_BUCKET_REGION || process.env.S3_BUCKET_REGION || "us-east-1";
const DEFAULT_UPLOAD_EXPIRES = 900;

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({
  signatureVersion: "v4",
  region: PROFILE_BUCKET_REGION,
});

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const getProfileBucketKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (!isHttpUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\/+/, "");

    if (host === `${PROFILE_BUCKET}.s3.amazonaws.com`) {
      return path || null;
    }

    if (host.startsWith(`${PROFILE_BUCKET}.s3.`)) {
      return path || null;
    }

    if (host.includes("amazonaws.com") && path.startsWith(`${PROFILE_BUCKET}/`)) {
      return path.slice(PROFILE_BUCKET.length + 1) || null;
    }
  } catch (error) {
    return null;
  }

  return null;
};

const toPublicUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  const regionSegment = PROFILE_BUCKET_REGION === "us-east-1" ? "s3" : `s3.${PROFILE_BUCKET_REGION}`;
  return `https://${PROFILE_BUCKET}.${regionSegment}.amazonaws.com/${raw}`;
};

const getFileExtension = (fileName = "") => {
  const clean = String(fileName || "").trim();
  if (!clean.includes(".")) return "jpg";
  const ext = clean.split(".").pop().toLowerCase();
  return ext || "jpg";
};

const buildProfileImageS3Key = ({ userId, imageId, fileName }) => {
  const ext = getFileExtension(fileName);
  return `profiles/${userId}/gallery/${imageId}.${ext}`;
};

const buildCoverImageS3Key = ({ userId, fileName }) => {
  const ext = getFileExtension(fileName);
  return `profiles/${userId}/cover/cover.${ext}`;
};

const buildAvatarImageS3Key = ({ userId, fileName }) => {
  const ext = getFileExtension(fileName);
  return `profiles/${userId}/avatar/avatar.${ext}`;
};

const getSignedUploadUrl = async ({ key, contentType, expiresInSeconds }) => {
  const params = {
    Bucket: PROFILE_BUCKET,
    Key: key,
    Expires: expiresInSeconds || DEFAULT_UPLOAD_EXPIRES,
  };

  if (contentType) {
    params.ContentType = contentType;
  }

  return s3.getSignedUrlPromise("putObject", params);
};

const getSignedReadUrl = ({ key, expiresInSeconds = 3600 }) => {
  const normalizedKey = getProfileBucketKey(key);
  if (!normalizedKey) return null;

  return s3.getSignedUrl("getObject", {
    Bucket: PROFILE_BUCKET,
    Key: normalizedKey,
    Expires: expiresInSeconds,
  });
};

const queryAllItems = async (params) => {
  const items = [];
  let lastEvaluatedKey;

  do {
    const data = await dynamodb
      .query({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    items.push(...(data.Items || []));
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
};

const scanAllItems = async (params) => {
  const items = [];
  let lastEvaluatedKey;

  do {
    const data = await dynamodb
      .scan({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    items.push(...(data.Items || []));
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
};

const getClientById = async (userId) => {
  const result = await dynamodb
    .get({
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: { id: userId },
    })
    .promise();

  return result.Item || null;
};

const ensureClientExists = async (userId) => {
  const item = await getClientById(userId);
  if (!item) {
    const error = new Error("Usuario no encontrado");
    error.statusCode = 404;
    throw error;
  }
  return item;
};

const normalizeGalleryItem = (item = {}) => {
  const key = getProfileBucketKey(item.key || item.publicUrl || item.url);
  return {
    imageId: item.imageId || uuidv4(),
    key: key || "",
    url: key ? toPublicUrl(key) : item.publicUrl || item.url || "",
    caption: item.caption || "",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
};

const resolveGallerySourceKey = async (userId, { imageId, key, url } = {}) => {
  const directKey = getProfileBucketKey(key || url);
  if (directKey) return directKey;

  if (!imageId) return null;

  const user = await getClientById(userId);
  const gallery = Array.isArray(user?.profileGallery) ? user.profileGallery : [];
  const item = gallery.find((entry) => entry.imageId === imageId);
  if (!item) return null;

  return getProfileBucketKey(item.key || item.url || item.publicUrl);
};

const copyObjectInProfileBucket = async ({ sourceKey, destKey }) => {
  if (!sourceKey || !destKey) {
    throw new Error("sourceKey y destKey son requeridos");
  }

  await s3
    .copyObject({
      Bucket: PROFILE_BUCKET,
      CopySource: `${PROFILE_BUCKET}/${sourceKey}`,
      Key: destKey,
    })
    .promise();

  return destKey;
};

module.exports = {
  dynamodb,
  s3,
  uuidv4,
  PROFILE_BUCKET,
  PROFILE_BUCKET_REGION,
  DEFAULT_UPLOAD_EXPIRES,
  isHttpUrl,
  getProfileBucketKey,
  toPublicUrl,
  buildProfileImageS3Key,
  buildCoverImageS3Key,
  buildAvatarImageS3Key,
  getSignedUploadUrl,
  getSignedReadUrl,
  queryAllItems,
  scanAllItems,
  getClientById,
  ensureClientExists,
  normalizeGalleryItem,
  resolveGallerySourceKey,
  copyObjectInProfileBucket,
};
