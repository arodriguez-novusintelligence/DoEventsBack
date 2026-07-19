const AWS = require("aws-sdk");
const { randomUUID } = require("crypto");

const PROFILE_BUCKET =
  process.env.PROFILE_BUCKET || process.env.PROFILE_IMAGES_BUCKET || "doevents-profile-media-qa";
const PROFILE_REGION = process.env.PROFILE_BUCKET_REGION || "us-east-2";
const ENTITY_BUCKET =
  process.env.ENTITY_MEDIA_BUCKET || process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";
const ENTITY_REGION = process.env.ENTITY_MEDIA_REGION || "us-east-1";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-qa";
const READ_URL_EXPIRES = Number(process.env.MEDIA_READ_URL_EXPIRES || 86400);

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});
const profileS3 = new AWS.S3({ region: PROFILE_REGION, signatureVersion: "v4" });
const entityS3 = new AWS.S3({ region: ENTITY_REGION, signatureVersion: "v4" });

const PROFILE_BUCKETS = new Set(
  [
    PROFILE_BUCKET,
    "doeventprofileimagesbucket",
    "doevents-profile-media-qa",
    "doevents-profile-media-dev",
    "doevents-profile-media-prod",
  ].filter(Boolean),
);

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

function resolveProfileBucketFromHost(host) {
  for (const bucket of PROFILE_BUCKETS) {
    if (host === `${bucket}.s3.amazonaws.com`) return bucket;
    if (host.startsWith(`${bucket}.s3.`)) return bucket;
  }
  const match = String(host || "").match(/^(doevents-profile-media-[a-z0-9-]+)\.s3\./i);
  return match ? match[1] : null;
}

function getProfileBucketKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!isHttpUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/^\/+/, "");
    const host = parsed.hostname;

    if (resolveProfileBucketFromHost(host)) return path || null;

    for (const bucket of PROFILE_BUCKETS) {
      if (host.includes("amazonaws.com") && path.startsWith(`${bucket}/`)) {
        return path.slice(bucket.length + 1) || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getProfileBucketName(value) {
  const raw = String(value || "").trim();
  if (!isHttpUrl(raw)) return PROFILE_BUCKET;
  try {
    return resolveProfileBucketFromHost(new URL(raw).hostname) || PROFILE_BUCKET;
  } catch {
    return PROFILE_BUCKET;
  }
}

function isProfileBucketReference(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (!isHttpUrl(raw)) return true;
  if (getProfileBucketKey(raw)) return true;
  try {
    const host = new URL(raw).hostname;
    if (resolveProfileBucketFromHost(host)) return true;
    if (host.includes("doeventprofileimagesbucket")) return true;
  } catch {
    return false;
  }
  return false;
}

function entityPublicUrl(key) {
  const normalized = String(key || "").replace(/^\/+/, "");
  const regionSegment = ENTITY_REGION === "us-east-1" ? "s3" : `s3.${ENTITY_REGION}`;
  return `https://${ENTITY_BUCKET}.${regionSegment}.amazonaws.com/${normalized}`;
}

async function resolveGallerySourceKey(userId, { imageId, key, url } = {}) {
  const directKey = getProfileBucketKey(key || url);
  if (directKey) return directKey;

  if (!imageId || !userId) return null;

  const result = await dynamodb
    .get({ TableName: CLIENT_TABLE, Key: { id: userId } })
    .promise();
  const gallery = Array.isArray(result.Item?.profileGallery)
    ? result.Item.profileGallery
    : [];
  const item = gallery.find((entry) => entry.imageId === imageId);
  if (!item) return null;

  return getProfileBucketKey(item.key || item.url || item.publicUrl);
}

async function copyProfileKeyToEntityBucket(sourceKey, destPrefix, sourceBucket = PROFILE_BUCKET) {
  const ext = String(sourceKey).split(".").pop()?.toLowerCase() || "jpg";
  const destKey = `${destPrefix}/${randomUUID()}.${ext}`;
  const copySource = encodeURIComponent(`${sourceBucket}/${sourceKey}`);

  await entityS3
    .copyObject({
      Bucket: ENTITY_BUCKET,
      Key: destKey,
      CopySource: copySource,
    })
    .promise();

  return entityPublicUrl(destKey);
}

async function copyGalleryImageToEntity(userId, entityPrefix, source = {}) {
  const sourceKey = await resolveGallerySourceKey(userId, source);
  if (!sourceKey) {
    const error = new Error("Imagen de galería no encontrada");
    error.statusCode = 404;
    throw error;
  }
  const sourceBucket = getProfileBucketName(source.url || source.key);
  return copyProfileKeyToEntityBucket(sourceKey, entityPrefix, sourceBucket);
}

function signProfileBucketUrl(value) {
  const key = getProfileBucketKey(value);
  if (!key || !isProfileBucketReference(value)) return null;

  return profileS3.getSignedUrl("getObject", {
    Bucket: PROFILE_BUCKET,
    Key: key,
    Expires: READ_URL_EXPIRES,
  });
}

function resolveReadableImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  const signed = signProfileBucketUrl(raw);
  if (signed) return signed;

  if (isHttpUrl(raw)) return raw.split("?")[0];
  return entityPublicUrl(raw);
}

function resolveReadableGallery(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map((url) => resolveReadableImageUrl(url)).filter(Boolean);
}

function isEntityBucketUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (!isHttpUrl(raw)) return false;
  try {
    const host = new URL(raw).hostname;
    return host === `${ENTITY_BUCKET}.s3.amazonaws.com` || host.startsWith(`${ENTITY_BUCKET}.s3.`);
  } catch {
    return raw.includes(ENTITY_BUCKET);
  }
}

async function persistProfileImageToEntity(userId, entityPrefix, url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  if (isEntityBucketUrl(raw)) {
    try {
      const key = decodeURIComponent(new URL(raw.split("?")[0]).pathname.replace(/^\/+/, ""));
      return entityPublicUrl(key);
    } catch {
      return raw.split("?")[0];
    }
  }

  if (!isProfileBucketReference(raw)) {
    return isHttpUrl(raw) ? raw.split("?")[0] : raw;
  }

  let sourceKey = getProfileBucketKey(raw);
  if (!sourceKey && userId) {
    sourceKey = await resolveGallerySourceKey(userId, { key: raw, url: raw });
  }
  if (!sourceKey) return null;

  const sourceBucket = getProfileBucketName(raw);
  return copyProfileKeyToEntityBucket(sourceKey, entityPrefix, sourceBucket);
}

async function persistGalleryToEntity(userId, entityPrefix, urls) {
  if (!Array.isArray(urls)) return [];
  const unique = [...new Set(urls.map((url) => String(url || "").trim()).filter(Boolean))];
  const persisted = await Promise.all(
    unique.map((url) => persistProfileImageToEntity(userId, entityPrefix, url)),
  );
  return persisted.filter(Boolean);
}

module.exports = {
  copyGalleryImageToEntity,
  persistProfileImageToEntity,
  persistGalleryToEntity,
  resolveReadableImageUrl,
  resolveReadableGallery,
  isProfileBucketReference,
  isEntityBucketUrl,
  getProfileBucketKey,
};
