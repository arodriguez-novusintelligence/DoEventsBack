const AWS = require("aws-sdk");

const {
  dynamodb,
  s3,
  S3_REGION,
  TABLES,
  MEDIA_BUCKET,
  FEED_PUBLIC_BASE_URL,
  FEED_SCOPE_HOME_PUBLIC,
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
  resolveViewerId,
  normalizeMentionUserId,
  createMentionTag,
  sanitizeMentions,
  extractMentionsFromText,
  getEventMentionIfExists,
  getUserProfileIfExists,
  getUserProfile,
  mapMediaByIds,
  resolvePublicationMediaUrl,
  getRequestedMediaCount,
  extractRemovedMediaIds,
  hasMediaPayload,
  hasMediaMutation,
  resolveRequestedMedia,
  shouldReplaceRequestedMedia,
  shouldClearRequestedMedia,
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
  loadEventImages,
  resolvePublicationTimestamp,
} = require("./feedCommon");

const lambda = new AWS.Lambda();

function getPathParam(event, key) {
  return event?.pathParameters?.[key] || null;
}

function buildIdempotencyKey(viewerId, operation, clientRequestId) {
  if (!viewerId || !clientRequestId) return null;
  return `${viewerId}#${operation}#${clientRequestId}`;
}

const EVENT_INTERACTION_PREFIX = "event#";
const SERVICE_INTERACTION_PREFIX = "service#";
const VENUE_INTERACTION_PREFIX = "venue#";
const PUBLICATIONS_BY_AUTHOR_INDEX = "authorId-createdAt-index";
const PUBLICATION_LIKES_BY_USER_INDEX = "userId-createdAt-index";
const FOLLOWERS_BY_TARGET_INDEX =
  process.env.DYNAMODB_FOLLOWERS_BY_TARGET_INDEX || "followUserIdIndex";
const NOTIFICATIONS_TRIGGER_FUNCTION_NAME =
  process.env.NOTIFICATIONS_TRIGGER_FUNCTION_NAME ||
  (process.env.STAGE === "qa"
    ? "notifications-qa-triggerNotification"
    : "notifications-dev-triggerNotification");
const FEED_NOTIFICATION_CHANNELS = ["push", "inApp"];
const FEED_USER_MENTIONED_TEMPLATE = "FEED_USER_MENTIONED";
const FEED_EVENT_MENTIONED_TEMPLATE = "FEED_EVENT_MENTIONED";
/** Máximo de republicaciones al feed por usuario y contenido (evento/servicio/lugar). */
const FEED_REPOST_MAX_PER_USER_PER_TARGET = 3;
/** Días de espera entre republicaciones del mismo contenido. */
const FEED_REPOST_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function buildInteractionTargetKey(targetType, targetId) {
  if (targetType === "event") {
    return `${EVENT_INTERACTION_PREFIX}${targetId}`;
  }

  if (targetType === "service") {
    return `${SERVICE_INTERACTION_PREFIX}${targetId}`;
  }

  if (targetType === "venue") {
    return `${VENUE_INTERACTION_PREFIX}${targetId}`;
  }

  return String(targetId || "");
}

function isEventInteractionTargetKey(targetKey) {
  return String(targetKey || "").startsWith(EVENT_INTERACTION_PREFIX);
}

function unwrapInteractionTargetKey(targetKey) {
  if (String(targetKey || "").startsWith(SERVICE_INTERACTION_PREFIX)) {
    return {
      targetType: "service",
      sourceId: String(targetKey).slice(SERVICE_INTERACTION_PREFIX.length) || null,
    };
  }

  if (String(targetKey || "").startsWith(VENUE_INTERACTION_PREFIX)) {
    return {
      targetType: "venue",
      sourceId: String(targetKey).slice(VENUE_INTERACTION_PREFIX.length) || null,
    };
  }

  if (!isEventInteractionTargetKey(targetKey)) {
    return {
      targetType: "publication",
      sourceId: targetKey || null,
    };
  }

  return {
    targetType: "event",
    sourceId: String(targetKey).slice(EVENT_INTERACTION_PREFIX.length) || null,
  };
}

function parseLikedValue(body = {}) {
  if (typeof body?.liked === "boolean") return body.liked;
  if (typeof body?.like === "boolean") return body.like;
  return false;
}

function parseToggleValue(body = {}, keys = []) {
  for (const key of keys) {
    if (typeof body?.[key] === "boolean") {
      return body[key];
    }
  }

  return true;
}

async function getPublicationOr404(publicationId) {
  const data = await dynamodb
    .get({
      TableName: TABLES.publications,
      Key: { id: publicationId },
    })
    .promise();

  return data.Item || null;
}

function userIdsMatch(left, right) {
  if (!left || !right) return false;
  const a = String(left).trim();
  const b = String(right).trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const shortA = a.length === 36 && a.includes("-") ? a.substring(0, 10) : a;
  const shortB = b.length === 36 && b.includes("-") ? b.substring(0, 10) : b;
  return shortA === shortB;
}

async function countStoryViews(publicationId) {
  try {
    const result = await dynamodb
      .query({
        TableName: TABLES.storyViews,
        KeyConditionExpression: "publicationId = :publicationId",
        ExpressionAttributeValues: { ":publicationId": publicationId },
        Select: "COUNT",
      })
      .promise();
    return result.Count || 0;
  } catch (err) {
    console.warn("countStoryViews degraded", publicationId, err?.code || err?.message || err);
    return 0;
  }
}

async function getEventOrNull(eventId) {
  const data = await dynamodb
    .get({
      TableName: TABLES.events,
      Key: { id: eventId },
    })
    .promise();

  return data.Item || null;
}

async function getServiceOrNull(serviceId) {
  try {
    const providerResult = await extendedDynamodb
      .get({
        TableName: EXTENDED_TABLES.services,
        Key: { serviceId },
      })
      .promise();

    const provider = providerResult.Item || null;
    if (provider && isServiceProviderRecord(provider)) {
      return provider;
    }
  } catch (err) {
    console.warn("getServiceOrNull provider lookup failed", err?.message || err);
  }

  const data = await dynamodb
    .get({
      TableName: TABLES.client,
      Key: { id: serviceId },
    })
    .promise();

  const item = data.Item || null;
  if (!item || !isServiceCandidate(item)) {
    return null;
  }

  return item;
}

async function getVenueOrNull(venueId) {
  try {
    const data = await extendedDynamodb
      .get({
        TableName: EXTENDED_TABLES.venues,
        Key: { venue_id: venueId },
      })
      .promise();

    return data.Item || null;
  } catch (err) {
    console.warn("getVenueOrNull lookup failed", err?.message || err);
    return null;
  }
}

async function resolveFeedTarget(targetId, viewerId = null, accessCache = {}) {
  const publication = await getPublicationOr404(targetId);
  if (publication && !publication.deletedAt) {
    const canAccessPublication = await canViewerAccessTarget(
      {
        targetType: "publication",
        sourceId: targetId,
        item: publication,
      },
      viewerId,
      accessCache,
    );

    if (!canAccessPublication) {
      return null;
    }

    return {
      targetType: "publication",
      sourceId: targetId,
      interactionId: buildInteractionTargetKey("publication", targetId),
      item: publication,
    };
  }

  const eventItem = await getEventOrNull(targetId);
  if (eventItem) {
    const canAccessEvent = await canViewerAccessTarget(
      {
        targetType: "event",
        sourceId: targetId,
        item: eventItem,
      },
      viewerId,
      accessCache,
    );

    if (!canAccessEvent) {
      return null;
    }

    return {
      targetType: "event",
      sourceId: targetId,
      interactionId: buildInteractionTargetKey("event", targetId),
      item: eventItem,
    };
  }

  const serviceItem = await getServiceOrNull(targetId);
  if (serviceItem) {
    const serviceId = isServiceProviderRecord(serviceItem)
      ? serviceItem.serviceId
      : targetId;
    return {
      targetType: "service",
      sourceId: serviceId,
      interactionId: buildInteractionTargetKey("service", serviceId),
      item: serviceItem,
    };
  }

  const venueItem = await getVenueOrNull(targetId);
  if (venueItem && isVenueFeedCandidate(venueItem)) {
    const venueId = venueItem.venue_id || venueItem.venueId || targetId;
    return {
      targetType: "venue",
      sourceId: venueId,
      interactionId: buildInteractionTargetKey("venue", venueId),
      item: venueItem,
    };
  }

  return null;
}

async function resolveLikeTarget(targetId, viewerId = null, accessCache = {}) {
  return resolveFeedTarget(targetId, viewerId, accessCache);
}

function decodeOffsetCursor(cursor) {
  if (!cursor) return 0;

  const decoded = decodeCursor(cursor);
  const offset = Number(decoded?.offset || 0);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

function encodeOffsetCursor(offset, total) {
  if (!Number.isFinite(offset) || offset < 0 || offset >= total) {
    return null;
  }

  return encodeCursor({ offset });
}

function isMissingIndexError(error) {
  return (
    error?.code === "ValidationException" &&
    /index|schema|key/i.test(String(error?.message || ""))
  );
}

async function collectQueryItems(params = {}) {
  const items = [];
  let lastEvaluatedKey = null;

  do {
    const result = await dynamodb
      .query({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey || undefined,
      })
      .promise();

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey || null;
  } while (lastEvaluatedKey);

  return items;
}

async function collectScanItems(params = {}) {
  const items = [];
  let lastEvaluatedKey = null;

  do {
    const result = await dynamodb
      .scan({
        ...params,
        ExclusiveStartKey: lastEvaluatedKey || undefined,
      })
      .promise();

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey || null;
  } while (lastEvaluatedKey);

  return items;
}

function sortItemsByCreatedAtDesc(items = []) {
  return [...items].sort((left, right) =>
    String(right?.createdAt || "").localeCompare(String(left?.createdAt || ""))
  );
}

function truncateText(value, maxLength = 120) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getUniqueMentionUserIds(mentions = []) {
  return [
    ...new Set(
      sanitizeMentions(mentions)
        .filter(
          (mention) =>
            String(mention?.mentionType || mention?.type || "user").toLowerCase() ===
            "user",
        )
        .map((mention) => normalizeMentionUserId(mention?.userId || mention))
        .filter(Boolean)
    ),
  ];
}

function getUniqueMentionEventIds(mentions = []) {
  return [
    ...new Set(
      sanitizeMentions(mentions)
        .filter(
          (mention) =>
            String(mention?.mentionType || mention?.type || "user").toLowerCase() ===
            "event",
        )
        .map((mention) => String(mention?.eventId || mention?.targetId || "").trim())
        .filter(Boolean),
    ),
  ];
}

function getUniqueMentionServiceIds(mentions = []) {
  return [
    ...new Set(
      sanitizeMentions(mentions)
        .filter(
          (mention) =>
            String(mention?.mentionType || mention?.type || "user").toLowerCase() ===
            "service",
        )
        .map((mention) => String(mention?.targetId || mention?.serviceId || "").trim())
        .filter(Boolean),
    ),
  ];
}

async function resolveUserMentionsFromTextHandles(text = "") {
  const source = String(text || "");
  if (!source) return [];

  const regex = /@([A-Za-z0-9][A-Za-z0-9_\u00C0-\u024F-]{0,127})/gu;
  const mentions = [];
  const seen = new Set();
  let match;

  while ((match = regex.exec(source))) {
    const handle = String(match[1] || "").trim();
    if (!handle) continue;

    const normalizedHandle = handle.toLowerCase();
    if (seen.has(normalizedHandle)) continue;

    const directUserId = normalizeMentionUserId(handle);
    let userId = directUserId;

    if (!userId) {
      const matches = await findMatchingUserIds(handle, { usernameOnly: true });
      if (matches.length === 1) {
        userId = matches[0];
      } else if (matches.length > 1) {
        const exactMatches = await findMatchingUserIds(handle, { usernameOnly: false });
        userId = exactMatches[0] || matches[0] || null;
      }
    }

    if (!userId) continue;
    seen.add(normalizedHandle);

    mentions.push({
      type: "user",
      mentionType: "user",
      targetId: userId,
      userId,
      eventId: null,
      tag: `@${handle}`,
      start: match.index,
      end: match.index + match[0].length,
      metadata: { username: handle },
    });

    if (mentions.length >= 30) break;
  }

  return sanitizeMentions(mentions);
}

async function resolveMentionRecords({ text = "", explicitMentions = [], viewerId = null }) {
  const requestedMentions = sanitizeMentions(
    Array.isArray(explicitMentions) ? explicitMentions : []
  );
  const hasNonUserExplicit = requestedMentions.some((mention) => {
    const mentionType = String(mention?.mentionType || mention?.type || "user").toLowerCase();
    return mentionType !== "user";
  });
  const extractedMentions = requestedMentions.length && !hasNonUserExplicit
    ? []
    : extractMentionsFromText(text);
  const extractedUserMentions = requestedMentions.length && hasNonUserExplicit
    ? await resolveUserMentionsFromTextHandles(text)
    : extractedMentions;
  const mergedMentions = [];
  const seen = new Set();

  [...extractedUserMentions, ...requestedMentions].forEach((mention) => {
    const key = [
      mention.mentionType || mention.type || "user",
      mention.targetId || mention.userId || mention.eventId,
      mention.start ?? "null",
      mention.end ?? "null",
      mention.tag || createMentionTag(mention.targetId || mention.userId || mention.eventId),
    ].join(":");

    if (seen.has(key)) return;
    seen.add(key);
    mergedMentions.push(mention);
  });

  const uniqueUserIds = getUniqueMentionUserIds(mergedMentions);
  const uniqueEventIds = getUniqueMentionEventIds(mergedMentions);
  const uniqueServiceIds = getUniqueMentionServiceIds(mergedMentions);
  const hasVenueMentions = mergedMentions.some(
    (mention) =>
      String(mention?.mentionType || mention?.type || "").toLowerCase() === "venue" &&
      String(mention?.targetId || "").trim(),
  );
  if (!uniqueUserIds.length && !uniqueEventIds.length && !uniqueServiceIds.length && !hasVenueMentions) {
    return [];
  }

  const [profiles, events, services] = await Promise.all([
    Promise.all(
      uniqueUserIds.map(async (userId) => [
        userId,
        await getUserProfileIfExists(userId, viewerId),
      ]),
    ),
    Promise.all(
      uniqueEventIds.map(async (eventId) => [eventId, await getEventMentionIfExists(eventId)]),
    ),
    Promise.all(
      uniqueServiceIds.map(async (serviceId) => [serviceId, await getServiceOrNull(serviceId)]),
    ),
  ]);
  const profileMap = new Map(profiles.filter(([, profile]) => profile));
  const eventMap = new Map(events.filter(([, eventInfo]) => eventInfo));
  const serviceMap = new Map(
    services.filter(([, service]) => service).map(([id, service]) => [
      id,
      {
        targetId: id,
        name: service.name || service.category || service.role || "Servicio",
        title: service.name || service.category || service.role || "Servicio",
        description: service.description || "",
        imageUrl: service.profileImageUrl || (Array.isArray(service.gallery) ? service.gallery[0] : null),
        locationLabel: service.city || "",
      },
    ]),
  );

  if (!profileMap.size && !eventMap.size && !serviceMap.size && !hasVenueMentions) {
    return [];
  }

  return mergedMentions.reduce((collection, mention) => {
    const mentionType = String(
      mention.mentionType || mention.type || (mention.eventId ? "event" : "user"),
    ).toLowerCase();

    if (mentionType === "event") {
      const eventInfo = eventMap.get(mention.eventId) || null;
      if (!eventInfo) {
        return collection;
      }

      const metadata = {
        ...(mention.metadata || {}),
        eventId: mention.eventId,
        title: mention.title || mention.name || eventInfo.title || eventInfo.name || null,
        name: mention.name || mention.title || eventInfo.name || eventInfo.title || null,
        description: mention.description || eventInfo.description || "",
        imageUrl: mention.imageUrl || eventInfo.imageUrl || null,
        locationLabel: mention.locationLabel || eventInfo.locationLabel || "",
        dateLabel: mention.dateLabel || eventInfo.dateLabel || "",
        slug: mention.slug || eventInfo.slug || null,
        status: eventInfo.status || null,
        fechaIni: eventInfo.fechaIni || null,
        horaIni: eventInfo.horaIni || null,
      };

      collection.push({
        type: "event",
        mentionType: "event",
        targetId: mention.eventId,
        userId: null,
        eventId: mention.eventId,
        tag: mention.tag || createMentionTag(mention.eventId),
        start: Number.isInteger(mention.start) ? mention.start : null,
        end: Number.isInteger(mention.end) ? mention.end : null,
        name: metadata.name,
        title: metadata.title,
        username: null,
        avatarUrl: null,
        role: mention.role || "event",
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        locationLabel: metadata.locationLabel,
        dateLabel: metadata.dateLabel,
        slug: metadata.slug,
        metadata,
      });

      return collection;
    }

    if (mentionType === "service") {
      const serviceId = String(mention.targetId || mention.serviceId || "").trim();
      const serviceInfo = serviceMap.get(serviceId) || null;
      if (!serviceInfo && !mention.title && !mention.name) {
        return collection;
      }
      const metadata = {
        ...(mention.metadata || {}),
        serviceId,
        targetId: serviceId,
        title: mention.title || mention.name || serviceInfo?.title || null,
        name: mention.name || mention.title || serviceInfo?.name || null,
        description: mention.description || serviceInfo?.description || "",
        imageUrl: mention.imageUrl || serviceInfo?.imageUrl || null,
        locationLabel: mention.locationLabel || serviceInfo?.locationLabel || "",
      };
      collection.push({
        type: "service",
        mentionType: "service",
        targetId: serviceId,
        userId: null,
        eventId: null,
        tag: mention.tag || `#${serviceId}`,
        start: Number.isInteger(mention.start) ? mention.start : null,
        end: Number.isInteger(mention.end) ? mention.end : null,
        name: metadata.name,
        title: metadata.title,
        username: null,
        avatarUrl: null,
        role: "service",
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        locationLabel: metadata.locationLabel,
        dateLabel: "",
        slug: null,
        metadata,
      });
      return collection;
    }

    if (mentionType === "venue" && (mention.targetId || mention.title || mention.name)) {
      const venueId = String(mention.targetId || "").trim();
      const metadata = {
        ...(mention.metadata || {}),
        venueId,
        targetId: venueId,
        title: mention.title || mention.name || "Lugar",
        name: mention.name || mention.title || "Lugar",
        description: mention.description || "",
        imageUrl: mention.imageUrl || null,
        locationLabel: mention.locationLabel || "",
      };
      collection.push({
        type: "venue",
        mentionType: "venue",
        targetId: venueId,
        userId: null,
        eventId: null,
        tag: mention.tag || `#${venueId}`,
        start: Number.isInteger(mention.start) ? mention.start : null,
        end: Number.isInteger(mention.end) ? mention.end : null,
        name: metadata.name,
        title: metadata.title,
        username: null,
        avatarUrl: null,
        role: "venue",
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        locationLabel: metadata.locationLabel,
        dateLabel: "",
        slug: null,
        metadata,
      });
      return collection;
    }

    const profile = profileMap.get(mention.userId) || null;
    if (!profile) {
      return collection;
    }

    const metadata = {
      ...(mention.metadata || {}),
      userId: mention.userId,
      name: mention.name || profile.name || null,
      username:
        mention.username || profile.username || createMentionTag(mention.userId),
      avatarUrl: mention.avatarUrl || profile.avatarUrl || null,
      role: mention.role || profile.role || null,
      description: mention.description || profile.description || "",
    };

    collection.push({
      type: "user",
      mentionType: "user",
      targetId: mention.userId,
      userId: mention.userId,
      eventId: null,
      tag: mention.tag || createMentionTag(mention.userId),
      start: Number.isInteger(mention.start) ? mention.start : null,
      end: Number.isInteger(mention.end) ? mention.end : null,
      name: metadata.name,
      title: null,
      username: metadata.username,
      avatarUrl: metadata.avatarUrl,
      role: metadata.role,
      description: metadata.description,
      imageUrl: null,
      locationLabel: "",
      dateLabel: "",
      slug: null,
      metadata,
    });

    return collection;
  }, []);
}

function getNewMentionUserIds(nextMentions = [], previousMentions = []) {
  const previousUserIds = new Set(getUniqueMentionUserIds(previousMentions));
  return getUniqueMentionUserIds(nextMentions).filter(
    (userId) => !previousUserIds.has(userId)
  );
}

function getNewMentionEventIds(nextMentions = [], previousMentions = []) {
  const previousEventIds = new Set(getUniqueMentionEventIds(previousMentions));
  return getUniqueMentionEventIds(nextMentions).filter(
    (eventId) => !previousEventIds.has(eventId)
  );
}

async function notifyMentionedUsers({
  mentionedUserIds = [],
  actor,
  publicationId,
  commentId = null,
  textPreview = "",
  contextType = "publication",
}) {
  const recipients = [...new Set((mentionedUserIds || []).map(String).filter(Boolean))].filter(
    (userId) => userId !== actor?.id
  );

  if (!recipients.length || !publicationId) return;

  await notifyUsersWithTemplate(recipients, FEED_USER_MENTIONED_TEMPLATE, () => ({
    actorUserId: actor?.id || null,
    actorName: actor?.name || "Usuario",
    actorUsername: actor?.username || null,
    publicationId,
    commentId,
    contextType,
    textPreview: truncateText(textPreview, 160),
    type: "feed_user_mentioned",
  }));
}

async function notifyMentionedEventOwners({
  mentionEventIds = [],
  actor,
  publicationId,
  textPreview = "",
}) {
  const uniqueEventIds = [
    ...new Set((mentionEventIds || []).map(String).filter(Boolean)),
  ];
  if (!uniqueEventIds.length || !publicationId) return;

  for (const eventId of uniqueEventIds) {
    const eventItem = await getEventOrNull(eventId);
    if (!eventItem) continue;

    const ownerId = eventItem.userId || eventItem.createdBy;
    if (!ownerId || String(ownerId) === String(actor?.id || "")) continue;

    await invokeNotification(FEED_EVENT_MENTIONED_TEMPLATE, ownerId, {
      actorUserId: actor?.id || null,
      actorName: actor?.name || "Usuario",
      actorUsername: actor?.username || null,
      publicationId,
      eventId,
      eventName: eventItem.nombre || eventItem.title || "Evento",
      textPreview: truncateText(textPreview, 160),
      type: "feed_event_mentioned",
    });
  }
}

function getNotificationTargetLabel(targetType) {
  if (targetType === "event") return "evento";
  if (targetType === "service") return "servicio";
  if (targetType === "venue") return "lugar";
  return "publicación";
}

function getNotificationTargetTitle(target = {}) {
  return (
    String(
      target?.item?.title ||
        target?.item?.nombre ||
        target?.item?.name ||
        target?.item?.description ||
        target?.item?.descripcion ||
        ""
    ).trim() || null
  );
}

function buildTargetNotificationMetadata(target = {}) {
  const metadata = {
    targetType: target.targetType || "publication",
    targetId: target.sourceId || null,
    targetLabel: getNotificationTargetLabel(target.targetType),
    targetTitle: getNotificationTargetTitle(target),
  };

  if (target.targetType === "event") {
    metadata.eventId = target.sourceId || null;
  } else if (target.targetType === "service") {
    metadata.serviceId = target.sourceId || null;
  } else if (target.targetType === "venue") {
    metadata.venueId = target.sourceId || null;
  } else {
    metadata.publicationId = target.sourceId || null;
  }

  return metadata;
}

function getFeedTargetOwnerId(target = {}) {
  if (target.targetType === "event") {
    return target?.item?.userId || target?.item?.createdBy || null;
  }

  if (target.targetType === "service") {
    return target?.item?.userId || target?.item?.id || null;
  }

  if (target.targetType === "venue") {
    return target?.item?.ownerUserId || null;
  }

  if (target.targetType === "publication") {
    return target?.item?.authorId || null;
  }

  return null;
}

function isPublicationPrivate(item = {}) {
  return normalizePrivacyValue(item.visibility || "PUBLIC", "PUBLIC") === "PRIVATE";
}

function isEventPrivate(item = {}) {
  return resolveEventVisibility(item) === "PRIVATE";
}

async function isViewerFollowingUser(ownerId, viewerId, cache = null) {
  if (!ownerId || !viewerId || ownerId === viewerId) return false;

  const cacheKey = `${viewerId}:${ownerId}`;
  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const relation = await dynamodb
    .get({
      TableName: process.env.DYNAMODB_FOLLOWERS_TABLE || "Followers",
      Key: {
        follow_id: `${viewerId}_${ownerId}`,
      },
      ProjectionExpression: "#status, blocked_at",
      ExpressionAttributeNames: {
        "#status": "status",
      },
    })
    .promise()
    .catch((error) => {
      console.warn("isViewerFollowingUser warning", error?.message || error);
      return { Item: null };
    });

  const follows =
    relation?.Item?.status === "accepted" &&
    !relation?.Item?.blocked_at;

  if (cache) {
    cache.set(cacheKey, follows);
  }

  return follows;
}

async function isViewerInvitedToEvent(eventId, viewerId, cache = null) {
  if (!eventId || !viewerId) return false;

  const cacheKey = `${viewerId}:${eventId}`;
  if (cache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const invitationResult = await dynamodb
    .query({
      TableName: TABLES.eventInvitations,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":sk": `USER#${viewerId}#`,
      },
      Limit: 3,
    })
    .promise()
    .catch((error) => {
      if (error?.code !== "ResourceNotFoundException") {
        console.warn("isViewerInvitedToEvent warning", error?.message || error);
      }
      return { Items: [] };
    });

  const invited = (invitationResult.Items || []).some((item) => {
    const status = String(item?.status || "pending").trim().toLowerCase();
    return status !== "rejected" && status !== "expired";
  });

  if (cache) {
    cache.set(cacheKey, invited);
  }

  return invited;
}

async function canViewerAccessTarget(
  { targetType, sourceId, item },
  viewerId,
  cache = {},
) {
  if (targetType === "publication") {
    if (!isPublicationPrivate(item)) return true;

    const ownerId = item?.authorId || null;
    if (!ownerId) return false;
    if (viewerId && viewerId === ownerId) return true;

    return isViewerFollowingUser(ownerId, viewerId, cache.followers);
  }

  if (targetType === "event") {
    if (!isEventPrivate(item)) return true;

    const ownerId = item?.userId || item?.createdBy || null;
    if (viewerId && ownerId && viewerId === ownerId) return true;

    const [followsOwner, invitedToEvent] = await Promise.all([
      isViewerFollowingUser(ownerId, viewerId, cache.followers),
      isViewerInvitedToEvent(sourceId || item?.id, viewerId, cache.invitations),
    ]);

    return followsOwner || invitedToEvent;
  }

  return true;
}

async function getAcceptedFollowerIds(userId) {
  if (!userId) return [];

  const followers = await collectQueryItems({
    TableName: process.env.DYNAMODB_FOLLOWERS_TABLE || "Followers",
    IndexName: FOLLOWERS_BY_TARGET_INDEX,
    KeyConditionExpression: "follow_userId = :userId",
    FilterExpression: "#status = :status AND attribute_not_exists(blocked_at)",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":userId": userId,
      ":status": "accepted",
    },
    ProjectionExpression: "userId, #status",
  }).catch((error) => {
    console.warn("getAcceptedFollowerIds warning", error?.message || error);
    return [];
  });

  return [...new Set(followers.map((item) => item.userId).filter(Boolean))];
}

