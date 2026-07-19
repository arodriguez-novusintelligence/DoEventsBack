function rowLabelFromIndex(index) {
  let label = "";
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function generateSeatGrid(rows, seatsPerRow, categoryId, disabledCodes = []) {
  const disabled = new Set(disabledCodes || []);
  const seats = [];
  for (let r = 0; r < rows; r += 1) {
    const rowLabel = rowLabelFromIndex(r);
    for (let c = 1; c <= seatsPerRow; c += 1) {
      const seatCode = `${rowLabel}${c}`;
      seats.push({
        seatId: `${categoryId}__${seatCode}`,
        rowLabel,
        colNumber: c,
        seatCode,
        seatType: "standard",
        status: disabled.has(seatCode) ? "occupied" : "available",
        isAccessible: false,
      });
    }
  }
  return seats;
}

/**
 * Si el frontend envía seats vacío pero rows/seatsPerRow > 0, genera la grilla en backend.
 * seats === undefined mantiene los asientos existentes (sin cambios).
 */
function resolveCategorySeats(categoryData, categoryId) {
  if (categoryData.seats === undefined) return undefined;
  if (Array.isArray(categoryData.seats) && categoryData.seats.length > 0) {
    return categoryData.seats;
  }
  const rows = Number(categoryData.rows) || 0;
  const seatsPerRow = Number(categoryData.seatsPerRow) || 0;
  if (rows > 0 && seatsPerRow > 0) {
    const disabled = categoryData.disabledSeats || [];
    return generateSeatGrid(rows, seatsPerRow, categoryId, disabled);
  }
  return categoryData.seats || [];
}

function normalizeDisabledSeats(disabled) {
  if (!Array.isArray(disabled)) return [];
  return [...disabled].map(String).sort();
}

/**
 * Cuando el frontend envía grilla (rows/seatsPerRow) sin lista de asientos,
 * omitir reescritura masiva si la grilla no cambió respecto a la categoría guardada.
 */
function shouldSkipGridSeatSync(existingCategory, categoryData) {
  if (!existingCategory) return false;

  const rows = Number(categoryData.rows) || 0;
  const seatsPerRow = Number(categoryData.seatsPerRow) || 0;
  if (rows <= 0 || seatsPerRow <= 0) return false;

  const seatsArray = categoryData.seats;
  const isGridReferencePayload =
    seatsArray === undefined
    || (Array.isArray(seatsArray) && seatsArray.length === 0);
  if (!isGridReferencePayload) return false;

  const existingRows = Number(existingCategory.rows) || 0;
  const existingSeatsPerRow = Number(existingCategory.seatsPerRow) || 0;
  if (existingRows !== rows || existingSeatsPerRow !== seatsPerRow) return false;

  const incomingDisabled = normalizeDisabledSeats(categoryData.disabledSeats);
  const existingDisabled = normalizeDisabledSeats(existingCategory.disabledSeats);
  return JSON.stringify(incomingDisabled) === JSON.stringify(existingDisabled);
}

module.exports = {
  rowLabelFromIndex,
  generateSeatGrid,
  resolveCategorySeats,
  normalizeDisabledSeats,
  shouldSkipGridSeatSync,
  pickLabelLayoutFields,
};

/** Offset/rotación del título de categoría o elemento en el canvas. */
function pickLabelLayoutFields(source = {}, fallback = {}) {
  const readNum = (...keys) => {
    for (const key of keys) {
      const fromSource = source[key];
      if (typeof fromSource === "number" && Number.isFinite(fromSource)) {
        return fromSource;
      }
    }
    for (const key of keys) {
      const fromFallback = fallback[key];
      if (typeof fromFallback === "number" && Number.isFinite(fromFallback)) {
        return fromFallback;
      }
    }
    return 0;
  };

  return {
    labelDx: readNum("labelDx", "label_dx"),
    labelDy: readNum("labelDy", "label_dy"),
    labelRotation: readNum("labelRotation", "label_rotation"),
  };
}
