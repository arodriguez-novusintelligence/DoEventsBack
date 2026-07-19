# Guía de Implementación Frontend - Búsqueda de Usuarios

## 🎯 Endpoint del Servicio

```
GET https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q={término}
```

## 📋 Request

**Método:** `GET`  
**Parámetro requerido:** `q` (query string)  
**Headers:** `Content-Type: application/json`

## 🔍 Tipos de Búsqueda

| Búsqueda | Ejemplo | Busca en |
|----------|---------|----------|
| General | `?q=jei` | user, email, nombre, apellido |
| Por username | `?q=@jei` | solo campo `user` |

## 📥 Estructura de la Respuesta

```typescript
interface SearchResponse {
  users: User[];
  count: number;
  searchTerm: string;
  isUsernameSearch: boolean;
}

interface User {
  id: string;
  user: string;
  email: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  fotoPerfilUrl: string | null;
}
```

## 🚀 Implementación en React

### 1. Hook Personalizado para Búsqueda

```javascript
// hooks/useUserSearch.js
import { useState, useEffect, useCallback } from 'react';

const API_URL = 'https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers';

export const useUserSearch = (debounceTime = 300) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchUsers = useCallback(async (term) => {
    if (!term || term.trim().length === 0) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}?q=${encodeURIComponent(term)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Error al buscar usuarios');
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchTerm);
    }, debounceTime);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, debounceTime, searchUsers]);

  return {
    searchTerm,
    setSearchTerm,
    users,
    loading,
    error,
  };
};
```

### 2. Componente de Búsqueda con Autocompletado

```javascript
// components/UserSearchAutocomplete.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useUserSearch } from '../hooks/useUserSearch';
import './UserSearchAutocomplete.css';

export const UserSearchAutocomplete = ({ onUserSelect, placeholder = 'Buscar usuario...' }) => {
  const { searchTerm, setSearchTerm, users, loading } = useUserSearch(300);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setShowDropdown(true);
  };

  const handleUserClick = (user) => {
    onUserSelect(user);
    setSearchTerm('');
    setShowDropdown(false);
  };

  return (
    <div className="user-search-autocomplete" ref={dropdownRef}>
      <div className="search-input-container">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className="search-input"
        />
        {loading && <span className="search-loader">Buscando...</span>}
      </div>

      {showDropdown && searchTerm.length > 0 && (
        <div className="search-dropdown">
          {users.length > 0 ? (
            <ul className="user-list">
              {users.map((user) => (
                <li
                  key={user.id}
                  onClick={() => handleUserClick(user)}
                  className="user-item"
                >
                  <div className="user-avatar">
                    {user.fotoPerfilUrl ? (
                      <img src={user.fotoPerfilUrl} alt={user.nombreCompleto} />
                    ) : (
                      <div className="avatar-placeholder">
                        {user.nombre?.charAt(0) || user.user?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="user-info">
                    <div className="user-name">{user.nombreCompleto || user.user}</div>
                    <div className="user-username">@{user.user}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="no-results">No se encontraron usuarios</div>
          )}
        </div>
      )}
    </div>
  );
};
```

### 3. CSS para el Componente

```css
/* components/UserSearchAutocomplete.css */
.user-search-autocomplete {
  position: relative;
  width: 100%;
  max-width: 400px;
}

.search-input-container {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #4a90e2;
}

.search-loader {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #666;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 400px;
  overflow-y: auto;
  z-index: 1000;
}

.user-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.user-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f0f0f0;
}

.user-item:last-child {
  border-bottom: none;
}

.user-item:hover {
  background-color: #f8f9fa;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  margin-right: 12px;
  overflow: hidden;
  flex-shrink: 0;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  text-transform: uppercase;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  margin-bottom: 4px;
}

.user-username {
  font-size: 13px;
  color: #666;
  margin-bottom: 2px;
}

.user-email {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 14px;
}
```

### 4. Ejemplo de Uso del Componente

```javascript
// pages/InviteUsers.jsx
import React, { useState } from 'react';
import { UserSearchAutocomplete } from '../components/UserSearchAutocomplete';

export const InviteUsers = () => {
  const [selectedUsers, setSelectedUsers] = useState([]);

  const handleUserSelect = (user) => {
    // Evitar duplicados
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleRemoveUser = (userId) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };

  return (
    <div className="invite-users-page">
      <h2>Invitar Usuarios</h2>
      
      <UserSearchAutocomplete 
        onUserSelect={handleUserSelect}
        placeholder="Buscar usuarios para invitar..."
      />

      <div className="selected-users">
        <h3>Usuarios Seleccionados ({selectedUsers.length})</h3>
        <ul>
          {selectedUsers.map(user => (
            <li key={user.id}>
              {user.fotoPerfilUrl && (
                <img src={user.fotoPerfilUrl} alt={user.nombreCompleto} />
              )}
              <span>{user.nombreCompleto} (@{user.user})</span>
              <button onClick={() => handleRemoveUser(user.id)}>×</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
```

## 🎨 Implementación con Axios

```javascript
// services/userService.js
import axios from 'axios';

const API_BASE_URL = 'https://dxskui0le8.execute-api.us-east-1.amazonaws.com';

export const searchUsers = async (searchTerm) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/searchUsers`, {
      params: { q: searchTerm }
    });
    return response.data;
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
};

// Uso
import { searchUsers } from './services/userService';

