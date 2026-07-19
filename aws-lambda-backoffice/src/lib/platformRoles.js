/**
 * Registro evolutivo de roles de plataforma.
 * Para añadir un rol futuro: agregar entrada aquí y desplegar backoffice.
 */
const PLATFORM_ROLES = {
  user: {
    id: 'user',
    label: 'Usuario',
    description: 'Usuario estándar de la aplicación',
    level: 0,
    canAccessAdmin: false,
    permissions: [],
  },
  operation: {
    id: 'operation',
    label: 'Operaciones',
    description: 'Gestión operativa de contenido y pagos',
    level: 10,
    canAccessAdmin: true,
    permissions: ['content.read', 'content.moderate', 'payments.read'],
  },
  support: {
    id: 'support',
    label: 'Soporte',
    description: 'Atención a usuarios y moderación',
    level: 20,
    canAccessAdmin: true,
    permissions: ['users.read', 'users.block', 'content.read', 'content.moderate'],
  },
  admin: {
    id: 'admin',
    label: 'Administrador',
    description: 'Acceso completo al backoffice',
    level: 100,
    canAccessAdmin: true,
    permissions: ['*'],
  },
};

function listPlatformRoles() {
  return Object.values(PLATFORM_ROLES).sort((a, b) => a.level - b.level);
}

function isValidPlatformRole(roleId) {
  return Boolean(PLATFORM_ROLES[String(roleId || '').toLowerCase()]);
}

function normalizePlatformRole(roleId) {
  const key = String(roleId || 'user').toLowerCase();
  return PLATFORM_ROLES[key] ? key : 'user';
}

module.exports = {
  PLATFORM_ROLES,
  listPlatformRoles,
  isValidPlatformRole,
  normalizePlatformRole,
};
