const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");
const {
  CHAT_MEDIA_BUCKET,
  getChatS3Client,
  signedGetObjectUrl,
} = require("../utils/chatAssetUrl");

function normalizeMediaKey(raw) {
  if (raw == null) return "";
  return String(raw).trim().replace(/^\/+/, "");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const body = parseLambdaJsonBody(event);
    const mediaKey = normalizeMediaKey(body.mediaKey || body.uploadId);
    const duration = body.duration != null ? Number(body.duration) : null;
    const width = body.width != null ? Number(body.width) : null;
    const height = body.height != null ? Number(body.height) : null;
    const thumbKey = normalizeMediaKey(body.thumbKey || "");
    const thumbUrlRaw = body.thumbUrl != null ? String(body.thumbUrl).trim() : null;

    if (!mediaKey) {
      return jsonResponse(400, {
        error: "mediaKey o uploadId es obligatorio",
      });
    }

    const s3 = getChatS3Client();
    await s3
      .headObject({
        Bucket: CHAT_MEDIA_BUCKET,
        Key: mediaKey,
      })
      .promise();

    const mediaUrl = signedGetObjectUrl(s3, CHAT_MEDIA_BUCKET, mediaKey);
    const resolvedThumbUrl = thumbKey
      ? signedGetObjectUrl(s3, CHAT_MEDIA_BUCKET, thumbKey)
      : thumbUrlRaw || null;

    return jsonResponse(200, {
      statusCode: 200,
      statusDesc: "Upload completado",
      uploadId: mediaKey,
      mediaKey,
      mediaUrl,
      url: mediaUrl,
      media: {
        key: mediaKey,
        url: mediaUrl,
        thumb: resolvedThumbUrl,
        ...(Number.isFinite(duration) && duration >= 0 ? { duration } : {}),
        ...(Number.isFinite(width) && width > 0 ? { width } : {}),
        ...(Number.isFinite(height) && height > 0 ? { height } : {}),
        ...(thumbKey ? { thumbKey } : {}),
      },
    });
  } catch (error) {
    console.error("Error en completeChatMediaUpload:", error);
    if (error && (error.code === "NotFound" || error.statusCode === 404)) {
      return jsonResponse(404, {
        error: "No se encontró el objeto en S3 para el mediaKey indicado",
      });
    }
    return jsonResponse(500, {
      error: error.message || "Internal server error",
    });
  }
};
