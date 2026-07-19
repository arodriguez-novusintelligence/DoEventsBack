const MAX_MEDIA_SIZE_BYTES = Number(
  process.env.MAX_MEDIA_SIZE_BYTES || 1024 * 1024 * 200,
);
const MAX_DIRECT_UPLOAD_BYTES = Number(
  process.env.MAX_DIRECT_UPLOAD_BYTES || 8 * 1024 * 1024,
);

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
]);

function normalizeFileType(raw) {
  const fileType = String(raw || "").trim().toLowerCase();
  if (fileType === "image/jpg") return "image/jpeg";
  return fileType;
}

function decodeBase64Payload(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const normalized = value.includes(",") ? value.split(",").pop() : value;
  try {
    return Buffer.from(normalized, "base64");
  } catch {
    return null;
  }
}

module.exports = {
  MAX_MEDIA_SIZE_BYTES,
  MAX_DIRECT_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  normalizeFileType,
  decodeBase64Payload,
};
