/**
 * Payload compatible con el cliente React Native (varias claves reconocibles).
 */
function buildPresenceBroadcast({
  userId,
  status,
  roomId,
  action = "statusConnection",
}) {
  const normalized = normalizePresenceStatus(status);
  return {
    channel: "status-connection",
    channelAlt: "statusConnection",
    channelSnake: "status_connection",
    action,
    actionAlt: "status-connection",
    actionPresence: "userPresence",
    userId,
    user_id: userId,
    status: normalized,
    userStatus: normalized,
    connectionStatus: normalized,
    roomId: roomId || undefined,
  };
}

function normalizePresenceStatus(s) {
  const v = String(s || "online").toLowerCase();
  if (v === "connected" || v === "active") return "online";
  if (v === "disconnected" || v === "inactive") return "offline";
  if (v === "online" || v === "offline") return v;
  return v;
}

module.exports = { buildPresenceBroadcast, normalizePresenceStatus };
