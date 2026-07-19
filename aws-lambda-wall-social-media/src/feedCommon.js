const AWS = require("aws-sdk");
const crypto = require("crypto");
const { resolveTableName } = require("./client/resolveQaTable");

const DYNAMODB_REGION =
  process.env.DYNAMODB_REGION ||
  process.env.DYNAMODB_EXTENDED_REGION ||
  process.env.AWS_REGION ||
  "us-east-1";
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: DYNAMODB_REGION });
const EXTENDED_DYNAMODB_REGION =
  process.env.DYNAMODB_EXTENDED_REGION || DYNAMODB_REGION;
const extendedDynamodb = new AWS.DynamoDB.DocumentClient({
  region: EXTENDED_DYNAMODB_REGION,
});
const S3_REGION =
  process.env.S3_REGION ||
  process.env.AWS_REGION ||
  process.env.DYNAMODB_EXTENDED_REGION ||
  "us-east-1";
const s3 = new AWS.S3({ signatureVersion: "v4", region: S3_REGION });

const FEED_SCOPE_HOME_PUBLIC = "HOME#PUBLIC";

const TABLES = {
  client: resolveTableName("DYNAMODB_CLIENT_TABLE", "Client"),
  events: resolveTableName("DYNAMODB_EVENTS_TABLE", "Eventos"),
  eventInvitations: resolveTableName("DYNAMODB_EVENT_INVITATIONS_TABLE", "EventInvitations"),
  publications: resolveTableName("DYNAMODB_FEED_PUBLICATIONS_TABLE", "FeedPublications"),
  timeline: resolveTableName("DYNAMODB_FEED_TIMELINE_TABLE", "FeedTimeline"),
  publicationLikes: resolveTableName("DYNAMODB_FEED_PUBLICATION_LIKES_TABLE", "FeedPublicationLikes"),
  storyViews: resolveTableName("DYNAMODB_FEED_STORY_VIEWS_TABLE", "FeedStoryViews"),
  publicationReposts: resolveTableName("DYNAMODB_FEED_PUBLICATION_REPOSTS_TABLE", "FeedPublicationReposts"),
  comments: resolveTableName("DYNAMODB_FEED_COMMENTS_TABLE", "FeedComments"),
  commentLikes: resolveTableName("DYNAMODB_FEED_COMMENT_LIKES_TABLE", "FeedCommentLikes"),
  shares: resolveTableName("DYNAMODB_FEED_SHARES_TABLE", "FeedShares"),
  media: resolveTableName("DYNAMODB_FEED_MEDIA_TABLE", "FeedMedia"),
  reports: resolveTableName("DYNAMODB_REPORTS_TABLE", "Reports"),
  notInterested: resolveTableName("DYNAMODB_NOTINTERESTED_TABLE", "NotInterested"),
  idempotency: resolveTableName("DYNAMODB_FEED_IDEMPOTENCY_TABLE", "FeedIdempotency"),
};

const EXTENDED_TABLES = {
  services: resolveTableName("DYNAMODB_SERVICES_TABLE", "ServiceProviders"),
  venues: resolveTableName("DYNAMODB_VENUES_TABLE", "Venues"),
};

const MEDIA_BUCKET = process.env.FEED_MEDIA_BUCKET || "doevent-feed-media";
const PROFILE_IMAGES_BUCKET =
  process.env.PROFILE_IMAGES_BUCKET ||
  process.env.PROFILE_BUCKET ||
  "doeventprofileimagesbucket";
const PROFILE_IMAGES_BUCKET_REGION =
  process.env.PROFILE_IMAGES_BUCKET_REGION ||
  process.env.PROFILE_BUCKET_REGION ||
  process.env.S3_REGION ||
  "us-east-1";
const LEGACY_PROFILE_BUCKET = "doeventprofileimagesbucket";
const s3ProfileRead = new AWS.S3({
  signatureVersion: "v4",
  region: PROFILE_IMAGES_BUCKET_REGION,
});
const s3LegacyProfileRead = new AWS.S3({
  signatureVersion: "v4",
  region: "us-east-1",
});
const EVENT_IMAGES_TABLE = resolveTableName(
  "DYNAMODB_EVENT_IMAGES_TABLE",
  "imagenes",
);
const EVENT_IMAGES_BUCKET =
  process.env.EVENT_IMAGES_BUCKET || "doeventimageeventbucket";
const FEED_PUBLIC_BASE_URL =
  process.env.FEED_PUBLIC_BASE_URL || "https://doevents.app/p";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,If-None-Match,X-User-Id,x-user-id",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
};

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

function errorResponse(statusCode, code, message, details = null) {
  return response(statusCode, {
    error: {
      code,
      message,
      details,
    },
  });
}

function parseBody(event) {
  if (!event || !event.body) return {};
  if (typeof event.body === "string") {
    try {
      return JSON.parse(event.body);
    } catch (err) {
      throw new Error("INVALID_JSON_BODY");
    }
  }
  return event.body;
}

function normalizeVisibility(value) {
  const visibility = String(value || "PUBLIC").toUpperCase();
  if (visibility !== "PUBLIC" && visibility !== "PRIVATE") {
    throw new Error("INVALID_VISIBILITY");
  }
  return visibility;
}

function normalizePrivacyValue(value, fallback = "PUBLIC") {
  const normalized = String(value || fallback)
    .trim()
    .toUpperCase();

  if (["PRIVADO", "PRIVATE", "1", "TRUE", "YES"].includes(normalized)) {
    return "PRIVATE";
  }

  if (["PUBLICO", "PUBLIC", "0", "FALSE", "NO"].includes(normalized)) {
    return "PUBLIC";
  }

  return normalized === "PRIVATE" ? "PRIVATE" : "PUBLIC";
}

function resolveEventPrivacyClass(eventItem = {}) {
  const clase = String(eventItem.clase || "").trim().toUpperCase();
  if (clase === "P") return "PRIVATE";
  if (clase === "A") return "PUBLIC";
  return null;
}

function resolveEventVisibility(eventItem = {}) {
  return normalizePrivacyValue(
    resolveEventPrivacyClass(eventItem) ||
      eventItem.visibility ||
      eventItem.privacy ||
      (eventItem.private === true ? "PRIVATE" : null),
    "PUBLIC",
  );
}