const results = await searchUsers('jei');
console.log(results.users);
```

## 📱 Implementación en React Native

```javascript
// components/UserSearchModal.jsx
import React, { useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

const API_URL = 'https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers';

export const UserSearchModal = ({ onUserSelect, visible, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchUsers = async (term) => {
    if (term.length < 2) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}?q=${encodeURIComponent(term)}`);
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text) => {
    setSearchTerm(text);
    // Debounce simple
    clearTimeout(searchUsers.timeout);
    searchUsers.timeout = setTimeout(() => searchUsers(text), 300);
  };

  const renderUser = ({ item }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => {
        onUserSelect(item);
        onClose();
      }}
    >
      {item.fotoPerfilUrl ? (
        <Image source={{ uri: item.fotoPerfilUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.nombre?.charAt(0) || item.user?.charAt(0)}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.nombreCompleto}</Text>
        <Text style={styles.userUsername}>@{item.user}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar usuario..."
        value={searchTerm}
        onChangeText={handleSearch}
        autoFocus
      />

      {loading && <ActivityIndicator size="large" color="#4a90e2" />}

      <FlatList
        data={users}
        renderItem={renderUser}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          searchTerm.length > 0 ? (
            <Text style={styles.noResults}>No se encontraron usuarios</Text>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
  },
  searchInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  userItem: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userUsername: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  userEmail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
    color: '#666',
  },
});
```

## 💡 Casos de Uso Prácticos

### 1. Buscador Simple

```javascript
function SimpleUserSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async () => {
    const response = await fetch(
      `https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=${query}`
    );
    const data = await response.json();
    setResults(data.users);
  };

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Buscar</button>
      <ul>
        {results.map(user => (
          <li key={user.id}>{user.nombreCompleto}</li>
        ))}
      </ul>
    </div>
  );
}
```

### 2. Buscar Solo por Username

```javascript
function UsernameSearch() {
  const [username, setUsername] = useState('');

  const searchByUsername = async () => {
    // Agregar @ al inicio para búsqueda específica
    const query = username.startsWith('@') ? username : `@${username}`;
    
    const response = await fetch(
      `https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers?q=${query}`
    );
    const data = await response.json();
    return data.users;
  };

  return (
    <input 
      placeholder="Username (sin @)" 
      onChange={(e) => setUsername(e.target.value)} 
    />
  );
}
```

### 3. Selector Múltiple de Usuarios

```javascript
function MultiUserSelector({ onUsersChange }) {
  const { searchTerm, setSearchTerm, users, loading } = useUserSearch();
  const [selected, setSelected] = useState([]);

  const toggleUser = (user) => {
    let newSelected;
    if (selected.find(u => u.id === user.id)) {
      newSelected = selected.filter(u => u.id !== user.id);
    } else {
      newSelected = [...selected, user];
    }
    setSelected(newSelected);
    onUsersChange(newSelected);
  };

  return (
    <div>
      <input 
        value={searchTerm} 
        onChange={(e) => setSearchTerm(e.target.value)} 
      />
      {users.map(user => (
        <label key={user.id}>
          <input 
            type="checkbox"
            checked={selected.some(u => u.id === user.id)}
            onChange={() => toggleUser(user)}
          />
          {user.nombreCompleto}
        </label>
      ))}
    </div>
  );
}
```

## 🔒 Mejores Prácticas

### 1. Debouncing
```javascript
// Evita hacer requests en cada tecla presionada
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
```

### 2. Manejo de Errores
```javascript
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
} catch (error) {
  console.error('Error:', error);
  // Mostrar mensaje al usuario
}
```

### 3. Caché de Búsquedas
```javascript
const searchCache = new Map();

const searchWithCache = async (term) => {
  if (searchCache.has(term)) {
    return searchCache.get(term);
  }
  
  const result = await searchUsers(term);
  searchCache.set(term, result);
  return result;
};
```

### 4. Cancelación de Requests
```javascript
const controller = new AbortController();

fetch(url, { signal: controller.signal })
  .then(response => response.json())
  .catch(error => {
    if (error.name === 'AbortError') {
      console.log('Request cancelled');
    }
  });

// Para cancelar
controller.abort();
```

## 🎯 Tips de UX

1. **Mínimo de caracteres**: Inicia la búsqueda después de 2-3 caracteres
2. **Debounce**: Espera 300-500ms después de que el usuario deja de escribir
3. **Loading state**: Muestra un indicador mientras se busca
4. **Empty state**: Mensaje claro cuando no hay resultados
5. **Keyboard navigation**: Permite navegar con flechas arriba/abajo
6. **Escape para cerrar**: Tecla ESC cierra el dropdown
7. **Highlight**: Resalta el término de búsqueda en los resultados

## 📊 Ejemplos de Respuesta

### Búsqueda exitosa
```json
{
  "users": [
    {
      "id": "usr-123",
      "user": "jeison",
      "email": "jeison@example.com",
      "nombre": "Jeison",
      "apellido": "Pérez",
      "nombreCompleto": "Jeison Pérez",
      "fotoPerfilUrl": "https://..."
    }
  ],
  "count": 1,
  "searchTerm": "jei",
  "isUsernameSearch": false
}
```

### Sin resultados
```json
{
  "users": [],
  "count": 0,
  "message": "No se encontraron usuarios que coincidan con la búsqueda",
  "searchTerm": "xyz123"
}
```

---

**Última actualización:** 19 de Enero, 2026  
**Endpoint:** `https://dxskui0le8.execute-api.us-east-1.amazonaws.com/searchUsers`
