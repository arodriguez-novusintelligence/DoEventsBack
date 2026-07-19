const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function extractAuthenticatedUserId(event) {
  const claims =
    event?.requestContext?.authorizer?.jwt?.claims ||
    event?.requestContext?.authorizer?.claims;

  if (claims) {
    return (
      claims.userId ||
      claims.sub ||
      claims["cognito:username"] ||
      claims.username ||
      claims.id ||
      null
    );
  }

  const authHeader =
    event?.headers?.Authorization || event?.headers?.authorization || "";
  const bearerMatch = String(authHeader).match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch ? bearerMatch[1].trim() : String(authHeader || "").trim();
  if (!token) return null;

  if (JWT_SECRET) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return payload.userId || payload.sub || payload.id || null;
    } catch {
      return null;
    }
  }

  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64Payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64Payload, "base64").toString("utf8"));
    return payload.userId || payload.sub || payload.id || null;
  } catch {
    return null;
  }
}

function assertSelfOrForbidden(event, pathUserId) {
  const authUserId = extractAuthenticatedUserId(event);
  if (!authUserId) {
    const err = new Error("No autenticado");
    err.statusCode = 401;
    throw err;
  }
  if (authUserId !== pathUserId) {
    const err = new Error("Sin permiso para este usuario");
    err.statusCode = 403;
    throw err;
  }
  return authUserId;
}

module.exports = {
  extractAuthenticatedUserId,
  assertSelfOrForbidden,
};