function parseIncludes(queryStringParameters) {
  const includeRaw = queryStringParameters?.include || "";
  const includeSet = new Set(
    String(includeRaw)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
  return {
    services: includeSet.has("services"),
    nearby: includeSet.has("nearby"),
  };
}

function parseLimit(queryStringParameters, defaultValue = 20, max = 50) {
  const raw = queryStringParameters?.limit;
  const value = Number(raw);
  if (!raw || Number.isNaN(value) || value <= 0) return defaultValue;
  return Math.min(value, max);
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function toSortKey(createdAt, id) {
  return `${createdAt}#${id}`;
}

function encodeCursor(lastEvaluatedKey) {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), "utf8").toString("base64");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error("INVALID_CURSOR");
  }
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function chunkArray(items = [], chunkSize = 100) {
  const size = Math.max(1, Number(chunkSize) || 1);
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function pushRecentCandidate(collection, candidate, maxItems = 80) {
  if (!candidate) return;

  collection.push(candidate);
  collection.sort((left, right) =>
    String(right?.createdAt || "").localeCompare(String(left?.createdAt || ""))
  );

  if (collection.length > maxItems) {
    collection.length = maxItems;
  }
}

function parseDateToIso(value) {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;

  if (/^\d{8}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}T00:00:00.000Z`;
  }

  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString();
  }

  return null;
}

function resolvePublicationTimestamp(item = {}, extraCandidates = []) {
  const candidates = [
    ...extraCandidates,
    item.publishAt,
    item.publishedAt,
    item.publicationTimestamp,
    item.createDate,
    item.createdAt,
    item.updatedAt,
    item.timestamp,
  ];

  for (const candidate of candidates) {
    const parsed = parseDateToIso(candidate);
    if (parsed) return parsed;
  }

  return nowIso();
}

function extractUserIdFromAuth(event) {
  const authorizerClaims =
    event?.requestContext?.authorizer?.jwt?.claims ||
    event?.requestContext?.authorizer?.claims ||
    null;

  const authorizerLambdaContext =
    event?.requestContext?.authorizer?.lambda ||
    event?.requestContext?.authorizer ||
    null;

  if (authorizerClaims) {
    const authorizerUserId =
      authorizerClaims.sub ||
      authorizerClaims["cognito:username"] ||
      authorizerClaims.username ||
      authorizerClaims.userId ||
      authorizerClaims.id ||
      authorizerClaims.clientId ||
      authorizerClaims.uid ||
      null;

    if (authorizerUserId) return authorizerUserId;
  }

  if (authorizerLambdaContext) {
    const authorizerUserId =
      authorizerLambdaContext.sub ||
      authorizerLambdaContext["cognito:username"] ||
      authorizerLambdaContext.username ||
      authorizerLambdaContext.userId ||
      authorizerLambdaContext.id ||
      authorizerLambdaContext.clientId ||
      authorizerLambdaContext.uid ||
      authorizerLambdaContext.principalId ||
      null;

    if (authorizerUserId) return authorizerUserId;
  }

  const authHeader =
    event?.headers?.Authorization || event?.headers?.authorization || "";

  const bearerMatch = String(authHeader).match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch
    ? bearerMatch[1].trim()
    : String(authHeader || "").trim();

  if (!token) return null;

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64UrlPayload = String(parts[1]);
    const base64Payload = base64UrlPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64UrlPayload.length / 4) * 4, "=");

    const payloadJson = Buffer.from(base64Payload, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson);

    return (
      payload.sub ||
      payload["cognito:username"] ||
      payload.username ||
      payload.userId ||
      payload.id ||
      payload.clientId ||
      payload.uid ||
      null
    );
  } catch (err) {
    return null;
  }
}

function resolveViewerId(event, body) {
  const headerViewerId =
    event?.headers?.["x-user-id"] ||
    event?.headers?.["X-User-Id"] ||
    event?.headers?.["x-userid"] ||
    event?.headers?.["X-Userid"] ||
    null;

  return (
    extractUserIdFromAuth(event) ||
    headerViewerId ||
    body?.viewerId ||
    body?.userId ||
    body?.clientId ||
    body?.user_id ||
    event?.queryStringParameters?.viewerId ||
    event?.queryStringParameters?.userId ||
    event?.queryStringParameters?.clientId ||
    null
  );
}

const MENTION_TARGET_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const USER_MENTION_TYPE = "user";
const EVENT_MENTION_TYPE = "event";
const SERVICE_MENTION_TYPE = "service";
const VENUE_MENTION_TYPE = "venue";

function normalizeMentionTargetId(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "");

  if (!normalized || !MENTION_TARGET_ID_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeMentionType(value, fallback = USER_MENTION_TYPE) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase();

  if (normalized === EVENT_MENTION_TYPE) return EVENT_MENTION_TYPE;
  if (normalized === SERVICE_MENTION_TYPE) return SERVICE_MENTION_TYPE;
  if (normalized === VENUE_MENTION_TYPE) return VENUE_MENTION_TYPE;
  return USER_MENTION_TYPE;
}

function sanitizeMentionMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return {};
  }
}

function normalizeMentionUserId(value) {
  return normalizeMentionTargetId(value);
}

function createMentionTag(userId) {
  const normalizedTargetId = normalizeMentionTargetId(userId);
  return normalizedTargetId ? `@${normalizedTargetId}` : null;
}

function toNullableIndex(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function resolveMentionEntryType(mention = {}) {
  return normalizeMentionType(
    mention.mentionType ||
      mention.type ||
      mention.entityType ||
      mention.targetType ||
      (mention.eventId || mention.event_id
        ? EVENT_MENTION_TYPE
        : mention.serviceId
          ? SERVICE_MENTION_TYPE
          : mention.venueId
            ? VENUE_MENTION_TYPE
            : USER_MENTION_TYPE),
  );
}

function getMentionTargetId(mention = {}, mentionType = null) {
  const resolvedType = mentionType || resolveMentionEntryType(mention);

  if (resolvedType === EVENT_MENTION_TYPE) {
    return normalizeMentionTargetId(
      mention.eventId ||
        mention.event_id ||
        mention.targetId ||
        mention.entityId ||
        mention.id ||
        mention.value,
    );
  }

  if (resolvedType === SERVICE_MENTION_TYPE || resolvedType === VENUE_MENTION_TYPE) {
    return normalizeMentionTargetId(
      mention.targetId || mention.serviceId || mention.venueId || mention.entityId || mention.id,
    );
  }

  return normalizeMentionUserId(
    mention.userId || mention.id || mention.value || mention.clientId,
  );
}

function normalizeMentionEntry(mention) {
  if (!mention && mention !== 0) return null;

  if (typeof mention === "string") {
    const userId = normalizeMentionUserId(mention);
    if (!userId) return null;

    return {
      type: USER_MENTION_TYPE,
      mentionType: USER_MENTION_TYPE,
      targetId: userId,
      userId,
      eventId: null,
      tag: createMentionTag(userId),
      start: null,
      end: null,
      name: null,
      title: null,
      username: null,
      avatarUrl: null,
      role: null,
      description: "",
      imageUrl: null,
      locationLabel: "",
      dateLabel: "",
      slug: null,
      metadata: {},
    };
  }

  if (typeof mention !== "object") return null;

  const mentionType = resolveMentionEntryType(mention);
  const targetId = getMentionTargetId(mention, mentionType);
  if (!targetId) return null;

  const tag = mention.tag || mention.token || mention.text || createMentionTag(targetId);
  const start = toNullableIndex(mention.start);
  const computedEnd = start !== null ? start + String(tag || "").length : null;
  const endCandidate = toNullableIndex(mention.end);

  return {
    type: mentionType,
    mentionType,
    targetId,
    userId: mentionType === USER_MENTION_TYPE ? targetId : null,
    eventId: mentionType === EVENT_MENTION_TYPE ? targetId : null,
    tag: String(tag || createMentionTag(targetId)),
    start,
    end: endCandidate !== null && start !== null && endCandidate >= start
      ? endCandidate
      : computedEnd,
    name: mention.name || mention.title || null,
    title: mention.title || mention.name || null,
    username: mention.username || null,
    avatarUrl: mention.avatarUrl || null,
    role: mention.role || null,
    description: String(mention.description || ""),
    imageUrl: mention.imageUrl || null,
    locationLabel: String(mention.locationLabel || ""),
    dateLabel: String(mention.dateLabel || ""),
    slug: mention.slug || null,
    metadata: sanitizeMentionMetadata(mention.metadata || mention.meta || {}),
  };
}

function sanitizeMentions(mentions) {
  if (!Array.isArray(mentions)) return [];

  const normalized = [];
  const seen = new Set();

  mentions.forEach((mention) => {
    const normalizedMention = normalizeMentionEntry(mention);
    if (!normalizedMention) return;

    const key = [
      normalizedMention.mentionType,
      normalizedMention.targetId,
      normalizedMention.start ?? "null",
      normalizedMention.end ?? "null",
      normalizedMention.tag,
    ].join(":");

    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(normalizedMention);
  });

  return normalized.slice(0, 30);
}

function extractMentionsFromText(text = "") {
  const source = String(text || "");
  if (!source) return [];

  const regex = /@([A-Za-z0-9][A-Za-z0-9_-]{0,127})/g;
  const mentions = [];
  let match;

  while ((match = regex.exec(source))) {
    const fullMatch = match[0];
    const userId = normalizeMentionUserId(match[1]);
    const start = match.index;
    const previousChar = start > 0 ? source[start - 1] : "";

    if (!userId) continue;
    if (previousChar && /[A-Za-z0-9_.]/.test(previousChar)) {
      continue;
    }

    mentions.push({
      type: USER_MENTION_TYPE,
      mentionType: USER_MENTION_TYPE,
      targetId: userId,
      userId,
      eventId: null,
      tag: fullMatch,
      start,
      end: start + fullMatch.length,
      metadata: {},
    });

    if (mentions.length >= 30) {
      break;
    }
  }

  return sanitizeMentions(mentions);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
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
    if (!acc[contentType]) {
      acc[contentType] = extension;
    }
    return acc;
  },
  {}
);

function detectContentTypeFromBytes(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // MP4 / MOV: ftyp box starts at byte offset 4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "video/mp4";
  }
  // WebM
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "video/webm";
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  return null;
}

function sanitizeContentType(value, fallback = "image/jpeg") {
  const contentType = String(value || "")
    .trim()
    .toLowerCase();

  if (
    contentType.startsWith("image/") ||
    contentType.startsWith("video/")
  ) {
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
  const normalizedContentType = sanitizeContentType(contentType, "");
  if (normalizedContentType) {
    return normalizedContentType;
  }

  const extension = getExtensionFromFileName(fileName);
  if (extension && CONTENT_TYPE_BY_EXTENSION[extension]) {
    return CONTENT_TYPE_BY_EXTENSION[extension];
  }

  return fallback;
}

function inferExtension({ contentType, fileName, fallback = "jpg" }) {
  const extensionFromName = getExtensionFromFileName(fileName);
  if (extensionFromName) {
    return extensionFromName;
  }

  const normalizedContentType = sanitizeContentType(contentType, "");
  if (normalizedContentType && EXTENSION_BY_CONTENT_TYPE[normalizedContentType]) {
    return EXTENSION_BY_CONTENT_TYPE[normalizedContentType];
  }

  return fallback;
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

function buildFeedMediaPublicUrl(key) {
  if (!MEDIA_BUCKET || !key) return null;
  return `https://${MEDIA_BUCKET}.s3.amazonaws.com/${key}`;
}

const MEDIA_INLINE_ROOT_KEYS = [
  "images",
  "videos",
  "photos",
  "media",
  "mediaItems",
  "medias",
  "attachments",
  "files",
  "fileList",
  "gallery",
  "selectedImages",
  "selectedPhotos",
  "selectedMedia",
  "selectedAssets",
  "uploads",
  "uploadResults",
  "uploaded",
  "uploadedItems",
  "mediaUploads",
  "mediaUpload",
  "items",
  "results",
  "assets",
  "selected",
  "selection",
  "imageUrls",
  "videoUrls",
  "photoUrls",
  "imageBase64s",
  "videoBase64s",
  "mediaBase64",
  "photoBase64s",
  "fotoBase64s",
  "imageBase64",
  "videoBase64",
  "photoBase64",
  "fotoBase64",
  "image",
  "video",
  "imagen",
  "photo",
  "foto",
];

const MEDIA_ID_ROOT_KEYS = [
  "mediaIds",
  "mediaId",
  "selectedMediaIds",
  "uploadedMediaIds",
  "items",
  "media",
  "mediaItems",
  "attachments",
  "files",
  "fileList",
  "uploadResults",
  "uploads",
  "uploaded",
  "uploadedItems",
  "mediaUploads",
  "mediaUpload",
];

const MEDIA_NESTED_COLLECTION_KEYS = [
  "assets",
  "items",
  "results",
  "uploads",
  "uploadResults",
  "uploaded",
  "uploadedItems",
  "selectedAssets",
  "selectedImages",
  "selectedPhotos",
  "selectedMedia",
  "selectedVideos",
  "files",
  "fileList",
  "images",
  "videos",
  "photos",
  "medias",
  "media",
  "mediaItems",
  "attachments",
  "gallery",
  "selected",
  "selection",
  "responses",
];

const MEDIA_NESTED_WRAPPER_KEYS = [
  "response",
  "result",
  "payload",
  "data",
  "value",
  "file",
  "originFileObj",
  "originFile",
  "originalFile",
  "asset",
  "upload",
  "mediaUpload",
  "mediaItem",
  "attachment",
  "source",
  "preview",
];

const MEDIA_ID_OBJECT_KEYS = [
  "mediaId",
  "media_id",
  "feedMediaId",
  "feed_media_id",
  "uploadId",
  "upload_id",
];

const MEDIA_REMOVE_ROOT_KEYS = [
  "removeMediaIds",
  "removedMediaIds",
  "deleteMediaIds",
  "deletedMediaIds",
];

function looksLikeFeedMediaId(value) {
  return /^med_[A-Za-z0-9]+$/i.test(String(value || "").trim());
}

function tryParseStructuredString(value) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("[") && !trimmed.startsWith("{"))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

function getIndexedObjectValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => value[key])
    .filter((item) => item !== undefined);
}

function collectNestedMediaValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  const nestedValues = [];

  [...MEDIA_NESTED_COLLECTION_KEYS, ...MEDIA_NESTED_WRAPPER_KEYS].forEach((key) => {
    if (value[key] !== undefined) {
      nestedValues.push(value[key]);
    }
  });

  nestedValues.push(...getIndexedObjectValues(value));

  return nestedValues.filter((item) => item !== undefined);
}

