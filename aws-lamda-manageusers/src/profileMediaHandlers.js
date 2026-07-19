const {
  dynamodb,
  s3,
  uuidv4,
  getProfileBucketKey,
  toPublicUrl,
  buildProfileImageS3Key,
  buildCoverImageS3Key,
  buildAvatarImageS3Key,
  getSignedUploadUrl,
  getSignedReadUrl,
  ensureClientExists,
  normalizeGalleryItem,
  resolveGallerySourceKey,
  copyObjectInProfileBucket,
} = require("./profileMediaUtils");
const { assertSelfOrForbidden } = require("./authUtils");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const estimateBytes = (value) =>
  Buffer.byteLength(JSON.stringify(value || {}), "utf8");

const MAX_PROFILE_GALLERY_BYTES = 350000;
const DEFAULT_UPLOAD_EXPIRES = 3600;

const parseBody = (event) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    const parseError = new Error("Body JSON invalido");
    parseError.statusCode = 400;
    throw parseError;
  }
};

exports.createProfileImagesUploadUrls = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    await ensureClientExists(userId);

    const files = Array.isArray(body.files) ? body.files : [];
    const expiresInSeconds = Number(
      body.expiresInSeconds || DEFAULT_UPLOAD_EXPIRES,
    );

    if (!files.length) {
      return jsonResponse(400, {
        error: "files is required and must be a non-empty array",
      });
    }

    const uploadEntries = await Promise.all(
      files.map(async (file) => {
        const imageId = file.imageId || uuidv4();
        const fileName = file.fileName || `${imageId}.jpg`;
        const contentType = file.contentType || "image/jpeg";

        const key = buildProfileImageS3Key({
          userId,
          imageId,
          fileName,
        });

        const uploadUrl = await getSignedUploadUrl({
          key,
          expiresInSeconds,
        });

        return {
          imageId,
          key,
          uploadUrl,
          publicUrl: toPublicUrl(key),
          signedUrl: getSignedReadUrl({ key }),
          method: "PUT",
          contentType,
        };
      }),
    );

    return jsonResponse(200, {
      userId,
      files: uploadEntries,
      expiresInSeconds,
    });
  } catch (error) {
    console.error("createProfileImagesUploadUrls error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.upsertProfileImages = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    const user = await ensureClientExists(userId);
    const images = Array.isArray(body.images) ? body.images : [];

    if (!images.length) {
      return jsonResponse(400, {
        error: "images is required and must be a non-empty array",
      });
    }

    const now = new Date().toISOString();
    const existingGallery = Array.isArray(user.profileGallery)
      ? user.profileGallery
      : [];

    const byId = new Map(existingGallery.map((img) => [img.imageId, img]));

    images.forEach((raw) => {
      const incoming = normalizeGalleryItem(raw);
      if (!incoming.key) {
        const validationError = new Error(
          "Cada imagen debe incluir key o una URL valida del bucket",
        );
        validationError.statusCode = 400;
        throw validationError;
      }

      const current = byId.get(incoming.imageId);

      const merged = {
        imageId: incoming.imageId,
        key: incoming.key || current?.key || "",
        url: incoming.url || current?.url || "",
        caption: raw.caption !== undefined ? raw.caption : current?.caption || "",
        createdAt: current?.createdAt || now,
        updatedAt: now,
      };

      if (!merged.url && merged.key) {
        merged.url = toPublicUrl(merged.key);
      }

      byId.set(merged.imageId, merged);
    });

    const profileGallery = [...byId.values()].sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );

    if (estimateBytes(profileGallery) > MAX_PROFILE_GALLERY_BYTES) {
      const sizeError = new Error(
        "La galeria es demasiado grande, reduce cantidad de imagenes o metadatos",
      );
      sizeError.statusCode = 413;
      throw sizeError;
    }

    await dynamodb
      .update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression: "SET profileGallery = :profileGallery, profileGalleryUpdatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":profileGallery": profileGallery,
          ":updatedAt": now,
        },
      })
      .promise();

    return jsonResponse(200, {
      message: "Imagenes de perfil actualizadas",
      userId,
      count: profileGallery.length,
      profileGallery: profileGallery.map((img) => ({
        ...img,
        publicUrl: toPublicUrl(img.key || img.url),
        url: getSignedReadUrl({ key: img.key || img.url }) || img.url,
        signedUrl: getSignedReadUrl({ key: img.key || img.url }),
      })),
    });
  } catch (error) {
    console.error("upsertProfileImages error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.listProfileImages = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    if (!userId) return jsonResponse(400, { error: "userId is required" });

    const user = await ensureClientExists(userId);
    const profileGallery = Array.isArray(user.profileGallery)
      ? user.profileGallery.map((img) => ({
          ...img,
          key: img.key || getProfileBucketKey(img.url) || "",
          publicUrl: toPublicUrl(img.key || img.url) || "",
          url:
            getSignedReadUrl({ key: img.key || img.url }) ||
            img.url ||
            toPublicUrl(img.key || "") ||
            "",
          signedUrl: getSignedReadUrl({ key: img.key || img.url }) || "",
        }))
      : [];

    return jsonResponse(200, {
      userId,
      count: profileGallery.length,
      profileGallery,
    });
  } catch (error) {
    console.error("listProfileImages error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.deleteProfileImage = async (event) => {
  try {
    const { userId, imageId } = event.pathParameters || {};
    if (!userId || !imageId) {
      return jsonResponse(400, { error: "userId and imageId are required" });
    }

    assertSelfOrForbidden(event, userId);

    const user = await ensureClientExists(userId);
    const profileGallery = Array.isArray(user.profileGallery)
      ? user.profileGallery
      : [];

    const existing = profileGallery.find((img) => img.imageId === imageId);
    if (!existing) {
      return jsonResponse(404, { error: "Imagen no encontrada" });
    }

    const updatedGallery = profileGallery.filter((img) => img.imageId !== imageId);
    const now = new Date().toISOString();

    await dynamodb
      .update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression: "SET profileGallery = :profileGallery, profileGalleryUpdatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":profileGallery": updatedGallery,
          ":updatedAt": now,
        },
      })
      .promise();

    const key = existing.key || getProfileBucketKey(existing.url);
    if (key) {
      await s3
        .deleteObject({
          Bucket: process.env.PROFILE_BUCKET || "doeventprofileimagesbucket",
          Key: key,
        })
        .promise();
    }

    return jsonResponse(200, {
      message: "Imagen eliminada",
      userId,
      imageId,
      count: updatedGallery.length,
    });
  } catch (error) {
    console.error("deleteProfileImage error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.createAvatarUploadUrl = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    await ensureClientExists(userId);

    const fileName = body.fileName || "avatar.jpg";
    const contentType = body.contentType || "image/jpeg";
    const expiresInSeconds = Number(
      body.expiresInSeconds || DEFAULT_UPLOAD_EXPIRES,
    );
    const key = buildAvatarImageS3Key({ userId, fileName });

    const uploadUrl = await getSignedUploadUrl({
      key,
      contentType,
      expiresInSeconds,
    });

    return jsonResponse(200, {
      userId,
      key,
      uploadUrl,
      publicUrl: toPublicUrl(key),
      signedUrl: getSignedReadUrl({ key }),
      method: "PUT",
      contentType,
      expiresInSeconds,
    });
  } catch (error) {
    console.error("createAvatarUploadUrl error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.upsertAvatarImage = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    await ensureClientExists(userId);

    let key = getProfileBucketKey(body.key || body.publicUrl || body.url);
    if (!key && (body.imageId || body.copyFromGallery)) {
      const sourceKey = await resolveGallerySourceKey(userId, body);
      if (!sourceKey) {
        return jsonResponse(404, { error: "Imagen de galería no encontrada" });
      }
      const destKey = buildAvatarImageS3Key({ userId, fileName: "avatar.jpg" });
      await copyObjectInProfileBucket({ sourceKey, destKey });
      key = destKey;
    }
    if (!key) {
      return jsonResponse(400, { error: "key, publicUrl/url o imageId es requerido" });
    }

    const now = new Date().toISOString();
    await dynamodb
      .update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression:
          "SET fotoPerfilUrl = :fotoPerfilUrl, fotoPerfilUpdatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":fotoPerfilUrl": key,
          ":updatedAt": now,
        },
      })
      .promise();

    const signedUrl = getSignedReadUrl({ key });
    return jsonResponse(200, {
      userId,
      fotoPerfilUrl: key,
      fotoPerfilSignedUrl: signedUrl,
      publicUrl: toPublicUrl(key),
      updatedAt: now,
    });
  } catch (error) {
    console.error("upsertAvatarImage error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.createCoverUploadUrl = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    await ensureClientExists(userId);

    const fileName = body.fileName || "cover.jpg";
    const contentType = body.contentType || "image/jpeg";
    const expiresInSeconds = Number(
      body.expiresInSeconds || DEFAULT_UPLOAD_EXPIRES,
    );
    const key = buildCoverImageS3Key({ userId, fileName });

    const uploadUrl = await getSignedUploadUrl({
      key,
      contentType,
      expiresInSeconds,
    });

    return jsonResponse(200, {
      userId,
      key,
      uploadUrl,
      publicUrl: toPublicUrl(key),
      method: "PUT",
      contentType,
      expiresInSeconds,
    });
  } catch (error) {
    console.error("createCoverUploadUrl error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.upsertCoverImage = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    await ensureClientExists(userId);

    let key = getProfileBucketKey(body.key || body.publicUrl || body.url);
    const url = body.publicUrl || body.url || (key ? toPublicUrl(key) : "");

    if (!key && (body.imageId || body.copyFromGallery)) {
      const sourceKey = await resolveGallerySourceKey(userId, body);
      if (!sourceKey) {
        return jsonResponse(404, { error: "Imagen de galería no encontrada" });
      }
      key = buildCoverImageS3Key({ userId, fileName: "cover.jpg" });
      await copyObjectInProfileBucket({ sourceKey, destKey: key });
    }

    if (!key && !url) {
      return jsonResponse(400, {
        error: "key or publicUrl/url is required",
      });
    }

    const now = new Date().toISOString();
    const profileCover = {
      key: key || "",
      url: url || "",
      updatedAt: now,
    };

    await dynamodb
      .update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression: "SET profileCover = :profileCover, coverImageUrl = :coverImageUrl",
        ExpressionAttributeValues: {
          ":profileCover": profileCover,
          ":coverImageUrl": profileCover.url,
        },
      })
      .promise();

    const signedUrl = getSignedReadUrl({ key: profileCover.key || profileCover.url });
    const publicUrl = toPublicUrl(profileCover.key || profileCover.url);

    return jsonResponse(200, {
      message: "Portada actualizada",
      userId,
      coverImageUrl: signedUrl || publicUrl || profileCover.url,
      coverImageSignedUrl: signedUrl,
      profileCover: {
        ...profileCover,
        publicUrl,
        url: signedUrl || publicUrl || profileCover.url,
        signedUrl,
      },
    });
  } catch (error) {
    console.error("upsertCoverImage error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.deleteCoverImage = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);

    const user = await ensureClientExists(userId);

    const coverKey =
      user.profileCover?.key ||
      getProfileBucketKey(user.profileCover?.url) ||
      getProfileBucketKey(user.coverImageUrl);

    await dynamodb
      .update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression: "REMOVE profileCover, coverImageUrl",
      })
      .promise();

    if (coverKey) {
      await s3
        .deleteObject({
          Bucket: process.env.PROFILE_BUCKET || "doeventprofileimagesbucket",
          Key: coverKey,
        })
        .promise();
    }

    return jsonResponse(200, {
      message: "Portada eliminada",
      userId,
    });
  } catch (error) {
    console.error("deleteCoverImage error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

const applyAvatarFromKey = async (userId, destKey) => {
  const now = new Date().toISOString();
  await dynamodb
    .update({
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: { id: userId },
      UpdateExpression:
        "SET fotoPerfilUrl = :fotoPerfilUrl, fotoPerfilUpdatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":fotoPerfilUrl": destKey,
        ":updatedAt": now,
      },
    })
    .promise();

  const signedUrl = getSignedReadUrl({ key: destKey });
  return {
    userId,
    fotoPerfilUrl: destKey,
    fotoPerfilSignedUrl: signedUrl,
    publicUrl: toPublicUrl(destKey),
    updatedAt: now,
  };
};

exports.setAvatarFromGallery = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);
    await ensureClientExists(userId);

    const sourceKey = await resolveGallerySourceKey(userId, body);
    if (!sourceKey) {
      return jsonResponse(404, { error: "Imagen de galería no encontrada" });
    }

    const destKey = buildAvatarImageS3Key({ userId, fileName: "avatar.jpg" });
    await copyObjectInProfileBucket({ sourceKey, destKey });

    const result = await applyAvatarFromKey(userId, destKey);
    return jsonResponse(200, result);
  } catch (error) {
    console.error("setAvatarFromGallery error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};

exports.setCoverFromGallery = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    const body = parseBody(event);

    if (!userId) return jsonResponse(400, { error: "userId is required" });

    assertSelfOrForbidden(event, userId);
    await ensureClientExists(userId);

    const sourceKey = await resolveGallerySourceKey(userId, body);
    if (!sourceKey) {
      return jsonResponse(404, { error: "Imagen de galería no encontrada" });
    }

    const destKey = buildCoverImageS3Key({ userId, fileName: "cover.jpg" });
    await copyObjectInProfileBucket({ sourceKey, destKey });

    const now = new Date().toISOString();
    const profileCover = {
      key: destKey,
      url: toPublicUrl(destKey) || "",
      updatedAt: now,
    };

    await dynamodb
      .update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression:
          "SET profileCover = :profileCover, coverImageUrl = :coverImageUrl",
        ExpressionAttributeValues: {
          ":profileCover": profileCover,
          ":coverImageUrl": profileCover.url,
        },
      })
      .promise();

    const signedUrl = getSignedReadUrl({ key: destKey });
    const publicUrl = toPublicUrl(destKey);

    return jsonResponse(200, {
      message: "Portada actualizada desde galería",
      userId,
      coverImageUrl: signedUrl || publicUrl || profileCover.url,
      coverImageSignedUrl: signedUrl,
      profileCover: {
        ...profileCover,
        publicUrl,
        url: signedUrl || publicUrl || profileCover.url,
        signedUrl,
      },
    });
  } catch (error) {
    console.error("setCoverFromGallery error", error);
    return jsonResponse(error.statusCode || 500, {
      error: error.message || "Internal server error",
    });
  }
};
