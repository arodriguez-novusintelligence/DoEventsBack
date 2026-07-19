const { v4: uuidv4 } = require("uuid");
const docClient = new (require("aws-sdk").DynamoDB.DocumentClient)();
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");
const { getActiveRoomByRoomId } = require("../utils/chatRoomAdmin");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");
const {
  CHAT_MEDIA_BUCKET,
  buildChatMediaObjectKey,
  getChatS3Client,
  signedGetObjectUrl,
  signedPutObjectUrl,
} = require("../utils/chatAssetUrl");
const {
  MAX_MEDIA_SIZE_BYTES,
  ALLOWED_MEDIA_TYPES,
  normalizeFileType,
} = require("../utils/chatMediaRules");

async function loadRoom(roomId) {
  return getActiveRoomByRoomId(roomId);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const body = parseLambdaJsonBody(event);
    const roomId = String(body.roomId || "").trim();
    const fileName = String(body.fileName || "").trim();
    const fileType = normalizeFileType(body.fileType);
    const size = Number(body.size);
    const senderId = String(body.senderId || body.userId || "").trim() || null;

    if (!roomId || !fileName || !fileType || !Number.isFinite(size) || size <= 0) {
      return jsonResponse(400, {
        error: "roomId, fileName, fileType y size son obligatorios",
      });
    }

    if (!ALLOWED_MEDIA_TYPES.has(fileType)) {
      return jsonResponse(400, {
        error: "fileType no permitido para upload de chat",
        allowedFileTypes: Array.from(ALLOWED_MEDIA_TYPES),
      });
    }

    if (size > MAX_MEDIA_SIZE_BYTES) {
      return jsonResponse(400, {
        error: "Archivo demasiado grande",
        maxBytes: MAX_MEDIA_SIZE_BYTES,
      });
    }

    const roomData = await loadRoom(roomId);
    if (!roomData) {
      return jsonResponse(404, { error: "Sala no encontrada" });
    }

    await assertEventChatRoomIsOpen(docClient, roomData);

    const s3 = getChatS3Client();
    const uploadToken = uuidv4();
    const mediaKey = buildChatMediaObjectKey(roomId, uploadToken, fileName);
    const uploadId = mediaKey;

    const uploadUrl = signedPutObjectUrl(s3, CHAT_MEDIA_BUCKET, mediaKey, null);
    const mediaUrl = signedGetObjectUrl(s3, CHAT_MEDIA_BUCKET, mediaKey);

    if (!uploadUrl || !mediaUrl) {
      return jsonResponse(500, {
        error: "No se pudo generar URL prefirmada para upload",
      });
    }

    return jsonResponse(200, {
      statusCode: 200,
      statusDesc: "Upload inicializado",
      uploadId,
      mediaKey,
      mediaUrl,
      uploadUrl,
      strategy: "putObject",
      expiresInSeconds: 60 * 15,
      media: {
        key: mediaKey,
        url: mediaUrl,
        fileType,
        fileName,
        size,
        senderId,
      },
    });
  } catch (error) {
    console.error("Error en initChatMediaUpload:", error);
    return jsonResponse(500, {
      error: error.message || "Internal server error",
    });
  }
};