function getRequestedMediaIdentity(value) {
  const normalizedValue = tryParseStructuredString(value);

  if (normalizedValue === undefined || normalizedValue === null || normalizedValue === "") {
    return null;
  }

  if (typeof normalizedValue === "string") {
    const trimmed = normalizedValue.trim();
    if (!trimmed) return null;
    if (looksLikeFeedMediaId(trimmed)) return `id:${trimmed}`;
    return `inline:${trimmed.slice(0, 128)}`;
  }

  if (typeof normalizedValue !== "object") {
    return `value:${String(normalizedValue)}`;
  }

  const nestedMediaIds = extractRequestedMediaIds(normalizedValue);
  if (nestedMediaIds.length) {
    return `id:${nestedMediaIds[0]}`;
  }

  const resolvedKey =
    normalizedValue.s3Key ||
    normalizedValue.key ||
    normalizedValue.pathKey ||
    normalizedValue.path ||
    normalizedValue.storageKey ||
    normalizeS3Key(
      normalizedValue.accessUrl ||
        normalizedValue.publicUrl ||
        normalizedValue.url ||
        normalizedValue.signedUrl,
      MEDIA_BUCKET
    ) ||
    null;

  if (resolvedKey) {
    return `key:${resolvedKey}`;
  }

  const externalUrl =
    normalizedValue.url ||
    normalizedValue.uri ||
    normalizedValue.publicUrl ||
    normalizedValue.imageUrl ||
    normalizedValue.photoUrl ||
    normalizedValue.thumbnailUrl ||
    normalizedValue.sourceUrl ||
    normalizedValue.accessUrl ||
    normalizedValue.signedUrl ||
    normalizedValue.thumbUrl ||
    normalizedValue.src ||
    null;

  if (externalUrl) {
    return `url:${String(externalUrl).slice(0, 256)}`;
  }

  const inlineValue =
    normalizedValue.base64 ||
    normalizedValue.data ||
    normalizedValue.base64Data ||
    normalizedValue.imageBase64 ||
    normalizedValue.photoBase64 ||
    normalizedValue.fotoBase64 ||
    normalizedValue.value ||
    normalizedValue.preview ||
    normalizedValue.thumbUrl ||
    null;

  if (inlineValue) {
    return `inline:${String(inlineValue).slice(0, 128)}`;
  }

  return null;
}

function normalizeS3Key(value, bucketName) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (!isHttpUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\/+/, "");

    if (host === `${bucketName}.s3.amazonaws.com`) {
      return path || null;
    }

    if (host.startsWith(`${bucketName}.s3.`)) {
      return path || null;
    }

    if (host.includes("amazonaws.com") && path.startsWith(`${bucketName}/`)) {
      return path.slice(bucketName.length + 1) || null;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function getSignedReadUrl(bucketName, key, expires = 3600) {
  if (!bucketName || !key) return null;

  try {
    return s3.getSignedUrl("getObject", {
      Bucket: bucketName,
      Key: key,
      Expires: expires,
    });
  } catch (error) {
    return null;
  }
}

function resolveEventImageUrl(urlOrKey) {
  if (!urlOrKey) return null;

  if (isHttpUrl(urlOrKey)) {
    return urlOrKey;
  }

  const imageKey = normalizeS3Key(urlOrKey, EVENT_IMAGES_BUCKET) || urlOrKey;
  return getSignedReadUrl(EVENT_IMAGES_BUCKET, imageKey) || null;
}

async function loadEventImages(eventId) {
  if (!eventId) return [];

  try {
    const result = await dynamodb
      .query({
        TableName: EVENT_IMAGES_TABLE,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "id_evento = :eventId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
        Limit: 1,
      })
      .promise();

    const imageRecords = Array.isArray(result.Items) ? result.Items : [];

    // Extract the S3 path from a URL or raw key for deduplication
    function getS3Path(value) {
      const str = String(value || "").trim();
      if (!str) return null;
      if (isHttpUrl(str)) {
        try {
          return new URL(str).pathname.replace(/^\//, "");
        } catch {
          return str;
        }
      }
      return str.replace(/^\//, "");
    }

    const uniqueImages = [];
    const seenPaths = new Set();

    for (const record of imageRecords) {
      const publicUrls = Array.isArray(record?.imagenesCargadas) ? record.imagenesCargadas : [];
      const s3Keys = Array.isArray(record?.s3Keys) ? record.s3Keys : [];

      // First pass: collect public URLs and register their paths
      for (const rawUrl of publicUrls) {
        const path = getS3Path(rawUrl);
        if (!path || seenPaths.has(path)) continue;
        if (isHttpUrl(rawUrl)) {
          seenPaths.add(path);
          uniqueImages.push(rawUrl);
        }
      }

      // Second pass: sign keys whose path is not already covered by a public URL
      for (const rawKey of s3Keys) {
        const path = getS3Path(rawKey);
        if (!path || seenPaths.has(path)) continue;
        const resolved = resolveEventImageUrl(rawKey);
        if (resolved) {
          seenPaths.add(path);
          uniqueImages.push(resolved);
        }
      }
    }

    return uniqueImages;
  } catch (error) {
    console.warn(
      `No se pudieron obtener imágenes para el evento ${eventId}`,
      error?.message || error
    );
    return [];
  }
}

function parseProfileS3Location(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (!isHttpUrl(value)) {
    return { bucket: PROFILE_IMAGES_BUCKET, key: value };
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\/+/, "");
    const buckets = [PROFILE_IMAGES_BUCKET, LEGACY_PROFILE_BUCKET];

    for (const bucket of buckets) {
      if (host === `${bucket}.s3.amazonaws.com` || host.startsWith(`${bucket}.s3.`)) {
        return { bucket, key: path };
      }
    }

    if (host.includes(".s3.") && path) {
      const bucket = host.split(".s3.")[0];
      return { bucket, key: path };
    }
  } catch (error) {
    return null;
  }

  return null;
}

function getProfileSignedReadUrl(bucket, key, expires = 3600) {
  if (!bucket || !key || isHttpUrl(key)) return null;

  try {
    const client =
      bucket === LEGACY_PROFILE_BUCKET ? s3LegacyProfileRead : s3ProfileRead;
    return client.getSignedUrl("getObject", {
      Bucket: bucket,
      Key: key,
      Expires: expires,
    });
  } catch (error) {
    return null;
  }
}

function resolveProfileImageUrl(clientItem) {
  const platform = String(
    clientItem?.PLATFORM || clientItem?.platform || ""
  ).toUpperCase();
  const hasPlatform = platform.length > 0;

  if (clientItem?.fotoPerfilSignedUrl && isHttpUrl(clientItem.fotoPerfilSignedUrl)) {
    return clientItem.fotoPerfilSignedUrl;
  }

  const candidates = [
    clientItem?.profileImageUrl,
    clientItem?.fotoPerfilUrl,
    clientItem?.imagen,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!raw) continue;

    if (hasPlatform && isHttpUrl(raw) && !raw.includes("amazonaws.com")) {
      return raw;
    }

    const publicHttp = maybePublicImage(raw);
    if (publicHttp && !publicHttp.includes("amazonaws.com")) {
      return publicHttp;
    }

    const location = parseProfileS3Location(raw);
    if (location?.key) {
      const signed = getProfileSignedReadUrl(location.bucket, location.key);
      if (signed) return signed;

      const region =
        location.bucket === LEGACY_PROFILE_BUCKET
          ? "us-east-1"
          : PROFILE_IMAGES_BUCKET_REGION;
      const regionSegment = region === "us-east-1" ? "s3" : `s3.${region}`;
      return `https://${location.bucket}.${regionSegment}.amazonaws.com/${location.key}`;
    }

    if (isHttpUrl(raw)) return raw;
  }

  return null;
}

function resolvePublicationMediaUrl(mediaItem) {
  if (!mediaItem) return null;

  const mediaKey = normalizeS3Key(mediaItem.s3Key || mediaItem.url, MEDIA_BUCKET);
  if (mediaKey) {
    return getSignedReadUrl(MEDIA_BUCKET, mediaKey) || mediaItem.url || mediaItem.publicUrl;
  }

  return mediaItem.url || mediaItem.publicUrl || null;
}

function resolvePublicationMedia(media = []) {
  if (!Array.isArray(media)) return [];

  return media
    .map((item) => {
      const resolvedUrl = resolvePublicationMediaUrl(item);
      if (!resolvedUrl) return null;

      return {
        mediaId: item.mediaId || item.id || null,
        kind: item.kind || "image",
        url: resolvedUrl,
        contentType: item.contentType || null,
      };
    })
    .filter(Boolean);
}

function extractInlineMediaInputs(body = {}) {
  const candidates = [];

  function normalizeMediaCandidates(value) {
    value = tryParseStructuredString(value);

    if (value === undefined || value === null || value === "") return [];

    if (Array.isArray(value)) {
      return value.flatMap((item) => normalizeMediaCandidates(item));
    }

    if (typeof value === "object") {
      const nestedCandidates = collectNestedMediaValues(value).flatMap((item) =>
        normalizeMediaCandidates(item)
      );

      if (nestedCandidates.length) {
        return nestedCandidates;
      }
    }

    return [value];
  }

  function pushValue(value) {
    if (value === undefined || value === null || value === "") return;

    candidates.push(...normalizeMediaCandidates(value));
  }

  MEDIA_INLINE_ROOT_KEYS.forEach((key) => pushValue(body[key]));

  return candidates.filter(Boolean).slice(0, 10);
}

function extractRequestedMediaIds(body = {}) {
  const mediaIds = [];

  function pushId(value) {
    value = tryParseStructuredString(value);

    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      value.forEach(pushId);
      return;
    }

    if (typeof value === "object") {
      const objectIdCandidates = [
        ...MEDIA_ID_OBJECT_KEYS.map((key) => value[key]),
        looksLikeFeedMediaId(value.id) ? value.id : null,
      ];

      for (const candidate of objectIdCandidates) {
        if (candidate) {
          pushId(candidate);
        }
      }

      const nestedValues = collectNestedMediaValues(value);
      nestedValues.forEach(pushId);

      if (value.ids !== undefined) {
        pushId(value.ids);
      }
      if (value.mediaIds !== undefined) {
        pushId(value.mediaIds);
      }
      if (value.selectedMediaIds !== undefined) {
        pushId(value.selectedMediaIds);
      }
      if (value.uploadedMediaIds !== undefined) {
        pushId(value.uploadedMediaIds);
      }

      return;
    }

    if (typeof value === "string") {
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => looksLikeFeedMediaId(item))
        .forEach((item) => mediaIds.push(item));
      return;
    }

    if (looksLikeFeedMediaId(value)) {
      mediaIds.push(String(value));
    }
  }

  MEDIA_ID_ROOT_KEYS.forEach((key) => pushId(body[key]));

  return [...new Set(mediaIds)].slice(0, 10);
}

