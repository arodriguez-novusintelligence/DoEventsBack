const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const PROFILE_BUCKET =
  process.env.PROFILE_BUCKET || "doevents-profile-media-qa";
const PROFILE_REGION = process.env.PROFILE_BUCKET_REGION || "us-east-2";
const VENUE_BUCKET = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";
const VENUE_BUCKET_REGION =
  process.env.ENTITY_MEDIA_REGION || process.env.VENUE_IMAGES_BUCKET_REGION || "us-east-1";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-qa";

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});
const profileS3 = new AWS.S3({ region: PROFILE_REGION, signatureVersion: "v4" });
const venueS3 = new AWS.S3({ region: VENUE_BUCKET_REGION, signatureVersion: "v4" });

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

async function copyGalleryImagesToVenue(userId, venueId, imports = []) {
  const urls = [];

  for (const entry of imports) {
    const sourceKey = await resolveGallerySourceKey(userId, entry);
    if (!sourceKey) continue;

    const sourceBucket = getProfileBucketName(entry.url || entry.key || entry.preview);
    const ext = sourceKey.split(".").pop()?.toLowerCase() || "jpg";
    const destKey = `venues/${venueId}/${uuidv4()}.${ext}`;

    await venueS3
      .copyObject({
        Bucket: VENUE_BUCKET,
        Key: destKey,
        CopySource: encodeURIComponent(`${sourceBucket}/${sourceKey}`),
      })
      .promise();

    urls.push(`https://${VENUE_BUCKET}.s3.amazonaws.com/${destKey}`);
  }

  return urls;
}

module.exports = {
  copyGalleryImagesToVenue,
  resolveGallerySourceKey,
};
