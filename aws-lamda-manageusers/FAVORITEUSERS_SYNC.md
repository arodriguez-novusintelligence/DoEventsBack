# 🔄 Sincronización Automática: Client ↔ FavoriteUsers

## 📋 Descripción

Cuando se crea un nuevo usuario en la tabla `Client` (manageusers), el sistema verifica automáticamente si ese **email** o **teléfono** ya existen en la tabla `FavoriteUsers` como **usuarios manuales**. Si los encuentra, actualiza esos registros para convertirlos en **usuarios registrados**.

---

## 🎯 Problema Resuelto

### Antes ❌

```
1. Usuario A agrega a Juan (manual) a sus favoritos
   → FavoriteUsers: { email: "juan@mail.com", originType: "MANUAL" }

2. Juan se registra en la app
   → Client: { id: "user123", email: "juan@mail.com" }

3. ❌ FavoriteUsers sigue mostrando a Juan como usuario manual
4. ❌ No hay conexión entre el registro manual y el usuario real
```

### Ahora ✅

```
1. Usuario A agrega a Juan (manual) a sus favoritos
   → FavoriteUsers: { email: "juan@mail.com", originType: "MANUAL" }

2. Juan se registra en la app
   → Client: { id: "user123", email: "juan@mail.com" }
   → 🔄 AUTOMÁTICO: Busca en FavoriteUsers
   → ✅ Encuentra el registro manual
   → ✅ Actualiza: { invitedUserId: "user123", originType: "REGISTERED" }

3. ✅ Ahora Juan aparece como usuario registrado
4. ✅ Tiene foto de perfil, username, todos sus datos
```

---

## 🔍 Búsqueda por Email y Phone

El sistema busca en **FavoriteUsers** usando:

### 1. Email (GSI2)

```javascript
GSI2PK = "EMAIL#juan@mail.com";
```

Encuentra todos los registros donde diferentes usuarios hayan agregado manualmente a alguien con ese email.

### 2. Phone (GSI1)

```javascript
GSI1PK = "PHONE#+573001234567";
```

Encuentra todos los registros donde diferentes usuarios hayan agregado manualmente a alguien con ese teléfono.

---

## 📊 Estructura de Datos

### FavoriteUsers - Antes de Registro (Usuario Manual)

```json
{
  "userId": "owner123", // Quien agregó al usuario
  "favoriteId": "fav-uuid-1", // ID único del registro
  "invitedUserId": "temp-uuid-xyz", // ID temporal
  "name": "Juan",
  "email": "juan@mail.com",
  "phone": "+573001234567",
  "originType": "MANUAL", // ← Usuario agregado manualmente
  "isFavorite": true,
  "profileImageUrl": "", // Sin foto
  "username": "", // Sin username
  "GSI1PK": "PHONE#+573001234567",
  "GSI2PK": "EMAIL#juan@mail.com",
  "createdAt": "2026-01-09T10:00:00Z"
}
```

### FavoriteUsers - Después de Registro (Usuario de la App)

```json
{
  "userId": "owner123",
  "favoriteId": "fav-uuid-1",
  "invitedUserId": "user123", // ← Ahora tiene el ID real de Client
  "name": "Juan",
  "lastName": "Pérez", // ← Datos completos de Client
  "email": "juan@mail.com",
  "phone": "+573001234567",
  "username": "juanperez", // ← Username de la app
  "profileImageUrl": "fotosPerfil/juanperez.jpg", // ← Foto de perfil
  "originType": "REGISTERED", // ← Ahora es usuario registrado
  "isFavorite": true,
  "GSI1PK": "PHONE#+573001234567",
  "GSI2PK": "EMAIL#juan@mail.com",
  "updatedAt": "2026-01-10T15:30:00Z" // ← Actualizado
}
```

### Client (Tabla de Usuarios)

```json
{
  "id": "user123",
  "name": "Juan",
  "lastName": "Pérez",
  "email": "juan@mail.com",
  "phone": "+573001234567",
  "user": "juanperez",
  "fotoPerfilUrl": "fotosPerfil/juanperez.jpg",
  "createDate": "2026-01-10T15:30:00Z"
}
```

---

## 🔄 Flujo de Sincronización