function getRequestedMediaCount(body = {}) {
  const requestedEntries = new Set(
    extractRequestedMediaIds(body).map((mediaId) => `id:${mediaId}`)
  );

  extractInlineMediaInputs(body).forEach((entry, index) => {
    requestedEntries.add(
      getRequestedMediaIdentity(entry) || `inline-index:${index}`
    );
  });

  return requestedEntries.size;
}

function extractRemovedMediaIds(body = {}) {
  const removedMediaIds = [];

  function pushRemovedId(value) {
    value = tryParseStructuredString(value);

    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      value.forEach(pushRemovedId);
      return;
    }

    if (typeof value === "object") {
      const objectIdCandidates = [
        ...MEDIA_ID_OBJECT_KEYS.map((key) => value[key]),
        looksLikeFeedMediaId(value.id) ? value.id : null,
      ];

      for (const candidate of objectIdCandidates) {
        if (candidate) {
          pushRemovedId(candidate);
        }
      }

      return;
    }

    if (typeof value === "string") {
      String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => looksLikeFeedMediaId(item))
        .forEach((item) => removedMediaIds.push(item));
      return;
    }

    if (looksLikeFeedMediaId(value)) {
      removedMediaIds.push(String(value));
    }
  }

  MEDIA_REMOVE_ROOT_KEYS.forEach((key) => pushRemovedId(body[key]));

  return [...new Set(removedMediaIds)].slice(0, 20);
}

function shouldReplaceRequestedMedia(body = {}) {
  return (
    body.replaceMedia === true ||
    body.replaceAllMedia === true ||
    String(body.mediaMode || "").trim().toLowerCase() === "replace"
  );
}

function shouldClearRequestedMedia(body = {}) {
  return body.clearMedia === true || body.removeAllMedia === true;
}

function hasMediaMutation(body = {}) {
  return (
    hasMediaPayload(body) ||
    extractRemovedMediaIds(body).length > 0 ||
    shouldReplaceRequestedMedia(body) ||
    shouldClearRequestedMedia(body)
  );
}

function hasMediaPayload(body = {}) {
  return extractRequestedMediaIds(body).length > 0 || extractInlineMediaInputs(body).length > 0;
}

async function persistInlineMedia({ viewerId, entry, index = 0 }) {
  if (!entry) return null;

  if (typeof entry === "string") {
    if (isHttpUrl(entry)) {
      return {
        mediaId: null,
        url: entry,
        publicUrl: entry,
        s3Key: null,
        kind: "image",
        contentType: null,
      };
    }

    const parsed = parseBase64Payload(entry);
    if (!parsed) return null;

    entry = {
      base64: parsed.base64,
      contentType: parsed.contentType,
      fileName: `feed-media-${index + 1}.${inferExtension({
        contentType: parsed.contentType,
      })}`,
    };
  }

  if (typeof entry === "object") {
    const [referencedMediaId] = extractRequestedMediaIds(entry);

    if (referencedMediaId) {
      const [mappedMedia] = await mapMediaByIds([referencedMediaId], viewerId);
      if (mappedMedia) {
        return mappedMedia;
      }
    }

    const directS3Key =
      entry.s3Key ||
      entry.key ||
      entry.pathKey ||
      entry.path ||
      entry.storageKey ||
      normalizeS3Key(
        entry.accessUrl || entry.publicUrl || entry.url || entry.signedUrl,
        MEDIA_BUCKET
      ) ||
      null;
    if (directS3Key) {
      return {
        mediaId: entry.mediaId || entry.id || null,
        url:
          entry.url ||
          entry.publicUrl ||
          buildFeedMediaPublicUrl(directS3Key) ||
          entry.accessUrl ||
          entry.signedUrl ||
          null,
        publicUrl:
          entry.publicUrl ||
          entry.url ||
          buildFeedMediaPublicUrl(directS3Key) ||
          entry.accessUrl ||
          entry.signedUrl ||
          null,
        s3Key: directS3Key,
        contentType: entry.contentType || null,
        kind:
          entry.kind ||
          (String(entry.contentType || "").startsWith("video/") ? "video" : "image"),
      };
    }
  }

  const externalUrl =
    entry.url ||
    entry.uri ||
    entry.publicUrl ||
    entry.imageUrl ||
    entry.photoUrl ||
    entry.thumbnailUrl ||
    entry.sourceUrl ||
    entry.accessUrl ||
    entry.signedUrl ||
    entry.thumbUrl ||
    entry.src ||
    null;

  if (externalUrl && isHttpUrl(externalUrl)) {
    return {
      mediaId: entry.mediaId || null,
      url: externalUrl,
      publicUrl: externalUrl,
      s3Key: entry.s3Key || null,
      contentType: entry.contentType || null,
      kind:
        entry.kind ||
        (String(entry.contentType || "").startsWith("video/") ? "video" : "image"),
    };
  }

  if (entry.mediaId && entry.s3Key) {
    return {
      mediaId: entry.mediaId,
      url: entry.url || buildFeedMediaPublicUrl(entry.s3Key),
      publicUrl: entry.publicUrl || buildFeedMediaPublicUrl(entry.s3Key),
      s3Key: entry.s3Key,
      contentType: entry.contentType || null,
      kind:
        entry.kind ||
        (String(entry.contentType || "").startsWith("video/") ? "video" : "image"),
    };
  }

  const fallbackContentType = inferContentType({
    contentType: entry.contentType,
    fileName: entry.fileName,
  });

  const parsed = parseBase64Payload(
    entry.base64 ||
      entry.data ||
      entry.base64Data ||
      entry.imageBase64 ||
      entry.photoBase64 ||
      entry.fotoBase64 ||
      entry.uri ||
      entry.value ||
      entry.preview ||
      entry.thumbUrl ||
      entry.src,
    fallbackContentType
  );

  if (!parsed) return null;

  const contentType = inferContentType({
    contentType: parsed.contentType || entry.contentType,
    fileName: entry.fileName,
    fallback: fallbackContentType,
  });
  const extension = inferExtension({
    contentType,
    fileName: entry.fileName,
    fallback: contentType.startsWith("video/") ? "mp4" : "jpg",
  });

  const bodyBuffer = Buffer.from(parsed.base64, "base64");
  // Override content type using magic bytes in case client sent no MIME prefix (e.g. raw video base64)
  const detectedContentType = detectContentTypeFromBytes(bodyBuffer);
  const finalContentType = detectedContentType || contentType;
  const finalExtension = detectedContentType
    ? inferExtension({ contentType: detectedContentType, fallback: detectedContentType.startsWith("video/") ? "mp4" : "jpg" })
    : extension;

  const mediaId = randomId("med");
  const key = `feed/${viewerId}/${mediaId}.${finalExtension}`;
  const publicUrl = buildFeedMediaPublicUrl(key);
  const createdAt = nowIso();

  await s3
    .putObject({
      Bucket: MEDIA_BUCKET,
      Key: key,
      Body: bodyBuffer,
      ContentType: finalContentType,
      Metadata: {
        ownerId: String(viewerId),
        mediaId,
      },
    })
    .promise();

  await dynamodb
    .put({
      TableName: TABLES.media,
      Item: {
        id: mediaId,
        ownerId: viewerId,
        contentType: finalContentType,
        s3Key: key,
        uploadUrlExpiresAt: null,
        publicUrl,
        visibility: "PUBLIC",
        status: "UPLOADED",
        createdAt,
        updatedAt: createdAt,
      },
    })
    .promise();

  return {
    mediaId,
    url: publicUrl,
    publicUrl,
    s3Key: key,
    contentType: finalContentType,
    kind: finalContentType.startsWith("video/") ? "video" : "image",
  };
}

async function resolveRequestedMedia(body = {}, viewerId = null, fallbackMedia = []) {
  const existingMedia = Array.isArray(fallbackMedia) ? fallbackMedia : [];

  if (!viewerId) {
    return existingMedia;
  }

  const clearRequested = shouldClearRequestedMedia(body);
  const replaceRequested = shouldReplaceRequestedMedia(body);
  const removedMediaIds = new Set(extractRemovedMediaIds(body).map(String));

  if (!hasMediaPayload(body) && !clearRequested && !removedMediaIds.size) {
    return existingMedia;
  }

  const combined = [];

  if (!clearRequested && !replaceRequested) {
    combined.push(
      ...existingMedia.filter((item) => {
        const mediaId = item?.mediaId || item?.id || null;
        return !mediaId || !removedMediaIds.has(String(mediaId));
      })
    );
  }

  const requestedMediaIds = extractRequestedMediaIds(body);
  if (requestedMediaIds.length) {
    const mappedMedia = await mapMediaByIds(requestedMediaIds, viewerId);
    combined.push(...mappedMedia);
  }

  const inlineEntries = extractInlineMediaInputs(body);
  for (let index = 0; index < inlineEntries.length; index += 1) {
    const resolved = await persistInlineMedia({
      viewerId,
      entry: inlineEntries[index],
      index,
    });

    if (resolved) {
      combined.push(resolved);
    }
  }

  const uniqueMedia = [];
  const seen = new Set();

  for (const item of combined) {
    const dedupeKey = item.mediaId || item.s3Key || item.url || item.publicUrl;
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    uniqueMedia.push(item);
  }

  return uniqueMedia.slice(0, 10);
}

