const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const {
  CHAT_MEDIA_BUCKET,
  getChatS3Client,
} = require("../utils/chatAssetUrl");
const s3 = getChatS3Client();
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const { enrichMessageForRestApi } = require("../utils/chatMessageContract");
const {
  resolveParticipantsDetails,
  idsMatch,
} = require("../utils/resolveChatParticipants");

const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "ChatMessage";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

// URL absoluta http(s) bien formada; si no, null (evita strings rotos al cliente)
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

// Key de objeto S3: sin espacios extremos, sin / inicial, sin caracteres de control
function normalizeS3Key(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/^\/+/, "");
  if (!s.length) return null;
  if (/[\r\n\u0000]/.test(s)) return null;
  return s;
}

// Adjunto del mensaje: URL válida o firma getObject sobre key en CHAT_MEDIA_BUCKET
function resolveMessageAsset(raw) {
  if (raw == null || raw === "") return null;
  const str = String(raw).trim();
  if (!str) return null;

  if (isHttpUrl(str)) {
    return sanitizeHttpUrl(str);
  }

  try {
    return getImageUrl(CHAT_MEDIA_BUCKET, str);
  } catch (e) {
    return null;
  }
}

// --- Paginación: ordenar por fecha (mismo criterio que el índice si usa createdAt) ---
const messageTimeMs = (msg) => {
  const t = msg.createdAt || msg.updatedAt;
  if (t) {
    const d = Date.parse(t);
    if (!Number.isNaN(d)) return d;
  }
  return 0;
};

