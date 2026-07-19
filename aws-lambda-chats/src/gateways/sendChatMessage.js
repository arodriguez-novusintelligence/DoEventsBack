const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const docClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const {
  notifyOfflineChatMessage,
} = require("../utils/notifyOfflineChatMessage");

const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "ChatMessage";
const {
  normalizeAssetForStorage,
  signedUrlForChatAsset,
} = require("../utils/chatAssetUrl");
const {
  assertSenderMatchesConnection,
  assertUserIsRoomParticipant,
  assertUserIsRoomAdmin,
  buildChatSenderDisplay,
} = require("../utils/wsConnectionUser");
const {
  getActiveRoomByRoomId,
} = require("../utils/chatRoomAdmin");
const { assertEventChatRoomIsOpen } = require("../utils/eventChatClosed");
const {
  resolveTimestamps,
  buildNewMessageWsPayload,
  buildChatAckWsPayload,
} = require("../utils/chatMessageContract");
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { broadcastJsonToRoomChannel } = require("../utils/wsBroadcastRoom");
const { sendAckToConnection } = require("../utils/wsAckDispatcher");
const { resolveWsManagementApiEndpoint } = require("../utils/resolveWsManagementApiEndpoint");
const {
  reserveMessageIdempotency,
  markMessageIdempotencyCommitted,
  releaseMessageIdempotency,
} = require("../utils/idempotencyStore");

function buildReplyMeta(message) {
  if (!message) return null;
  const hasReplyTo = message.replyToId != null && message.replyToId !== "";
  const hasReply = message.reply && typeof message.reply === "object";
  if (!hasReplyTo && !hasReply) return null;
  return {
    ...(hasReplyTo ? { replyToId: message.replyToId } : {}),
    ...(hasReply
      ? {
          reply: {
            id: message.reply.id,
            type: message.reply.type,
            text: message.reply.text,
            sender: message.reply.sender,
          },
        }
      : {}),
  };
}

function isReplyMessageType(type) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]/g, "-");
  return normalized === "message-reply" || normalized === "messagereply";
}

function isAnnouncementMessageType(type) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]/g, "-");
  return (
    normalized === "message-announcement" || normalized === "messageannouncement"
  );
}

function buildChatPreview(message) {
  const type = String(message.type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]/g, "-");
  if (type === "message-location" || message.location) {
    return message.location?.label || message.text || "Ubicación compartida";
  }
  if (type === "message-event-share" || message.sharedEvent) {
    return message.sharedEvent?.name || message.text || "Evento compartido";
  }
  if (type === "video") return "Video";
  if (type === "file" || type === "document") {
    return message.media?.fileName || message.text || "Archivo";
  }
  if (type.includes("image") || type.includes("gif")) return "Foto";
  return message.text || "";
}