async function getUserProfileIfExists(userId, viewerId) {
  if (!userId) {
    return null;
  }

  try {
    const profileRequest = dynamodb
      .get({
        TableName: TABLES.client,
        Key: { id: userId },
      })
      .promise();
    const followsRequest =
      viewerId && viewerId !== userId
        ? dynamodb
            .get({
              TableName: process.env.DYNAMODB_FOLLOWERS_TABLE || "Followers",
              Key: { follow_id: `${viewerId}_${userId}` },
              ProjectionExpression: "#status, blocked_at",
              ExpressionAttributeNames: {
                "#status": "status",
              },
            })
            .promise()
            .catch(() => ({ Item: null }))
        : Promise.resolve({ Item: null });
    const [result, followResult] = await Promise.all([profileRequest, followsRequest]);

    const item = result.Item || null;
    if (!item) {
      return null;
    }
    const follow = followResult.Item;
    const isFollowing =
      String(follow?.status || "").toLowerCase() === "accepted" && !follow?.blocked_at;

    const name =
      [item.nombre, item.apellido].filter(Boolean).join(" ").trim() ||
      item.name ||
      item.user ||
      "Usuario";

    const avatarUrl = resolveProfileImageUrl(item);

    return {
      id: userId,
      name,
      avatarUrl,
      isFollowing,
      username: item.user ? `@${item.user}` : null,
      role: item.role || item.tipoUsuario || item.typeUser || null,
      description: item.description || "",
    };
  } catch (err) {
    return null;
  }
}

function buildEventLocationLabel(item = {}) {
  const exactAddress = String(item.direccion || "").trim();
  if (exactAddress) {
    return exactAddress;
  }

  const venueLabel = typeof item.ubicacion === "string"
    ? String(item.ubicacion).trim()
    : String(item.ubicacion?.label || item.ubicacionLabel || "").trim();
  if (venueLabel) {
    return venueLabel;
  }

  return [item.ciudad, item.departamento, item.pais].filter(Boolean).join(", ");
}

async function getEventMentionIfExists(eventId) {
  if (!eventId) {
    return null;
  }

  try {
    const result = await dynamodb
      .get({
        TableName: TABLES.events,
        Key: { id: eventId },
      })
      .promise();

    const item = result.Item || null;
    if (!item) {
      return null;
    }

    // Only return active events
    const rawStatus = item.estatus || item.status || null;
    const normalizedStatus = String(rawStatus || "").trim().toLowerCase();
    const ACTIVE_STATUSES = new Set(["activo", "active", "en_ejecucion", "published", "publicado", "1"]);
    if (rawStatus !== null && rawStatus !== undefined && rawStatus !== "" && !ACTIVE_STATUSES.has(normalizedStatus)) {
      return null;
    }

    // Prefer public URL; sign the key only as a fallback
    const imageCandidates = [item.imagenPrincipal, item.imagen, item.imageUrl].filter(Boolean);
    const publicImageUrl =
      maybePublicImage(imageCandidates[0]) ||
      maybePublicImage(imageCandidates[1]) ||
      maybePublicImage(imageCandidates[2]) ||
      null;
    const imageUrl =
      publicImageUrl ||
      resolveEventImageUrl(imageCandidates[0]) ||
      resolveEventImageUrl(imageCandidates[1]) ||
      resolveEventImageUrl(imageCandidates[2]) ||
      null;

    const title = item.nombre || item.title || "Evento";
    const description = String(item.descripcion || item.description || "");
    const locationLabel = buildEventLocationLabel(item);
    const dateLabel = [item.fechaIni, item.horaIni].filter(Boolean).join(" - ");
    const slug =
      item.slug ||
      item.eventSlug ||
      item.slug_evento ||
      item.slugEvento ||
      item.urlSlug ||
      null;

    return {
      id: eventId,
      title,
      name: title,
      description,
      imageUrl,
      locationLabel,
      dateLabel,
      slug,
      status: rawStatus,
      fechaIni: item.fechaIni || null,
      horaIni: item.horaIni || null,
    };
  } catch (error) {
    return null;
  }
}

async function getUserProfile(userId, viewerId) {
  const profile = await getUserProfileIfExists(userId, viewerId);
  if (profile) {
    return profile;
  }

  return {
    id: userId || null,
    name: "Usuario",
    avatarUrl: null,
    isFollowing: false,
  };
}

function maybePublicImage(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  if (raw.startsWith("venues/")) {
    const bucket = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";
    const region = process.env.VENUE_IMAGES_BUCKET_REGION || "us-east-1";
    const regionSegment = region === "us-east-1" ? "s3" : `s3.${region}`;
    return `https://${bucket}.${regionSegment}.amazonaws.com/${raw.replace(/^\/+/, "")}`;
  }
  return null;
}

async function mapMediaByIds(mediaIds = [], viewerId = null) {
  const uniqueIds = [...new Set((mediaIds || []).map(String).filter(Boolean))].slice(
    0,
    10
  );
  if (!uniqueIds.length) return [];

  const keys = uniqueIds.map((id) => ({ id }));
  const data = await dynamodb
    .batchGet({
      RequestItems: {
        [TABLES.media]: {
          Keys: keys,
        },
      },
    })
    .promise();

  const map = new Map(
    (data.Responses?.[TABLES.media] || []).map((item) => [item.id, item])
  );

  const resolved = [];
  for (const id of uniqueIds) {
    const item = map.get(id);
    if (!item) continue;
    if (item.ownerId !== viewerId && item.visibility !== "PUBLIC") continue;

    if (item.status === "PENDING_UPLOAD" && item.s3Key) {
      try {
        await s3.headObject({ Bucket: MEDIA_BUCKET, Key: item.s3Key }).promise();
        const uploadedAt = nowIso();
        await dynamodb
          .update({
            TableName: TABLES.media,
            Key: { id: item.id },
            UpdateExpression: "SET #st = :uploaded, updatedAt = :now",
            ExpressionAttributeNames: { "#st": "status" },
            ExpressionAttributeValues: {
              ":uploaded": "UPLOADED",
              ":now": uploadedAt,
            },
          })
          .promise();
        item.status = "UPLOADED";
      } catch {
        continue;
      }
    }

    const resolvedUrl = resolvePublicationMediaUrl(item);
    resolved.push({
      mediaId: item.id,
      url: resolvedUrl,
      publicUrl: resolvedUrl,
      s3Key: item.s3Key || null,
      contentType: item.contentType || null,
      kind: String(item.contentType || "").startsWith("video/") ? "video" : "image",
    });
  }

  return resolved;
}

async function readIdempotentResult(id) {
  if (!id) return null;

  const result = await dynamodb
    .get({
      TableName: TABLES.idempotency,
      Key: { id },
    })
    .promise();

  if (!result.Item) return null;

  return {
    statusCode: result.Item.statusCode,
    payload: result.Item.payload,
  };
}

async function saveIdempotentResult(id, statusCode, payload, ttlSeconds = 86400) {
  if (!id) return;

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  await dynamodb
    .put({
      TableName: TABLES.idempotency,
      Item: {
        id,
        statusCode,
        payload,
        createdAt: nowIso(),
        expiresAt,
      },
    })
    .promise();
}

async function upsertTimelineEntry({
  sourceType,
  sourceId,
  createdAt,
  payload,
  visibility = "PUBLIC",
}) {
  const id = `${sourceType}_${sourceId}`;
  const created = createdAt || nowIso();

  await dynamodb
    .put({
      TableName: TABLES.timeline,
      Item: {
        id,
        sourceType,
        sourceId,
        createdAt: created,
        sortKey: toSortKey(created, id),
        feedScope: FEED_SCOPE_HOME_PUBLIC,
        listItemType: "publication",
        payload: payload || null,
        visibility,
        updatedAt: nowIso(),
      },
    })
    .promise();
}

async function deleteTimelineEntry(sourceType, sourceId) {
  const id = `${sourceType}_${sourceId}`;
  await dynamodb
    .delete({
      TableName: TABLES.timeline,
      Key: { id },
    })
    .promise();
}

function formatFeedPublication({ publication, author, viewerState, sourcePublication = null }) {
  const publicationTimestamp = resolvePublicationTimestamp(publication, [
    publication.createdAt,
  ]);
  const media = resolvePublicationMedia(publication.media);

  const item = {
    id: publication.id,
    listItemType: "publication",
    type: publication.type || "post",
    author: {
      id: author?.id || publication.authorId,
      name: author?.name || "Usuario",
      avatarUrl: author?.avatarUrl || null,
      isFollowing: !!author?.isFollowing,
    },
    createdAt: publicationTimestamp,
    publishedAt: publicationTimestamp,
    publicationTimestamp,
    title: publication.title || "",
    description: publication.description || "",
    media,
    imageUrl: media[0]?.url || null,
    images: media.map((entry) => entry.url).filter(Boolean),
    locationLabel: publication.locationLabel || "",
    dateLabel: publication.dateLabel || "",
    priceLabel: publication.priceLabel || "",
    mentions: sanitizeMentions(publication.mentions || []),
    isRepost: !!publication.isRepost,
    repostOf: publication.repostOf || null,
    stats: {
      likes: safeNumber(publication.likesCount),
      comments: safeNumber(publication.commentsCount),
      reposts: safeNumber(publication.repostsCount),
      shares: safeNumber(publication.sharesCount),
    },
    viewerState: {
      liked: !!viewerState?.liked,
      reposted: !!viewerState?.reposted,
      hidden: !!viewerState?.hidden,
      notInterested: !!viewerState?.notInterested,
      saved: !!viewerState?.saved,
      canEdit: viewerState?.viewerId === publication.authorId,
      canDelete: viewerState?.viewerId === publication.authorId,
    },
  };

  if (sourcePublication && sourcePublication.id) {
    item.sourcePublication = sourcePublication;
    item.sourceImages = Array.isArray(sourcePublication.images)
      ? sourcePublication.images.filter(Boolean)
      : [];
    item.sourceImageUrl =
      sourcePublication.imageUrl || item.sourceImages[0] || null;

    if (!item.imageUrl && item.sourceImageUrl) {
      item.imageUrl = item.sourceImageUrl;
      item.images = item.sourceImages.length ? item.sourceImages : [item.sourceImageUrl];
      item.media = item.media?.length
        ? item.media
        : [{ url: item.sourceImageUrl, kind: "image" }];
    }
  }

  return item;
}