async function loadUserPublications(userId) {
  if (!userId) return [];

  try {
    return sortItemsByCreatedAtDesc(
      await collectQueryItems({
        TableName: TABLES.publications,
        IndexName: PUBLICATIONS_BY_AUTHOR_INDEX,
        KeyConditionExpression: "authorId = :authorId",
        ExpressionAttributeValues: {
          ":authorId": userId,
        },
        ScanIndexForward: false,
      })
    );
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }
  }

  return sortItemsByCreatedAtDesc(
    await collectScanItems({
      TableName: TABLES.publications,
      FilterExpression: "authorId = :authorId",
      ExpressionAttributeValues: {
        ":authorId": userId,
      },
    })
  );
}

async function loadRepostRecordsForTarget(publicationId) {
  if (!publicationId) return [];

  return sortItemsByCreatedAtDesc(
    await collectQueryItems({
      TableName: TABLES.publicationReposts,
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: {
        ":publicationId": publicationId,
      },
    })
  );
}

function canEditPublication(publication, userId) {
  if (!userId || !publication) return false;
  if (publication.authorId === userId) return true;
  const coAdminIds = Array.isArray(publication.coAdminIds)
    ? publication.coAdminIds
    : [];
  return coAdminIds.includes(userId);
}

async function invokeNotification(templateKey, userId, metadata = {}) {
  if (!templateKey || !userId || !NOTIFICATIONS_TRIGGER_FUNCTION_NAME) {
    return false;
  }

  try {
    await lambda
      .invoke({
        FunctionName: NOTIFICATIONS_TRIGGER_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: JSON.stringify({
          templateKey,
          userId,
          channels: FEED_NOTIFICATION_CHANNELS,
          metadata: {
            userId,
            ...metadata,
          },
        }),
      })
      .promise();

    return true;
  } catch (error) {
    console.warn(
      `No se pudo invocar notificación ${templateKey} para ${userId}`,
      error?.message || error
    );
    return false;
  }
}

async function notifyUsersWithTemplate(userIds = [], templateKey, metadataBuilder) {
  const uniqueUserIds = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!uniqueUserIds.length) return;

  for (const chunk of chunkArray(uniqueUserIds, 10)) {
    await Promise.all(
      chunk.map((userId) =>
        invokeNotification(
          templateKey,
          userId,
          typeof metadataBuilder === "function"
            ? metadataBuilder(userId)
            : metadataBuilder || {}
        )
      )
    );
  }
}

async function notifyFollowersAboutPublication({ publication, author }) {
  if (!publication?.id) return;
  if (String(publication.visibility || "PUBLIC").toUpperCase() !== "PUBLIC") return;

  const followerIds = (await getAcceptedFollowerIds(publication.authorId)).filter(
    (userId) => userId !== publication.authorId
  );

  if (!followerIds.length) return;

  await notifyUsersWithTemplate(
    followerIds,
    "FEED_NEW_PUBLICATION_FOLLOWER",
    () => ({
      actorUserId: author?.id || publication.authorId,
      actorName: author?.name || "Usuario",
      actorUsername: author?.username || null,
      publicationId: publication.id,
      publicationType: publication.type || "post",
      publicationTitle: String(publication.title || "").trim() || null,
      publicationDescription: truncateText(publication.description, 140),
      type: "feed_new_publication",
    })
  );
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesPartialSearch(value, normalizedTerm) {
  return normalizeSearchValue(value).includes(normalizedTerm);
}

async function findMatchingUserIds(searchTerm, { usernameOnly = false } = {}) {
  const normalizedTerm = normalizeSearchValue(searchTerm);
  if (!normalizedTerm) return [];

  const users = [];
  let lastEvaluatedKey = null;

  do {
    const result = await dynamodb
      .scan({
        TableName: TABLES.client,
        ProjectionExpression: "id, #user, nombre, apellido",
        ExpressionAttributeNames: {
          "#user": "user",
        },
        ExclusiveStartKey: lastEvaluatedKey || undefined,
      })
      .promise();

    users.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey || null;
  } while (lastEvaluatedKey);

  return users
    .filter((user) => {
      if (usernameOnly) {
        return matchesPartialSearch(user.user, normalizedTerm);
      }

      return (
        matchesPartialSearch(user.user, normalizedTerm) ||
        matchesPartialSearch(user.nombre, normalizedTerm) ||
        matchesPartialSearch(user.apellido, normalizedTerm) ||
        matchesPartialSearch(
          [user.nombre, user.apellido].filter(Boolean).join(" "),
          normalizedTerm
        )
      );
    })
    .map((user) => user.id)
    .filter(Boolean);
}

async function loadLikeRecordsForTarget(interactionId) {
  const items = [];
  let lastEvaluatedKey = null;

  do {
    const result = await dynamodb
      .query({
        TableName: TABLES.publicationLikes,
        KeyConditionExpression: "publicationId = :publicationId",
        ExpressionAttributeValues: {
          ":publicationId": interactionId,
        },
        ExclusiveStartKey: lastEvaluatedKey || undefined,
      })
      .promise();

    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey || null;
  } while (lastEvaluatedKey);

  return items.sort((left, right) =>
    String(right?.createdAt || "").localeCompare(String(left?.createdAt || ""))
  );
}

async function loadLikeRecordsForUser(userId) {
  try {
    return sortItemsByCreatedAtDesc(
      await collectQueryItems({
        TableName: TABLES.publicationLikes,
        IndexName: PUBLICATION_LIKES_BY_USER_INDEX,
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        ScanIndexForward: false,
      })
    );
  } catch (error) {
    if (!isMissingIndexError(error)) {
      throw error;
    }
  }

  return sortItemsByCreatedAtDesc(
    await collectScanItems({
      TableName: TABLES.publicationLikes,
      ProjectionExpression: "publicationId, userId, createdAt",
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    })
  );
}

async function findRepostPublicationForUser({ target, userId }) {
  if (!target?.sourceId || !userId) return null;

  const userPublications = await loadUserPublications(userId);
  if (!Array.isArray(userPublications) || !userPublications.length) return null;

  const match = userPublications.find((publication) => {
    if (!publication?.isRepost || publication?.deletedAt) return false;

    if (target.targetType === "publication") {
      return publication?.repostOf?.publicationId === target.sourceId;
    }

    if (target.targetType === "event") {
      return (
        publication?.repostOf?.targetType === "event" &&
        publication?.repostOf?.eventId === target.sourceId
      );
    }

    return false;
  });

  if (!match) return null;

  return {
    repostPublicationId: match.id,
    repostInteractionId: buildInteractionTargetKey("publication", match.id),
  };
}

async function formatTargetAsFeedPublication(
  sourceTarget,
  viewerId,
  viewerState = { viewerId, liked: false, reposted: false },
) {
  if (!sourceTarget?.item) return null;

  const interactionId = sourceTarget.interactionId;

  if (sourceTarget.targetType === "publication") {
    const author = await getUserProfile(sourceTarget.item.authorId, viewerId);
    return formatFeedPublication({
      publication: sourceTarget.item,
      author,
      viewerState,
    });
  }

  if (sourceTarget.targetType === "event") {
    const eventItem = sourceTarget.item;
    const author = await getUserProfile(eventItem.userId || eventItem.createdBy, viewerId);
    const eventImages = await loadEventImages(sourceTarget.sourceId);
    const [likesCount, commentsCount, repostsCount] = await Promise.all([
      countPublicationLikes(interactionId),
      countTargetComments(interactionId),
      countPublicationReposts(interactionId),
    ]);

    return formatEventPublication({
      item: {
        ...eventItem,
        eventImages,
        imagenPrincipal: eventImages[0] || null,
        imageUrl: eventImages[0] || eventItem.imageUrl || null,
        imagen: eventImages[0] || eventItem.imagen || null,
        likesCount,
        commentsCount,
        repostsCount,
      },
      author,
      viewerState,
    });
  }

  if (sourceTarget.targetType === "service") {
    const serviceItem = sourceTarget.item;
    const [likesCount, commentsCount, repostsCount] = await Promise.all([
      countPublicationLikes(interactionId),
      countTargetComments(interactionId),
      countPublicationReposts(interactionId),
    ]);
    const enriched = {
      ...serviceItem,
      likesCount,
      commentsCount,
      repostsCount,
    };

    if (isServiceProviderRecord(serviceItem)) {
      const author = await getUserProfile(serviceItem.userId, viewerId);
      return formatServiceProviderPublication({
        item: enriched,
        author,
        viewerState,
      });
    }

    return formatServicePublication({
      item: enriched,
      viewerState,
    });
  }

  if (sourceTarget.targetType === "venue") {
    const venueItem = sourceTarget.item;
    const [likesCount, commentsCount, repostsCount] = await Promise.all([
      countPublicationLikes(interactionId),
      countTargetComments(interactionId),
      countPublicationReposts(interactionId),
    ]);
    const author = await getUserProfile(venueItem.ownerUserId, viewerId);
    return formatVenuePublication({
      item: {
        ...venueItem,
        likesCount,
        commentsCount,
        repostsCount,
      },
      author,
      viewerState,
    });
  }

  return null;
}

async function loadRepostSourcePublication(publication, viewerId, stateMap = new Map()) {
  const repostOf = publication?.repostOf;
  if (!repostOf) return null;

  if (repostOf.publicationId) {
    const source = await getPublicationOr404(repostOf.publicationId);
    if (!source || source.deletedAt) return null;

    const canAccessSource = await canViewerAccessTarget(
      {
        targetType: "publication",
        sourceId: repostOf.publicationId,
        item: source,
      },
      viewerId,
      { followers: new Map() },
    );
    if (!canAccessSource) return null;

    const sourceAuthor = await getUserProfile(source.authorId, viewerId);
    return formatFeedPublication({
      publication: source,
      author: sourceAuthor,
      viewerState:
        stateMap.get(repostOf.publicationId) || {
          viewerId,
          liked: false,
          reposted: false,
        },
    });
  }

  const targetType = repostOf.targetType;
  const targetId =
    repostOf.eventId ||
    repostOf.targetId ||
    repostOf.serviceId ||
    repostOf.venueId;
  if (!targetType || !targetId) return null;

  const sourceTarget = await resolveFeedTarget(targetId, viewerId, {
    followers: new Map(),
    invitations: new Map(),
  });
  if (!sourceTarget) return null;

  return formatTargetAsFeedPublication(
    sourceTarget,
    viewerId,
    stateMap.get(sourceTarget.interactionId) || {
      viewerId,
      liked: false,
      reposted: false,
    },
  );
}

async function materializeInteractionTarget(interactionId, viewerId, stateMap = new Map()) {
  const { targetType, sourceId } = unwrapInteractionTargetKey(interactionId);
  const viewerState = stateMap.get(interactionId) || {
    viewerId,
    liked: false,
    reposted: false,
  };

  if (targetType === "publication") {
    const publication = await getPublicationOr404(sourceId);
    if (!publication || publication.deletedAt) {
      return null;
    }

    const canAccessPublication = await canViewerAccessTarget(
      {
        targetType: "publication",
        sourceId,
        item: publication,
      },
      viewerId,
      {
        followers: new Map(),
      },
    );
    if (!canAccessPublication) {
      return null;
    }

    const author = await getUserProfile(publication.authorId, viewerId);
    const sourcePublication = await loadRepostSourcePublication(
      publication,
      viewerId,
      stateMap,
    );

    return formatFeedPublication({
      publication,
      author,
      viewerState,
      sourcePublication,
    });
  }

  if (targetType === "event") {
    const eventItem = await getEventOrNull(sourceId);
    if (!eventItem) return null;

    const canAccessEvent = await canViewerAccessTarget(
      {
        targetType: "event",
        sourceId,
        item: eventItem,
      },
      viewerId,
      {
        followers: new Map(),
        invitations: new Map(),
      },
    );
    if (!canAccessEvent) return null;

    const eventImages = await loadEventImages(sourceId);
    const [likesCount, commentsCount, repostsCount] = await Promise.all([
      countPublicationLikes(interactionId),
      countTargetComments(interactionId),
      countPublicationReposts(interactionId),
    ]);

    return formatEventPublication({
      item: {
        ...eventItem,
        eventImages,
        imagenPrincipal: eventImages[0] || null,
        imageUrl: eventImages[0] || eventItem.imageUrl || null,
        imagen: eventImages[0] || eventItem.imagen || null,
        likesCount,
        commentsCount,
        repostsCount,
      },
      viewerState,
    });
  }

  if (targetType === "service") {
    const serviceItem = await getServiceOrNull(sourceId);
    if (!serviceItem) return null;

    return formatTargetAsFeedPublication(
      {
        targetType: "service",
        sourceId,
        interactionId,
        item: serviceItem,
      },
      viewerId,
      viewerState,
    );
  }

  if (targetType === "venue") {
    const venueItem = await getVenueOrNull(sourceId);
    if (!venueItem || !isVenueFeedCandidate(venueItem)) return null;

    return formatTargetAsFeedPublication(
      {
        targetType: "venue",
        sourceId,
        interactionId,
        item: venueItem,
      },
      viewerId,
      viewerState,
    );
  }

  return null;
}

async function countPublicationLikes(interactionId) {
  const result = await dynamodb
    .query({
      TableName: TABLES.publicationLikes,
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: {
        ":publicationId": interactionId,
      },
      Select: "COUNT",
    })
    .promise();

  return safeNumber(result.Count);
}

async function countPublicationReposts(interactionId) {
  const result = await dynamodb
    .query({
      TableName: TABLES.publicationReposts,
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: {
        ":publicationId": interactionId,
      },
      Select: "COUNT",
    })
    .promise();

  return safeNumber(result.Count);
}

async function countTargetComments(interactionId) {
  const result = await dynamodb
    .query({
      TableName: TABLES.comments,
      IndexName: "publicationId-sortKey-index",
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: {
        ":publicationId": interactionId,
      },
      Select: "COUNT",
    })
    .promise();

  return safeNumber(result.Count);
}

async function loadInteractionStats(interactionIds = []) {
  const ids = [...new Set((interactionIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();

  const statsEntries = await Promise.all(
    ids.map(async (interactionId) => {
      const [likes, comments, reposts] = await Promise.all([
        countPublicationLikes(interactionId),
        countTargetComments(interactionId),
        countPublicationReposts(interactionId),
      ]);

      return [interactionId, { likes, comments, reposts }];
    })
  );

  return new Map(statsEntries);
}

const FEED_PREFERENCE_SCOPE = "FEED";
const FEED_PREFERENCE_ACTION_HIDE = "HIDE";
const FEED_PREFERENCE_ACTION_NOT_INTERESTED = "NOT_INTERESTED";
const FEED_PREFERENCE_ACTION_SAVE = "SAVE";

function buildFeedPreferencePartitionKey(viewerId) {
  return `feed#${viewerId}`;
}

function buildFeedPreferenceTargetKey(targetType, sourceId) {
  return `${targetType}:${sourceId}`;
}

function buildFeedPreferenceSortKey() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

async function queryViewerFeedPreferences(viewerId) {
  if (!viewerId) return [];

  const result = await dynamodb
    .query({
      TableName: TABLES.notInterested,
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": buildFeedPreferencePartitionKey(viewerId),
      },
    })
    .promise();

  return (result.Items || []).filter((item) => item.scope === FEED_PREFERENCE_SCOPE);
}

async function loadSuppressedFeedTargets(viewerId) {
  const preferences = await queryViewerFeedPreferences(viewerId);
  const suppressed = new Set();

  for (const preference of preferences) {
    const isSuppressedAction =
      preference.actionType === FEED_PREFERENCE_ACTION_HIDE ||
      preference.actionType === FEED_PREFERENCE_ACTION_NOT_INTERESTED;

    if (!isSuppressedAction) continue;
    if (!preference.targetKey) continue;
    if (preference.active === false) continue;

    suppressed.add(preference.targetKey);
  }

  return suppressed;
}

async function setViewerFeedPreference({
  viewerId,
  target,
  actionType,
  enabled,
}) {
  const partitionKey = buildFeedPreferencePartitionKey(viewerId);
  const targetKey = buildFeedPreferenceTargetKey(target.targetType, target.sourceId);
  const preferences = await queryViewerFeedPreferences(viewerId);
  const matchingItems = preferences.filter(
    (item) => item.actionType === actionType && item.targetKey === targetKey
  );

  if (!enabled && matchingItems.length) {
    for (const chunk of chunkArray(matchingItems, 25)) {
      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.notInterested]: chunk.map((item) => ({
              DeleteRequest: {
                Key: {
                  id: item.id,
                  createdAt: item.createdAt,
                },
              },
            })),
          },
        })
        .promise();
    }
  }

  if (enabled && !matchingItems.length) {
    const createdAt = buildFeedPreferenceSortKey();
    await dynamodb
      .put({
        TableName: TABLES.notInterested,
        Item: {
          id: partitionKey,
          createdAt,
          createdAtIso: nowIso(),
          viewerId,
          scope: FEED_PREFERENCE_SCOPE,
          actionType,
          targetKey,
          targetType: target.targetType,
          targetId: target.sourceId,
          interactionId: target.interactionId,
          active: true,
        },
      })
      .promise();
  }

  return {
    publicationId: target.sourceId,
    targetType: target.targetType,
    enabled,
  };
}

