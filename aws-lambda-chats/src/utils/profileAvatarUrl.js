const {
  isHttpUrl,
  sanitizeHttpUrl,
  signedGetObjectUrl,
} = require("./chatAssetUrl");
const AWS = require("aws-sdk");

const PROFILE_BUCKET = process.env.PROFILE_MEDIA_BUCKET || "doeventprofileimagesbucket";
const PROFILE_BUCKET_REGION =
  process.env.PROFILE_MEDIA_BUCKET_REGION
  || process.env.AWS_REGION
  || process.env.AWS_DEFAULT_REGION
  || "us-east-1";

let profileS3Client = null;

function getProfileS3Client(fallbackS3) {
  if (profileS3Client) return profileS3Client;
  try {
    profileS3Client = new AWS.S3({
      region: PROFILE_BUCKET_REGION,
      signatureVersion: "v4",
    });
    return profileS3Client;
  } catch {
    return fallbackS3 || new AWS.S3({ signatureVersion: "v4" });
  }
}

/**
 * Extrae key S3 usable desde URL pública del bucket de perfil o key cruda.
 */
function extractProfileObjectKey(fotoPerfilUrl) {
  const raw = String(fotoPerfilUrl || "").trim();
  if (!raw) return null;
  if (!isHttpUrl(raw)) {
    return raw.replace(/^\/+/, "") || null;
  }
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const path = decodeURIComponent(u.pathname || "").replace(/^\/+/, "");
    if (!path) return null;
    // virtual-hosted: bucket.s3.../key or bucket.s3.region.../key
    if (
      host.startsWith(`${PROFILE_BUCKET}.`)
      || host.includes("doevents-profile-media")
      || host.includes("doeventprofileimagesbucket")
    ) {
      return path;
    }
    // path-style: s3.region.amazonaws.com/bucket/key
    if (host.startsWith("s3.") || host === "s3.amazonaws.com") {
      const parts = path.split("/");
      if (parts.length >= 2 && /profile|fotoPerfil|doevent/i.test(parts[0])) {
        return parts.slice(1).join("/");
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * URL de avatar de perfil (http(s) OAuth con platform, o firma S3 sobre key/URL de bucket).
 */
function resolveProfileAvatarUrl(s3, fotoPerfilUrl, platform) {
  if (!fotoPerfilUrl) return null;
  const normalizedPlatform = String(platform || "").trim().toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;
  const raw = String(fotoPerfilUrl).trim();

  // Foto OAuth (Google/Apple/Facebook): URL pública directa.
  if (hasPlatform && isHttpUrl(raw)) {
    const host = (() => {
      try { return new URL(raw).hostname.toLowerCase(); } catch { return ""; }
    })();
    const isOurBucket = /doevents-profile-media|doeventprofileimagesbucket|amazonaws\.com/i.test(host);
    if (!isOurBucket) {
      return sanitizeHttpUrl(raw);
    }
  }

  const s3Client = getProfileS3Client(s3);
  const key = extractProfileObjectKey(raw) || (!isHttpUrl(raw) ? raw.replace(/^\/+/, "") : null);
  if (key) {
    const signed = signedGetObjectUrl(s3Client, PROFILE_BUCKET, key);
    if (signed) return signed;
  }

  return isHttpUrl(raw) ? sanitizeHttpUrl(raw) : null;
}

module.exports = {
  resolveProfileAvatarUrl,
  getProfileS3Client,
  PROFILE_BUCKET,
  PROFILE_BUCKET_REGION,
};