function formatEventPublication({ item, viewerState, author = null }) {
  const eventImages = Array.isArray(item?.eventImages)
    ? item.eventImages.filter(Boolean)
    : [];
  const imageUrl =
    eventImages[0] ||
    maybePublicImage(item?.imagenPrincipal) ||
    maybePublicImage(item?.imagen) ||
    maybePublicImage(item?.imageUrl) ||
    null;
  const userId = item.userId || item.createdBy || "event-owner";
  const authorName =
    author?.name ||
    [item.authorName, item.organizerName, item.anfitrioName].filter(Boolean).join(" ").trim() ||
    item.organizerName ||
    item.anfitrioName ||
    "Organizador";
  const publicationTimestamp = resolvePublicationTimestamp(item, [
    item.publishAt,
    item.createDate,
    item.createdAt,
  ]);

  return {
    id: item.id,
    eventId: item.id,
    targetId: item.id,
    listItemType: "publication",
    type: "event",
    author: {
      id: author?.id || userId,
      name: authorName,
      avatarUrl: author?.avatarUrl || null,
      isFollowing: !!author?.isFollowing,
    },
    createdAt: publicationTimestamp,
    publishedAt: publicationTimestamp,
    publicationTimestamp,
    title: item.nombre || item.title || "Evento",
    description: item.descripcion || item.description || "",
    media: eventImages.length
      ? eventImages.map((url) => ({ url, kind: "image" }))
      : imageUrl
        ? [{ url: imageUrl, kind: "image" }]
        : [],
    imageUrl,
    images: eventImages.length ? eventImages : imageUrl ? [imageUrl] : [],
    locationLabel: buildEventLocationLabel(item),
    dateLabel: [item.fechaIni, item.horaIni].filter(Boolean).join(" - "),
    priceLabel: item.costoEvt ? String(item.costoEvt) : "",
    mentions: [],
    isRepost: false,
    repostOf: null,
    stats: {
      likes: safeNumber(item.likesCount),
      comments: safeNumber(item.commentsCount),
      reposts: safeNumber(item.repostsCount),
      shares: safeNumber(item.sharesCount),
    },
    viewerState: {
      liked: !!viewerState?.liked,
      reposted: !!viewerState?.reposted,
      hidden: !!viewerState?.hidden,
      notInterested: !!viewerState?.notInterested,
      saved: !!viewerState?.saved,
      canEdit: viewerState?.viewerId === item.userId,
      canDelete: viewerState?.viewerId === item.userId,
    },
    metadata: {
      estatus: item.estatus || item.status || item.event_status || "activo",
      fechaIni: item.fechaIni || item.event_fechaIni || "",
      fechaFin: item.fechaFin || item.event_fechaFin || "",
      horaIni: item.horaIni || item.event_horaIni || "",
      horaFin: item.horaFin || item.event_horaFin || "",
    },
  };
}

function formatServicePublication({ item, viewerState }) {
  const fullName = [item.nombre, item.apellido].filter(Boolean).join(" ").trim();
  const name = fullName || item.name || item.user || "Servicio";
  const publicationTimestamp = resolvePublicationTimestamp(item, [
    item.createdAt,
    item.timestamp,
  ]);
  const imageUrl =
    maybePublicImage(item.profileImageUrl) ||
    maybePublicImage(item.fotoPerfilUrl) ||
    maybePublicImage(item.imageUrl) ||
    null;

  return {
    id: item.id,
    listItemType: "publication",
    type: "service",
    author: {
      id: item.id,
      name,
      avatarUrl: imageUrl,
      isFollowing: false,
    },
    createdAt: publicationTimestamp,
    publishedAt: publicationTimestamp,
    publicationTimestamp,
    title: item.role || item.serviceType || item.tipoServicio || "Servicio",
    description: item.description || "",
    media: imageUrl ? [{ url: imageUrl, kind: "image" }] : [],
    imageUrl,
    images: imageUrl ? [imageUrl] : [],
    locationLabel: [item.ciudad, item.departamento].filter(Boolean).join(", "),
    dateLabel: "",
    priceLabel: item.priceLabel || "",
    mentions: [],
    isRepost: false,
    repostOf: null,
    stats: {
      likes: safeNumber(item.likesCount),
      comments: safeNumber(item.commentsCount),
      reposts: safeNumber(item.repostsCount),
      shares: safeNumber(item.sharesCount),
    },
    viewerState: {
      liked: !!viewerState?.liked,
      reposted: !!viewerState?.reposted,
      hidden: !!viewerState?.hidden,
      notInterested: !!viewerState?.notInterested,
      saved: !!viewerState?.saved,
      canEdit: viewerState?.viewerId === item.id,
      canDelete: false,
    },
  };
}

function formatServiceProviderPublication({ item, viewerState, author = null }) {
  const serviceId = item.serviceId || item.id;
  const gallery = Array.isArray(item.gallery) ? item.gallery.filter(Boolean) : [];
  const allImageCandidates = [
    item.profileImageUrl,
    ...gallery,
    item.imageUrl,
  ].filter(Boolean);
  const allImages = [];
  const seenImages = new Set();
  for (const raw of allImageCandidates) {
    const resolved = maybePublicImage(raw);
    if (!resolved || seenImages.has(resolved)) continue;
    seenImages.add(resolved);
    allImages.push(resolved);
  }
  const imageUrl = allImages[0] || null;
  const publicationTimestamp = resolvePublicationTimestamp(item, [
    item.updatedAt,
    item.createdAt,
  ]);
  const authorName = author?.name || item.name || "Servicio";

  return {
    id: serviceId,
    listItemType: "publication",
    type: "service",
    targetId: serviceId,
    author: {
      id: author?.id || item.userId || serviceId,
      name: authorName,
      avatarUrl: author?.avatarUrl || imageUrl,
      isFollowing: !!author?.isFollowing,
    },
    createdAt: publicationTimestamp,
    publishedAt: publicationTimestamp,
    publicationTimestamp,
    title: item.name || item.role || item.category || "Servicio",
    description: item.description || "",
    media: allImages.map((url) => ({ url, kind: "image" })),
    imageUrl,
    images: allImages,
    locationLabel: [item.city, item.department].filter(Boolean).join(", "),
    dateLabel: "",
    priceLabel: item.minPrice != null ? String(item.minPrice) : "",
    mentions: [],
    isRepost: false,
    repostOf: null,
    stats: {
      likes: safeNumber(item.likesCount || item.likeCount),
      comments: safeNumber(item.commentsCount),
      reposts: safeNumber(item.repostsCount),
      shares: safeNumber(item.sharesCount),
    },
    viewerState: {
      liked: !!viewerState?.liked,
      reposted: !!viewerState?.reposted,
      hidden: !!viewerState?.hidden,
      notInterested: !!viewerState?.notInterested,
      saved: !!viewerState?.saved,
      canEdit: viewerState?.viewerId === item.userId,
      canDelete: false,
    },
    metadata: {
      serviceId,
      category: item.category || item.role || null,
      gallery: allImages,
      imageUrls: allImages,
    },
  };
}

function formatVenuePublication({ item, viewerState, author = null }) {
  const venueId = item.venue_id || item.venueId || item.id;
  const imageUrls = item.images
    ? String(item.images)
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean)
    : Array.isArray(item.imageUrls)
      ? item.imageUrls.filter(Boolean)
      : [];
  const amenities = parseVenueAmenities(item.amenities);
  const galleryFromAmenities = Array.isArray(amenities.gallery)
    ? amenities.gallery.filter(Boolean)
    : [];
  const allImageCandidates = [
    ...imageUrls,
    ...galleryFromAmenities,
    item.mainImage,
    item.imageUrl,
  ].filter(Boolean);
  const allImages = [];
  const seenImages = new Set();
  for (const raw of allImageCandidates) {
    const resolved = maybePublicImage(raw);
    if (!resolved || seenImages.has(resolved)) continue;
    seenImages.add(resolved);
    allImages.push(resolved);
  }
  const imageUrl = allImages[0] || null;
  const publicationTimestamp = resolvePublicationTimestamp(item, [
    item.updatedAt,
    item.createdAt,
  ]);
  const ownerName = author?.name || item.ownerName || "Anfitrión";
  const feedTags = buildVenueFeedTags(amenities, item);
  const addonServices = Array.isArray(amenities.addonServices)
    ? amenities.addonServices.slice(0, 12)
    : [];
  const pricePerDay = Number(
    amenities?.pricing?.perDay || amenities?.pricing?.perMultiDay || 0,
  );

  return {
    id: venueId,
    listItemType: "publication",
    type: "venue",
    targetId: venueId,
    author: {
      id: author?.id || item.ownerUserId || venueId,
      name: ownerName,
      avatarUrl: author?.avatarUrl || null,
      isFollowing: !!author?.isFollowing,
    },
    createdAt: publicationTimestamp,
    publishedAt: publicationTimestamp,
    publicationTimestamp,
    title: item.name || "Lugar",
    description: item.description || "",
    media: allImages.map((url) => ({ url, kind: "image" })),
    imageUrl,
    images: allImages,
    locationLabel: buildVenueFeedLocationLabel(item),
    dateLabel: buildVenueScheduleLabel(amenities),
    priceLabel: formatVenuePriceLabel(amenities),
    mentions: feedTags.map((tag, index) => ({
      type: "venue",
      mentionType: "venue",
      targetId: venueId,
      tag,
      name: tag.replace(/^@/, ""),
      id: `${venueId}-tag-${index}`,
    })),
    isRepost: false,
    repostOf: null,
    stats: {
      likes: safeNumber(item.likesCount || item.likeCount),
      comments: safeNumber(item.commentsCount),
      reposts: safeNumber(item.repostsCount),
      shares: safeNumber(item.sharesCount),
    },
    viewerState: {
      liked: !!viewerState?.liked,
      reposted: !!viewerState?.reposted,
      hidden: !!viewerState?.hidden,
      notInterested: !!viewerState?.notInterested,
      saved: !!viewerState?.saved,
      canEdit: viewerState?.viewerId === item.ownerUserId,
      canDelete: false,
    },
    metadata: {
      venueId,
      listingType: amenities.listingType || "rental",
      pricePerDay: Number.isFinite(pricePerDay) && pricePerDay > 0 ? pricePerDay : null,
      checkIn: amenities.availability?.globalStartTime || amenities.globalStartTime || null,
      checkOut: amenities.availability?.globalEndTime || amenities.globalEndTime || null,
      capacity: item.capacity || amenities.capacity || null,
      city: item.city || null,
      department: item.department || item.sector || null,
      address: item.address || null,
      venueTypes: Array.isArray(amenities.venueTypes) ? amenities.venueTypes : [],
      eventTypes: Array.isArray(amenities.eventTypes) ? amenities.eventTypes : [],
      facilities: Array.isArray(amenities.facilities) ? amenities.facilities : [],
      addonServices,
      availability: amenities.availability || null,
      pricing: amenities.pricing || null,
      imageUrls: allImages,
      mainImage: imageUrl,
    },
  };
}