function chunkArray(items = [], size = 25) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function deleteMediaItems(mediaItems = []) {
  const items = (mediaItems || []).filter(Boolean);
  if (!items.length) return;

  // Delete from S3
  await Promise.allSettled(
    items
      .filter((item) => item.s3Key)
      .map((item) =>
        s3
          .deleteObject({ Bucket: MEDIA_BUCKET, Key: item.s3Key })
          .promise()
          .catch((err) => console.warn("S3 deleteObject failed", item.s3Key, err.message))
      )
  );

  // Delete from FeedMedia table
  const mediaDeleteRequests = items
    .filter((item) => item.mediaId)
    .map((item) => ({
      DeleteRequest: { Key: { id: item.mediaId } },
    }));

  for (const chunk of chunkArray(mediaDeleteRequests, 25)) {
    await dynamodb
      .batchWrite({ RequestItems: { [TABLES.media]: chunk } })
      .promise();
  }
}

async function listAllPublicationComments(publicationId) {
  if (!publicationId) return [];
  const items = [];
  let lastEvaluatedKey = null;
  do {
    const result = await dynamodb
      .query({
        TableName: TABLES.comments,
        IndexName: "publicationId-sortKey-index",
        KeyConditionExpression: "publicationId = :publicationId",
        ExpressionAttributeValues: { ":publicationId": publicationId },
        ExclusiveStartKey: lastEvaluatedKey || undefined,
      })
      .promise();
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey || null;
  } while (lastEvaluatedKey);
  return items;
}

async function listChildComments(publicationId, parentCommentId) {
  if (!publicationId || !parentCommentId) return [];

  const replies = [];
  let lastEvaluatedKey = null;

  do {
    const result = await dynamodb
      .query({
        TableName: TABLES.comments,
        IndexName: "publicationId-sortKey-index",
        KeyConditionExpression: "publicationId = :publicationId",
        ExpressionAttributeValues: {
          ":publicationId": publicationId,
          ":parentCommentId": parentCommentId,
        },
        FilterExpression: "parentCommentId = :parentCommentId",
        ExclusiveStartKey: lastEvaluatedKey || undefined,
      })
      .promise();

    replies.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey || null;
  } while (lastEvaluatedKey);

  return replies;
}

async function deleteCommentLikesByCommentIds(commentIds = []) {
  const uniqueCommentIds = [...new Set((commentIds || []).map(String).filter(Boolean))];
  if (!uniqueCommentIds.length) return;

  const likeEntries = await Promise.all(
    uniqueCommentIds.map(async (commentId) => {
      const result = await dynamodb
        .query({
          TableName: TABLES.commentLikes,
          KeyConditionExpression: "commentId = :commentId",
          ExpressionAttributeValues: {
            ":commentId": commentId,
          },
        })
        .promise();

      return (result.Items || []).map((item) => ({
        DeleteRequest: {
          Key: {
            commentId: item.commentId,
            userId: item.userId,
          },
        },
      }));
    })
  );

  const deleteRequests = likeEntries.flat();
  if (!deleteRequests.length) return;

  for (const chunk of chunkArray(deleteRequests, 25)) {
    await dynamodb
      .batchWrite({
        RequestItems: {
          [TABLES.commentLikes]: chunk,
        },
      })
      .promise();
  }
}

async function deleteCommentsByIds(commentIds = []) {
  const uniqueCommentIds = [...new Set((commentIds || []).map(String).filter(Boolean))];
  if (!uniqueCommentIds.length) return;

  const deleteRequests = uniqueCommentIds.map((commentId) => ({
    DeleteRequest: {
      Key: { id: commentId },
    },
  }));

  for (const chunk of chunkArray(deleteRequests, 25)) {
    await dynamodb
      .batchWrite({
        RequestItems: {
          [TABLES.comments]: chunk,
        },
      })
      .promise();
  }
}

async function syncPublicationCommentCount(interactionId) {
  const totalComments = await countTargetComments(interactionId);
  const target = unwrapInteractionTargetKey(interactionId);

  if (target.targetType === "publication" && target.sourceId) {
    await dynamodb
      .update({
        TableName: TABLES.publications,
        Key: { id: target.sourceId },
        UpdateExpression: "SET commentsCount = :commentsCount, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":commentsCount": totalComments,
          ":updatedAt": nowIso(),
        },
      })
      .promise();
  }

  return totalComments;
}

async function syncParentRepliesCount(publicationId, parentCommentId) {
  if (!publicationId || !parentCommentId) return 0;

  const remainingReplies = await listChildComments(publicationId, parentCommentId);

  await dynamodb
    .update({
      TableName: TABLES.comments,
      Key: { id: parentCommentId },
      UpdateExpression: "SET repliesCount = :repliesCount, updatedAt = :updatedAt",
      ConditionExpression: "attribute_exists(id)",
      ExpressionAttributeValues: {
        ":repliesCount": remainingReplies.length,
        ":updatedAt": nowIso(),
      },
    })
    .promise()
    .catch((error) => {
      if (error?.code !== "ConditionalCheckFailedException") {
        throw error;
      }
    });

  return remainingReplies.length;
}

function sanitizeUploadContentType(value) {
  return String(value || "image/jpeg").trim().toLowerCase();
}

function buildMediaUploadRequests(body = {}) {
  const candidateItems =
    (Array.isArray(body.items) && body.items) ||
    (Array.isArray(body.files) && body.files) ||
    (Array.isArray(body.media) && body.media) ||
    (Array.isArray(body.contentTypes) &&
      body.contentTypes.map((contentType) => ({ contentType }))) ||
    null;

  const normalizedItems = (candidateItems || [body])
    .map((item) => (typeof item === "string" ? { contentType: item } : item || {}))
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      contentType: sanitizeUploadContentType(item.contentType || body.contentType),
      fileName: item.fileName || item.name || null,
    }))
    .slice(0, 10);

  return normalizedItems.length ? normalizedItems : [{ contentType: "image/jpeg" }];
}

