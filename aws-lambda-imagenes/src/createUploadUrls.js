const { DEFAULT_BUCKET, buildPublicUrl, getS3Client } = require("./mediaUtils");

const s3 = getS3Client();

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const CONTENT_TYPE_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const normalizeValue = (value) => String(value || "").trim();

const sanitizeName = (value, fallback) => {
  const normalized = normalizeValue(value)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
};

const getExtension = (fileName, contentType) => {
  const rawName = normalizeValue(fileName).toLowerCase();
  if (rawName.includes(".")) {
    const extension = rawName.split(".").pop();
    if (extension) return extension;
  }

  const normalizedType = normalizeValue(contentType).toLowerCase();
  const typeEntry = Object.entries(CONTENT_TYPE_BY_EXTENSION).find(
    ([, type]) => type === normalizedType,
  );

  return typeEntry ? typeEntry[0] : "jpg";
};

const getContentType = (contentType, extension) => {
  const normalizedType = normalizeValue(contentType).toLowerCase();

  if (normalizedType.startsWith("image/") || normalizedType.startsWith("video/")) {
    return normalizedType;
  }

  return CONTENT_TYPE_BY_EXTENSION[extension] || "image/jpeg";
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const eventId = normalizeValue(body.eventId || body.id_evento);
    const files = Array.isArray(body.files) ? body.files : [];
    const expiresInSeconds = Number(body.expiresInSeconds) || 900;

    console.log("📥 createUploadUrls request", {
      eventId,
      filesCount: files.length,
      expiresInSeconds,
    });

    if (!eventId) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "eventId es obligatorio.",
        }),
      };
    }

    if (!Array.isArray(files) || files.length === 0) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "files es obligatorio y debe contener al menos un archivo.",
        }),
      };
    }

    if (files.length > 20) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({
          success: false,
          message: "Máximo 20 archivos por solicitud.",
        }),
      };
    }

    const uploads = await Promise.all(
      files.map(async (file, index) => {
        const rawFileName = normalizeValue(file && file.fileName);
        const extension = getExtension(rawFileName, file && file.contentType);
        const contentType = getContentType(file && file.contentType, extension);
        const safeFileName = sanitizeName(rawFileName, `media-${index + 1}.${extension}`);
        const s3Key = `events/${eventId}/${Date.now()}-${index}-${safeFileName}`;

        const uploadUrl = await s3.getSignedUrlPromise("putObject", {
          Bucket: DEFAULT_BUCKET,
          Key: s3Key,
          ContentType: contentType,
          Expires: Math.min(Math.max(expiresInSeconds, 60), 3600),
          Metadata: {
            eventId: String(eventId),
          },
        });

        return {
          fileName: safeFileName,
          contentType,
          s3Key,
          uploadUrl,
          publicUrl: buildPublicUrl(s3Key, DEFAULT_BUCKET),
          method: "PUT",
        };
      }),
    );

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        bucket: DEFAULT_BUCKET,
        expiresInSeconds: Math.min(Math.max(expiresInSeconds, 60), 3600),
        uploads,
      }),
    };
  } catch (error) {
    console.error("Error creando URLs firmadas de carga:", error);

    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor.",
        error: error.message,
      }),
    };
  }
};