function buildServicesSection(services) {
  const sectionTimestamp = services
    .map((service) => service?.publishedAt || service?.createdAt || null)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] || nowIso();

  return {
    id: `services_${Date.now()}`,
    listItemType: "services-section",
    createdAt: sectionTimestamp,
    publishedAt: sectionTimestamp,
    publicationTimestamp: sectionTimestamp,
    title: "Servicios recomendados para tu evento",
    services: services.map((service) => ({
      id: service.id,
      name: service.author?.name || service.title || "Servicio",
      role: service.title || "Servicio",
      ratingLabel: service.ratingLabel || "5.0",
      username: service.author?.name ? `@${service.author.name.replace(/\s+/g, "").toLowerCase()}` : "",
      description: service.description || "",
      imageUrl: service.author?.avatarUrl || null,
    })),
  };
}

const FEED_PREFERENCE_SCOPE = "FEED";
const FEED_PREFERENCE_ACTION_HIDE = "HIDE";
const FEED_PREFERENCE_ACTION_NOT_INTERESTED = "NOT_INTERESTED";
const FEED_PREFERENCE_ACTION_SAVE = "SAVE";

function buildViewerPreferencePartitionKey(viewerId) {
  return `feed#${viewerId}`;
}

function buildPreferenceStateKey(publicationId) {
  const rawId = String(publicationId || "");
  if (!rawId) return null;

  if (rawId.startsWith("event#")) {
    return `event:${rawId.slice("event#".length)}`;
  }

  return `publication:${rawId}`;
}

async function loadViewerStateByPublicationIds(publicationIds, viewerId) {
  const ids = [...new Set((publicationIds || []).map(String).filter(Boolean))];
  if (!viewerId || !ids.length) return new Map();

  const likedIds = new Set(
    []
  );
  const repostedIds = new Set(
    []
  );

  for (const chunk of chunkArray(ids, 50)) {
    const likesData = await dynamodb
      .batchGet({
        RequestItems: {
          [TABLES.publicationLikes]: {
            Keys: chunk.map((id) => ({ publicationId: id, userId: viewerId })),
          },
          [TABLES.publicationReposts]: {
            Keys: chunk.map((id) => ({ publicationId: id, userId: viewerId })),
          },
        },
      })
      .promise();

    (likesData.Responses?.[TABLES.publicationLikes] || []).forEach((item) => {
      if (item?.publicationId) {
        likedIds.add(item.publicationId);
      }
    });

    (likesData.Responses?.[TABLES.publicationReposts] || []).forEach((item) => {
      if (item?.publicationId) {
        repostedIds.add(item.publicationId);
      }
    });
  }

  const preferencesData = await dynamodb
    .query({
      TableName: TABLES.notInterested,
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": buildViewerPreferencePartitionKey(viewerId),
      },
    })
    .promise()
    .catch(() => ({ Items: [] }));

  const hiddenTargetKeys = new Set();
  const notInterestedTargetKeys = new Set();
  const savedTargetKeys = new Set();

  (preferencesData.Items || [])
    .filter((item) => item.scope === FEED_PREFERENCE_SCOPE)
    .filter((item) => item.active !== false)
    .forEach((item) => {
      if (!item.targetKey) return;

      if (item.actionType === FEED_PREFERENCE_ACTION_HIDE) {
        hiddenTargetKeys.add(item.targetKey);
      }

      if (item.actionType === FEED_PREFERENCE_ACTION_NOT_INTERESTED) {
        notInterestedTargetKeys.add(item.targetKey);
      }

      if (item.actionType === FEED_PREFERENCE_ACTION_SAVE) {
        savedTargetKeys.add(item.targetKey);
      }
    });

  const state = new Map();
  ids.forEach((id) => {
    const preferenceStateKey = buildPreferenceStateKey(id);
    state.set(id, {
      viewerId,
      liked: likedIds.has(id),
      reposted: repostedIds.has(id),
      hidden: preferenceStateKey ? hiddenTargetKeys.has(preferenceStateKey) : false,
      notInterested: preferenceStateKey
        ? notInterestedTargetKeys.has(preferenceStateKey)
        : false,
      saved: preferenceStateKey ? savedTargetKeys.has(preferenceStateKey) : false,
    });
  });

  return state;
}

async function loadCommentLikeState(commentIds, viewerId) {
  const ids = [...new Set((commentIds || []).map(String).filter(Boolean))];
  if (!viewerId || !ids.length) return new Set();

  const data = await dynamodb
    .batchGet({
      RequestItems: {
        [TABLES.commentLikes]: {
          Keys: ids.map((id) => ({ commentId: id, userId: viewerId })),
        },
      },
    })
    .promise();

  return new Set((data.Responses?.[TABLES.commentLikes] || []).map((item) => item.commentId));
}

function getFeedETag(payload) {
  const serialized = JSON.stringify(payload);
  const digest = crypto.createHash("sha256").update(serialized).digest("hex");
  return `W/\"${digest}\"`;
}