async function createMediaUploadDescriptor(viewerId, requestItem = {}) {
  const contentType = sanitizeUploadContentType(requestItem.contentType);
  const validPrefix =
    contentType.startsWith("image/") || contentType.startsWith("video/");

  if (!validPrefix) {
    throw new Error("FEED_INVALID_CONTENT_TYPE");
  }

  const mediaId = randomId("med");
  const extension =
    (requestItem.fileName && String(requestItem.fileName).match(/\.([a-z0-9]+)$/i)?.[1]) ||
    contentType.split("/")[1]?.split(";")[0] ||
    "bin";
  const key = `feed/${viewerId}/${mediaId}.${extension}`;
  const publicUrl = `https://${MEDIA_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  const accessUrl = s3.getSignedUrl("getObject", {
    Bucket: MEDIA_BUCKET,
    Key: key,
    Expires: 3600,
  });

  const uploadUrl = s3.getSignedUrl("putObject", {
    Bucket: MEDIA_BUCKET,
    Key: key,
    Expires: 900,
    ContentType: contentType,
  });

  const createdAt = nowIso();

  await dynamodb
    .put({
      TableName: TABLES.media,
      Item: {
        id: mediaId,
        ownerId: viewerId,
        contentType,
        s3Key: key,
        uploadUrlExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        publicUrl,
        visibility: "PUBLIC",
        status: "PENDING_UPLOAD",
        createdAt,
        updatedAt: createdAt,
      },
    })
    .promise();

  return {
    mediaId,
    bucket: MEDIA_BUCKET,
    key,
    contentType,
    fileName: requestItem.fileName || null,
    uploadUrl,
    accessUrl,
    isPublic: false,
    publicUrl,
  };
}

function publicationTypeOrDefault(type) {
  const allowed = new Set(["post", "event", "service", "story"]);
  const parsed = String(type || "post").toLowerCase();
  return allowed.has(parsed) ? parsed : "post";
}

function storyExpiresAtIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function isStoryActive(publication, nowMs = Date.now()) {
  if (!publication || publication.type !== "story" || publication.deletedAt) {
    return false;
  }
  const expiresAt = publication.expiresAt || publication.metadata?.expiresAt;
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) ? expiresMs > nowMs : true;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveStoryMedia(publication, viewerId = null) {
  const media = Array.isArray(publication?.media) ? publication.media : [];
  let first = media[0] || null;
  const firstUrl = first?.url || first?.accessUrl || first?.publicUrl || null;

  if (!firstUrl) {
    const mediaIds = [
      ...(Array.isArray(publication?.mediaIds) ? publication.mediaIds : []),
      ...media.map((item) => item?.mediaId || item?.id).filter(Boolean),
    ];
    const uniqueIds = [...new Set(mediaIds.map(String).filter(Boolean))].slice(0, 1);
    if (uniqueIds.length) {
      const mapped = await mapMediaByIds(uniqueIds, viewerId || publication?.authorId || null);
      if (mapped[0]) first = mapped[0];
    }
  }

  if (!first) {
    return { mediaUrl: null, mediaKind: publication?.mediaKind || "text" };
  }

  const contentType = String(
    first.contentType || first.kind || publication?.mediaKind || "",
  ).toLowerCase();
  const mediaKind =
    publication?.mediaKind
    || (contentType.includes("video") ? "video" : "image");
  const mediaUrl =
    resolvePublicationMediaUrl(first)
    || first.url
    || first.accessUrl
    || first.publicUrl
    || null;
  return {
    mediaUrl,
    mediaKind,
  };
}

function sortFeedItemsNewestFirst(items = []) {
  return [...items].sort((left, right) => {
    const rightTimestamp = resolvePublicationTimestamp(right, [
      right?.publishedAt,
      right?.createdAt,
    ]);
    const leftTimestamp = resolvePublicationTimestamp(left, [
      left?.publishedAt,
      left?.createdAt,
    ]);

    return String(rightTimestamp).localeCompare(String(leftTimestamp));
  });
}

function resolveFeedItemEventId(item) {
  if (!item) return null;
  if (item.eventId) return String(item.eventId);
  const repostOf = item.repostOf || null;
  if (repostOf?.eventId) return String(repostOf.eventId);
  if (repostOf?.targetType === "event" && repostOf?.targetId) {
    return String(repostOf.targetId);
  }
  if (item.type === "event" && item.id && !String(item.id).startsWith("pub_")) {
    return String(item.id);
  }
  if (item.sourcePublication) return resolveFeedItemEventId(item.sourcePublication);
  return null;
}

function resolveFeedItemServiceId(item) {
  if (!item) return null;
  const repostOf = item.repostOf || null;
  if (repostOf?.serviceId) return String(repostOf.serviceId);
  if (repostOf?.targetType === "service" && repostOf?.targetId) {
    return String(repostOf.targetId);
  }
  if (item.type === "service" && item.id && !String(item.id).startsWith("pub_")) {
    return String(item.id);
  }
  if (item.sourcePublication) return resolveFeedItemServiceId(item.sourcePublication);
  return null;
}

function resolveFeedItemVenueId(item) {
  if (!item) return null;
  const repostOf = item.repostOf || null;
  if (repostOf?.venueId) return String(repostOf.venueId);
  if (repostOf?.targetType === "venue" && repostOf?.targetId) {
    return String(repostOf.targetId);
  }
  if (item.type === "venue" && item.id && !String(item.id).startsWith("pub_")) {
    return String(item.id);
  }
  if (item.sourcePublication) return resolveFeedItemVenueId(item.sourcePublication);
  return null;
}

function isNativeSourceFeedItem(item, sourceType, sourceId) {
  return (
    item?.type === sourceType
    && String(item.id) === String(sourceId)
    && !item.isRepost
    && !String(item.id).startsWith("pub_")
  );
}

function dedupeHomeFeedItemsBySource(items = []) {
  const seenIds = new Set();
  const eventPrimary = new Map();
  const servicePrimary = new Map();
  const venuePrimary = new Map();
  const out = [];

  function tryMergeDuplicate(item, sourceId, sourceType, primaryMap) {
    if (!sourceId) return false;

    const existing = primaryMap.get(sourceId);
    if (!existing) {
      primaryMap.set(sourceId, item);
      return false;
    }

    const existingNative = isNativeSourceFeedItem(existing, sourceType, sourceId);
    const candidateNative = isNativeSourceFeedItem(item, sourceType, sourceId);
    let preferred = existing;
    if (candidateNative && !existingNative) preferred = item;
    if (preferred !== existing) {
      const idx = out.indexOf(existing);
      if (idx >= 0) out[idx] = preferred;
      primaryMap.set(sourceId, preferred);
    }
    seenIds.add(item.id);
    return true;
  }

  for (const item of items) {
    if (!item?.id || seenIds.has(item.id)) continue;

    const eventId = resolveFeedItemEventId(item);
    if (eventId && tryMergeDuplicate(item, eventId, "event", eventPrimary)) continue;

    const serviceId = resolveFeedItemServiceId(item);
    if (serviceId && tryMergeDuplicate(item, serviceId, "service", servicePrimary)) {
      continue;
    }

    const venueId = resolveFeedItemVenueId(item);
    if (venueId && tryMergeDuplicate(item, venueId, "venue", venuePrimary)) {
      continue;
    }

    seenIds.add(item.id);
    out.push(item);
  }

  return out;
}

/** @deprecated Usar dedupeHomeFeedItemsBySource */
function dedupeHomeFeedItemsByEvent(items = []) {
  return dedupeHomeFeedItemsBySource(items);
}

async function materializeTimelineItems(entries, viewerId) {
  const publicationIds = entries
    .filter((item) => item.sourceType === "publication")
    .map((item) => item.sourceId);
  const eventInteractionIds = entries
    .filter((item) => item.sourceType === "event")
    .map((item) => buildInteractionTargetKey("event", item.sourceId));
  const serviceInteractionIds = entries
    .filter((item) => item.sourceType === "service")
    .map((item) => buildInteractionTargetKey("service", item.sourceId));
  const venueInteractionIds = entries
    .filter((item) => item.sourceType === "venue")
    .map((item) => buildInteractionTargetKey("venue", item.sourceId));

  const publicationDataMap = new Map();

  if (publicationIds.length) {
    for (const chunk of chunkArray(publicationIds, 100)) {
      const batch = await dynamodb
        .batchGet({
          RequestItems: {
            [TABLES.publications]: {
              Keys: chunk.map((id) => ({ id })),
            },
          },
        })
        .promise();

      (batch.Responses?.[TABLES.publications] || []).forEach((publication) => {
        publicationDataMap.set(publication.id, publication);
      });
    }
  }

  const sourcePublicationIds = [
    ...new Set(
      [...publicationDataMap.values()]
        .map((publication) => publication?.repostOf?.publicationId)
        .filter(Boolean)
    ),
  ];

  const sourcePublicationMap = new Map();

  if (sourcePublicationIds.length) {
    for (const chunk of chunkArray(sourcePublicationIds, 100)) {
      const sourceBatch = await dynamodb
        .batchGet({
          RequestItems: {
            [TABLES.publications]: {
              Keys: chunk.map((id) => ({ id })),
            },
          },
        })
        .promise();

      (sourceBatch.Responses?.[TABLES.publications] || []).forEach(
        (publication) => {
          sourcePublicationMap.set(publication.id, publication);
        }
      );
    }
  }

  const publicationStateMap = await loadViewerStateByPublicationIds(
    [
      ...new Set([
        ...publicationIds,
        ...sourcePublicationIds,
        ...eventInteractionIds,
        ...serviceInteractionIds,
        ...venueInteractionIds,
      ]),
    ],
    viewerId
  );
  const externalInteractionStats = await loadInteractionStats(eventInteractionIds);
  const accessCache = {
    followers: new Map(),
    invitations: new Map(),
  };

  const authorCache = new Map();

  async function resolveAuthor(userId) {
    const key = String(userId || "none");
    if (!authorCache.has(key)) {
      authorCache.set(key, await getUserProfile(userId, viewerId));
    }
    return authorCache.get(key);
  }

  const feedItems = [];

  for (const entry of entries) {
    if (entry.sourceType === "publication") {
      const publication = publicationDataMap.get(entry.sourceId);
      if (!publication || publication.deletedAt) continue;
      // Las historias tienen endpoint propio; en el home feed solo van publicaciones normales.
      if (publication.type === "story") continue;

       const canAccessPublication = await canViewerAccessTarget(
        {
          targetType: "publication",
          sourceId: publication.id,
          item: publication,
        },
        viewerId,
        accessCache,
      );
      if (!canAccessPublication) continue;

      const author = await resolveAuthor(publication.authorId);
      const viewerState = publicationStateMap.get(publication.id) || {
        viewerId,
        liked: false,
        reposted: false,
      };

      let sourcePublication = null;
      const sourcePublicationId = publication?.repostOf?.publicationId;
      if (sourcePublicationId) {
        const source = sourcePublicationMap.get(sourcePublicationId);
        if (source && !source.deletedAt) {
          const canAccessSource = await canViewerAccessTarget(
            {
              targetType: "publication",
              sourceId: source.id,
              item: source,
            },
            viewerId,
            accessCache,
          );
          if (canAccessSource) {
            const sourceAuthor = await resolveAuthor(source.authorId);
            const sourceViewerState = publicationStateMap.get(sourcePublicationId) || {
              viewerId,
              liked: false,
              reposted: false,
            };
            sourcePublication = formatFeedPublication({
              publication: source,
              author: sourceAuthor,
              viewerState: sourceViewerState,
            });
          }
        }
      } else if (
        publication?.repostOf?.targetType === "event"
        && (publication?.repostOf?.eventId || publication?.repostOf?.targetId)
      ) {
        const sourceEventId =
          publication.repostOf.eventId || publication.repostOf.targetId;
        const sourceEvent = await getEventOrNull(sourceEventId);
        if (sourceEvent) {
          const canAccessSourceEvent = await canViewerAccessTarget(
            {
              targetType: "event",
              sourceId: sourceEventId,
              item: sourceEvent,
            },
            viewerId,
            accessCache,
          );

          if (canAccessSourceEvent) {
            const sourceEventInteractionId = buildInteractionTargetKey("event", sourceEventId);
            const [sourceEventImages, sourceStatsMap] = await Promise.all([
              loadEventImages(sourceEventId),
              loadInteractionStats([sourceEventInteractionId]),
            ]);
            const sourceStats = sourceStatsMap.get(sourceEventInteractionId) || {
              likes: safeNumber(sourceEvent.likesCount),
              comments: safeNumber(sourceEvent.commentsCount),
              reposts: safeNumber(sourceEvent.repostsCount),
            };

            sourcePublication = formatEventPublication({
              item: {
                ...sourceEvent,
                eventImages: sourceEventImages,
                imagenPrincipal: sourceEventImages[0] || null,
                imageUrl: sourceEventImages[0] || sourceEvent.imageUrl || null,
                imagen: sourceEventImages[0] || sourceEvent.imagen || null,
                likesCount: sourceStats.likes,
                commentsCount: sourceStats.comments,
                repostsCount: sourceStats.reposts,
              },
              viewerState:
                publicationStateMap.get(sourceEventInteractionId) ||
                { viewerId, liked: false, reposted: false },
            });
          }
        }
      } else if (
        publication?.repostOf?.targetType === "service"
        && (publication?.repostOf?.serviceId || publication?.repostOf?.targetId)
      ) {
        const sourceServiceId =
          publication.repostOf.serviceId || publication.repostOf.targetId;
        const sourceService = await getServiceOrNull(sourceServiceId);
        if (sourceService) {
          const sourceInteractionId = buildInteractionTargetKey("service", sourceServiceId);
          const sourceStats = externalInteractionStats.get(sourceInteractionId) || {
            likes: safeNumber(sourceService.likesCount || sourceService.likeCount),
            comments: safeNumber(sourceService.commentsCount),
            reposts: safeNumber(sourceService.repostsCount),
          };
          const sourceAuthor = await resolveAuthor(sourceService.userId);
          sourcePublication = isServiceProviderRecord(sourceService)
            ? formatServiceProviderPublication({
                item: {
                  ...sourceService,
                  likesCount: sourceStats.likes,
                  commentsCount: sourceStats.comments,
                  repostsCount: sourceStats.reposts,
                },
                author: sourceAuthor,
                viewerState: publicationStateMap.get(sourceInteractionId) || {
                  viewerId,
                  liked: false,
                  reposted: false,
                },
              })
            : formatServicePublication({
                item: {
                  ...sourceService,
                  likesCount: sourceStats.likes,
                  commentsCount: sourceStats.comments,
                  repostsCount: sourceStats.reposts,
                },
                viewerState: publicationStateMap.get(sourceInteractionId) || {
                  viewerId,
                  liked: false,
                  reposted: false,
                },
              });
        }
      } else if (
        publication?.repostOf?.targetType === "venue"
        && (publication?.repostOf?.venueId || publication?.repostOf?.targetId)
      ) {
        const sourceVenueId =
          publication.repostOf.venueId || publication.repostOf.targetId;
        const sourceVenue = await getVenueOrNull(sourceVenueId);
        if (sourceVenue && isVenueFeedCandidate(sourceVenue)) {
          const sourceInteractionId = buildInteractionTargetKey("venue", sourceVenueId);
          const sourceStats = externalInteractionStats.get(sourceInteractionId) || {
            likes: safeNumber(sourceVenue.likesCount || sourceVenue.likeCount),
            comments: safeNumber(sourceVenue.commentsCount),
            reposts: safeNumber(sourceVenue.repostsCount),
          };
          const sourceAuthor = await resolveAuthor(sourceVenue.ownerUserId);
          sourcePublication = formatVenuePublication({
            item: {
              ...sourceVenue,
              likesCount: sourceStats.likes,
              commentsCount: sourceStats.comments,
              repostsCount: sourceStats.reposts,
            },
            author: sourceAuthor,
            viewerState: publicationStateMap.get(sourceInteractionId) || {
              viewerId,
              liked: false,
              reposted: false,
            },
          });
        }
      }

      feedItems.push(
        formatFeedPublication({
          publication,
          author,
          viewerState,
          sourcePublication,
        })
      );
      continue;
    }

    if (entry.sourceType === "event") {
      const liveEvent = await getEventOrNull(entry.sourceId);
      if (!liveEvent || liveEvent.estatus === "DELETED") {
        await deleteTimelineEntry("event", entry.sourceId);
        continue;
      }

      const eventItem = { ...(entry.payload || {}), ...liveEvent };
      const _evtStatusRaw = String(eventItem.estatus || eventItem.status || "").trim().toLowerCase();
      const _feedActiveStatuses = new Set(["activo", "active", "en_ejecucion", "published", "publicado", "1", "ejecucion"]);
      if (!_feedActiveStatuses.has(_evtStatusRaw)) {
        await deleteTimelineEntry("event", entry.sourceId);
        continue;
      }

      const canAccessEvent = await canViewerAccessTarget(
        {
          targetType: "event",
          sourceId: entry.sourceId,
          item: eventItem,
        },
        viewerId,
        accessCache,
      );
      if (!canAccessEvent) continue;

      const interactionId = buildInteractionTargetKey("event", entry.sourceId);
      const stats = externalInteractionStats.get(interactionId) || {
        likes: safeNumber(eventItem.likesCount),
        comments: safeNumber(eventItem.commentsCount),
        reposts: safeNumber(eventItem.repostsCount),
      };

      const author = await resolveAuthor(eventItem.userId || eventItem.createdBy);

      feedItems.push(
        formatEventPublication({
          item: {
            ...eventItem,
            likesCount: stats.likes,
            commentsCount: stats.comments,
            repostsCount: stats.reposts,
          },
          author,
          viewerState:
            publicationStateMap.get(interactionId) ||
            { viewerId, liked: false, reposted: false },
        })
      );
      continue;
    }

    if (entry.sourceType === "service" && entry.payload) {
      if (!isServiceFeedRecord(entry.payload)) {
        continue;
      }

      const serviceId = entry.payload.serviceId || entry.sourceId;
      const liveService = await getServiceOrNull(serviceId);
      if (!liveService) {
        await deleteTimelineEntry("service", entry.sourceId);
        continue;
      }

      const serviceItem = { ...entry.payload, ...liveService };
      const interactionId = buildInteractionTargetKey("service", serviceId);
      const stats = externalInteractionStats.get(interactionId) || {
        likes: safeNumber(serviceItem.likesCount || serviceItem.likeCount),
        comments: safeNumber(serviceItem.commentsCount),
        reposts: safeNumber(serviceItem.repostsCount),
      };
      const author = isServiceProviderRecord(serviceItem)
        ? await resolveAuthor(serviceItem.userId)
        : null;

      feedItems.push(
        isServiceProviderRecord(serviceItem)
          ? formatServiceProviderPublication({
              item: {
                ...serviceItem,
                likesCount: stats.likes,
                commentsCount: stats.comments,
                repostsCount: stats.reposts,
              },
              author,
              viewerState:
                publicationStateMap.get(interactionId) ||
                { viewerId, liked: false, reposted: false },
            })
          : formatServicePublication({
              item: {
                ...serviceItem,
                likesCount: stats.likes,
                commentsCount: stats.comments,
                repostsCount: stats.reposts,
              },
              viewerState:
                publicationStateMap.get(interactionId) ||
                { viewerId, liked: false, reposted: false },
            })
      );
      continue;
    }

    if (entry.sourceType === "venue" && entry.payload) {
      const venueId =
        entry.payload.venue_id || entry.payload.venueId || entry.sourceId;
      const liveVenue = await getVenueOrNull(venueId);
      if (!liveVenue || !isVenueFeedCandidate(liveVenue)) {
        await deleteTimelineEntry("venue", entry.sourceId);
        continue;
      }

      const venueItem = { ...entry.payload, ...liveVenue };
      const interactionId = buildInteractionTargetKey("venue", venueId);
      const stats = externalInteractionStats.get(interactionId) || {
        likes: safeNumber(venueItem.likesCount || venueItem.likeCount),
        comments: safeNumber(venueItem.commentsCount),
        reposts: safeNumber(venueItem.repostsCount),
      };
      const author = await resolveAuthor(venueItem.ownerUserId);

      feedItems.push(
        formatVenuePublication({
          item: {
            ...venueItem,
            likesCount: stats.likes,
            commentsCount: stats.comments,
            repostsCount: stats.reposts,
          },
          author,
          viewerState:
            publicationStateMap.get(interactionId) ||
            { viewerId, liked: false, reposted: false },
        })
      );
      continue;
    }
  }

  return feedItems;
}

exports.getHomeFeed = async (event) => {
  try {
    const viewerId = resolveViewerId(event, null) || null;

    const limit = parseLimit(event.queryStringParameters, 20, 40);
    const includes = parseIncludes(event.queryStringParameters);
    const cursor = decodeCursor(event.queryStringParameters?.cursor || null);

    await syncExternalSourcesToTimeline({ maxItems: Math.max(80, limit * 3) });

    let suppressedTargets = new Set();
    try {
      suppressedTargets = await loadSuppressedFeedTargets(viewerId);
    } catch (prefErr) {
      console.warn(
        "loadSuppressedFeedTargets failed, continuing without filters",
        prefErr?.message || prefErr,
      );
    }

    const entries = [];
    const queryLimit = Math.max(limit * 3, limit);
    let lastEvaluatedKey = cursor || null;
    let finalLastEvaluatedKey = null;

    do {
      const queryParams = {
        TableName: TABLES.timeline,
        IndexName: "feedScope-sortKey-index",
        KeyConditionExpression: "feedScope = :scope",
        ExpressionAttributeValues: {
          ":scope": FEED_SCOPE_HOME_PUBLIC,
        },
        ScanIndexForward: false,
        Limit: queryLimit,
      };

      if (lastEvaluatedKey) {
        queryParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const batch = await dynamodb.query(queryParams).promise();
      finalLastEvaluatedKey = batch.LastEvaluatedKey || null;

      const filteredBatch = (batch.Items || []).filter((entry) => {
        if (entry.sourceType !== "publication" && entry.sourceType !== "event") {
          return true;
        }

        const targetKey = buildFeedPreferenceTargetKey(entry.sourceType, entry.sourceId);
        return !suppressedTargets.has(targetKey);
      });

      entries.push(...filteredBatch);
      lastEvaluatedKey = finalLastEvaluatedKey;
    } while (entries.length < queryLimit && lastEvaluatedKey);

    const feedItems = dedupeHomeFeedItemsBySource(
      sortFeedItemsNewestFirst(
        await materializeTimelineItems(entries, viewerId),
      ),
    );

    let finalItems = [...feedItems];

    if (includes.services) {
      const serviceCandidates = feedItems
        .filter((item) => item.type === "service")
        .slice(0, 12);
      if (serviceCandidates.length) {
        const section = buildServicesSection(serviceCandidates);
        if (finalItems.length >= 3) {
          finalItems.splice(3, 0, section);
        } else {
          finalItems.push(section);
        }
      }
    }

    finalItems = sortFeedItemsNewestFirst(finalItems).slice(0, limit);

    const nearbyHighlights = includes.nearby
      ? sortFeedItemsNewestFirst(
          feedItems.filter((item) => item.type === "event")
        )
          .slice(0, 6)
          .map((item) => ({
            id: item.id,
            title: item.title,
            publishedAt: item.publicationTimestamp || item.publishedAt || item.createdAt,
            schedule: item.dateLabel,
            location: item.locationLabel,
            imageUrl: item.media?.[0]?.url || null,
          }))
      : [];

    const payload = {
      items: finalItems,
      nearbyHighlights,
      nextCursor: encodeCursor(finalLastEvaluatedKey),
      hasMore: Boolean(finalLastEvaluatedKey),
      serverTime: nowIso(),
    };

    const etag = getFeedETag(payload);
    const ifNoneMatch =
      event?.headers?.["if-none-match"] || event?.headers?.["If-None-Match"];

    if (ifNoneMatch && ifNoneMatch === etag) {
      return {
        statusCode: 304,
        headers: {
          ETag: etag,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization,If-None-Match",
          "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
        },
        body: "",
      };
    }

    return response(200, payload, { ETag: etag });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(
        400,
        "FEED_INVALID_CURSOR",
        "Cursor inválido",
        null
      );
    }

    console.error("getHomeFeed error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "Error interno consultando el feed"
    );
  }
};

exports.createPublication = async (event) => {
  try {
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);
    if (!viewerId) {
      return errorResponse(
        401,
        "FEED_UNAUTHORIZED",
        "Debes estar autenticado para publicar"
      );
    }

    const clientRequestId = body.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      "createPublication",
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const visibility = normalizeVisibility(body.visibility);
    const type = publicationTypeOrDefault(body.type);

    const media = await resolveRequestedMedia(body, viewerId, []);
    const requestedMediaCount = getRequestedMediaCount(body);
    if (hasMediaPayload(body) && !media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_NOT_RESOLVED",
        "Se recibió media, pero no se pudo procesar ni asociar a la publicación"
      );
    }
    if (requestedMediaCount > media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_PARTIAL_RESOLUTION",
        `Se recibieron ${requestedMediaCount} archivos de media, pero solo se pudieron asociar ${media.length}`
      );
    }

    const description = String(body.description || "").trim();
    const mentions = await resolveMentionRecords({
      text: description,
      explicitMentions: body.mentions,
      viewerId,
    });
    const createdAt = nowIso();
    const isStory = type === "story";
    const publication = {
      id: randomId(isStory ? "story" : "pub"),
      type,
      authorId: viewerId,
      coAdminIds: [],
      title: String(body.title || "").trim(),
      description,
      media,
      mentions,
      visibility,
      isRepost: false,
      repostOf: null,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      sharesCount: 0,
      locationLabel: String(body.locationLabel || ""),
      dateLabel: String(body.dateLabel || ""),
      priceLabel: String(body.priceLabel || ""),
      latitude:
        body.latitude !== undefined && body.latitude !== null
          ? Number(body.latitude)
          : null,
      longitude:
        body.longitude !== undefined && body.longitude !== null
          ? Number(body.longitude)
          : null,
      createdAt,
      updatedAt: createdAt,
      ...(isStory
        ? {
            expiresAt: storyExpiresAtIso(),
            isLive: Boolean(body.isLive),
            mediaKind: String(body.mediaKind || (media.length ? "image" : "text")),
          }
        : {}),
    };

    await dynamodb
      .put({
        TableName: TABLES.publications,
        Item: {
          ...publication,
          sortKey: toSortKey(publication.createdAt, publication.id),
        },
      })
      .promise();

    if (!isStory) {
      await upsertTimelineEntry({
        sourceType: "publication",
        sourceId: publication.id,
        createdAt: publication.createdAt,
        payload: null,
        visibility,
      });
    }

    const author = await getUserProfile(viewerId, viewerId);
    const formatted = formatFeedPublication({
      publication,
      author,
      viewerState: {
        viewerId,
        liked: false,
        reposted: false,
      },
    });

    await notifyFollowersAboutPublication({ publication, author });
    await notifyMentionedUsers({
      mentionedUserIds: getUniqueMentionUserIds(mentions),
      actor: author,
      publicationId: publication.id,
      textPreview: description,
      contextType: "publication",
    });
    await notifyMentionedEventOwners({
      mentionEventIds: getUniqueMentionEventIds(mentions),
      actor: author,
      publicationId: publication.id,
      textPreview: description,
    });

    const payload = { publication: formatted };
    await saveIdempotentResult(idempotencyKey, 201, payload);
    return response(201, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "Body JSON inválido",
        null
      );
    }
    if (err.message === "INVALID_VISIBILITY") {
      return errorResponse(
        400,
        "FEED_INVALID_VISIBILITY",
        "visibility permitido: PUBLIC | PRIVATE"
      );
    }

    console.error("createPublication error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo crear la publicación"
    );
  }
};

exports.getPublication = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    const publication = await getPublicationOr404(publicationId);
    if (!publication || publication.deletedAt) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const canAccessPublication = await canViewerAccessTarget(
      {
        targetType: "publication",
        sourceId: publicationId,
        item: publication,
      },
      viewerId,
      {
        followers: new Map(),
      },
    );
    if (!canAccessPublication) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const stateMap = await loadViewerStateByPublicationIds(
      [publicationId],
      viewerId
    );
    const author = await getUserProfile(publication.authorId, viewerId);

    let sourcePublication = null;
    const sourcePublicationId = publication?.repostOf?.publicationId;
    if (sourcePublicationId) {
      const source = await getPublicationOr404(sourcePublicationId);
      if (source && !source.deletedAt) {
        const canAccessSource = await canViewerAccessTarget(
          {
            targetType: "publication",
            sourceId: sourcePublicationId,
            item: source,
          },
          viewerId,
          {
            followers: new Map(),
          },
        );
        if (canAccessSource) {
          const sourceStateMap = await loadViewerStateByPublicationIds(
            [sourcePublicationId],
            viewerId
          );
          const sourceAuthor = await getUserProfile(source.authorId, viewerId);
          sourcePublication = formatFeedPublication({
            publication: source,
            author: sourceAuthor,
            viewerState: sourceStateMap.get(sourcePublicationId) || {
              viewerId,
              liked: false,
              reposted: false,
            },
          });
        }
      }
    } else if (publication?.repostOf?.targetType === "event" && publication?.repostOf?.eventId) {
      const sourceEventId = publication.repostOf.eventId;
      const sourceEvent = await getEventOrNull(sourceEventId);
      if (sourceEvent) {
        const canAccessSourceEvent = await canViewerAccessTarget(
          {
            targetType: "event",
            sourceId: sourceEventId,
            item: sourceEvent,
          },
          viewerId,
          {
            followers: new Map(),
            invitations: new Map(),
          },
        );

        if (canAccessSourceEvent) {
          const sourceInteractionId = buildInteractionTargetKey("event", sourceEventId);
          const [sourceImages, sourceLikes, sourceComments, sourceReposts] = await Promise.all([
            loadEventImages(sourceEventId),
            countPublicationLikes(sourceInteractionId),
            countTargetComments(sourceInteractionId),
            countPublicationReposts(sourceInteractionId),
          ]);

          sourcePublication = formatEventPublication({
            item: {
              ...sourceEvent,
              eventImages: sourceImages,
              imagenPrincipal: sourceImages[0] || null,
              imageUrl: sourceImages[0] || sourceEvent.imageUrl || null,
              imagen: sourceImages[0] || sourceEvent.imagen || null,
              likesCount: sourceLikes,
              commentsCount: sourceComments,
              repostsCount: sourceReposts,
            },
            viewerState: {
              viewerId,
              liked: false,
              reposted: false,
            },
          });
        }
      }
    }

    return response(200, {
      publication: formatFeedPublication({
        publication,
        author,
        viewerState: stateMap.get(publicationId) || {
          viewerId,
          liked: false,
          reposted: false,
        },
        sourcePublication,
      }),
    });
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("getPublication error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo obtener la publicación"
    );
  }
};

exports.updatePublication = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    console.log("updatePublication", { publicationId, viewerId, bodyKeys: Object.keys(body || {}) });

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "publicationId es requerido"
      );
    }

    const publication = await getPublicationOr404(publicationId);
    if (!publication || publication.deletedAt) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    if (!canEditPublication(publication, viewerId)) {
      return errorResponse(403, "FEED_FORBIDDEN", "Sin permiso para editar");
    }

    const visibility = body.visibility
      ? normalizeVisibility(body.visibility)
      : publication.visibility;

    const mediaMutationRequested = hasMediaMutation(body);
    const mediaPayloadRequested = hasMediaPayload(body);
    const clearMediaRequested = shouldClearRequestedMedia(body);
    const replaceMediaRequested = shouldReplaceRequestedMedia(body);
    const removedMediaIds = extractRemovedMediaIds(body);

    const media = mediaMutationRequested
      ? await resolveRequestedMedia(body, viewerId, publication.media || [])
      : publication.media || [];
    const requestedMediaCount = getRequestedMediaCount(body);
    console.log("updatePublication media", { mediaMutationRequested, mediaPayloadRequested, requestedMediaCount, resolvedCount: media.length, clearMediaRequested });
    if (mediaPayloadRequested && !media.length && !clearMediaRequested) {
      return errorResponse(
        400,
        "FEED_MEDIA_NOT_RESOLVED",
        "Se recibió media, pero no se pudo procesar ni asociar a la publicación"
      );
    }
    if (requestedMediaCount > media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_PARTIAL_RESOLUTION",
        `Se recibieron ${requestedMediaCount} archivos de media, pero solo se pudieron asociar ${media.length}`
      );
    }

    if (
      mediaMutationRequested &&
      !mediaPayloadRequested &&
      !clearMediaRequested &&
      !removedMediaIds.length &&
      replaceMediaRequested
    ) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "Si usas replaceMedia sin nuevos archivos debes enviar clearMedia=true o al menos un mediaId"
      );
    }

    const nextDescription =
      body.description !== undefined
        ? String(body.description || "").trim()
        : publication.description;
    const nextMentions =
      body.description !== undefined || body.mentions !== undefined
        ? await resolveMentionRecords({
            text: nextDescription,
            explicitMentions: body.mentions,
            viewerId,
          })
        : publication.mentions || [];

    const updatedPublication = {
      ...publication,
      title:
        body.title !== undefined
          ? String(body.title || "").trim()
          : publication.title,
      description: nextDescription,
      mentions: nextMentions,
      locationLabel:
        body.locationLabel !== undefined
          ? String(body.locationLabel || "")
          : publication.locationLabel || "",
      dateLabel:
        body.dateLabel !== undefined
          ? String(body.dateLabel || "")
          : publication.dateLabel || "",
      priceLabel:
        body.priceLabel !== undefined
          ? String(body.priceLabel || "")
          : publication.priceLabel || "",
      visibility,
      media,
      updatedAt: nowIso(),
      ...(body.latitude !== undefined
        ? {
            latitude:
              body.latitude == null || body.latitude === ""
                ? null
                : Number(body.latitude),
          }
        : {}),
      ...(body.longitude !== undefined
        ? {
            longitude:
              body.longitude == null || body.longitude === ""
                ? null
                : Number(body.longitude),
          }
        : {}),
      ...(body.isLive !== undefined
        ? { isLive: Boolean(body.isLive) }
        : {}),
      ...(body.mediaKind !== undefined
        ? { mediaKind: String(body.mediaKind || publication.mediaKind || "video") }
        : {}),
    };

    await dynamodb
      .put({
        TableName: TABLES.publications,
        Item: updatedPublication,
      })
      .promise();

    // Delete S3 objects and FeedMedia records for removed media
    if (mediaMutationRequested) {
      const newMediaIds = new Set((media || []).map((m) => m.mediaId).filter(Boolean));
      const removedMedia = (publication.media || []).filter(
        (m) => m.mediaId && !newMediaIds.has(m.mediaId)
      );
      if (removedMedia.length) {
        await deleteMediaItems(removedMedia).catch((err) =>
          console.warn("deleteMediaItems partial failure", err.message)
        );
      }
    }

    await upsertTimelineEntry({
      sourceType: "publication",
      sourceId: publicationId,
      createdAt: updatedPublication.createdAt,
      payload: null,
      visibility,
    });

    const author = await getUserProfile(viewerId, viewerId);
    if (publication.visibility !== "PUBLIC" && updatedPublication.visibility === "PUBLIC") {
      await notifyFollowersAboutPublication({ publication: updatedPublication, author });
    }
    await notifyMentionedUsers({
      mentionedUserIds: getNewMentionUserIds(updatedPublication.mentions, publication.mentions),
      actor: author,
      publicationId,
      textPreview: updatedPublication.description,
      contextType: updatedPublication.isRepost ? "repost" : "publication",
    });
    await notifyMentionedEventOwners({
      mentionEventIds: getNewMentionEventIds(updatedPublication.mentions, publication.mentions),
      actor: author,
      publicationId,
      textPreview: updatedPublication.description,
    });

    return response(200, {
      publication: formatFeedPublication({
        publication: updatedPublication,
        author,
        viewerState: {
          viewerId,
          liked: false,
          reposted: false,
        },
      }),
    });
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }
    if (err.message === "INVALID_VISIBILITY") {
      return errorResponse(
        400,
        "FEED_INVALID_VISIBILITY",
        "visibility permitido: PUBLIC | PRIVATE"
      );
    }

    console.error("updatePublication error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo actualizar la publicación"
    );
  }
};

exports.deletePublication = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "publicationId es requerido"
      );
    }

    const publication = await getPublicationOr404(publicationId);
    if (!publication || publication.deletedAt) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    if (publication.authorId !== viewerId) {
      return errorResponse(403, "FEED_FORBIDDEN", "Sin permiso para eliminar");
    }

    // 1. Remove from timeline
    await deleteTimelineEntry("publication", publicationId);

    // 2. Delete publication likes
    const likesItems = await collectQueryItems({
      TableName: TABLES.publicationLikes,
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: { ":publicationId": publicationId },
    }).catch(() => []);
    if (likesItems.length) {
      for (const chunk of chunkArray(
        likesItems.map((item) => ({
          DeleteRequest: { Key: { publicationId: item.publicationId, userId: item.userId } },
        })),
        25
      )) {
        await dynamodb
          .batchWrite({ RequestItems: { [TABLES.publicationLikes]: chunk } })
          .promise();
      }
    }

    // 3. Delete reposts
    const repostItems = await collectQueryItems({
      TableName: TABLES.publicationReposts,
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: { ":publicationId": publicationId },
    }).catch(() => []);
    if (repostItems.length) {
      for (const chunk of chunkArray(
        repostItems.map((item) => ({
          DeleteRequest: { Key: { publicationId: item.publicationId, userId: item.userId } },
        })),
        25
      )) {
        await dynamodb
          .batchWrite({ RequestItems: { [TABLES.publicationReposts]: chunk } })
          .promise();
      }
    }

    // 4. Delete all comments and their likes
    const allComments = await listAllPublicationComments(publicationId).catch(() => []);
    if (allComments.length) {
      const commentIds = allComments.map((c) => c.id).filter(Boolean);
      await deleteCommentLikesByCommentIds(commentIds).catch((err) =>
        console.warn("deleteCommentLikes partial failure", err.message)
      );
      await deleteCommentsByIds(commentIds).catch((err) =>
        console.warn("deleteComments partial failure", err.message)
      );
    }

    // 5. Delete media from S3 and FeedMedia table
    const publicationMedia = publication.media || [];
    if (publicationMedia.length) {
      await deleteMediaItems(publicationMedia).catch((err) =>
        console.warn("deleteMediaItems partial failure", err.message)
      );
    }

    // 6. Hard-delete the publication
    await dynamodb
      .delete({
        TableName: TABLES.publications,
        Key: { id: publicationId },
      })
      .promise();

    return response(200, {
      publicationId,
      deleted: true,
    });
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("deletePublication error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo eliminar la publicación"
    );
  }
};

exports.createRepost = async (event) => {
  try {
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }

    const sourceTargetId = body.sourcePublicationId || body.sourceId || body.targetId;
    if (!sourceTargetId) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "sourcePublicationId es requerido"
      );
    }

    const sourceTarget = await resolveFeedTarget(sourceTargetId, viewerId, {
      followers: new Map(),
      invitations: new Map(),
    });

    if (!sourceTarget) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación o evento no existe"
      );
    }

    const source = sourceTarget.item;
    const sourceInteractionId = sourceTarget.interactionId;
    const isSourcePublication = sourceTarget.targetType === "publication";
    const isSourceEvent = sourceTarget.targetType === "event";
    const isSourceService = sourceTarget.targetType === "service";
    const isSourceVenue = sourceTarget.targetType === "venue";

    const visibility = normalizeVisibility(body.visibility);

    const clientRequestId = body.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      "createRepost",
      clientRequestId
    );
    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const existingRepost = await dynamodb
      .get({
        TableName: TABLES.publicationReposts,
        Key: {
          publicationId: sourceInteractionId,
          userId: viewerId,
        },
      })
      .promise();

    let previousRepostCount = 0;
    if (existingRepost.Item) {
      previousRepostCount = safeNumber(existingRepost.Item.repostCount, 1);

      if (previousRepostCount >= FEED_REPOST_MAX_PER_USER_PER_TARGET) {
        return errorResponse(
          429,
          "FEED_REPOST_LIMIT_REACHED",
          `Solo puedes republicar este contenido hasta ${FEED_REPOST_MAX_PER_USER_PER_TARGET} veces`,
        );
      }

      const lastRepostedAt =
        existingRepost.Item.lastRepostedAt
        || existingRepost.Item.createdAt
        || null;
      if (lastRepostedAt) {
        const elapsedMs = Date.now() - new Date(lastRepostedAt).getTime();
        if (elapsedMs < FEED_REPOST_COOLDOWN_MS) {
          const daysLeft = Math.max(
            1,
            Math.ceil((FEED_REPOST_COOLDOWN_MS - elapsedMs) / (24 * 60 * 60 * 1000)),
          );
          return errorResponse(
            429,
            "FEED_REPOST_COOLDOWN",
            `Debes esperar ${daysLeft} día(s) para volver a republicar este contenido`,
          );
        }
      }

      const oldRepostPublicationId = existingRepost.Item.repostPublicationId;
      if (oldRepostPublicationId) {
        await deleteTimelineEntry("publication", oldRepostPublicationId);
        await dynamodb
          .update({
            TableName: TABLES.publications,
            Key: { id: oldRepostPublicationId },
            UpdateExpression: "SET deletedAt = :deletedAt, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":deletedAt": nowIso(),
              ":updatedAt": nowIso(),
            },
          })
          .promise();
      }
    }

    const media = await resolveRequestedMedia(body, viewerId, []);
    const requestedMediaCount = getRequestedMediaCount(body);
    if (hasMediaPayload(body) && !media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_NOT_RESOLVED",
        "Se recibió media, pero no se pudo procesar ni asociar al repost"
      );
    }
    if (requestedMediaCount > media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_PARTIAL_RESOLUTION",
        `Se recibieron ${requestedMediaCount} archivos de media, pero solo se pudieron asociar ${media.length}`
      );
    }
    const description = String(body.opinion || "").trim();
    const sourceTitle = isSourceEvent
      ? String(source.nombre || source.title || "").trim()
      : isSourceService
        ? String(source.name || source.nombre || "").trim()
        : isSourceVenue
          ? String(source.name || source.venue_name || "").trim()
          : String(source.title || "").trim();
    const sourceDescription = isSourceEvent
      ? String(source.descripcion || source.description || "").trim()
      : String(source.description || source.descripcion || "").trim();
    const mentions = await resolveMentionRecords({
      text: description,
      explicitMentions: body.mentions,
      viewerId,
    });
    const createdAt = nowIso();

    const repostPublication = {
      id: randomId("pub"),
      type: isSourceEvent
        ? "event"
        : isSourceService
          ? "service"
          : isSourceVenue
            ? "venue"
            : source.type || "post",
      authorId: viewerId,
      coAdminIds: [],
      title: String(body.title || "").trim() || sourceTitle,
      description: description || sourceDescription,
      visibility,
      media,
      mentions,
      isRepost: true,
      repostOf: isSourcePublication
        ? { publicationId: sourceTarget.sourceId }
        : {
            targetType: sourceTarget.targetType,
            targetId: sourceTarget.sourceId,
            ...(isSourceEvent ? { eventId: sourceTarget.sourceId } : {}),
            ...(isSourceService ? { serviceId: sourceTarget.sourceId } : {}),
            ...(isSourceVenue ? { venueId: sourceTarget.sourceId } : {}),
          },
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
      sharesCount: 0,
      locationLabel:
        source.locationLabel
        || [source.city, source.department || source.address].filter(Boolean).join(" - ")
        || [source.ciudad, source.departamento].filter(Boolean).join(", "),
      dateLabel:
        source.dateLabel
        || [source.fechaIni, source.horaIni].filter(Boolean).join(" - "),
      priceLabel:
        source.priceLabel
        || (source.costoEvt ? String(source.costoEvt) : "")
        || (source.minPrice != null ? String(source.minPrice) : ""),
      createdAt,
      sortKey: toSortKey(createdAt, randomId("seq")),
      updatedAt: createdAt,
    };

    repostPublication.sortKey = toSortKey(createdAt, repostPublication.id);

    await dynamodb
      .put({
        TableName: TABLES.publications,
        Item: repostPublication,
      })
      .promise();

    await dynamodb
      .put({
        TableName: TABLES.publicationReposts,
        Item: {
          publicationId: sourceInteractionId,
          userId: viewerId,
          repostPublicationId: repostPublication.id,
          repostInteractionId: buildInteractionTargetKey("publication", repostPublication.id),
          createdAt: existingRepost.Item?.createdAt || createdAt,
          lastRepostedAt: createdAt,
          repostCount: previousRepostCount + 1,
        },
      })
      .promise();

    const updatedSource = isSourcePublication
      ? await dynamodb
          .update({
            TableName: TABLES.publications,
            Key: { id: sourceTarget.sourceId },
            UpdateExpression: "SET repostsCount = if_not_exists(repostsCount, :zero) + :inc",
            ExpressionAttributeValues: {
              ":inc": 1,
              ":zero": 0,
            },
            ReturnValues: "ALL_NEW",
          })
          .promise()
      : null;
    void updatedSource;

    await upsertTimelineEntry({
      sourceType: "publication",
      sourceId: repostPublication.id,
      createdAt: repostPublication.createdAt,
      payload: null,
      visibility,
    });

    const author = await getUserProfile(viewerId, viewerId);
    const sourceStateMap = await loadViewerStateByPublicationIds(
      [sourceInteractionId],
      viewerId
    );
    const sourceViewerState = {
      ...(sourceStateMap.get(sourceInteractionId) || {
        viewerId,
        liked: false,
        reposted: false,
      }),
      reposted: true,
    };

    const sourcePublicationPayload = await formatTargetAsFeedPublication(
      sourceTarget,
      viewerId,
      sourceViewerState,
    );

    const payload = {
      repostPublication: formatFeedPublication({
        publication: repostPublication,
        author,
        viewerState: {
          viewerId,
          liked: false,
          reposted: true,
        },
        sourcePublication: sourcePublicationPayload,
      }),
      sourcePublication: sourcePublicationPayload,
    };

    const sourceOwnerId = getFeedTargetOwnerId(sourceTarget);
    if (sourceOwnerId && sourceOwnerId !== viewerId) {
      const actor = await getUserProfile(viewerId, viewerId);
      await invokeNotification("FEED_TARGET_REPOSTED_OWNER", sourceOwnerId, {
        actorUserId: actor.id,
        actorName: actor.name || "Usuario",
        actorUsername: actor.username || null,
        repostPublicationId: repostPublication.id,
        repostText: truncateText(repostPublication.description, 140),
        type: "feed_target_reposted",
        ...buildTargetNotificationMetadata(sourceTarget),
      });
    }

    const repostActor = await getUserProfile(viewerId, viewerId);
    await notifyMentionedUsers({
      mentionedUserIds: getUniqueMentionUserIds(mentions),
      actor: repostActor,
      publicationId: repostPublication.id,
      textPreview: description,
      contextType: "repost",
    });
    await notifyMentionedEventOwners({
      mentionEventIds: getUniqueMentionEventIds(mentions),
      actor: repostActor,
      publicationId: repostPublication.id,
      textPreview: description,
    });

    await saveIdempotentResult(idempotencyKey, 201, payload);
    return response(201, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }
    if (err.message === "INVALID_VISIBILITY") {
      return errorResponse(
        400,
        "FEED_INVALID_VISIBILITY",
        "visibility permitido: PUBLIC | PRIVATE"
      );
    }

    console.error("createRepost error", err);
    return errorResponse(500, "FEED_INTERNAL_ERROR", "No se pudo repostear");
  }
};

exports.setPublicationLike = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const target = await resolveLikeTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const liked = parseLikedValue(body);
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `setPublicationLike:${publicationId}:${liked ? "1" : "0"}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const likeKey = {
      publicationId: target.interactionId,
      userId: viewerId,
    };

    let delta = 0;
    const existing = await dynamodb
      .get({
        TableName: TABLES.publicationLikes,
        Key: likeKey,
      })
      .promise();

    if (liked && !existing.Item) {
      await dynamodb
        .put({
          TableName: TABLES.publicationLikes,
          Item: {
            ...likeKey,
            createdAt: nowIso(),
          },
        })
        .promise();
      delta = 1;
    } else if (!liked && existing.Item) {
      await dynamodb
        .delete({
          TableName: TABLES.publicationLikes,
          Key: likeKey,
        })
        .promise();
      delta = -1;
    }

    let likesCount =
      target.targetType === "publication"
        ? safeNumber(target.item.likesCount)
        : await countPublicationLikes(target.interactionId);

    if (delta !== 0 && target.targetType === "publication") {
      const updated = await dynamodb
        .update({
          TableName: TABLES.publications,
          Key: { id: target.sourceId },
          UpdateExpression: "SET likesCount = if_not_exists(likesCount, :zero) + :delta",
          ExpressionAttributeValues: {
            ":delta": delta,
            ":zero": 0,
          },
          ReturnValues: "UPDATED_NEW",
        })
        .promise();
      likesCount = safeNumber(updated.Attributes?.likesCount);
    } else if (delta !== 0 && target.targetType === "event") {
      try {
        const updated = await dynamodb
          .update({
            TableName: TABLES.events,
            Key: { id: target.sourceId },
            UpdateExpression:
              "SET likesCount = if_not_exists(likesCount, :zero) + :delta",
            ExpressionAttributeValues: {
              ":delta": delta,
              ":zero": 0,
            },
            ReturnValues: "UPDATED_NEW",
          })
          .promise();
        likesCount = safeNumber(updated.Attributes?.likesCount);
      } catch (eventLikeErr) {
        console.warn("event likesCount update failed", eventLikeErr?.message);
        likesCount = await countPublicationLikes(target.interactionId);
      }
    } else if (delta !== 0 && target.targetType === "service") {
      if (isServiceProviderRecord(target.item)) {
        const updated = await extendedDynamodb
          .update({
            TableName: EXTENDED_TABLES.services,
            Key: { serviceId: target.sourceId },
            UpdateExpression: "SET likesCount = if_not_exists(likesCount, :zero) + :delta",
            ExpressionAttributeValues: {
              ":delta": delta,
              ":zero": 0,
            },
            ReturnValues: "UPDATED_NEW",
          })
          .promise();
        likesCount = safeNumber(updated.Attributes?.likesCount);
      } else {
        const updated = await dynamodb
          .update({
            TableName: TABLES.client,
            Key: { id: target.sourceId },
            UpdateExpression: "SET likesCount = if_not_exists(likesCount, :zero) + :delta",
            ExpressionAttributeValues: {
              ":delta": delta,
              ":zero": 0,
            },
            ReturnValues: "UPDATED_NEW",
          })
          .promise();
        likesCount = safeNumber(updated.Attributes?.likesCount);
      }
    } else if (delta !== 0 && target.targetType === "venue") {
      const updated = await extendedDynamodb
        .update({
          TableName: EXTENDED_TABLES.venues,
          Key: { venue_id: target.sourceId },
          UpdateExpression: "SET likeCount = if_not_exists(likeCount, :zero) + :delta",
          ExpressionAttributeValues: {
            ":delta": delta,
            ":zero": 0,
          },
          ReturnValues: "UPDATED_NEW",
        })
        .promise();
      likesCount = safeNumber(updated.Attributes?.likeCount);
    } else if (delta !== 0) {
      likesCount = await countPublicationLikes(target.interactionId);
    }

    const payload = {
      publicationId: target.sourceId,
      targetType: target.targetType,
      viewerState: { liked },
      stats: {
        likes: likesCount,
      },
    };

    if (
      liked
      && delta > 0
      && ["publication", "event", "service", "venue"].includes(target.targetType)
    ) {
      const ownerId = getFeedTargetOwnerId(target);
      if (ownerId && ownerId !== viewerId) {
        try {
          const actor = await getUserProfile(viewerId, viewerId);
          await invokeNotification("FEED_TARGET_LIKED_OWNER", ownerId, {
            actorUserId: actor.id,
            actorName: actor.name || "Usuario",
            actorUsername: actor.username || null,
            type: "feed_target_liked",
            ...buildTargetNotificationMetadata(target),
          });
        } catch (notifyErr) {
          console.warn("like notification skipped", notifyErr?.message || notifyErr);
        }
      }
    }

    await saveIdempotentResult(idempotencyKey, 200, payload);
    return response(200, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("setPublicationLike error", err);
    return errorResponse(500, "FEED_INTERNAL_ERROR", "No se pudo actualizar like");
  }
};

