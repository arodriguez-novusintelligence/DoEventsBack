/**
 * Orígenes CORS compartidos (web local + Capacitor móvil).
 * Capacitor usa https://localhost (iOS/Android) y capacitor://localhost.
 */
const CAPACITOR_ORIGINS = [
  'https://localhost',
  'capacitor://localhost',
];

const LOCAL_WEB_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5001',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  ...CAPACITOR_ORIGINS,
];

const PRODUCTION_WEB_ORIGINS = [
  'https://dev.doeventsapp.com',
  'https://qa.doeventsapp.com',
  'https://doeventsapp.com',
  'https://www.doeventsapp.com',
  'https://doeventsapp-pre.com',
];

const DEFAULT_CORS_ORIGINS = [...LOCAL_WEB_ORIGINS, ...PRODUCTION_WEB_ORIGINS];

function parseOrigins(value) {
  if (!value) return [...DEFAULT_CORS_ORIGINS];
  return String(value)
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(requestOrigin, allowed = DEFAULT_CORS_ORIGINS) {
  const list = Array.isArray(allowed) ? allowed : parseOrigins(allowed);
  if (!requestOrigin) return list[0] || '*';
  if (list.includes('*')) return '*';
  return list.includes(requestOrigin) ? requestOrigin : list[0];
}

module.exports = {
  CAPACITOR_ORIGINS,
  LOCAL_WEB_ORIGINS,
  PRODUCTION_WEB_ORIGINS,
  DEFAULT_CORS_ORIGINS,
  parseOrigins,
  resolveAllowedOrigin,
};
