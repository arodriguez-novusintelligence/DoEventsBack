# Documentación del Servicio de Búsqueda de Usuarios

## 📋 Descripción General

Servicio para buscar usuarios por coincidencia de caracteres en la tabla `Client` de DynamoDB. La búsqueda permite encontrar usuarios basándose en coincidencias parciales en los campos `email` y `user`.

## 🔗 Endpoint

**URL Base:** `https://dxskui0le8.execute-api.us-east-1.amazonaws.com`

**Endpoint:** `GET /searchUsers`

**URL Completa:** 
```
https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q={término_búsqueda}
```

## 📝 Parámetros de Consulta (Query Parameters)

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` o `search` | string | Sí | Término de búsqueda para encontrar usuarios |

## ✨ Características

- ✅ Búsqueda por coincidencia parcial (no requiere coincidencia exacta)
- ✅ Busca en campos `email` y `user` simultáneamente
- ✅ Case-insensitive (no distingue mayúsculas/minúsculas)
- ✅ No requiere escribir @ o formato de email completo
- ✅ Retorna nombre completo e imagen de perfil
- ✅ URLs de imágenes firmadas (válidas por 1 hora)

## 📤 Ejemplos de Uso

### Ejemplo 1: Buscar por nombre de usuario
```bash
# Buscar usuarios que contengan "juan"
GET https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=juan
```

### Ejemplo 2: Buscar por parte del email
```bash
# Buscar usuarios con gmail
GET https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=gmail
```

### Ejemplo 3: Buscar por caracteres específicos
```bash
# Buscar usuarios que contengan "mar"
GET https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=mar
```

### Usando JavaScript (Fetch API)
```javascript
// Función para buscar usuarios
async function searchUsers(searchTerm) {
  const url = `https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=${encodeURIComponent(searchTerm)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error buscando usuarios:', error);
    throw error;
  }
}

// Uso
searchUsers('juan').then(result => {
  console.log('Usuarios encontrados:', result.users);
  console.log('Total:', result.count);
});
```

### Usando Axios
```javascript
import axios from 'axios';

async function searchUsers(searchTerm) {
  try {
    const response = await axios.get(
      'https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers',
      {
        params: {
          q: searchTerm
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
```

### Usando cURL
```bash
curl -X GET "https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=juan"
```

## 📥 Respuestas

### Respuesta Exitosa (200 OK)

```json
{
  "users": [
    {
      "id": "user-123-abc",
      "user": "juanperez",
      "email": "juan.perez@gmail.com",
      "nombre": "Juan",
      "apellido": "Pérez",
      "nombreCompleto": "Juan Pérez",
      "fotoPerfilUrl": "https://doeventprofileimagesbucket.s3.amazonaws.com/fotosPerfil/juanperez.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
    },
    {
      "id": "user-456-def",
      "user": "juanam",
      "email": "juana.martinez@example.com",
      "nombre": "Juana",
      "apellido": "Martínez",
      "nombreCompleto": "Juana Martínez",
      "fotoPerfilUrl": null
    }
  ],
  "count": 2,
  "searchTerm": "juan"
}
```

### Sin Resultados (200 OK)

```json
{
  "users": [],
  "count": 0,
  "message": "No se encontraron usuarios que coincidan con la búsqueda"
}
```

### Error - Parámetro Faltante (400 Bad Request)

```json
{
  "statusDesc": "El término de búsqueda es obligatorio",
  "statusCode": 400
}
```

### Error del Servidor (500 Internal Server Error)

```json
{
  "statusDesc": "Error interno del servidor al buscar usuarios",
  "statusCode": 500,
  "error": "Mensaje de error detallado"
}
```

## 🔍 Estructura de la Respuesta

### Objeto User

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | ID único del usuario |
| `user` | string | Nombre de usuario (username) |
| `email` | string | Correo electrónico del usuario |
| `nombre` | string | Primer nombre |
| `apellido` | string | Apellido |
| `nombreCompleto` | string | Nombre y apellido concatenados |
| `fotoPerfilUrl` | string\|null | URL firmada de la foto de perfil (válida 1 hora) o null si no tiene |

### Objeto de Respuesta Principal

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `users` | array | Array de objetos User encontrados |
| `count` | number | Cantidad de usuarios encontrados |
| `searchTerm` | string | Término de búsqueda utilizado |
| `message` | string | Mensaje informativo (solo cuando no hay resultados) |

## 💡 Casos de Uso

### 1. Buscador de usuarios en tiempo real

```javascript
// Componente React con búsqueda en tiempo real
import { useState, useEffect } from 'react';

function UserSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setUsers([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=${searchTerm}`
        );
        const data = await response.json();
        setUsers(data.users);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar usuarios..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      {loading && <p>Buscando...</p>}
      <ul>
        {users.map(user => (
          <li key={user.id}>
            {user.fotoPerfilUrl && (
              <img src={user.fotoPerfilUrl} alt={user.nombreCompleto} />
            )}
            <div>
              <strong>{user.nombreCompleto}</strong>
              <p>@{user.user}</p>
              <p>{user.email}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 2. Selector de usuarios para invitaciones

```javascript
async function findAndSelectUser(searchTerm) {
  const result = await searchUsers(searchTerm);
  
  if (result.count === 0) {
    alert('No se encontraron usuarios');
    return null;
  }
  
  // Mostrar lista de usuarios para seleccionar
  return result.users;
}
```

### 3. Autocompletado de usuarios

```javascript
// Autocompletar basado en búsqueda
function setupAutocomplete(inputElement) {
  let timeoutId;
  
  inputElement.addEventListener('input', (e) => {
    clearTimeout(timeoutId);
    
    timeoutId = setTimeout(async () => {
      const searchTerm = e.target.value;
      if (searchTerm.length >= 2) {
        const result = await searchUsers(searchTerm);
        displaySuggestions(result.users);
      }
    }, 300);
  });
}
```

## ⚠️ Consideraciones Importantes

1. **Rendimiento**: El servicio usa un `scan` de DynamoDB, lo cual puede ser costoso en tablas grandes. Para producción con muchos usuarios, considera:
   - Implementar paginación
   - Usar AWS Elasticsearch/OpenSearch
   - Limitar resultados máximos

2. **URLs de Imágenes**: Las URLs firmadas son válidas por 1 hora. Si necesitas almacenarlas por más tiempo, deberás solicitar nuevas URLs.

3. **Búsqueda Case-Insensitive**: La búsqueda convierte todo a minúsculas, por lo que "Juan", "juan" y "JUAN" darán los mismos resultados.

4. **Mínimo de caracteres**: Se recomienda comenzar la búsqueda con al menos 2-3 caracteres para evitar resultados demasiado amplios.

## 🔧 Mantenimiento y Actualización

### Redesplegar el servicio

```bash
cd aws-lamda-manageusers
serverless deploy
```

### Ver logs en tiempo real

```bash
serverless logs -f searchUsers --tail
```

### Eliminar el servicio

```bash
serverless remove
```

## 📊 Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | Búsqueda exitosa (con o sin resultados) |
| 400 | Parámetro de búsqueda faltante o inválido |
| 500 | Error interno del servidor |

## 🎯 Ejemplos de Búsqueda Comunes

| Término de Búsqueda | Qué Encuentra |
|---------------------|---------------|
| `juan` | Usuarios con "juan" en email o username |
| `@gmail` | Usuarios con emails de Gmail |
| `maria` | Usuarios llamados María o con email que contenga "maria" |
| `.com` | Usuarios con dominios .com |
| `admin` | Usuarios con "admin" en username o email |

## 📞 Soporte

Para problemas o preguntas sobre este servicio, contacta al equipo de desarrollo.

---

**Última actualización:** 11 de Enero, 2026  
**Versión:** 1.0.0  
**Región AWS:** us-east-1