exports.listPublicationReposts = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const viewerId = resolveViewerId(event, null);
    const target = await resolveFeedTarget(publicationId, viewerId, {
      followers: new Map(),
      invitations: new Map(),
    });
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const limit = parseLimit(event.queryStringParameters, 20, 100);
    const offset = decodeOffsetCursor(event.queryStringParameters?.cursor || null);
    const repostRecords = await loadRepostRecordsForTarget(target.interactionId);
    const pageRecords = repostRecords.slice(offset, offset + limit);

    const items = await Promise.all(
      pageRecords.map(async (repostRecord) => {
        const profile = await getUserProfile(repostRecord.userId, viewerId);
        const resolvedRepost =
          repostRecord.repostPublicationId && repostRecord.repostInteractionId
            ? {
                repostPublicationId: repostRecord.repostPublicationId,
                repostInteractionId: repostRecord.repostInteractionId,
              }
            : await findRepostPublicationForUser({
                target,
                userId: repostRecord.userId,
              });

        return {
          id: profile.id,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          username: profile.username || null,
          role: profile.role || null,
          description: profile.description || "",
          repostedAt: repostRecord.createdAt || null,
          interactionId: target.interactionId,
          repostPublicationId: resolvedRepost?.repostPublicationId || null,
          repostInteractionId: resolvedRepost?.repostInteractionId || null,
        };
      })
    );

    const nextOffset = offset + pageRecords.length;

    return response(200, {
      publicationId: target.sourceId,
      targetType: target.targetType,
      interactionId: target.interactionId,
      items,
      total: repostRecords.length,
      hasMore: nextOffset < repostRecords.length,
      nextCursor: encodeOffsetCursor(nextOffset, repostRecords.length),
    });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(400, "FEED_INVALID_CURSOR", "Cursor inválido");
    }

    console.error("listPublicationReposts error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo consultar la lista de reposts"
    );
  }
};

