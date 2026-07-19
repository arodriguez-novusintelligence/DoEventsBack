# AWS Lambda - Guest Management System

Esta lambda proporciona un sistema completo de gestión de invitados, grupos favoritos y **sistema de invitaciones a eventos** con notificaciones multicanal.

## ✨ Nuevas Funcionalidades

### 🎉 Sistema de Invitaciones a Eventos

Sistema completo para enviar invitaciones masivas con soporte para:

- ✅ Usuarios individuales y grupos
- ✅ Notificaciones multicanal (Email, Push, WhatsApp, In-App)
- ✅ Gestión de estados (pending, accepted, rejected, expired)
- ✅ Estadísticas en tiempo real

**📚 Documentación completa:**

- [EVENT_INVITATIONS_GUIDE.md](./EVENT_INVITATIONS_GUIDE.md) - Guía detallada de uso
- [INVITATIONS_SUMMARY.md](./INVITATIONS_SUMMARY.md) - Resumen ejecutivo

## 🚀 Despliegue

### Prerrequisitos

- Node.js 18+
- AWS CLI configurado
- Serverless Framework

### Instalación y Despliegue

```bash
# Instalar dependencias
npm install

# Desplegar a desarrollo
npm run deploy-dev

# Desplegar a producción
npm run deploy-prod
```

## 📊 Esquema de Base de Datos

### Tabla Guest

- **PK**: `EVENT#{eventId}`
- **SK**: `GUEST#{guestId}`
- **Índices GSI**:
  - GSI1: Búsqueda por teléfono
  - GSI2: Búsqueda por email
  - GSI3: Búsqueda por clientId
  - GSI4: Filtrado por favoritos

### Tabla Group

- **PK**: `EVENT#{eventId}`
- **SK**: `GROUP#{groupId}`
- **Índice GSI**:
  - GSI1: Ordenamiento de grupos

### Tabla EventInvitations (Nueva)

- **PK**: `EVENT#{eventId}`
- **SK**: `USER#{userId}#{invitationId}`
- **Índices GSI**:
  - UserIdIndex: Buscar por userId
  - EventIdIndex: Buscar por eventId

## 🔗 Endpoints

### Invitaciones a Eventos (NUEVO)

| Método | Endpoint                                       | Descripción                 |
| ------ | ---------------------------------------------- | --------------------------- |
| POST   | `/events/{eventId}/invitations`                | Enviar invitaciones masivas |
| GET    | `/events/{eventId}/invitations`                | Listar invitaciones         |
| PUT    | `/events/{eventId}/invitations/{invitationId}` | Actualizar estado           |

### Invitados

| Método | Endpoint                                      | Descripción                 |
| ------ | --------------------------------------------- | --------------------------- |
| GET    | `/events/{eventId}/guests`                    | Obtener todos los invitados |
| POST   | `/events/{eventId}/guests`                    | Crear invitado              |
| PUT    | `/events/{eventId}/guests/{guestId}`          | Actualizar invitado         |
| DELETE | `/events/{eventId}/guests/{guestId}`          | Eliminar invitado           |
| POST   | `/events/{eventId}/guests/{guestId}/favorite` | Agregar a favoritos         |
| DELETE | `/events/{eventId}/guests/{guestId}/favorite` | Quitar de favoritos         |
| POST   | `/events/{eventId}/guests/import`             | Importar contactos          |

### Grupos

| Método | Endpoint                                              | Descripción                |
| ------ | ----------------------------------------------------- | -------------------------- |
| GET    | `/events/{eventId}/groups`                            | Obtener todos los grupos   |
| POST   | `/events/{eventId}/groups`                            | Crear grupo                |
| PUT    | `/events/{eventId}/groups/{groupId}`                  | Actualizar grupo           |
| DELETE | `/events/{eventId}/groups/{groupId}`                  | Eliminar grupo             |
| POST   | `/events/{eventId}/groups/{groupId}/guests`           | Agregar invitados al grupo |
| DELETE | `/events/{eventId}/groups/{groupId}/guests/{guestId}` | Quitar invitado del grupo  |
| PUT    | `/events/{eventId}/groups/reorder`                    | Reordenar grupos           |

## 📝 Ejemplos de Uso

### Crear Invitado Registrado

```json
POST /events/event123/guests
{
  "name": "John Doe",
  "clientId": "client456",
  "phone": "+1234567890",
  "email": "john@example.com",
  "isFavorite": true,
  "tags": ["VIP"],
  "originType": "REGISTERED"
}
```

### Importar Contactos

```json
POST /events/event123/guests/import
{
  "contacts": [
    {
      "name": "Jane Smith",
      "phone": "+0987654321",
      "email": "jane@example.com"
    }
  ],
  "groupId": "group789",
  "isFavorite": false
}
```

### Crear Grupo

```json
POST /events/event123/groups
{
  "name": "Family",
  "color": "#FF9AA2",
  "guestIds": ["guest1", "guest2"]
}
```

## 🔧 Configuración

### Variables de Entorno

- `GUESTS_TABLE`: Nombre de la tabla de invitados
- `GROUPS_TABLE`: Nombre de la tabla de grupos

### Headers Requeridos

```
Authorization: Bearer {token}
Content-Type: application/json
```

## 🧪 Testing

Para testing local con serverless-offline:

```bash
npm run logs
```

## 📋 Validaciones

- **Invitados**: Nombre requerido, al menos teléfono o email
- **Grupos**: Nombre y color hex requeridos
- **Importación**: Array de contactos con nombre y teléfono
- **Reordenamiento**: Array de grupos con ID y orden

## 🚨 Códigos de Error

- `VALIDATION_ERROR`: Datos inválidos
- `EVENT_NOT_FOUND`: Evento no existe
- `GUEST_NOT_FOUND`: Invitado no encontrado
- `GROUP_NOT_FOUND`: Grupo no encontrado
- `DUPLICATE_ENTRY`: Registro duplicado
- `INTERNAL_ERROR`: Error interno

## 🔄 Flujo de Integración

1. **Cargar datos iniciales**: GET invitados y grupos
2. **Gestión de favoritos**: POST/DELETE favorite
3. **Organización**: Crear grupos y asignar invitados
4. **Importación**: Importar contactos del dispositivo
5. **Reordenamiento**: Drag & drop de grupos

## 📈 Rendimiento

- **Single Table Design**: Consultas eficientes con GSI
- **Paginación**: Soporte para grandes listas
- **Índices optimizados**: Búsqueda rápida por teléfono/email/clientId
- **Batch operations**: Operaciones masivas para importación

## 🔒 Seguridad

- Validación de entrada en todos los endpoints
- Control de acceso por evento
- Sanitización de datos
- Manejo seguro de errores
