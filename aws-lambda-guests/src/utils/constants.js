// Predefined colors for groups
const GROUP_COLORS = [
  "#FF9AA2", // Pastel Pink
  "#FFB347", // Pastel Orange
  "#FDFD96", // Pastel Yellow
  "#77DD77", // Pastel Green
  "#AEC6CF", // Pastel Blue
  "#B19CD9", // Pastel Purple
  "#FFB6C1", // Light Pink
  "#98D8C8", // Pastel Teal
];

// Origin types for guests
const ORIGIN_TYPES = {
  REGISTERED: "REGISTERED",
  UNREGISTERED: "UNREGISTERED",
  IMPORTED: "IMPORTED",
};

// Error codes
const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  GUEST_NOT_FOUND: "GUEST_NOT_FOUND",
  GROUP_NOT_FOUND: "GROUP_NOT_FOUND",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  SERVER_ERROR: "SERVER_ERROR",
};

module.exports = {
  GROUP_COLORS,
  ORIGIN_TYPES,
  ERROR_CODES,
};