```
POST /users (addUser)
│
├─ 1. Validar datos
│
├─ 2. Verificar email/phone no duplicados en Client
│
├─ 3. Crear usuario en tabla Client
│
└─ 4. 🔄 SINCRONIZAR CON FAVORITEUSERS
    │
    ├─ 4.1 Buscar por EMAIL en FavoriteUsers (GSI2)
    │      Query: GSI2PK = "EMAIL#juan@mail.com"
    │      → Encuentra: [registro1, registro2, ...]
    │
    ├─ 4.2 Buscar por PHONE en FavoriteUsers (GSI1)
    │      Query: GSI1PK = "PHONE#+573001234567"
    │      → Encuentra: [registro3, registro4, ...]
    │
    ├─ 4.3 Combinar resultados (sin duplicados)
    │      → Total: [registro1, registro2, registro3, registro4]
    │
    └─ 4.4 Actualizar CADA registro encontrado
           ├─ invitedUserId → ID del nuevo usuario
           ├─ name → Nombre de Client
           ├─ lastName → Apellido de Client
           ├─ email → Email de Client
           ├─ phone → Phone de Client
           ├─ username → Username de Client
           ├─ profileImageUrl → Foto de perfil de Client
           ├─ originType → "REGISTERED" (era "MANUAL")
           └─ updatedAt → Timestamp actual
```

---

## 💡 Casos de Uso

### Caso 1: Un Usuario lo Agregó Manualmente

```javascript
// 1. María agrega a Juan manualmente
POST /favorites/maria123/users
{
  "name": "Juan",
  "email": "juan@mail.com",
  "phone": "+573001234567",
  "originType": "MANUAL"
}

// FavoriteUsers:
// userId=maria123, favoriteId=fav1, originType=MANUAL

// 2. Juan se registra
POST /users
{
  "name": "Juan",
  "lastName": "Pérez",
  "email": "juan@mail.com",
  "phone": "+573001234567",
  "user": "juanp"
}

// 3. Sincronización automática:
// ✅ Actualiza fav1: originType=REGISTERED, invitedUserId=user123
```

### Caso 2: Múltiples Usuarios lo Agregaron

```javascript
// 1. María agrega a Juan
// userId=maria123, favoriteId=fav1, email=juan@mail.com

// 2. Carlos agrega a Juan
// userId=carlos456, favoriteId=fav2, email=juan@mail.com

// 3. Ana agrega a Juan por teléfono
// userId=ana789, favoriteId=fav3, phone=+573001234567

// 4. Juan se registra
POST /users { email: "juan@mail.com", phone: "+573001234567" }

// 5. Sincronización automática actualiza LOS 3 registros:
// ✅ fav1 → REGISTERED (encontrado por email)
// ✅ fav2 → REGISTERED (encontrado por email)
// ✅ fav3 → REGISTERED (encontrado por phone)
```

### Caso 3: Solo Email (Sin Teléfono)

```javascript
// Usuario agregado solo con email
POST /favorites/user1/users
{
  "name": "Ana",
  "email": "ana@mail.com"
  // Sin phone
}

// Ana se registra con email y teléfono
POST /users
{
  "email": "ana@mail.com",
  "phone": "+573009999999",
  "name": "Ana"
}

// ✅ Encuentra por email
// ✅ Actualiza con todos los datos (incluido phone)
```

---

## 🎨 Campos Actualizados

| Campo             | Antes (MANUAL)   | Después (REGISTERED)    |
| ----------------- | ---------------- | ----------------------- |
| `invitedUserId`   | UUID temporal    | ✅ ID real de Client    |
| `name`            | Nombre ingresado | ✅ Nombre de Client     |
| `lastName`        | Puede ser vacío  | ✅ Apellido de Client   |
| `email`           | Email ingresado  | ✅ Email de Client      |
| `phone`           | Phone ingresado  | ✅ Phone de Client      |
| `username`        | Vacío            | ✅ Username de Client   |
| `profileImageUrl` | Vacío            | ✅ Foto de perfil S3    |
| `originType`      | "MANUAL"         | ✅ "REGISTERED"         |
| `updatedAt`       | Fecha creación   | ✅ Fecha sincronización |

---

## 🔐 Validaciones

### En addUser.js (manageusers)

1. ✅ Valida que email no exista en Client
2. ✅ Valida que phone no exista en Client
3. ✅ Crea usuario en Client
4. ✅ Busca en FavoriteUsers por email/phone
5. ✅ Actualiza todos los registros encontrados
6. ✅ No falla si no encuentra registros (opcional)

### Garantías

- ✅ **No interrumpe la creación del usuario** si falla la sincronización
- ✅ **Búsqueda case-insensitive** (DynamoDB keys)
- ✅ **Sin duplicados** en actualizaciones
- ✅ **Logs detallados** para debugging
- ✅ **Parallel updates** para mejor performance

---

## 📊 Performance

### Búsqueda Eficiente