function isServiceCandidate(client) {
  if (!client) return false;
  const roleLike = [
    client.role,
    client.serviceType,
    client.tipoServicio,
    client.tipoUsuario,
    client.typeUser,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasServiceHint =
    roleLike.includes("service") ||
    roleLike.includes("servicio") ||
    roleLike.includes("provider") ||
    roleLike.includes("vendor") ||
    roleLike.includes("artist") ||
    roleLike.includes("cantante") ||
    roleLike.includes("dj");

  return hasServiceHint;
}

function isServiceProviderRecord(item) {
  if (!item?.serviceId) return false;
  const status = String(item.status || "active").trim().toLowerCase();
  return !status || status === "active";
}

function isServiceFeedRecord(item) {
  return isServiceProviderRecord(item) || isServiceCandidate(item);
}

function parseVenueAmenities(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function isVenueFeedCandidate(venue) {
  if (!venue) return false;
  const venueId = venue.venue_id || venue.venueId;
  if (!venueId) return false;

  const status = String(venue.status || "").trim().toLowerCase();
  if (status && status !== "active") return false;
  if (venue.isEventVenue === true) return false;
  if (venue.isTemplate !== true) return false;

  const amenities = parseVenueAmenities(venue.amenities);
  if (amenities.listingType === "rental") return true;
  return Boolean(
    amenities.pricing && Object.keys(amenities.pricing).length > 0
  );
}

function buildVenueFeedLocationLabel(item = {}) {
  const city = String(item.city || "").trim();
  const dept = String(item.department || item.sector || "").trim();
  const address = String(item.address || "").trim();

  if (city && dept && city.toLowerCase() !== dept.toLowerCase()) {
    return `${city} - ${dept}`;
  }
  if (city) return city;

  if (address) {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    const unique = [];
    const seen = new Set();
    for (const part of parts) {
      const key = part.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(part);
    }
    if (unique.length >= 2) {
      return `${unique[0]} - ${unique[unique.length - 1]}`;
    }
    return unique[0] || address;
  }

  return [city, dept].filter(Boolean).join(" - ");
}

function buildVenueScheduleLabel(amenities = {}) {
  const availability = amenities.availability || {};
  const start = availability.globalStartTime || amenities.globalStartTime;
  const end = availability.globalEndTime || amenities.globalEndTime;
  const openDays = availability.openDays || amenities.openDays;
  let daysPart = "Abierto todos los días";

  if (openDays && !["all", "everyday", "todos"].includes(String(openDays).toLowerCase())) {
    daysPart = String(openDays);
  }

  if (start && end) return `${daysPart} - ${start} a ${end}`;
  if (start) return `${daysPart} - ${start}`;
  return daysPart === "Abierto todos los días" ? "" : daysPart;
}

function buildVenueFeedTags(amenities = {}, item = {}) {
  const tags = [];
  const pushTag = (value) => {
    let raw = "";
    if (value == null) return;
    if (typeof value === "string") {
      raw = value.trim();
    } else if (typeof value === "object") {
      raw = String(value.label || value.name || value.id || "").trim();
    } else {
      raw = String(value).trim();
    }
    if (!raw || raw === "[object Object]") return;
    const tag = raw.startsWith("@") ? raw : `@${raw.replace(/\s+/g, "")}`;
    if (!tags.includes(tag)) tags.push(tag);
  };

  (Array.isArray(amenities.features) ? amenities.features : []).slice(0, 4).forEach(pushTag);
  (Array.isArray(amenities.venueTypes) ? amenities.venueTypes : []).slice(0, 4).forEach(pushTag);
  (Array.isArray(amenities.eventTypes) ? amenities.eventTypes : []).slice(0, 4).forEach(pushTag);
  (Array.isArray(amenities.facilities) ? amenities.facilities : []).slice(0, 3).forEach(pushTag);
  if (item.sector) pushTag(item.sector);
  if (item.city) pushTag(item.city.replace(/\s+/g, ""));

  return tags.slice(0, 8);
}

function formatVenuePriceLabel(amenities = {}) {
  const raw = amenities?.pricing?.perDay || amenities?.pricing?.perMultiDay || null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return "";
  return `$ ${Math.round(price).toLocaleString("es-CO")} / día`;
}

async function syncExternalSourcesToTimeline({ maxItems = 80 }) {
  const eventCandidates = [];
  const recentEventItems = [];
  const staleEventIds = [];
  let scannedEventsCount = 0;

  try {
    let lastEvaluatedKey = null;

    do {
      const eventsResult = await dynamodb
        .scan({
          TableName: TABLES.events,
          ProjectionExpression:
            "id, userId, createdBy, organizerName, anfitrioName, publishAt, createDate, createdAt, updatedAt, nombre, title, descripcion, #description, ciudad, departamento, fechaIni, horaIni, costoEvt, modalidadEvt, imageUrl, imagen, estatus, #evtStatus",
          ExpressionAttributeNames: {
            "#description": "description",
            "#evtStatus": "status",
          },
          ExclusiveStartKey: lastEvaluatedKey || undefined,
        })
        .promise();

      scannedEventsCount += (eventsResult.Items || []).length;

      const FEED_ACTIVE_STATUSES = new Set(["activo", "active", "en_ejecucion", "ejecucion", "published", "publicado", "1"]);

      (eventsResult.Items || []).forEach((eventItem) => {
        if (!eventItem?.id) return;

        const evtStatus = String(eventItem.estatus || eventItem.status || "").trim().toLowerCase();
        if (!FEED_ACTIVE_STATUSES.has(evtStatus)) {
          staleEventIds.push(eventItem.id);
          return;
        }

        const visibility = resolveEventVisibility(eventItem);

        const createdAt = resolvePublicationTimestamp(eventItem, [
          eventItem.publishAt,
          eventItem.createDate,
          eventItem.createdAt,
          eventItem.updatedAt,
        ]);

        pushRecentCandidate(
          recentEventItems,
          {
            ...eventItem,
            createdAt,
            publishedAt: createdAt,
            publicationTimestamp: createdAt,
            visibility,
          },
          maxItems
        );
      });

      lastEvaluatedKey = eventsResult.LastEvaluatedKey || null;
    } while (lastEvaluatedKey);

    // Eliminar del timeline entradas stale de eventos con estatus no activo
    if (staleEventIds.length > 0) {
      await Promise.allSettled(
        staleEventIds.map((id) => deleteTimelineEntry("event", id))
      );
      console.info("syncExternalSourcesToTimeline: cleaned stale event entries", { count: staleEventIds.length });
    }

    const eventsWithImages = await Promise.all(
      recentEventItems.map(async (eventItem) => {
        const eventImages = await loadEventImages(eventItem.id);
        return {
          ...eventItem,
          eventImages,
          imagenPrincipal: eventImages[0] || null,
          imageUrl: eventImages[0] || eventItem.imageUrl || null,
          imagen: eventImages[0] || eventItem.imagen || null,
        };
      })
    );

    eventsWithImages.filter(Boolean).forEach((eventItem) => {
      eventCandidates.push({
        sourceType: "event",
        sourceId: eventItem.id,
        createdAt: eventItem.createdAt,
        payload: eventItem,
        visibility: resolveEventVisibility(eventItem),
      });
    });

    console.info("syncExternalSourcesToTimeline events", {
      scannedEventsCount,
      selectedEventsCount: eventCandidates.length,
      newestEventId: eventCandidates[0]?.sourceId || null,
    });
  } catch (err) {
    console.warn("No se pudieron sincronizar eventos al timeline", err?.message || err);
  }

  const serviceCandidates = [];
  try {
    let lastEvaluatedKey = null;
    const recentServiceItems = [];

    do {
      const servicesResult = await extendedDynamodb
        .scan({
          TableName: EXTENDED_TABLES.services,
          ProjectionExpression:
            "serviceId, userId, #name, #role, category, description, profileImageUrl, gallery, city, department, minPrice, #status, createdAt, updatedAt, likesCount, likeCount, commentsCount, repostsCount, sharesCount",
          ExpressionAttributeNames: {
            "#name": "name",
            "#role": "role",
            "#status": "status",
          },
          ExclusiveStartKey: lastEvaluatedKey || undefined,
        })
        .promise();

      (servicesResult.Items || []).forEach((item) => {
        if (!isServiceProviderRecord(item)) return;
        const createdAt = resolvePublicationTimestamp(item, [
          item.publishAt,
          item.publishedAt,
          item.createdAt,
        ]);
        pushRecentCandidate(
          recentServiceItems,
          {
            ...item,
            createdAt,
            publishedAt: createdAt,
            publicationTimestamp: createdAt,
          },
          maxItems
        );
      });

      lastEvaluatedKey = servicesResult.LastEvaluatedKey || null;
    } while (lastEvaluatedKey && recentServiceItems.length < maxItems);

    recentServiceItems.forEach((item) => {
      serviceCandidates.push({
        sourceType: "service",
        sourceId: item.serviceId,
        createdAt: item.createdAt,
        payload: item,
      });
    });

    if (!serviceCandidates.length) {
      const usersResult = await dynamodb
        .scan({
          TableName: TABLES.client,
          ProjectionExpression:
            "id, #user, nombre, apellido, fotoPerfilUrl, profileImageUrl, #role, serviceType, tipoServicio, tipoUsuario, typeUser, createdAt, #timestamp, ciudad, departamento, likesCount",
          ExpressionAttributeNames: {
            "#user": "user",
            "#role": "role",
            "#timestamp": "timestamp",
          },
          Limit: maxItems,
        })
        .promise();

      (usersResult.Items || []).forEach((item) => {
        if (!item?.id || !isServiceCandidate(item)) return;
        const createdAt = resolvePublicationTimestamp(item, [
          item.createdAt,
          item.timestamp,
        ]);

        serviceCandidates.push({
          sourceType: "service",
          sourceId: item.id,
          createdAt,
          payload: {
            ...item,
            createdAt,
            publishedAt: createdAt,
            publicationTimestamp: createdAt,
          },
        });
      });
    }

    console.info("syncExternalSourcesToTimeline services", {
      selectedServicesCount: serviceCandidates.length,
      newestServiceId: serviceCandidates[0]?.sourceId || null,
    });
  } catch (err) {
    console.warn(
      "No se pudieron sincronizar servicios al timeline",
      err?.message || err
    );
  }

  const venueCandidates = [];
  try {
    let lastEvaluatedKey = null;
    const recentVenueItems = [];

    do {
      const venuesResult = await extendedDynamodb
        .scan({
          TableName: EXTENDED_TABLES.venues,
          ProjectionExpression:
            "venue_id, venueId, ownerUserId, #name, description, city, department, address, images, amenities, #status, isTemplate, isEventVenue, createdAt, updatedAt, likeCount, likesCount, commentsCount, repostsCount, sharesCount",
          ExpressionAttributeNames: {
            "#name": "name",
            "#status": "status",
          },
          ExclusiveStartKey: lastEvaluatedKey || undefined,
        })
        .promise();

      (venuesResult.Items || []).forEach((item) => {
        if (!isVenueFeedCandidate(item)) return;
        const venueId = item.venue_id || item.venueId;
        const createdAt = resolvePublicationTimestamp(item, [
          item.publishAt,
          item.publishedAt,
          item.createdAt,
        ]);
        pushRecentCandidate(
          recentVenueItems,
          {
            ...item,
            venue_id: venueId,
            venueId,
            createdAt,
            publishedAt: createdAt,
            publicationTimestamp: createdAt,
          },
          maxItems
        );
      });

      lastEvaluatedKey = venuesResult.LastEvaluatedKey || null;
    } while (lastEvaluatedKey && recentVenueItems.length < maxItems);

    recentVenueItems.forEach((item) => {
      const venueId = item.venue_id || item.venueId;
      venueCandidates.push({
        sourceType: "venue",
        sourceId: venueId,
        createdAt: item.createdAt,
        payload: item,
      });
    });

    console.info("syncExternalSourcesToTimeline venues", {
      selectedVenuesCount: venueCandidates.length,
      newestVenueId: venueCandidates[0]?.sourceId || null,
    });
  } catch (err) {
    console.warn(
      "No se pudieron sincronizar lugares al timeline",
      err?.message || err
    );
  }

  const merged = [...eventCandidates, ...serviceCandidates, ...venueCandidates]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, maxItems);

  if (!merged.length) return;

  const chunks = [];
  for (let i = 0; i < merged.length; i += 25) {
    chunks.push(merged.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    const timelineIds = chunk.map(
      (entry) => `${entry.sourceType}_${entry.sourceId}`,
    );
    const existingTimelineMap = new Map();

    for (let i = 0; i < timelineIds.length; i += 100) {
      const idChunk = timelineIds.slice(i, i + 100);
      const existingBatch = await dynamodb
        .batchGet({
          RequestItems: {
            [TABLES.timeline]: {
              Keys: idChunk.map((id) => ({ id })),
            },
          },
        })
        .promise();

      (existingBatch.Responses?.[TABLES.timeline] || []).forEach((item) => {
        existingTimelineMap.set(item.id, item);
      });
    }

    await dynamodb
      .batchWrite({
        RequestItems: {
          [TABLES.timeline]: chunk.map((entry) => {
            const id = `${entry.sourceType}_${entry.sourceId}`;
            const existing = existingTimelineMap.get(id);
            const createdAt = existing?.createdAt || entry.createdAt;
            const sortKey =
              existing?.sortKey || toSortKey(entry.createdAt, id);

            return {
              PutRequest: {
                Item: {
                  id,
                  sourceType: entry.sourceType,
                  sourceId: entry.sourceId,
                  createdAt,
                  sortKey,
                  feedScope: FEED_SCOPE_HOME_PUBLIC,
                  listItemType: "publication",
                  payload: entry.payload,
                  visibility: entry.visibility || "PUBLIC",
                  updatedAt: nowIso(),
                },
              },
            };
          }),
        },
      })
      .promise();
  }
}

module.exports = {
  dynamodb,
  s3,
  S3_REGION,
  TABLES,
  MEDIA_BUCKET,
  FEED_PUBLIC_BASE_URL,
  FEED_SCOPE_HOME_PUBLIC,
  CORS_HEADERS,
  response,
  errorResponse,
  parseBody,
  parseIncludes,
  parseLimit,
  normalizeVisibility,
  normalizePrivacyValue,
  resolveEventVisibility,
  nowIso,
  randomId,
  toSortKey,
  encodeCursor,
  decodeCursor,
  safeNumber,
  chunkArray,
  parseDateToIso,
  resolveViewerId,
  normalizeMentionUserId,
  createMentionTag,
  sanitizeMentions,
  extractMentionsFromText,
  resolveProfileImageUrl,
  resolvePublicationMedia,
  resolvePublicationMediaUrl,
  resolveEventImageUrl,
  loadEventImages,
  getEventMentionIfExists,
  getUserProfileIfExists,
  getUserProfile,
  mapMediaByIds,
  getRequestedMediaCount,
  extractRemovedMediaIds,
  hasMediaPayload,
  hasMediaMutation,
  shouldReplaceRequestedMedia,
  shouldClearRequestedMedia,
  resolveRequestedMedia,
  readIdempotentResult,
  saveIdempotentResult,
  upsertTimelineEntry,
  deleteTimelineEntry,
  formatFeedPublication,
  formatEventPublication,
  formatServicePublication,
  formatServiceProviderPublication,
  formatVenuePublication,
  isServiceCandidate,
  isServiceProviderRecord,
  isServiceFeedRecord,
  isVenueFeedCandidate,
  extendedDynamodb,
  EXTENDED_TABLES,
  buildServicesSection,
  loadViewerStateByPublicationIds,
  loadCommentLikeState,
  getFeedETag,
  syncExternalSourcesToTimeline,
  resolvePublicationTimestamp,
};