exports.listUserPublications = async (event) => {
  try {
    const pathUserId = getPathParam(event, "userId");
    const viewerId = resolveViewerId(event, null);
    const userId = pathUserId || viewerId;

    if (!userId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }

    const limit = parseLimit(event.queryStringParameters, 20, 50);
    const offset = decodeOffsetCursor(event.queryStringParameters?.cursor || null);
    const allPublications = await loadUserPublications(userId);
    const canViewPrivate =
      (viewerId && viewerId === userId) ||
      (await isViewerFollowingUser(userId, viewerId, new Map()));
    const visiblePublications = allPublications
      .filter((item) => item && !item.deletedAt)
      .filter(
        (item) => canViewPrivate || !isPublicationPrivate(item)
      );

    const pagePublications = visiblePublications.slice(offset, offset + limit);
    const sourcePublicationIds = [
      ...new Set(
        pagePublications
          .map((publication) => publication?.repostOf?.publicationId)
          .filter(Boolean)
      ),
    ];
    const stateMap = await loadViewerStateByPublicationIds(
      [
        ...pagePublications.map((item) => item.id),
        ...sourcePublicationIds,
      ],
      viewerId
    );

    const sourcePublicationMap = new Map();
    if (sourcePublicationIds.length) {
      for (const chunk of chunkArray(sourcePublicationIds, 100)) {
        const batch = await dynamodb
          .batchGet({
            RequestItems: {
              [TABLES.publications]: {
                Keys: chunk.map((id) => ({ id })),
              },
            },
          })
          .promise();

        (batch.Responses?.[TABLES.publications] || []).forEach((publication) => {
          sourcePublicationMap.set(publication.id, publication);
        });
      }
    }

    const authorCache = new Map();
    async function resolveAuthor(userIdToResolve) {
      const key = String(userIdToResolve || "none");
      if (!authorCache.has(key)) {
        authorCache.set(key, await getUserProfile(userIdToResolve, viewerId));
      }
      return authorCache.get(key);
    }

    const items = await Promise.all(
      pagePublications.map(async (publication) => {
        const author = await resolveAuthor(publication.authorId);
        let sourcePublication = null;
        const sourcePublicationId = publication?.repostOf?.publicationId;

        if (sourcePublicationId) {
          const source = sourcePublicationMap.get(sourcePublicationId);
          if (source && !source.deletedAt) {
            const canAccessSource = await canViewerAccessTarget(
              {
                targetType: "publication",
                sourceId: sourcePublicationId,
                item: source,
              },
              viewerId,
              {
                followers: new Map(),
              },
            );

            if (canAccessSource) {
              const sourceAuthor = await resolveAuthor(source.authorId);
              sourcePublication = formatFeedPublication({
                publication: source,
                author: sourceAuthor,
                viewerState: stateMap.get(sourcePublicationId) || {
                  viewerId,
                  liked: false,
                  reposted: false,
                },
              });
            }
          }
        } else if (publication?.repostOf?.targetType === "event" && publication?.repostOf?.eventId) {
          const sourceEventId = publication.repostOf.eventId;
          const sourceEvent = await getEventOrNull(sourceEventId);
          if (sourceEvent) {
            const canAccessSourceEvent = await canViewerAccessTarget(
              {
                targetType: "event",
                sourceId: sourceEventId,
                item: sourceEvent,
              },
              viewerId,
              {
                followers: new Map(),
                invitations: new Map(),
              },
            );

            if (canAccessSourceEvent) {
              const sourceInteractionId = buildInteractionTargetKey("event", sourceEventId);
              const [sourceImages, sourceLikes, sourceComments, sourceReposts] = await Promise.all([
                loadEventImages(sourceEventId),
                countPublicationLikes(sourceInteractionId),
                countTargetComments(sourceInteractionId),
                countPublicationReposts(sourceInteractionId),
              ]);

              sourcePublication = formatEventPublication({
                item: {
                  ...sourceEvent,
                  eventImages: sourceImages,
                  imagenPrincipal: sourceImages[0] || null,
                  imageUrl: sourceImages[0] || sourceEvent.imageUrl || null,
                  imagen: sourceImages[0] || sourceEvent.imagen || null,
                  likesCount: sourceLikes,
                  commentsCount: sourceComments,
                  repostsCount: sourceReposts,
                },
                viewerState:
                  stateMap.get(sourceInteractionId) || {
                    viewerId,
                    liked: false,
                    reposted: false,
                  },
              });
            }
          }
        }

        return formatFeedPublication({
          publication,
          author,
          viewerState: stateMap.get(publication.id) || {
            viewerId,
            liked: false,
            reposted: false,
          },
          sourcePublication,
        });
      })
    );

    const nextOffset = offset + pagePublications.length;

    return response(200, {
      userId,
      items,
      total: visiblePublications.length,
      hasMore: nextOffset < visiblePublications.length,
      nextCursor: encodeOffsetCursor(nextOffset, visiblePublications.length),
    });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(400, "FEED_INVALID_CURSOR", "Cursor inválido");
    }

    console.error("listUserPublications error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudieron consultar las publicaciones del usuario"
    );
  }
};

exports.listPublicationLikes = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const limit = parseLimit(event.queryStringParameters, 20, 100);
    const offset = decodeOffsetCursor(event.queryStringParameters?.cursor || null);
    const viewerId = resolveViewerId(event, null);

    const target = await resolveLikeTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const likeRecords = await loadLikeRecordsForTarget(target.interactionId);
    const pageRecords = likeRecords.slice(offset, offset + limit);

    const items = await Promise.all(
      pageRecords.map(async (likeRecord) => {
        const profile = await getUserProfile(likeRecord.userId, viewerId);

        return {
          id: profile.id,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          username: profile.username || null,
          role: profile.role || null,
          description: profile.description || "",
          likedAt: likeRecord.createdAt || null,
          interactionId: target.interactionId,
        };
      })
    );

    const nextOffset = offset + pageRecords.length;

    return response(200, {
      publicationId: target.sourceId,
      targetType: target.targetType,
      interactionId: target.interactionId,
      items,
      total: likeRecords.length,
      hasMore: nextOffset < likeRecords.length,
      nextCursor: encodeOffsetCursor(nextOffset, likeRecords.length),
    });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(400, "FEED_INVALID_CURSOR", "Cursor inválido");
    }

    console.error("listPublicationLikes error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo consultar la lista de likes"
    );
  }
};

exports.listUserLikedItems = async (event) => {
  try {
    const pathUserId = getPathParam(event, "userId");
    const viewerId = resolveViewerId(event, null);
    const userId = pathUserId || viewerId;

    if (!userId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }

    const limit = parseLimit(event.queryStringParameters, 20, 50);
    const offset = decodeOffsetCursor(event.queryStringParameters?.cursor || null);
    const likeRecords = await loadLikeRecordsForUser(userId);
    const pageRecords = likeRecords.slice(offset, offset + limit);
    const interactionIds = [
      ...new Set(pageRecords.map((item) => item.publicationId).filter(Boolean)),
    ];
    const stateMap = await loadViewerStateByPublicationIds(interactionIds, userId);

    const items = [];
    for (const likeRecord of pageRecords) {
      const item = await materializeInteractionTarget(
        likeRecord.publicationId,
        userId,
        stateMap
      );

      if (!item) continue;

      item.viewerState = {
        ...(item.viewerState || {}),
        liked: true,
      };
      item.likedAt = likeRecord.createdAt || null;

      items.push(item);
    }

    const nextOffset = offset + pageRecords.length;

    return response(200, {
      userId,
      items,
      total: likeRecords.length,
      hasMore: nextOffset < likeRecords.length,
      nextCursor: encodeOffsetCursor(nextOffset, likeRecords.length),
    });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(400, "FEED_INVALID_CURSOR", "Cursor inválido");
    }

    console.error("listUserLikedItems error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo consultar los likes del usuario"
    );
  }
};

