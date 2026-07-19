const crypto = require("crypto");
const { v4 } = require("uuid");
const { deleteFacebookUserByPlatformId } = require("./userDeletionUtils");

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function parseSignedRequest(signedRequest, secret) {
  if (!signedRequest || !secret) {
    throw new Error("signed_request o secret faltante");
  }
  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    throw new Error("signed_request inválido");
  }
  const [encodedSig, payload] = parts;
  const sig = base64UrlDecode(encodedSig);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    throw new Error("Firma signed_request inválida");
  }
  return JSON.parse(base64UrlDecode(payload).toString("utf8"));
}

function parseBody(event) {
  const raw = event.body || "";
  if (event.isBase64Encoded) {
    return Buffer.from(raw, "base64").toString("utf8");
  }
  return raw;
}

function getSignedRequest(event) {
  const contentType = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();
  const body = parseBody(event);
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new URLSearchParams(body).get("signed_request");
  }
  try {
    const json = JSON.parse(body || "{}");
    return json.signed_request || null;
  } catch {
    return null;
  }
}

exports.facebookDataDeletion = async (event) => {
  const method = (event.requestContext?.http?.method || event.httpMethod || "GET").toUpperCase();
  const statusBase =
    process.env.DATA_DELETION_STATUS_URL || "https://dev.doeventsapp.com/auth/data-deletion";

  if (method === "GET") {
    const code = event.queryStringParameters?.code || "";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: code
          ? `Solicitud procesada. Código: ${code}. Los datos asociados a Facebook se eliminaron de DoEvents.`
          : "Endpoint de estado de eliminación de datos DoEvents (Facebook).",
        confirmation_code: code || null,
      }),
    };
  }

  if (method !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Facebook App Secret no configurado" }),
    };
  }

  try {
    const signedRequest = getSignedRequest(event);
    const data = parseSignedRequest(signedRequest, secret);
    const facebookUserId = data.user_id;
    const confirmationCode = v4().replace(/-/g, "").substring(0, 16).toUpperCase();

    const deletionResult = await deleteFacebookUserByPlatformId(facebookUserId);

    console.log(
      JSON.stringify({
        event: "facebook_data_deletion_request",
        facebookUserId,
        confirmationCode,
        issuedAt: data.issued_at || null,
        deletionResult,
      }),
    );

    const statusUrl = `${statusBase}?code=${confirmationCode}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: statusUrl,
        confirmation_code: confirmationCode,
      }),
    };
  } catch (error) {
    console.error("facebookDataDeletion:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message || "Solicitud inválida" }),
    };
  }
};