exports.handler = async (event) => {
  let idempotencyKey = null;
  let shouldReleaseReservation = false;

  try {
    const body = parseLambdaJsonBody(event);
    const roomId = String(body.roomId ?? "").trim();
    const { message = {} } = body;

    if (!roomId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "roomId es obligatorio" }),
      };
    }

    let roomData = null;
    if (event.requestContext?.connectionId) {
      await assertSenderMatchesConnection(docClient, event, message.sender);
      roomData = await assertUserIsRoomParticipant(docClient, roomId, message.sender);
      if (isAnnouncementMessageType(message.type)) {
        await assertUserIsRoomAdmin(docClient, roomId, message.sender);
      }
    } else if (isAnnouncementMessageType(message.type)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: "Los anuncios solo pueden enviarse por administradores conectados al chat",
        }),
      };
    }

    if (!roomData) {
      roomData = await getActiveRoomByRoomId(roomId);
    }
    if (roomData) {
      await assertEventChatRoomIsOpen(docClient, roomData);
    }

    const requestContext = event.requestContext || {};
    const wsEndpoint = resolveWsManagementApiEndpoint(requestContext);
    const stage = wsEndpoint.stage;
    const domainName = wsEndpoint.domainName;
    const connectionId = requestContext.connectionId || null;
    const canBroadcastWs = Boolean(domainName);

    const channelId = roomId;
    const idMessage = uuidv4();
    const clientMessageId = message.clientMessageId || null;
    const senderUserId = message.sender != null ? String(message.sender) : null;

    const idempotency = await reserveMessageIdempotency({
      docClient,
      roomId,
      userId: senderUserId,
      clientMessageId,
      serverMessageId: idMessage,
    });

    if (idempotency.reserved && idempotency.idempotencyKey) {
      idempotencyKey = idempotency.idempotencyKey;
      shouldReleaseReservation = true;
    }

    if (idempotency.duplicate) {
      const duplicateServerMessageId = idempotency.existingServerMessageId || idMessage;

      if (canBroadcastWs && connectionId) {
        const duplicateAck = buildChatAckWsPayload({
          roomId,
          userId: senderUserId,
          clientMessageId,
          serverMessageId: duplicateServerMessageId,
          duplicate: true,
        });

        await sendAckToConnection({
          domainName,
          stage,
          connectionId,
          payload: duplicateAck,
          requestContext,
        });
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Duplicate message ignored",
          id: duplicateServerMessageId,
          clientMessageId: clientMessageId || undefined,
          duplicate: true,
        }),
      };
    }

    const { createdAt, updatedAt } = resolveTimestamps(message);

    const replyMeta = buildReplyMeta(message);

    if (message.media && message.media.base64) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "sendChatMessage no permite media.base64. Usa chat-media-upload/init y chat-media-upload/complete.",
        }),
      };
    }

    const mediaInput =
      message.media && typeof message.media === "object" ? message.media : null;
    const incomingAssetRef =
      message.asset ||
      (mediaInput && mediaInput.key) ||
      (mediaInput && mediaInput.url) ||
      null;

    const assetStored = normalizeAssetForStorage(incomingAssetRef);
    const assetBroadcast = signedUrlForChatAsset(incomingAssetRef, s3);

    const mediaOut = mediaInput
      ? {
          ...(mediaInput.key ? { key: mediaInput.key } : {}),
          ...(mediaInput.thumb || mediaInput.thumbUrl
            ? { thumb: mediaInput.thumb || mediaInput.thumbUrl }
            : {}),
          ...(mediaInput.duration != null ? { duration: mediaInput.duration } : {}),
          ...(mediaInput.width != null ? { width: mediaInput.width } : {}),
          ...(mediaInput.height != null ? { height: mediaInput.height } : {}),
          ...(mediaInput.fileType ? { fileType: mediaInput.fileType } : {}),
          ...(mediaInput.fileName ? { fileName: mediaInput.fileName } : {}),
          ...(assetBroadcast ? { url: assetBroadcast } : mediaInput.url ? { url: mediaInput.url } : {}),
        }
      : null;

    const sender = await buildChatSenderDisplay(s3, message.sender);

    const locationOut =
      message.location && typeof message.location === "object"
        ? {
            lat: Number(message.location.lat),
            lng: Number(message.location.lng),
            ...(message.location.label ? { label: String(message.location.label) } : {}),
          }
        : null;
    const sharedEventOut =
      message.sharedEvent && typeof message.sharedEvent === "object"
        ? {
            ...(message.sharedEvent.id ? { id: String(message.sharedEvent.id) } : {}),
            ...(message.sharedEvent.name ? { name: String(message.sharedEvent.name) } : {}),
            ...(message.sharedEvent.image ? { image: String(message.sharedEvent.image) } : {}),
            ...(message.sharedEvent.date ? { date: String(message.sharedEvent.date) } : {}),
          }
        : null;

    await docClient
      .put({
        TableName: MESSAGES_TABLE,
        Item: {
          status: "active",
          id: idMessage,
          roomId: roomId,
          text: message.text,
          reactions: message.reactions,
          sender: message.sender,
          reads: [message.sender],
          type: message.type,
          asset: assetStored,
          ...(mediaOut ? { media: mediaOut } : {}),
          ...(locationOut && Number.isFinite(locationOut.lat) && Number.isFinite(locationOut.lng)
            ? { location: locationOut }
            : {}),
          ...(sharedEventOut && sharedEventOut.id ? { sharedEvent: sharedEventOut } : {}),
          replyMeta: replyMeta,
          createdAt,
          updatedAt,
          deletedAt: message.deletedAt,
          ...(clientMessageId ? { clientMessageId } : {}),
        },
      })
      .promise();

    if (idempotencyKey) {
      await markMessageIdempotencyCommitted({
        docClient,
        idempotencyKey,
      });
      shouldReleaseReservation = false;
    }

    const broadcastPayload = buildNewMessageWsPayload({
      id: idMessage,
      roomId,
      sender,
      text: message.text,
      reactions: message.reactions,
      reads: [message.sender],
      type: message.type,
      asset: assetBroadcast,
      replyMeta,
      createdAt,
      updatedAt,
      deletedAt: message.deletedAt,
      clientMessageId,
      action: message.action ? message.action : "sendChatMessage",
      ...(mediaOut ? { media: mediaOut } : {}),
      ...(locationOut && Number.isFinite(locationOut.lat) && Number.isFinite(locationOut.lng)
        ? { location: locationOut }
        : {}),
      ...(sharedEventOut && sharedEventOut.id ? { sharedEvent: sharedEventOut } : {}),
    });

    if (canBroadcastWs && connectionId) {
      const ackPayload = buildChatAckWsPayload({
        roomId,
        userId: senderUserId,
        clientMessageId,
        serverMessageId: idMessage,
      });

      await sendAckToConnection({
        domainName,
        stage,
        connectionId,
        payload: ackPayload,
        requestContext,
      });
    }

    if (canBroadcastWs) {
      await broadcastJsonToRoomChannel({
        docClient,
        domainName,
        stage,
        channelId,
        payload: broadcastPayload,
        requestContext,
      });
    }

    try {
      const { incrementUnreadForParticipants } = require("../utils/chatUnread");
      await incrementUnreadForParticipants(roomData, message.sender);
    } catch (unreadError) {
      console.error("sendChatMessage unread increment failed:", unreadError.message);
    }

    const isReplyMessage = isReplyMessageType(message.type);
    const isAnnouncementMessage = isAnnouncementMessageType(message.type);

    const {
      CHAT_NOTIFY_CHANNELS,
    } = require("../utils/notifyOfflineChatMessage");

    await notifyOfflineChatMessage({
      docClient,
      roomId,
      senderId: message.sender,
      messageId: idMessage,
      previewText: buildChatPreview(message),
      senderName: String(sender?.name || "").trim() || "Alguien",
      templateKey: isAnnouncementMessage
        ? "CHAT_USER_ANNOUNCEMENT"
        : "CHAT_USER_NEW_MESSAGE",
      channels: CHAT_NOTIFY_CHANNELS,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Message sent successfully",
        id: idMessage,
        clientMessageId: clientMessageId || undefined,
        duplicate: false,
        createdAt,
        updatedAt,
      }),
    };
  } catch (error) {
    if (shouldReleaseReservation && idempotencyKey) {
      try {
        await releaseMessageIdempotency({
          docClient,
          idempotencyKey,
        });
      } catch (releaseError) {
        console.error("sendChatMessage release idempotency failed:", releaseError);
      }
    }

    console.error("Error in sendChatMessage handler:", error);
    const code = error.statusCode || 500;
    return {
      statusCode: code,
      body: JSON.stringify({
        error: error.message || "Internal server error",
      }),
    };
  }
};
