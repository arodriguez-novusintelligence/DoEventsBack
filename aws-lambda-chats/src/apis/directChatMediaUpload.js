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
} = require("../utils/chatAssetUrl");
const {
  MAX_DIRECT_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  normalizeFileType,
  decodeBase64Payload,
} = require("../utils/chatMediaRules");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const body = parseLambdaJsonBody(event);
    const roomId = String(body.roomId || "").trim();
    const fileName = String(body.fileName || "").trim();
    const fileType = normalizeFileType(body.fileType || body.contentType);
    const senderId = String(body.senderId || body.userId || "").trim() || null;
    const declaredSize = Number(body.size);
    const buffer = decodeBase64Payload(body.contentBase64 || body.base64);

    if (!roomId || !fileName || !fileType || !buffer || buffer.length === 0) {
      return jsonResponse(400, {
        error: "roomId, fileName, fileType y contentBase64 son obligatorios",
      });
    }

    if (!ALLOWED_MEDIA_TYPES.has(fileType)) {
      return jsonResponse(400, {
        error: "fileType no permitido para upload de chat",
      });
    }

    if (buffer.length > MAX_DIRECT_UPLOAD_BYTES) {
      return jsonResponse(400, {
        error: "Archivo demasiado grande para subida directa",
        maxBytes: MAX_DIRECT_UPLOAD_BYTES,
      });
    }

    if (Number.isFinite(declaredSize) && declaredSize > 0) {
      const delta = Math.abs(buffer.length - declaredSize);
      if (delta > Math.max(4096, declaredSize * 0.05)) {
        return jsonResponse(400, {
          error: "El tamaño del archivo no coincide con el contenido enviado",
        });
      }
    }

    const roomData = await getActiveRoomByRoomId(roomId);
    if (!roomData) {
      return jsonResponse(404, { error: "Sala no encontrada" });
    }

    await assertEventChatRoomIsOpen(docClient, roomData);

    const s3 = getChatS3Client();
    const mediaKey = buildChatMediaObjectKey(roomId, uuidv4(), fileName);

    await s3
      .putObject({
        Bucket: CHAT_MEDIA_BUCKET,
        Key: mediaKey,
        Body: buffer,
        ContentType: fileType,
      })
      .promise();

    const mediaUrl = signedGetObjectUrl(s3, CHAT_MEDIA_BUCKET, mediaKey);
    if (!mediaUrl) {
      return jsonResponse(500, {
        error: "No se pudo generar URL de lectura para el archivo",
      });
    }

    return jsonResponse(200, {
      statusCode: 200,
      statusDesc: "Upload completado",
      uploadId: mediaKey,
      mediaKey,
      mediaUrl,
      url: mediaUrl,
      strategy: "direct",
      media: {
        key: mediaKey,
        url: mediaUrl,
        fileType,
        fileName,
        size: buffer.length,
        senderId,
      },
    });
  } catch (error) {
    console.error("Error en directChatMediaUpload:", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};