const sortMessagesAscending = (items) =>
  [...items].sort((a, b) => {
    const ta = messageTimeMs(a);
    const tb = messageTimeMs(b);
    if (ta !== tb) return ta - tb;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

async function queryAllMessagesInRoom(roomId) {
  const all = [];
  let lastKey;
  do {
    const res = await dynamodb
      .query({
        TableName: MESSAGES_TABLE,
        IndexName: "RoomIndex",
        KeyConditionExpression: "roomId = :rid",
        ExpressionAttributeValues: {
          ":rid": roomId,
        },
        ExclusiveStartKey: lastKey,
      })
      .promise();
    const active = (res.Items || []).filter(
      (m) => m.status !== "deleted" && !m.deletedAt,
    );
    all.push(...active);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return all;
}

async function findMessageByIdInRoom(roomId, messageId) {
  let lastKey;
  do {
    const res = await dynamodb
      .query({
        TableName: MESSAGES_TABLE,
        IndexName: "RoomIndex",
        KeyConditionExpression: "roomId = :rid",
        ExpressionAttributeValues: {
          ":rid": roomId,
        },
        ExclusiveStartKey: lastKey,
        ProjectionExpression: "id, roomId, #ca",
        ExpressionAttributeNames: { "#ca": "createdAt" },
      })
      .promise();
    const found = (res.Items || []).find((m) => m.id === messageId);
    if (found) return found;
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return null;
}

async function queryNewestPageWithCreatedAt(roomId, limitPlusOne, beforeCreatedAt) {
  const exprValues = { ":rid": roomId };
  let keyCond = "roomId = :rid";
  if (beforeCreatedAt != null) {
    keyCond += " AND createdAt < :cutoff";
    exprValues[":cutoff"] = beforeCreatedAt;
  }
  const res = await dynamodb
    .query({
      TableName: MESSAGES_TABLE,
      IndexName: "RoomIndex",
      KeyConditionExpression: keyCond,
      ExpressionAttributeValues: exprValues,
      ScanIndexForward: false,
      Limit: limitPlusOne,
    })
    .promise();
  return res.Items || [];
}

function paginateInMemory(sortedAsc, limit, beforeMessageId) {
  if (!beforeMessageId) {
    const slice = sortedAsc.slice(-limit);
    const hasMore = sortedAsc.length > limit;
    return { page: slice, hasMore };
  }
  const idx = sortedAsc.findIndex((m) => m.id === beforeMessageId);
  if (idx < 0) return { notFound: true };
  const older = sortedAsc.slice(0, idx);
  const page = older.slice(-limit);
  const hasMore = older.length > limit;
  return { page, hasMore };
}

// Resuelve senders con lookup de Client por id corto/UUID y firma avatar en bucket de perfil.
async function mapRoomMessagesWithSenders(roomMessageData) {
  if (!roomMessageData.length) return [];

  const senderIds = [
    ...new Set(
      roomMessageData
        .map((msg) => String(msg.sender || "").trim())
        .filter(Boolean),
    ),
  ];
  const resolvedSenders = await resolveParticipantsDetails(senderIds);

  return roomMessageData.map((message) => {
    const senderId = String(message.sender || "").trim();
    const sender = resolvedSenders.find((s) => idsMatch(s.id, senderId));
    const media =
      message.media && typeof message.media === "object" ? message.media : null;
    const assetRef =
      message.asset || (media && (media.key || media.url)) || null;
    const assetUrl =
      resolveMessageAsset(assetRef) ||
      (media && media.url ? sanitizeHttpUrl(media.url) : null);

    const senderResolved = sender
      ? {
          id: sender.id,
          name: sender.name,
          avatar: sender.avatar,
        }
      : message.sender;

    const mediaObj = media
      ? {
          ...media,
          url: assetUrl || media.url || null,
          fileType: media.fileType || message.assetContentType || null,
          fileName: media.fileName || message.mediaFileName || null,
          ...(media.key ? { key: media.key } : {}),
        }
      : assetUrl || message.assetContentType || message.mediaFileName
        ? {
            url: assetUrl || null,
            fileType: message.assetContentType || null,
            fileName: message.mediaFileName || null,
          }
        : null;

    return enrichMessageForRestApi(message, senderResolved, assetUrl, mediaObj);
  });
}

exports.fetchMessagesInternal = async (roomId) => {
  const roomMessageData = await queryAllMessagesInRoom(roomId);
  const messages = await mapRoomMessagesWithSenders(roomMessageData);
  return { messages };
};

exports.handler = async (event) => {
  const CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  // GET PARAM ROOM ID FROM PATH PARAMETERS
  const roomId = event.pathParameters && event.pathParameters.roomId;

  if (!roomId) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: "Missing roomId in path." }),
    };
  }

  // QUERY PARAMS: limit (default 50), beforeMessageId opcional
  const qs = event.queryStringParameters || {};
  let limit = DEFAULT_LIMIT;
  if (qs.limit != null && String(qs.limit).trim() !== "") {
    const n = parseInt(qs.limit, 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_LIMIT) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({ message: `Invalid limit (1-${MAX_LIMIT}).` }),
      };
    }
    limit = n;
  }
  const beforeMessageId =
    qs.beforeMessageId != null && String(qs.beforeMessageId).trim() !== ""
      ? String(qs.beforeMessageId).trim()
      : null;
  const sinceTs =
    qs.sinceTs != null && String(qs.sinceTs).trim() !== ""
      ? String(qs.sinceTs).trim()
      : null;

  if (beforeMessageId && sinceTs) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "Use beforeMessageId or sinceTs, but not both.",
      }),
    };
  }

  let sinceMs = null;
  if (sinceTs) {
    const parsed = Date.parse(sinceTs);
    if (Number.isNaN(parsed)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Credentials": true,
        },
        body: JSON.stringify({
          message: "Invalid sinceTs. Expected ISO-8601 timestamp.",
        }),
      };
    }
    sinceMs = parsed;
  }

  try {
    let roomMessageData = [];
    let hasMore = false;

    if (beforeMessageId) {
      const cursor = await findMessageByIdInRoom(roomId, beforeMessageId);
      if (!cursor || (cursor.roomId != null && cursor.roomId !== roomId)) {
        return {
          statusCode: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true,
          },
          body: JSON.stringify({
            message: "Message not found for this room or invalid beforeMessageId.",
          }),
        };
      }

      const beforeCreatedAt = cursor.createdAt;
      if (beforeCreatedAt == null || beforeCreatedAt === "") {
        const all = sortMessagesAscending(await queryAllMessagesInRoom(roomId));
        const pag = paginateInMemory(all, limit, beforeMessageId);
        if (pag.notFound) {
          return {
            statusCode: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Credentials": true,
            },
            body: JSON.stringify({
              message: "Message not found for this room or invalid beforeMessageId.",
            }),
          };
        }
        roomMessageData = pag.page;
        hasMore = pag.hasMore;
      } else {
        try {
          const batch = await queryNewestPageWithCreatedAt(
            roomId,
            limit + 1,
            beforeCreatedAt,
          );
          hasMore = batch.length > limit;
          roomMessageData = batch.slice(0, limit);
          roomMessageData.reverse();
        } catch (e) {
          const all = sortMessagesAscending(await queryAllMessagesInRoom(roomId));
          const pag = paginateInMemory(all, limit, beforeMessageId);
          if (pag.notFound) {
            return {
              statusCode: 404,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true,
              },
              body: JSON.stringify({
                message: "Message not found for this room or invalid beforeMessageId.",
              }),
            };
          }
          roomMessageData = pag.page;
          hasMore = pag.hasMore;
        }
      }
    } else if (sinceMs != null) {
      const all = sortMessagesAscending(await queryAllMessagesInRoom(roomId));
      const deltas = all.filter((m) => messageTimeMs(m) > sinceMs);
      hasMore = deltas.length > limit;
      roomMessageData = deltas.slice(0, limit);
    } else {
      try {
        const batch = await queryNewestPageWithCreatedAt(roomId, limit + 1, null);
        hasMore = batch.length > limit;
        roomMessageData = batch.slice(0, limit);
        roomMessageData.reverse();
      } catch (e) {
        const all = sortMessagesAscending(await queryAllMessagesInRoom(roomId));
        const pag = paginateInMemory(all, limit, null);
        roomMessageData = pag.page;
        hasMore = pag.hasMore;
      }
    }

    // CHECK IF ROOM EXISTS (mensajes vacíos es válido)
    // VALIDATE SENDER DATA + MAP (misma lógica que tu versión original)
    const roomDataAndSenders = await mapRoomMessagesWithSenders(roomMessageData);

    const oldestMessageId =
      roomDataAndSenders.length > 0 ? roomDataAndSenders[0].id : undefined;

    // RETURN SUCCESS RESPONSE WITH ROOM DATA
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        messages: roomDataAndSenders,
        hasMore,
        ...(sinceTs != null ? { sinceTs } : {}),
        ...(oldestMessageId != null ? { oldestMessageId } : {}),
      }),
    };
  } catch (error) {
    // HANDLE DYNAMODB QUERY ERROR
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "Failed to retrieve room connections.",
        error: error.message,
      }),
    };
  }
};

const getImageUrl = (bucketName, key) => {
  const cleanKey = normalizeS3Key(key);
  if (!cleanKey || !bucketName) {
    throw new Error("Invalid S3 bucket or key");
  }
  const params = {
    Bucket: bucketName,
    Key: cleanKey,
  };

  // GET URL FOR S3 OBJECT
  const signed = s3.getSignedUrl("getObject", params);
  const safe = sanitizeHttpUrl(signed);
  if (!safe) {
    throw new Error("Signed URL malformed");
  }
  return safe;
};
