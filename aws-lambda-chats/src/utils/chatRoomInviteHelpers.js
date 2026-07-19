/**
 * Destinatario para notificar al organizador (admin o primer participante).
 */
function resolveAdminNotifyUserId(roomData, participantsList) {
  const admins = Array.isArray(roomData.adminId) ? roomData.adminId : [];
  if (admins.length > 0) return admins[0];
  if (Array.isArray(participantsList) && participantsList.length > 0) {
    return participantsList[0];
  }
  return null;
}

module.exports = { resolveAdminNotifyUserId };
