const CHAT_MEDIA_BUCKET = process.env.CHAT_MEDIA_BUCKET || "doeventschatroombucket";
const CHAT_MEDIA_BUCKET_REGION = process.env.CHAT_MEDIA_BUCKET_REGION || "us-east-1";

function getChatS3Client() {
  const AWS = require("aws-sdk");
  return new AWS.S3({
    region: CHAT_MEDIA_BUCKET_REGION,
    signatureVersion: "v4",
  });
}

/** Firma getObject: por defecto 7 días (segundos). Máx. típico en presigned URLs. */
const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_SIGNED_UPLOAD_EXPIRES_SECONDS = 60 * 15;

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

function normalizeS3Key(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/^\/+/, "");
  if (!s.length) return null;
  if (/[\r\n]/.test(s) || s.includes("\0")) return null;
  return s;
}

/** URL absoluta http(s) bien formada; evita devolver strings rotos al cliente. */
function sanitizeHttpUrl(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname.length === 0) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Segmento de ruta seguro para S3 (sin slashes ni caracteres de control).
 */
function sanitizePathSegment(raw, fallback = "file") {
  const base = String(raw ?? "")
    .trim()
    .replace(/[/\\\r\n\0]+/g, "_")
    .replace(/\s+/g, "_");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Key final tipo: {roomSegment}/{messageId}_{timestamp}_{fileNameSafe}
 */
function buildChatMediaObjectKey(roomId, messageId, originalFileName) {
  const roomSeg = sanitizePathSegment(roomId, "room");
  const fileSeg = sanitizePathSegment(originalFileName || "asset", "asset");
  const mid = sanitizePathSegment(messageId, "msg");
  const ts = Date.now();
  return `${roomSeg}/${mid}_${ts}_${fileSeg}`;
}

/**
 * GET firmado sobre bucket/key; valida key y URL resultante.
 */
function signedGetObjectUrl(s3, bucket, key, expiresSeconds) {
  const exp =
    typeof expiresSeconds === "number" && expiresSeconds > 0
      ? expiresSeconds
      : DEFAULT_SIGNED_URL_EXPIRES_SECONDS;
  const cleanKey = normalizeS3Key(key);
  if (!cleanKey || !bucket) return null;
  try {
    const signed = s3.getSignedUrl("getObject", {
      Bucket: bucket,
      Key: cleanKey,
      Expires: exp,
    });
    return sanitizeHttpUrl(signed);
  } catch {
    return null;
  }
}

/**
 * PUT firmado para subir archivo directo a S3.
 */
function signedPutObjectUrl(s3, bucket, key, contentType, expiresSeconds) {
  const exp =
    typeof expiresSeconds === "number" && expiresSeconds > 0
      ? expiresSeconds
      : DEFAULT_SIGNED_UPLOAD_EXPIRES_SECONDS;
  const cleanKey = normalizeS3Key(key);
  if (!cleanKey || !bucket) return null;
  try {
    const params = {
      Bucket: bucket,
      Key: cleanKey,
      Expires: exp,
    };
    const cleanType = String(contentType || "").trim();
    if (cleanType) {
      params.ContentType = cleanType;
    }
    const signed = s3.getSignedUrl("putObject", params);
    return sanitizeHttpUrl(signed);
  } catch {
    return null;
  }
}

/**
 * Guardar en DynamoDB: URL http(s) tal cual, o key S3 sin slash inicial.
 */
function normalizeAssetForStorage(raw) {
  if (raw == null || raw === "") return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (isHttpUrl(str)) return str;
  return normalizeS3Key(str);
}

/**
 * Para WebSocket / REST: URL firmada si es key en CHAT_MEDIA_BUCKET; si ya es URL http(s), devuelve la saneada.
 */
function signedUrlForChatAsset(raw, s3) {
  if (raw == null || raw === "") return null;
  const str = String(raw).trim();
  if (!str) return null;
  if (isHttpUrl(str)) return sanitizeHttpUrl(str);
  const cleanKey = normalizeS3Key(str);
  if (!cleanKey) return null;
  return signedGetObjectUrl(s3, CHAT_MEDIA_BUCKET, cleanKey);
}

module.exports = {
  CHAT_MEDIA_BUCKET,
  CHAT_MEDIA_BUCKET_REGION,
  getChatS3Client,
  isHttpUrl,
  normalizeAssetForStorage,
  signedUrlForChatAsset,
  sanitizeHttpUrl,
  buildChatMediaObjectKey,
  signedGetObjectUrl,
  signedPutObjectUrl,
};
