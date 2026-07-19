const AWS = require("aws-sdk");
const s3 = new AWS.S3();

/**
 * Determina si una URL de imagen necesita ser firmada o ya es una URL externa
 * @param {string} fotoPerfilUrl - La URL o clave S3 almacenada en la base de datos
 * @param {string|null} platform - Plataforma del usuario (si existe)
 * @returns {boolean} - true si necesita firma, false si es URL externa
 */
function needsS3Signing(fotoPerfilUrl, platform = null) {
  if (!fotoPerfilUrl) return false;

  const normalizedPlatform = String(platform || "")
    .trim()
    .toUpperCase();
  const hasPlatform = normalizedPlatform.length > 0;

  // Si tiene platform y la foto ya es URL completa, no firmar
  if (
    hasPlatform &&
    (fotoPerfilUrl.startsWith("http://") ||
      fotoPerfilUrl.startsWith("https://"))
  ) {
    return false;
  }

  // Si no tiene platform o tiene clave en S3, firmar
  return true;
}

/**
 * Genera una URL firmada de S3 o retorna la URL externa
 * @param {string} fotoPerfilUrl - La URL o clave S3 almacenada
 * @param {string|number|null} platformOrExpires - Plataforma o tiempo de expiración (compatibilidad)
 * @param {number} expiresIn - Tiempo de expiración en segundos (default: 3600 = 1 hora)
 * @returns {string|null} - URL firmada de S3 o URL externa, o null si no hay imagen
 */
function getProfileImageUrl(fotoPerfilUrl, platformOrExpires = null, expiresIn = 3600) {
  if (!fotoPerfilUrl) return null;

  let platform = platformOrExpires;
  let effectiveExpires = expiresIn;

  if (typeof platformOrExpires === "number") {
    platform = null;
    effectiveExpires = platformOrExpires;
  }

  if (!needsS3Signing(fotoPerfilUrl, platform)) {
    return fotoPerfilUrl;
  }

  try {
    const bucketName = "doeventprofileimagesbucket";
    const signedUrlParams = {
      Bucket: bucketName,
      Key: fotoPerfilUrl,
      Expires: effectiveExpires,
    };

    return s3.getSignedUrl("getObject", signedUrlParams);
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return fotoPerfilUrl;
  }
}

module.exports = {
  needsS3Signing,
  getProfileImageUrl,
};
