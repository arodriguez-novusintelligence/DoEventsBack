function pickSingleGroupIds(groupIds) {
  const ids = (groupIds || []).filter(Boolean);
  return ids.length ? [ids[0]] : [];
}

/**
 * Favoritos y grupos (Familiares, Amigos, Trabajo) son excluyentes.
 * Sin grupo = no favorito y sin groupIds.
 */
function normalizeContactCategory(input = {}) {
  const groupIds = pickSingleGroupIds(input.groupIds);
  const hasFavoriteFlag = input.isFavorite !== undefined && input.isFavorite !== null;

  if (hasFavoriteFlag && Boolean(input.isFavorite)) {
    return { isFavorite: true, groupIds: [] };
  }
  if (groupIds.length) {
    return { isFavorite: false, groupIds };
  }
  return { isFavorite: false, groupIds: [] };
}

function sanitizeStoredContact(item = {}) {
  if (item.isFavorite) {
    return { ...item, isFavorite: true, groupIds: [] };
  }
  return {
    ...item,
    isFavorite: false,
    groupIds: pickSingleGroupIds(item.groupIds),
  };
}

module.exports = {
  pickSingleGroupIds,
  normalizeContactCategory,
  sanitizeStoredContact,
};