exports.searchFeedPublications = async (event) => {
  try {
    const viewerId = resolveViewerId(event, null);
    const rawSearchTerm =
      event.queryStringParameters?.q || event.queryStringParameters?.search || "";
    const isUsernameSearch = String(rawSearchTerm).trim().startsWith("@");
    const searchTerm = isUsernameSearch
      ? String(rawSearchTerm).trim().slice(1)
      : String(rawSearchTerm).trim();
    const normalizedSearchTerm = normalizeSearchValue(searchTerm);

    if (!normalizedSearchTerm) {
      return errorResponse(400, "FEED_BAD_REQUEST", "El término de búsqueda es obligatorio");
    }

    const limit = parseLimit(event.queryStringParameters, 20, 50);
    const offset = decodeOffsetCursor(event.queryStringParameters?.cursor || null);
    const matchedUserIds = new Set(
      await findMatchingUserIds(searchTerm, { usernameOnly: isUsernameSearch })
    );

    const publications = [];
    let lastEvaluatedKey = null;

    do {
      const result = await dynamodb
        .scan({
          TableName: TABLES.publications,
          ExclusiveStartKey: lastEvaluatedKey || undefined,
        })
        .promise();

      publications.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey || null;
    } while (lastEvaluatedKey);

    const candidatePublications = publications
      .filter((item) => item && !item.deletedAt)
      .filter((item) => {
        const matchesAuthor = matchedUserIds.has(item.authorId);

        if (isUsernameSearch) {
          return matchesAuthor;
        }

        return (
          matchesAuthor ||
          matchesPartialSearch(item.title, normalizedSearchTerm) ||
          matchesPartialSearch(item.description, normalizedSearchTerm) ||
          matchesPartialSearch(item.locationLabel, normalizedSearchTerm) ||
          matchesPartialSearch(item.dateLabel, normalizedSearchTerm)
        );
      });

    const followerAccessCache = new Map();
    const visiblePublications = [];
    for (const item of candidatePublications) {
      if (!isPublicationPrivate(item)) {
        visiblePublications.push(item);
        continue;
      }

      if (viewerId && viewerId === item.authorId) {
        visiblePublications.push(item);
        continue;
      }

      const canViewPrivate = await isViewerFollowingUser(
        item.authorId,
        viewerId,
        followerAccessCache,
      );
      if (canViewPrivate) {
        visiblePublications.push(item);
      }
    }

    const filteredPublications = visiblePublications
      .sort((left, right) =>
        String(
          resolvePublicationTimestamp(right, [right?.createdAt, right?.updatedAt])
        ).localeCompare(
          String(resolvePublicationTimestamp(left, [left?.createdAt, left?.updatedAt]))
        )
      );

    const pagePublications = filteredPublications.slice(offset, offset + limit);
    const stateMap = await loadViewerStateByPublicationIds(
      pagePublications.map((item) => item.id),
      viewerId
    );

    const items = await Promise.all(
      pagePublications.map(async (publication) => {
        const author = await getUserProfile(publication.authorId, viewerId);
        let sourcePublication = null;
        const sourcePublicationId = publication?.repostOf?.publicationId;

        if (sourcePublicationId) {
          const source = await getPublicationOr404(sourcePublicationId);
          if (source && !source.deletedAt) {
            const canAccessSource = await canViewerAccessTarget(
              {
                targetType: "publication",
                sourceId: sourcePublicationId,
                item: source,
              },
              viewerId,
              {
                followers: new Map(),
              },
            );

            if (canAccessSource) {
              const sourceAuthor = await getUserProfile(source.authorId, viewerId);
              sourcePublication = formatFeedPublication({
                publication: source,
                author: sourceAuthor,
                viewerState: stateMap.get(sourcePublicationId) || {
                  viewerId,
                  liked: false,
                  reposted: false,
                },
              });
            }
          }
        } else if (publication?.repostOf?.targetType === "event" && publication?.repostOf?.eventId) {
          const sourceEventId = publication.repostOf.eventId;
          const sourceEvent = await getEventOrNull(sourceEventId);
          if (sourceEvent) {
            const canAccessSourceEvent = await canViewerAccessTarget(
              {
                targetType: "event",
                sourceId: sourceEventId,
                item: sourceEvent,
              },
              viewerId,
              {
                followers: new Map(),
                invitations: new Map(),
              },
            );

            if (canAccessSourceEvent) {
              const sourceInteractionId = buildInteractionTargetKey("event", sourceEventId);
              const [sourceImages, sourceLikes, sourceComments, sourceReposts] = await Promise.all([
                loadEventImages(sourceEventId),
                countPublicationLikes(sourceInteractionId),
                countTargetComments(sourceInteractionId),
                countPublicationReposts(sourceInteractionId),
              ]);

              sourcePublication = formatEventPublication({
                item: {
                  ...sourceEvent,
                  eventImages: sourceImages,
                  imagenPrincipal: sourceImages[0] || null,
                  imageUrl: sourceImages[0] || sourceEvent.imageUrl || null,
                  imagen: sourceImages[0] || sourceEvent.imagen || null,
                  likesCount: sourceLikes,
                  commentsCount: sourceComments,
                  repostsCount: sourceReposts,
                },
                viewerState:
                  stateMap.get(sourceInteractionId) || {
                    viewerId,
                    liked: false,
                    reposted: false,
                  },
              });
            }
          }
        }

        return formatFeedPublication({
          publication,
          author,
          viewerState: stateMap.get(publication.id) || {
            viewerId,
            liked: false,
            reposted: false,
          },
          sourcePublication,
        });
      })
    );

    const nextOffset = offset + pagePublications.length;

    return response(200, {
      items,
      total: filteredPublications.length,
      searchTerm: searchTerm,
      mode: isUsernameSearch ? "user" : "keyword",
      hasMore: nextOffset < filteredPublications.length,
      nextCursor: encodeOffsetCursor(nextOffset, filteredPublications.length),
    });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(400, "FEED_INVALID_CURSOR", "Cursor inválido");
    }

    console.error("searchFeedPublications error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo ejecutar la búsqueda del feed"
    );
  }
};

exports.sharePublication = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    // El feed puede enviar IDs de publicación (pub_*) o IDs nativos de evento/lugar/servicio.
    const target = await resolveFeedTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const clientRequestId = body.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `sharePublication:${target.targetType}:${target.sourceId}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const webAppBase = String(
      process.env.WEB_APP_BASE_URL
      || String(FEED_PUBLIC_BASE_URL || "").replace(/\/p\/?$/, "")
      || "https://dev.doeventsapp.com"
    ).replace(/\/+$/, "");

    let shareUrl = `${FEED_PUBLIC_BASE_URL}/${encodeURIComponent(target.sourceId)}`;
    if (target.targetType === "event") {
      shareUrl = `${webAppBase}/events/${encodeURIComponent(target.sourceId)}`;
    } else if (target.targetType === "venue") {
      shareUrl = `${webAppBase}/places/${encodeURIComponent(target.sourceId)}`;
    } else if (target.targetType === "service") {
      shareUrl = `${webAppBase}/services/${encodeURIComponent(target.sourceId)}`;
    } else if (target.targetType === "publication") {
      shareUrl = `${FEED_PUBLIC_BASE_URL}/${encodeURIComponent(target.sourceId)}`;
    }

    await dynamodb
      .put({
        TableName: TABLES.shares,
        Item: {
          id: randomId("shr"),
          publicationId: target.sourceId,
          targetType: target.targetType,
          targetId: target.sourceId,
          userId: viewerId,
          channel: String(body.channel || "native"),
          createdAt: nowIso(),
        },
      })
      .promise();

    let sharesCount = 0;
    const incrExpr = {
      UpdateExpression: "SET sharesCount = if_not_exists(sharesCount, :zero) + :inc",
      ExpressionAttributeValues: {
        ":inc": 1,
        ":zero": 0,
      },
      ReturnValues: "ALL_NEW",
    };

    if (target.targetType === "publication") {
      const updated = await dynamodb
        .update({
          TableName: TABLES.publications,
          Key: { id: target.sourceId },
          ...incrExpr,
        })
        .promise();
      sharesCount = safeNumber(updated.Attributes?.sharesCount);
    } else if (target.targetType === "event") {
      const updated = await dynamodb
        .update({
          TableName: TABLES.events,
          Key: { id: target.sourceId },
          ...incrExpr,
        })
        .promise();
      sharesCount = safeNumber(updated.Attributes?.sharesCount);
    } else if (target.targetType === "service") {
      try {
        const updated = await extendedDynamodb
          .update({
            TableName: EXTENDED_TABLES.services,
            Key: { serviceId: target.sourceId },
            ...incrExpr,
          })
          .promise();
        sharesCount = safeNumber(updated.Attributes?.sharesCount);
      } catch (err) {
        console.warn("sharePublication service sharesCount update skipped", err?.message || err);
      }
    } else if (target.targetType === "venue") {
      try {
        const updated = await extendedDynamodb
          .update({
            TableName: EXTENDED_TABLES.venues,
            Key: { venue_id: target.sourceId },
            ...incrExpr,
          })
          .promise();
        sharesCount = safeNumber(updated.Attributes?.sharesCount);
      } catch (err) {
        console.warn("sharePublication venue sharesCount update skipped", err?.message || err);
      }
    }

    const payload = {
      publicationId: target.sourceId,
      targetType: target.targetType,
      stats: {
        shares: sharesCount,
      },
      shareUrl,
    };

    await saveIdempotentResult(idempotencyKey, 200, payload);
    return response(200, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("sharePublication error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo registrar el share"
    );
  }
};

exports.setPublicationHidden = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const target = await resolveFeedTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const hidden = parseToggleValue(body, ["hidden", "hide"]);
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `setPublicationHidden:${target.interactionId}:${hidden ? "1" : "0"}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const payload = await setViewerFeedPreference({
      viewerId,
      target,
      actionType: FEED_PREFERENCE_ACTION_HIDE,
      enabled: hidden,
    });

    const responsePayload = {
      publicationId: payload.publicationId,
      targetType: payload.targetType,
      viewerState: {
        hidden,
      },
    };

    await saveIdempotentResult(idempotencyKey, 200, responsePayload);
    return response(200, responsePayload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("setPublicationHidden error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo actualizar el estado de ocultar"
    );
  }
};

exports.setPublicationNotInterested = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const target = await resolveFeedTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const notInterested = parseToggleValue(body, ["notInterested", "not_interested"]);
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `setPublicationNotInterested:${target.interactionId}:${notInterested ? "1" : "0"}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const payload = await setViewerFeedPreference({
      viewerId,
      target,
      actionType: FEED_PREFERENCE_ACTION_NOT_INTERESTED,
      enabled: notInterested,
    });

    const responsePayload = {
      publicationId: payload.publicationId,
      targetType: payload.targetType,
      viewerState: {
        notInterested,
      },
    };

    await saveIdempotentResult(idempotencyKey, 200, responsePayload);
    return response(200, responsePayload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("setPublicationNotInterested error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo actualizar el estado de no me interesa"
    );
  }
};

exports.setPublicationSaved = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const target = await resolveFeedTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const saved = parseToggleValue(body, ["saved", "save", "bookmarked", "bookmark"]);
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `setPublicationSaved:${target.interactionId}:${saved ? "1" : "0"}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const payload = await setViewerFeedPreference({
      viewerId,
      target,
      actionType: FEED_PREFERENCE_ACTION_SAVE,
      enabled: saved,
    });

    const responsePayload = {
      publicationId: payload.publicationId,
      targetType: payload.targetType,
      viewerState: {
        saved,
      },
    };

    await saveIdempotentResult(idempotencyKey, 200, responsePayload);
    return response(200, responsePayload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("setPublicationSaved error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo actualizar el estado de guardado"
    );
  }
};

exports.reportPublication = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const publication = await getPublicationOr404(publicationId);
    if (!publication || publication.deletedAt) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const reason = String(body.reason || body.category || "").trim();
    if (!reason) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "reason es requerido"
      );
    }

    const details = String(body.details || body.description || "").trim();
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `reportPublication:${publicationId}:${reason.toLowerCase()}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const reportId = randomId("rep");
    await dynamodb
      .put({
        TableName: TABLES.reports,
        Item: {
          report_id: reportId,
          post_id: publicationId,
          client_id: viewerId,
          reason,
          details: details || null,
          source: "feed-publication",
          timestamp: nowIso(),
        },
      })
      .promise();

    const payload = {
      reportId,
      publicationId,
      reported: true,
    };

    await saveIdempotentResult(idempotencyKey, 201, payload);
    return response(201, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("reportPublication error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo reportar la publicación"
    );
  }
};

exports.listPublicationComments = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);
    const limit = parseLimit(event.queryStringParameters, 20, 50);
    const cursor = decodeCursor(event.queryStringParameters?.cursor || null);
    const parentCommentFilterRaw = event?.queryStringParameters?.parentCommentId;
    const hasParentFilter = parentCommentFilterRaw !== undefined;
    const target = await resolveFeedTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const query = {
      TableName: TABLES.comments,
      IndexName: "publicationId-sortKey-index",
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: {
        ":publicationId": target.interactionId,
      },
      ScanIndexForward: false,
      Limit: limit,
    };

    if (hasParentFilter) {
      if (parentCommentFilterRaw === "null" || parentCommentFilterRaw === "") {
        query.FilterExpression =
          "attribute_not_exists(parentCommentId) OR parentCommentId = :nullParent";
        query.ExpressionAttributeValues[":nullParent"] = null;
      } else {
        query.FilterExpression = "parentCommentId = :parentCommentId";
        query.ExpressionAttributeValues[":parentCommentId"] = String(
          parentCommentFilterRaw
        );
      }
    }

    if (cursor) {
      query.ExclusiveStartKey = cursor;
    }

    const result = await dynamodb.query(query).promise();
    const comments = result.Items || [];

    const likeStateSet = await loadCommentLikeState(
      comments.map((item) => item.id),
      viewerId
    );

    const authorCache = new Map();
    const items = [];

    for (const comment of comments) {
      const authorKey = String(comment.userId || "none");
      if (!authorCache.has(authorKey)) {
        authorCache.set(authorKey, await getUserProfile(comment.userId, viewerId));
      }
      const author = authorCache.get(authorKey);

      const commentMedia = comment.media?.length
        ? comment.media
        : await mapMediaByIds(comment.mediaIds || [], viewerId);
      const imageUrls = commentMedia
        .map((item) => resolvePublicationMediaUrl(item))
        .filter(Boolean);

      items.push({
        id: comment.id,
        publicationId: target.sourceId,
        targetType: target.targetType,
        parentCommentId: comment.parentCommentId || null,
        user: {
          id: author?.id || comment.userId,
          name: author?.name || "Usuario",
          avatarUrl: author?.avatarUrl || null,
        },
        text: comment.text,
        mentions: sanitizeMentions(comment.mentions || []),
        media: commentMedia,
        images: imageUrls,
        createdAt: comment.createdAt,
        stats: {
          likes: safeNumber(comment.likesCount),
          replies: safeNumber(comment.repliesCount),
        },
        viewerState: {
          liked: likeStateSet.has(comment.id),
        },
      });
    }

    return response(200, {
      items,
      nextCursor: encodeCursor(result.LastEvaluatedKey),
      hasMore: Boolean(result.LastEvaluatedKey),
      total:
        target.targetType === "publication"
          ? safeNumber(target.item?.commentsCount)
          : await countTargetComments(target.interactionId),
    });
  } catch (err) {
    if (err.message === "INVALID_CURSOR") {
      return errorResponse(400, "FEED_INVALID_CURSOR", "Cursor inválido");
    }
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("listPublicationComments error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudieron listar comentarios"
    );
  }
};

exports.createPublicationComment = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId es requerido");
    }

    const text = String(body.text || "").trim();
    const media = await resolveRequestedMedia(body, viewerId, []);
    const requestedMediaCount = getRequestedMediaCount(body);
    if (hasMediaPayload(body) && !media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_NOT_RESOLVED",
        "Se recibió media, pero no se pudo procesar"
      );
    }
    if (requestedMediaCount > media.length) {
      return errorResponse(
        400,
        "FEED_MEDIA_PARTIAL_RESOLUTION",
        `Se recibieron ${requestedMediaCount} archivos, pero solo se asociaron ${media.length}`
      );
    }
    if (!text && !media.length) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "El comentario debe incluir texto o una imagen"
      );
    }

    const target = await resolveFeedTarget(publicationId, viewerId);
    if (!target) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    const clientRequestId = body.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `comment:${target.interactionId}`,
      clientRequestId
    );
    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    let parentCommentId = body.parentCommentId || null;
    let parentComment = null;

    if (parentCommentId) {
      const parent = await dynamodb
        .get({
          TableName: TABLES.comments,
          Key: { id: parentCommentId },
        })
        .promise();

      if (!parent.Item || parent.Item.publicationId !== target.interactionId) {
        return errorResponse(
          404,
          "FEED_COMMENT_NOT_FOUND",
          "El comentario padre no existe"
        );
      }

      if (parent.Item.parentCommentId) {
        return errorResponse(
          400,
          "FEED_COMMENT_DEPTH_NOT_ALLOWED",
          "Solo se permite un nivel de respuesta"
        );
      }

      parentComment = parent.Item;
    }

    const mentions = await resolveMentionRecords({
      text,
      explicitMentions: body.mentions,
      viewerId,
    });
    const createdAt = nowIso();
    const comment = {
      id: randomId("com"),
      publicationId: target.interactionId,
      parentCommentId,
      userId: viewerId,
      text,
      mentions,
      mediaIds: media.map((item) => item.mediaId).filter(Boolean),
      media,
      likesCount: 0,
      repliesCount: 0,
      createdAt,
      updatedAt: createdAt,
      sortKey: toSortKey(createdAt, randomId("seq")),
    };

    await dynamodb
      .put({
        TableName: TABLES.comments,
        Item: comment,
      })
      .promise();

    if (parentCommentId) {
      await dynamodb
        .update({
          TableName: TABLES.comments,
          Key: { id: parentCommentId },
          UpdateExpression: "SET repliesCount = if_not_exists(repliesCount, :zero) + :inc",
          ExpressionAttributeValues: {
            ":inc": 1,
            ":zero": 0,
          },
        })
        .promise();
    }

    let totalComments = 0;
    if (target.targetType === "publication") {
      const publicationStats = await dynamodb
        .update({
          TableName: TABLES.publications,
          Key: { id: target.sourceId },
          UpdateExpression:
            "SET commentsCount = if_not_exists(commentsCount, :zero) + :inc",
          ExpressionAttributeValues: {
            ":inc": 1,
            ":zero": 0,
          },
          ReturnValues: "ALL_NEW",
        })
        .promise();

      totalComments = safeNumber(publicationStats.Attributes?.commentsCount);
    } else {
      totalComments = await countTargetComments(target.interactionId);
    }

    const payload = {
      comment: {
        id: comment.id,
        publicationId: target.sourceId,
        targetType: target.targetType,
        parentCommentId: comment.parentCommentId,
        text: comment.text,
        mentions,
        media: comment.media,
        images: (comment.media || [])
          .map((item) => resolvePublicationMediaUrl(item))
          .filter(Boolean),
        createdAt: comment.createdAt,
      },
      publicationStats: {
        comments: totalComments,
      },
    };

    if (target.targetType === "publication" || target.targetType === "event") {
      const actor = await getUserProfile(viewerId, viewerId);
      const ownerId = getFeedTargetOwnerId(target);
      const notificationTasks = [];

      if (ownerId && ownerId !== viewerId) {
        notificationTasks.push(
          invokeNotification("FEED_TARGET_COMMENTED_OWNER", ownerId, {
            actorUserId: actor.id,
            actorName: actor.name || "Usuario",
            actorUsername: actor.username || null,
            commentId: comment.id,
            commentText: truncateText(comment.text, 160),
            parentCommentId: parentCommentId || null,
            type: "feed_target_commented",
            ...buildTargetNotificationMetadata(target),
          })
        );
      }

      if (
        parentComment?.userId &&
        parentComment.userId !== viewerId &&
        parentComment.userId !== ownerId
      ) {
        notificationTasks.push(
          invokeNotification("FEED_COMMENT_REPLIED_OWNER", parentComment.userId, {
            actorUserId: actor.id,
            actorName: actor.name || "Usuario",
            actorUsername: actor.username || null,
            commentId: comment.id,
            parentCommentId: parentComment.id,
            commentText: truncateText(comment.text, 160),
            parentCommentText: truncateText(parentComment.text, 160),
            type: "feed_comment_replied",
            ...buildTargetNotificationMetadata(target),
          })
        );
      }

      notificationTasks.push(
        notifyMentionedUsers({
          mentionedUserIds: getUniqueMentionUserIds(mentions),
          actor,
          publicationId: target.sourceId,
          commentId: comment.id,
          textPreview: comment.text,
          contextType: "comment",
        }),
        notifyMentionedEventOwners({
          mentionEventIds: getUniqueMentionEventIds(mentions),
          actor,
          publicationId: target.sourceId,
          textPreview: comment.text,
        })
      );

      await Promise.all(notificationTasks);
    }

    await saveIdempotentResult(idempotencyKey, 201, payload);
    return response(201, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("createPublicationComment error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo crear el comentario"
    );
  }
};

exports.updateComment = async (event) => {
  try {
    const commentId = getPathParam(event, "commentId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!commentId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "commentId es requerido");
    }

    const text = String(body.text || "").trim();
    if (!text) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "El texto del comentario es obligatorio"
      );
    }

    const commentData = await dynamodb
      .get({
        TableName: TABLES.comments,
        Key: { id: commentId },
      })
      .promise();

    const comment = commentData.Item;
    if (!comment) {
      return errorResponse(
        404,
        "FEED_COMMENT_NOT_FOUND",
        "Comentario no encontrado"
      );
    }

    if (comment.userId !== viewerId) {
      return errorResponse(403, "FEED_FORBIDDEN", "Sin permiso para editar");
    }

    const mentions = await resolveMentionRecords({
      text,
      explicitMentions: body.mentions,
      viewerId,
    });

    await dynamodb
      .update({
        TableName: TABLES.comments,
        Key: { id: commentId },
        UpdateExpression: "SET #text = :text, mentions = :mentions, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#text": "text",
        },
        ExpressionAttributeValues: {
          ":text": text,
          ":mentions": mentions,
          ":updatedAt": nowIso(),
        },
      })
      .promise();

    const actor = await getUserProfile(viewerId, viewerId);
    await notifyMentionedUsers({
      mentionedUserIds: getNewMentionUserIds(mentions, comment.mentions),
      actor,
      publicationId:
        unwrapInteractionTargetKey(comment.publicationId).sourceId || comment.publicationId,
      commentId,
      textPreview: text,
      contextType: "comment",
    });
    await notifyMentionedEventOwners({
      mentionEventIds: getNewMentionEventIds(mentions, comment.mentions),
      actor,
      publicationId:
        unwrapInteractionTargetKey(comment.publicationId).sourceId || comment.publicationId,
      textPreview: text,
    });

    return response(200, {
      commentId,
      text,
      mentions,
      updated: true,
    });
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("updateComment error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo actualizar el comentario"
    );
  }
};

exports.reportComment = async (event) => {
  try {
    const commentId = getPathParam(event, "commentId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!commentId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "commentId es requerido");
    }

    const commentData = await dynamodb
      .get({
        TableName: TABLES.comments,
        Key: { id: commentId },
      })
      .promise();

    const comment = commentData.Item;
    if (!comment) {
      return errorResponse(
        404,
        "FEED_COMMENT_NOT_FOUND",
        "Comentario no encontrado"
      );
    }

    if (comment.userId === viewerId) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "No puedes reportar tu propio comentario"
      );
    }

    const reason = String(body.reason || body.category || "inappropriate").trim();
    const details = String(body.details || body.description || "").trim();
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `reportComment:${commentId}:${reason.toLowerCase()}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const reportId = randomId("rep");
    await dynamodb
      .put({
        TableName: TABLES.reports,
        Item: {
          report_id: reportId,
          post_id: commentId,
          comment_id: commentId,
          publication_id: comment.publicationId || null,
          client_id: viewerId,
          reason,
          details: details || null,
          source: "feed-comment",
          timestamp: nowIso(),
        },
      })
      .promise();

    const payload = {
      reportId,
      commentId,
      reported: true,
    };

    await saveIdempotentResult(idempotencyKey, 201, payload);
    return response(201, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("reportComment error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo reportar el comentario"
    );
  }
};

