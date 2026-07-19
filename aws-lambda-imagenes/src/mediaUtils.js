const AWS = require("aws-sdk");

const DEFAULT_BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";
/** El bucket vive en us-east-1 aunque la Lambda QA corra en us-east-2. */
const IMAGE_BUCKET_REGION = process.env.IMAGE_BUCKET_REGION || "us-east-1";
const PUBLIC_URL_ROOT = `https://${DEFAULT_BUCKET}.s3.${IMAGE_BUCKET_REGION}.amazonaws.com`;

let s3Client;
function getS3Client() {
  if (!s3Client) {
    s3Client = new AWS.S3({
      region: IMAGE_BUCKET_REGION,
      signatureVersion: "v4",
    });
  }
  return s3Client;
}

const CONTENT_TYPE_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
};

const EXTENSION_BY_CONTENT_TYPE = Object.entries(CONTENT_TYPE_BY_EXTENSION).reduce(
  (acc, [extension, contentType]) => {
    if (!acc[contentType]) acc[contentType] = extension;
    return acc;
  },
  {},
);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isDataUri(value) {
  return /^data:[^;]+;base64,/i.test(String(value || ""));
}

function looksLikeBase64(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");

  if (!normalized || normalized.length < 32 || normalized.length % 4 !== 0) {
    return false;
  }

  return /^[A-Za-z0-9+/=]+$/.test(normalized);
}

function sanitizeContentType(value, fallback = "image/jpeg") {
  const contentType = String(value || "")
    .trim()
    .toLowerCase();

  if (!contentType || contentType === "image/*" || contentType === "video/*") {
    return fallback;
  }

  if (contentType.startsWith("image/") || contentType.startsWith("video/")) {
    return contentType;
  }

  return fallback;
}

function getExtensionFromFileName(fileName) {
  const name = String(fileName || "").trim();
  if (!name.includes(".")) return null;
  return name.split(".").pop().trim().toLowerCase() || null;
}

function inferContentType({ contentType, fileName, fallback = "image/jpeg" }) {
  const normalized = sanitizeContentType(contentType, "");
  if (normalized) return normalized;

  const extension = getExtensionFromFileName(fileName);
  if (extension && CONTENT_TYPE_BY_EXTENSION[extension]) {
    return CONTENT_TYPE_BY_EXTENSION[extension];
  }

  return fallback;
}

function inferExtension({ contentType, fileName, fallback = "jpg" }) {
  const extensionFromName = getExtensionFromFileName(fileName);
  if (extensionFromName) return extensionFromName;

  const normalizedContentType = sanitizeContentType(contentType, "");
  if (normalizedContentType && EXTENSION_BY_CONTENT_TYPE[normalizedContentType]) {
    return EXTENSION_BY_CONTENT_TYPE[normalizedContentType];
  }

  return fallback;
}

function detectContentTypeFromBytes(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "video/mp4";
  }

  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "video/webm";
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  return null;
}

function parseBase64Payload(value, fallbackContentType = "image/jpeg") {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (isDataUri(raw)) {
    const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return null;

    return {
      base64: match[2].replace(/\s+/g, ""),
      contentType: sanitizeContentType(match[1], fallbackContentType),
    };
  }

  if (!looksLikeBase64(raw)) return null;

  return {
    base64: raw.replace(/\s+/g, ""),
    contentType: sanitizeContentType(fallbackContentType, "image/jpeg"),
  };
}

function normalizeS3Key(value, bucketName = DEFAULT_BUCKET) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (!isHttpUrl(raw)) {
    if (raw.includes(`${bucketName}.s3.amazonaws.com/`)) {
      return raw.split(`${bucketName}.s3.amazonaws.com/`)[1] || null;
    }
    return raw.replace(/^\/+/, "");
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.host.toLowerCase();

    if (host === `${bucketName}.s3.amazonaws.com` || host.startsWith(`${bucketName}.s3.`)) {
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) || null;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function buildPublicUrl(key, bucketName = DEFAULT_BUCKET) {
  if (!key) return null;
  return `https://${bucketName}.s3.${IMAGE_BUCKET_REGION}.amazonaws.com/${key}`;
}

function sanitizeFileBaseName(name, fallback = "Imagen") {
  const raw = String(name || "").trim();
  const withoutExtension = raw.includes(".")
    ? raw.substring(0, raw.lastIndexOf("."))
    : raw;

  const sanitized = withoutExtension
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || fallback;
}

function buildEventMediaKey({ eventId, fileName, index = 0, contentType = "image/jpeg" }) {
  const extension = inferExtension({
    contentType,
    fileName,
    fallback: contentType.startsWith("video/") ? "mp4" : "jpg",
  });

  const baseName = sanitizeFileBaseName(fileName, `Imagen${index}`);
  const finalName = `${baseName}.${extension}`;

  return `events/${eventId}/${finalName}`;
}

function extractEntryValues(entry) {
  if (entry && typeof entry === "object") {
    return {
      s3Key: entry.s3Key || entry.key || entry.path || null,
      url: entry.url || entry.publicUrl || entry.accessUrl || entry.src || null,
      fileName: entry.nombreImagen || entry.fileName || null,
      rawBase64:
        entry.ImagenB64 ||
        entry.base64 ||
        entry.base64Data ||
        entry.imageBase64 ||
        entry.imagenBase64 ||
        null,
      contentType: entry.contentType || entry.mimeType || null,
    };
  }

  if (typeof entry === "string") {
    return {
      s3Key: null,
      url: isHttpUrl(entry) ? entry : null,
      fileName: null,
      rawBase64: !isHttpUrl(entry) ? entry : null,
      contentType: null,
    };
  }

  return {
    s3Key: null,
    url: null,
    fileName: null,
    rawBase64: null,
    contentType: null,
  };
}

function resolveIncomingMediaEntry({ entry, eventId, index = 0, bucketName = DEFAULT_BUCKET }) {
  const values = extractEntryValues(entry);

  const referencedKey =
    normalizeS3Key(values.s3Key, bucketName) || normalizeS3Key(values.url, bucketName);
  if (referencedKey) {
    return {
      type: "reference",
      s3Key: referencedKey,
      publicUrl: buildPublicUrl(referencedKey, bucketName),
    };
  }

  if (values.url && isHttpUrl(values.url) && !normalizeS3Key(values.url, bucketName)) {
    return {
      type: "external",
      s3Key: null,
      publicUrl: values.url,
    };
  }

  const fallbackType = inferContentType({
    contentType: values.contentType,
    fileName: values.fileName,
  });

  const parsed = parseBase64Payload(values.rawBase64, fallbackType);
  if (!parsed) {
    return null;
  }

  const buffer = Buffer.from(parsed.base64, "base64");
  const detectedContentType = detectContentTypeFromBytes(buffer);
  const finalContentType = sanitizeContentType(
    detectedContentType || parsed.contentType || fallbackType,
    "image/jpeg",
  );
  const key = buildEventMediaKey({
    eventId,
    fileName: values.fileName || `Imagen${index}`,
    index,
    contentType: finalContentType,
  });

  return {
    type: "upload",
    s3Key: key,
    publicUrl: buildPublicUrl(key, bucketName),
    contentType: finalContentType,
    body: buffer,
  };
}

module.exports = {
  DEFAULT_BUCKET,
  IMAGE_BUCKET_REGION,
  PUBLIC_URL_ROOT,
  getS3Client,
  buildPublicUrl,
  normalizeS3Key,
  resolveIncomingMediaEntry,
};