```javascript
// GSI1 (Phone Index)
Query GSI1PK = "PHONE#+573001234567"
→ O(1) lookup

// GSI2 (Email Index)
Query GSI2PK = "EMAIL#juan@mail.com"
→ O(1) lookup

// Actualización en paralelo
Promise.all([update1, update2, update3])
→ Todas las actualizaciones simultáneas
```

### Tiempos Estimados

| Operación                         | Tiempo     |
| --------------------------------- | ---------- |
| Crear usuario en Client           | ~100ms     |
| Buscar por email (GSI2)           | ~50ms      |
| Buscar por phone (GSI1)           | ~50ms      |
| Actualizar 1 registro             | ~100ms     |
| Actualizar 5 registros (paralelo) | ~150ms     |
| **TOTAL**                         | **~450ms** |

---

## 🧪 Testing

### Test 1: Usuario Manual Existe

```bash
# 1. Crear usuario manual
POST /favorites/owner1/users
{
  "name": "Test",
  "email": "test@mail.com",
  "originType": "MANUAL"
}

# 2. Registrar usuario
POST /users
{
  "email": "test@mail.com",
  "name": "Test User",
  "user": "testuser"
}

# 3. Verificar actualización
GET /favorites/owner1/users
# Debe mostrar originType=REGISTERED con foto y username
```

### Test 2: Sin Registros en FavoriteUsers

```bash
# Crear usuario nuevo sin registros previos
POST /users
{
  "email": "nuevo@mail.com",
  "name": "Nuevo"
}

# ✅ Debe crear sin errores
# ✅ Logs: "No se encontraron registros en FavoriteUsers"
```

### Test 3: Múltiples Usuarios

```bash
# 1. Dos usuarios agregan al mismo contacto
POST /favorites/user1/users { "email": "juan@mail.com" }
POST /favorites/user2/users { "email": "juan@mail.com" }

# 2. Contacto se registra
POST /users { "email": "juan@mail.com" }

# 3. Verificar ambos se actualizaron
GET /favorites/user1/users  # ✅ originType=REGISTERED
GET /favorites/user2/users  # ✅ originType=REGISTERED
```

---

## 🚨 Manejo de Errores

### Errores No Críticos (No interrumpen creación)

```javascript
// Error en búsqueda GSI
// → Log del error + continúa

// Error en actualización individual
// → Log del error + continúa con otros

// FavoriteUsers no existe
// → Log "No encontrados" + continúa
```

### Logs de Debug

```javascript
console.log(
  `🔄 Verificando si ${email} o ${phone} existen en FavoriteUsers...`
);
console.log(
  `✅ Encontrados ${emailQuery.Items.length} registros con email ${email}`
);
console.log(
  `🔄 Actualizando ${usersToUpdate.length} registros en FavoriteUsers...`
);
console.log(
  `✅ Sincronización completada (${usersToUpdate.length} actualizados)`
);
console.log(`ℹ️ No se encontraron registros en FavoriteUsers para sincronizar`);
```

---

## 📝 Archivos Modificados

| Archivo                                | Cambios                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `aws-lamda-manageusers/src/addUser.js` | + syncWithFavoriteUsers() función<br>+ Llamada después de crear en Client |

---

## 🎯 Beneficios

### Para el Usuario

- ✅ **Sincronización automática**: No necesita volver a agregar contactos
- ✅ **Datos completos**: Foto de perfil, username, etc.
- ✅ **Experiencia fluida**: Todo "simplemente funciona"

### Para el Sistema

- ✅ **Datos consistentes**: Client y FavoriteUsers siempre sincronizados
- ✅ **Menos duplicados**: Un contacto = un usuario
- ✅ **Trazabilidad**: originType indica el origen del dato

### Para Desarrollo

- ✅ **Código limpio**: Función separada y reutilizable
- ✅ **No invasivo**: No rompe flujo existente
- ✅ **Logs detallados**: Fácil debugging

---

## 🔄 Comparación: Antes vs Ahora

| Aspecto               | Antes ❌                        | Ahora ✅                        |
| --------------------- | ------------------------------- | ------------------------------- |
| **Crear usuario**     | Solo crea en Client             | Crea + sincroniza FavoriteUsers |
| **Usuarios manuales** | Permanecen como MANUAL          | Se convierten en REGISTERED     |
| **Datos**             | Incompletos (sin foto/username) | Completos (todos los datos)     |
| **Duplicados**        | Usuario manual ≠ Usuario real   | Usuario unificado               |
| **Búsqueda**          | Manual                          | Automática (email + phone)      |
| **Performance**       | N/A                             | Búsqueda O(1) con GSI           |

---

**Fecha:** Enero 10, 2026  
**Módulo:** aws-lamda-manageusers  
**Versión:** 2.0.0  
**Status:** ✅ Implementado y Listo