exports.deleteComment = async (event) => {
  try {
    const commentId = getPathParam(event, "commentId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!commentId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "commentId es requerido");
    }

    const commentData = await dynamodb
      .get({
        TableName: TABLES.comments,
        Key: { id: commentId },
      })
      .promise();

    const comment = commentData.Item;
    if (!comment) {
      return errorResponse(
        404,
        "FEED_COMMENT_NOT_FOUND",
        "Comentario no encontrado"
      );
    }

    if (comment.userId !== viewerId) {
      return errorResponse(403, "FEED_FORBIDDEN", "Sin permiso para eliminar");
    }

    const repliesToDelete = comment.parentCommentId
      ? []
      : await listChildComments(comment.publicationId, comment.id);

    const commentsToDelete = [comment, ...repliesToDelete];
    const deletedCommentIds = commentsToDelete.map((item) => item.id);

    await deleteCommentLikesByCommentIds(deletedCommentIds);
    await deleteCommentsByIds(deletedCommentIds);

    if (comment.parentCommentId) {
      await syncParentRepliesCount(comment.publicationId, comment.parentCommentId);
    }

    const totalComments = await syncPublicationCommentCount(comment.publicationId);

    return response(200, {
      commentId,
      deleted: true,
      deletedCommentIds,
      deletedRepliesCount: repliesToDelete.length,
      publicationStats: {
        comments: totalComments,
      },
    });
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("deleteComment error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo eliminar el comentario"
    );
  }
};

exports.setCommentLike = async (event) => {
  try {
    const commentId = getPathParam(event, "commentId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!commentId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "commentId es requerido");
    }

    const commentData = await dynamodb
      .get({
        TableName: TABLES.comments,
        Key: { id: commentId },
      })
      .promise();

    const comment = commentData.Item;
    if (!comment) {
      return errorResponse(
        404,
        "FEED_COMMENT_NOT_FOUND",
        "Comentario no encontrado"
      );
    }

    const liked = parseLikedValue(body);
    const clientRequestId = body?.clientRequestId || null;
    const idempotencyKey = buildIdempotencyKey(
      viewerId,
      `setCommentLike:${commentId}:${liked ? "1" : "0"}`,
      clientRequestId
    );

    const previous = await readIdempotentResult(idempotencyKey);
    if (previous) {
      return response(previous.statusCode, previous.payload);
    }

    const likeKey = {
      commentId,
      userId: viewerId,
    };

    const existing = await dynamodb
      .get({
        TableName: TABLES.commentLikes,
        Key: likeKey,
      })
      .promise();

    let delta = 0;
    if (liked && !existing.Item) {
      await dynamodb
        .put({
          TableName: TABLES.commentLikes,
          Item: {
            ...likeKey,
            createdAt: nowIso(),
          },
        })
        .promise();
      delta = 1;
    } else if (!liked && existing.Item) {
      await dynamodb
        .delete({
          TableName: TABLES.commentLikes,
          Key: likeKey,
        })
        .promise();
      delta = -1;
    }

    let likesCount = safeNumber(comment.likesCount);
    if (delta !== 0) {
      const updated = await dynamodb
        .update({
          TableName: TABLES.comments,
          Key: { id: commentId },
          UpdateExpression: "SET likesCount = if_not_exists(likesCount, :zero) + :delta",
          ExpressionAttributeValues: {
            ":delta": delta,
            ":zero": 0,
          },
          ReturnValues: "UPDATED_NEW",
        })
        .promise();
      likesCount = safeNumber(updated.Attributes?.likesCount);
    }

    const payload = {
      commentId,
      viewerState: {
        liked,
      },
      stats: {
        likes: likesCount,
      },
    };

    await saveIdempotentResult(idempotencyKey, 200, payload);
    return response(200, payload);
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }

    console.error("setCommentLike error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo actualizar el like del comentario"
    );
  }
};

exports.createMediaUploadUrl = async (event) => {
  try {
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);
    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }

    const uploadRequests = buildMediaUploadRequests(body);
    const uploadItems = await Promise.all(
      uploadRequests.map((requestItem) =>
        createMediaUploadDescriptor(viewerId, requestItem)
      )
    );

    if (uploadItems.length === 1 && !Array.isArray(body.items) && !Array.isArray(body.files) && !Array.isArray(body.media) && !Array.isArray(body.contentTypes)) {
      return response(200, uploadItems[0]);
    }

    return response(200, {
      items: uploadItems,
      count: uploadItems.length,
    });
  } catch (err) {
    if (err.message === "INVALID_JSON_BODY") {
      return errorResponse(400, "FEED_BAD_REQUEST", "Body JSON inválido");
    }
    if (err.message === "FEED_INVALID_CONTENT_TYPE") {
      return errorResponse(
        400,
        "FEED_INVALID_CONTENT_TYPE",
        "contentType inválido para media"
      );
    }

    console.error("createMediaUploadUrl error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo generar upload-url"
    );
  }
};

exports.getStories = async (event) => {
  try {
    const viewerId = resolveViewerId(event, null) || null;
    const authorId = event.queryStringParameters?.authorId || null;
    const limit = parseLimit(event.queryStringParameters, 20, 40);
    const radiusKm = Math.min(
      200,
      Math.max(5, Number(event.queryStringParameters?.radiusKm || 80))
    );
    const lat = event.queryStringParameters?.lat
      ? Number(event.queryStringParameters.lat)
      : null;
    const lng = event.queryStringParameters?.lng
      ? Number(event.queryStringParameters.lng)
      : null;

    const stories = [];
    let lastEvaluatedKey = null;

    do {
      const result = await dynamodb
        .scan({
          TableName: TABLES.publications,
          ExclusiveStartKey: lastEvaluatedKey || undefined,
          FilterExpression: "#type = :story",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: { ":story": "story" },
        })
        .promise();

      stories.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey || null;
    } while (lastEvaluatedKey && stories.length < 400);

    const nowMs = Date.now();
    const activeStories = stories
      .filter((item) => isStoryActive(item, nowMs))
      .filter((item) => (authorId ? userIdsMatch(item.authorId, authorId) : true))
      .filter((item) => {
        if (!viewerId || userIdsMatch(item.authorId, viewerId)) return true;
        if (!isPublicationPrivate(item)) return true;
        return false;
      })
      .filter((item) => {
        if (authorId || lat == null || lng == null) return true;
        const storyLat = item.latitude ?? item.metadata?.latitude;
        const storyLng = item.longitude ?? item.metadata?.longitude;
        if (storyLat == null || storyLng == null) return true;
        return haversineKm(lat, lng, Number(storyLat), Number(storyLng)) <= radiusKm;
      })
      .sort((left, right) =>
        String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
      );

    if (authorId) {
      const author = await getUserProfile(authorId, viewerId);
      const payloadItems = await Promise.all(
        activeStories.slice(0, limit).map(async (publication) => {
          const media = await resolveStoryMedia(publication, viewerId || authorId);
          return {
            id: publication.id,
            authorId,
            authorName: author?.name || "Usuario",
            authorAvatar: author?.avatarUrl || null,
            description: publication.description || "",
            mediaUrl: media.mediaUrl,
            mediaKind: publication.mediaKind || media.mediaKind,
            isLive: Boolean(publication.isLive),
            createdAt: publication.createdAt,
            expiresAt: publication.expiresAt || null,
            locationLabel: publication.locationLabel || "",
            mediaIds: [
              ...(Array.isArray(publication.mediaIds) ? publication.mediaIds : []),
              ...(Array.isArray(publication.media)
                ? publication.media.map((item) => item?.mediaId || item?.id).filter(Boolean)
                : []),
            ]
              .map(String)
              .filter((value, index, list) => list.indexOf(value) === index)
              .slice(0, 6),
            latitude: publication.latitude ?? publication.metadata?.latitude ?? null,
            longitude: publication.longitude ?? publication.metadata?.longitude ?? null,
            views: await countStoryViews(publication.id),
          };
        })
      );

      return response(200, {
        items: payloadItems,
        serverTime: nowIso(),
      });
    }

    const grouped = new Map();
    for (const publication of activeStories) {
      const key = publication.authorId;
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(publication);
    }

    const rings = [];
    for (const [userId, userStories] of grouped.entries()) {
      const author = await getUserProfile(userId, viewerId);
      const latest = userStories[0];
      const media = await resolveStoryMedia(latest, viewerId || userId);
      const authorLat = latest.latitude ?? latest.metadata?.latitude;
      const authorLng = latest.longitude ?? latest.metadata?.longitude;
      if (lat != null && lng != null && authorLat != null && authorLng != null) {
        const distance = haversineKm(lat, lng, Number(authorLat), Number(authorLng));
        if (distance > radiusKm) continue;
      }

      rings.push({
        id: userId,
        authorId: userId,
        name: (author?.name || "Usuario").split(" ")[0],
        avatarUrl: author?.avatarUrl || null,
        previewUrl: media.mediaUrl,
        live: userStories.some((story) => story.isLive),
        storyCount: userStories.length,
      });
    }

    rings.sort((left, right) => Number(right.live) - Number(left.live));

    return response(200, {
      items: rings.slice(0, limit),
      serverTime: nowIso(),
    });
  } catch (err) {
    console.error("getStories error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudieron cargar las historias"
    );
  }
};

exports.recordStoryView = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);
    if (!publicationId || !viewerId) {
      return errorResponse(400, "FEED_BAD_REQUEST", "publicationId y usuario son requeridos");
    }

    const publication = await getPublicationOr404(publicationId);
    if (!publication || publication.deletedAt || publication.type !== "story" || !isStoryActive(publication)) {
      return errorResponse(404, "FEED_STORY_NOT_FOUND", "La historia no existe o expiró");
    }
    if (userIdsMatch(publication.authorId, viewerId)) {
      return response(200, { views: await countStoryViews(publicationId) });
    }

    await dynamodb.put({
      TableName: TABLES.storyViews,
      Item: { publicationId, userId: viewerId, createdAt: nowIso() },
      ConditionExpression: "attribute_not_exists(publicationId) AND attribute_not_exists(userId)",
    }).promise().catch((err) => {
      if (err.code !== "ConditionalCheckFailedException") throw err;
    });
    return response(200, { views: await countStoryViews(publicationId) });
  } catch (err) {
    console.error("recordStoryView error", err);
    return errorResponse(500, "FEED_INTERNAL_ERROR", "No se pudo registrar la vista");
  }
};

exports.listStoryViewers = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const viewerId = resolveViewerId(event, null);
    const publication = publicationId ? await getPublicationOr404(publicationId) : null;
    if (!publication || publication.type !== "story") {
      return errorResponse(404, "FEED_STORY_NOT_FOUND", "La historia no existe");
    }
    if (!viewerId || !userIdsMatch(publication.authorId, viewerId)) {
      return errorResponse(403, "FEED_FORBIDDEN", "Solo el autor puede ver las visualizaciones");
    }
    const result = await dynamodb.query({
      TableName: TABLES.storyViews,
      KeyConditionExpression: "publicationId = :publicationId",
      ExpressionAttributeValues: { ":publicationId": publicationId },
      ScanIndexForward: false,
      Limit: parseLimit(event.queryStringParameters, 100, 200),
    }).promise();
    const viewers = await Promise.all((result.Items || []).map(async (item) => {
      const user = await getUserProfile(item.userId, viewerId);
      return {
        id: item.userId,
        name: user?.name || "Usuario",
        avatarUrl: user?.avatarUrl || null,
        viewedAt: item.createdAt,
      };
    }));
    return response(200, { viewers, count: result.Count || 0 });
  } catch (err) {
    console.error("listStoryViewers error", err);
    return errorResponse(500, "FEED_INTERNAL_ERROR", "No se pudieron cargar las visualizaciones");
  }
};

exports.assignPublicationCoAdmin = async (event) => {
  try {
    const publicationId = getPathParam(event, "publicationId");
    const body = parseBody(event);
    const viewerId = resolveViewerId(event, body);
    const coAdminUserId = String(
      body.coAdminUserId || body.targetUserId || ""
    ).trim();

    if (!viewerId) {
      return errorResponse(401, "FEED_UNAUTHORIZED", "No autenticado");
    }
    if (!publicationId || !coAdminUserId) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "publicationId y coAdminUserId son requeridos"
      );
    }
    if (viewerId === coAdminUserId) {
      return errorResponse(
        400,
        "FEED_BAD_REQUEST",
        "No puedes designarte a ti mismo como co-admin"
      );
    }

    const publication = await getPublicationOr404(publicationId);
    if (!publication || publication.deletedAt) {
      return errorResponse(
        404,
        "FEED_PUBLICATION_NOT_FOUND",
        "La publicación no existe"
      );
    }

    if (publication.authorId !== viewerId) {
      return errorResponse(
        403,
        "FEED_FORBIDDEN",
        "Solo el creador puede designar co-administradores"
      );
    }

    const coAdminIds = Array.isArray(publication.coAdminIds)
      ? [...publication.coAdminIds]
      : [];
    if (!coAdminIds.includes(coAdminUserId)) {
      coAdminIds.push(coAdminUserId);
    }

    const now = nowIso();
    await dynamodb
      .update({
        TableName: TABLES.publications,
        Key: { id: publicationId },
        UpdateExpression: "SET coAdminIds = :coAdminIds, updatedAt = :now",
        ExpressionAttributeValues: {
          ":coAdminIds": coAdminIds,
          ":now": now,
        },
      })
      .promise();

    const author = await getUserProfile(viewerId, viewerId);
    const assignedByName =
      [author?.name, author?.lastName].filter(Boolean).join(" ").trim() ||
      author?.username ||
      "Un usuario";
    const entityName =
      String(publication.title || "").trim() ||
      String(publication.description || "").slice(0, 60) ||
      "Publicación";

    await invokeNotification("CO_ADMIN_ASSIGNED", coAdminUserId, {
      entityType: "PUBLICATION",
      entityId: publicationId,
      entityName,
      assignedByUserId: viewerId,
      assignedByName,
    });

    return response(200, { success: true, coAdminIds });
  } catch (err) {
    console.error("assignPublicationCoAdmin error", err);
    return errorResponse(
      500,
      "FEED_INTERNAL_ERROR",
      "No se pudo asignar co-administrador"
    );
  }
};
