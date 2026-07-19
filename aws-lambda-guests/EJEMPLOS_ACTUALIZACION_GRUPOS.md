# Ejemplos de Actualización de Grupos de Favoritos

## 1. Actualizar un solo grupo (Individual)

### Endpoint

```
PUT /users/{userId}/groups/{groupId}
```

### Ejemplo 1: Cambiar solo el color

```json
{
  "color": "#FF5733"
}
```

### Ejemplo 2: Cambiar nombre y agregar usuarios

```json
{
  "name": "Familia VIP",
  "userIds": ["user1", "user2", "user3", "user4"]
}
```

### Ejemplo 3: Cambiar orden y color

```json
{
  "order": 5,
  "color": "#3498DB"
}
```

### Ejemplo 4: Actualización completa

```json
{
  "name": "Equipo de Desarrollo",
  "color": "#2ECC71",
  "order": 2,
  "userIds": ["dev1", "dev2", "dev3"],
  "tags": ["trabajo", "tech", "importante"]
}
```

---

## 2. Actualizar múltiples grupos (Batch)

### Endpoint

```
PUT /users/{userId}/groups/batch
```

### Ejemplo 1: Reordenar todos los grupos

```json
{
  "groups": [
    {
      "groupId": "grp-familia",
      "order": 0
    },
    {
      "groupId": "grp-amigos",
      "order": 1
    },
    {
      "groupId": "grp-trabajo",
      "order": 2
    },
    {
      "groupId": "grp-universidad",
      "order": 3
    }
  ]
}
```

**Caso de uso:** El usuario arrastra grupos para cambiar su orden en la interfaz.

---

### Ejemplo 2: Actualizar varios grupos con diferentes cambios

```json
{
  "groups": [
    {
      "groupId": "grp-001",
      "name": "Familia Cercana",
      "color": "#E74C3C",
      "order": 0
    },
    {
      "groupId": "grp-002",
      "userIds": ["user1", "user2", "user5", "user8"],
      "order": 1
    },
    {
      "groupId": "grp-003",
      "tags": ["VIP", "prioritario"],
      "order": 2
    }
  ]
}
```

**Caso de uso:** El usuario está reorganizando sus grupos y actualizando información de varios a la vez.

---

### Ejemplo 3: Agregar/quitar usuarios de múltiples grupos

```json
{
  "groups": [
    {
      "groupId": "grp-familia",
      "userIds": ["user1", "user2", "user3"]
    },
    {
      "groupId": "grp-trabajo",
      "userIds": ["user10", "user11", "user12", "user13"]
    },
    {
      "groupId": "grp-amigos",
      "userIds": ["user20", "user21"]
    }
  ]
}
```

**Caso de uso:** El usuario movió varios contactos entre grupos.

---

### Ejemplo 4: Actualización masiva con reorden

```json
{
  "groups": [
    {
      "groupId": "grp-001",
      "name": "⭐ Favoritos",
      "color": "#FFD700",
      "order": 0,
      "userIds": ["user1", "user2"],
      "tags": ["favoritos", "importante"]
    },
    {
      "groupId": "grp-002",
      "name": "👨‍👩‍👧‍👦 Familia",
      "color": "#E74C3C",
      "order": 1,
      "userIds": ["user3", "user4", "user5"]
    },
    {
      "groupId": "grp-003",
      "name": "👥 Amigos",
      "color": "#3498DB",
      "order": 2,
      "userIds": ["user6", "user7", "user8", "user9"]
    },
    {
      "groupId": "grp-004",
      "name": "💼 Trabajo",
      "color": "#2ECC71",
      "order": 3,
      "userIds": ["user10", "user11"]
    },
    {
      "groupId": "grp-005",
      "name": "🎓 Universidad",
      "color": "#9B59B6",
      "order": 4
    }
  ]
}
```

**Caso de uso:** El usuario está haciendo una reorganización completa de todos sus grupos.

---

## 3. Casos de uso comunes

### Caso 1: Drag and Drop para reordenar

Cuando el usuario arrastra grupos para cambiarles el orden:

```json
{
  "groups": [
    { "groupId": "grp-003", "order": 0 },
    { "groupId": "grp-001", "order": 1 },
    { "groupId": "grp-002", "order": 2 },
    { "groupId": "grp-004", "order": 3 }
  ]
}
```

### Caso 2: Mover un usuario de un grupo a otro

Actualizar ambos grupos en una sola petición:

```json
{
  "groups": [
    {
      "groupId": "grp-origen",
      "userIds": ["user1", "user2"]
    },
    {
      "groupId": "grp-destino",
      "userIds": ["user5", "user6", "user3"]
    }
  ]
}
```

### Caso 3: Aplicar un tema de colores a todos los grupos

```json
{
  "groups": [
    { "groupId": "grp-001", "color": "#FF6B6B" },
    { "groupId": "grp-002", "color": "#4ECDC4" },
    { "groupId": "grp-003", "color": "#45B7D1" },
    { "groupId": "grp-004", "color": "#96CEB4" },
    { "groupId": "grp-005", "color": "#FFEAA7" }
  ]
}
```

---

## 4. Respuestas esperadas

### Respuesta exitosa (200)

```json
{
  "message": "Batch update completed",
  "summary": {
    "total": 5,
    "updated": 5,
    "failed": 0
  },
  "results": {
    "updated": [
      { "groupId": "grp-001", "groupName": "Familia", "order": 0 },
      { "groupId": "grp-002", "groupName": "Amigos", "order": 1 },
      { "groupId": "grp-003", "groupName": "Trabajo", "order": 2 },
      { "groupId": "grp-004", "groupName": "Universidad", "order": 3 },
      { "groupId": "grp-005", "groupName": "Otros", "order": 4 }
    ],
    "errors": []
  }
}
```

### Respuesta con errores parciales (207 Multi-Status)

```json
{
  "message": "Batch update completed",
  "summary": {
    "total": 5,
    "updated": 3,
    "failed": 2
  },
  "results": {
    "updated": [
      { "groupId": "grp-001", "groupName": "Familia", "order": 0 },
      { "groupId": "grp-002", "groupName": "Amigos", "order": 1 },
      { "groupId": "grp-003", "groupName": "Trabajo", "order": 2 }
    ],
    "errors": [
      {
        "groupId": "grp-999",
        "error": "Group not found"
      },
      {
        "groupId": "grp-888",
        "error": "No fields to update"
      }
    ]
  }
}
```

---

## 5. Consideraciones importantes

### Límites

- Máximo **25 grupos** por petición batch
- Los grupos se procesan secuencialmente
- Si un grupo falla, los demás continúan procesándose

### Campos opcionales

Todos los campos son opcionales excepto `groupId`:

- Solo se actualizan los campos que se envían
- Los campos no enviados mantienen su valor actual

### Cambio de nombre

- Cambiar el nombre es más costoso (elimina y recrea el item)
- El `groupId` siempre permanece igual
- El `createdAt` se preserva

### Atomicidad

- Cada grupo se actualiza individualmente
- No es una transacción atómica para todos los grupos
- Revisar `results.errors` para ver qué grupos fallaron

### Orden

- El campo `order` determina la posición de visualización
- Se recomienda usar incrementos de 1: 0, 1, 2, 3...
- El cliente debe ordenar por este campo al mostrar

### UserIds

- Pueden ser IDs de cualquier tipo: favoritos, followers, following, importados, manuales
- Al actualizar `userIds`, se reemplaza completamente el array
- Para agregar un usuario: incluir los existentes + el nuevo
- Para quitar un usuario: enviar el array sin ese ID
