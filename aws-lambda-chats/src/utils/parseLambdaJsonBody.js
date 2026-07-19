/**
 * Cuerpo de Lambda API/WS: string JSON, objeto en body o campos en la raíz del evento.
 */
function parseLambdaJsonBody(event) {
  try {
    let raw = {};
    if (typeof event?.body === "string") {
      raw = JSON.parse(event.body || "{}");
    } else if (event?.body && typeof event.body === "object") {
      raw = event.body;
    }

    const merged =
      raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};

    for (const key of [
      "action",
      "roomId",
      "userId",
      "message",
      "id",
      "emoji",
      "newText",
      "deletedAt",
      "token",
      "purpose",
    ]) {
      if (merged[key] === undefined && event?.[key] !== undefined) {
        merged[key] = event[key];
      }
    }

    return merged;
  } catch {
    return {};
  }
}

module.exports = { parseLambdaJsonBody };
