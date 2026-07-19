function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function isSignedS3Url(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return (
      parsed.searchParams.has("X-Amz-Signature") ||
      parsed.searchParams.has("X-Amz-Algorithm")
    );
  } catch {
    return /X-Amz-Signature=/i.test(raw);
  }
}

function isEphemeralMediaUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return true;
  if (raw.startsWith("blob:")) return true;
  if (isSignedS3Url(raw)) return true;
  if (/^\/assets\//i.test(raw)) return true;
  if (/qa\.doeventsapp\.com\/assets\//i.test(raw)) return true;
  return false;
}

function bucketPublicUrl(bucket, region, key) {
  const regionSegment = region === "us-east-1" ? "s3" : `s3.${region}`;
  return `https://${bucket}.${regionSegment}.amazonaws.com/${String(key || "").replace(/^\/+/, "")}`;
}

function inferRegionFromS3Host(hostname) {
  const regional = String(hostname || "").match(/\.s3\.([a-z0-9-]+)\.amazonaws\.com$/i);
  return regional?.[1] || "us-east-1";
}

function inferBucketFromS3Host(hostname) {
  if (!String(hostname || "").includes("amazonaws.com")) return null;
  return (
    String(hostname).replace(/\.s3(\.[a-z0-9-]+)?\.amazonaws\.com$/i, "") || null
  );
}

function toPersistentImageUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || !isHttpUrl(raw) || isEphemeralMediaUrl(raw)) return null;

  try {
    const parsed = new URL(raw);
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!path) return null;

    const bucket = inferBucketFromS3Host(parsed.hostname);
    if (!bucket) {
      return isSignedS3Url(raw) ? null : `${parsed.origin}${parsed.pathname}`;
    }

    return bucketPublicUrl(bucket, inferRegionFromS3Host(parsed.hostname), path);
  } catch {
    const withoutQuery = raw.split("?")[0];
    return isEphemeralMediaUrl(withoutQuery) ? null : withoutQuery;
  }
}

function normalizeIncomingImageUrls(images) {
  if (!Array.isArray(images)) return [];

  const urls = images
    .map((img) => {
      if (!img) return null;
      if (typeof img === "string") {
        return toPersistentImageUrl(img);
      }
      if (typeof img === "object" && img.base64) {
        return null;
      }
      if (typeof img === "object") {
        return toPersistentImageUrl(
          img.url || img.imageUrl || img.signedUrl || img.publicUrl || img.uri,
        );
      }
      return null;
    })
    .filter((url) => typeof url === "string" && url.length > 0);

  return [...new Set(urls)];
}

module.exports = {
  isEphemeralMediaUrl,
  isSignedS3Url,
  toPersistentImageUrl,
  normalizeIncomingImageUrls,
};
