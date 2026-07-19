# 📱 Guía de Integración Frontend - Imágenes de Venues

## 🎯 Overview

Esta guía te ayudará a integrar el sistema de imágenes para venues en tu aplicación frontend (React, Angular, Vue, etc.). El backend ahora soporta la carga de imágenes en base64 tanto al crear como al actualizar venues.

---

## 🌐 API Endpoints Disponibles

**Base URL:** `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev`

### Endpoints principales:
- **POST** `/venues` - Crear venue (con imágenes)
- **PUT** `/venues/{venueId}` - Actualizar venue (con imágenes)
- **POST** `/venues/{venueId}/images` - Agregar imagen específica
- **GET** `/venues/{venueId}` - Obtener venue (con URLs de imágenes)
- **GET** `/venues` - Listar venues (con URLs de imágenes)

---

## 📤 1. Crear Venue con Imágenes

### React Example - Crear con Múltiples Imágenes

```jsx
import { useState } from 'react';

function CreateVenueForm() {
  const [venueData, setVenueData] = useState({
    name: '',
    capacity: 0,
    latitude: 0,
    longitude: 0,
    images: []
  });

  // Convertir archivo a base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Extraer solo el base64 sin el prefijo data:image/...
        const base64 = reader.result.split(',')[1];
        resolve({
          base64: base64,
          fileName: file.name
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Manejar selección de múltiples imágenes
  const handleImageSelect = async (event) => {
    const files = Array.from(event.target.files);
    const imagesPromises = files.map(file => fileToBase64(file));
    const imagesData = await Promise.all(imagesPromises);
    
    setVenueData(prev => ({
      ...prev,
      images: imagesData
    }));
  };

  // Enviar formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(
        'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            name: venueData.name,
            ownerUserId: 'user-123', // Obtener del contexto de autenticación
            latitude: venueData.latitude,
            longitude: venueData.longitude,
            capacity: venueData.capacity,
            images: venueData.images, // Array de {base64, fileName}
            floors: [] // Agregar pisos si es necesario
          })
        }
      );

      const result = await response.json();
      console.log('Venue creado:', result);
      
      // Redirigir o mostrar mensaje de éxito
      alert('Venue creado exitosamente!');
      
    } catch (error) {
      console.error('Error al crear venue:', error);
      alert('Error al crear venue');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Nombre del venue"
        value={venueData.name}
        onChange={(e) => setVenueData({...venueData, name: e.target.value})}
        required
      />
      
      <input
        type="number"
        placeholder="Capacidad"
        value={venueData.capacity}
        onChange={(e) => setVenueData({...venueData, capacity: parseInt(e.target.value)})}
        required
      />

      {/* Input para múltiples imágenes */}
      <div>
        <label>Imágenes del Venue:</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleImageSelect}
        />
        <small>Selecciona hasta 10 imágenes</small>
      </div>

      {/* Preview de imágenes seleccionadas */}
      {venueData.images.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {venueData.images.map((img, index) => (
            <div key={index}>
              <img 
                src={`data:image/jpeg;base64,${img.base64}`}
                alt={img.fileName}
                style={{ width: '100px', height: '100px', objectFit: 'cover' }}
              />
              <p>{img.fileName}</p>
            </div>
          ))}
        </div>
      )}

      <button type="submit">Crear Venue</button>
    </form>
  );
}

export default CreateVenueForm;
```

### React Example - Crear con Imagen Única

```jsx
function CreateVenueWithSingleImage() {
  const [venueData, setVenueData] = useState({
    name: '',
    capacity: 0,
    imageBase64: null
  });

  const handleImageSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // Guardar con el prefijo data:image/... completo
      setVenueData(prev => ({
        ...prev,
        imageBase64: reader.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const response = await fetch(
      'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: venueData.name,
          ownerUserId: 'user-123',
          capacity: venueData.capacity,
          imageBase64: venueData.imageBase64, // String con data URI
          floors: []
        })
      }
    );

    const result = await response.json();
    console.log('Venue creado:', result);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Nombre"
        value={venueData.name}
        onChange={(e) => setVenueData({...venueData, name: e.target.value})}
      />
      
      <input
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
      />

      {venueData.imageBase64 && (
        <img 
          src={venueData.imageBase64}
          alt="Preview"
          style={{ width: '200px', height: '200px' }}
        />
      )}

      <button type="submit">Crear</button>
    </form>
  );
}
```

---

## 🔄 2. Actualizar Venue con Imágenes

### React Example - Actualizar con Nuevas Imágenes

```jsx
function UpdateVenueWithImages({ venueId }) {
  const [updateData, setUpdateData] = useState({
    name: '',
    capacity: 0,
    images: []
  });

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve({
          base64: base64,
          fileName: file.name
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (event) => {
    const files = Array.from(event.target.files);
    const imagesData = await Promise.all(files.map(file => fileToBase64(file)));
    
    setUpdateData(prev => ({
      ...prev,
      images: imagesData
    }));
  };

  const handleUpdate = async () => {
    try {
      const response = await fetch(
        `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/${venueId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(updateData)
        }
      );

      const result = await response.json();
      console.log('Venue actualizado:', result);
      alert('✅ Venue actualizado. Las nuevas imágenes se agregaron a las existentes.');
      
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <h2>Actualizar Venue</h2>
      
      <input
        type="text"
        placeholder="Nuevo nombre"
        value={updateData.name}
        onChange={(e) => setUpdateData({...updateData, name: e.target.value})}
      />

      <div>
        <label>Agregar nuevas imágenes:</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
        />
        <small>Las imágenes nuevas se AGREGARÁN a las existentes</small>
      </div>

      {updateData.images.length > 0 && (
        <div>
          <p>Imágenes seleccionadas: {updateData.images.length}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {updateData.images.map((img, idx) => (
              <img 
                key={idx}
                src={`data:image/jpeg;base64,${img.base64}`}
                alt={img.fileName}
                style={{ width: '80px', height: '80px', objectFit: 'cover' }}
              />
            ))}
          </div>
        </div>
      )}

      <button onClick={handleUpdate}>Actualizar Venue</button>
    </div>
  );
}
```

### React Example - Actualizar con Imagen Única

```jsx
function UpdateVenueWithSingleImage({ venueId }) {
  const [imageBase64, setImageBase64] = useState(null);

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImageBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpdate = async () => {
    const response = await fetch(
      `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/${venueId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          imageBase64: imageBase64
        })
      }
    );

    const result = await response.json();
    console.log('Actualizado:', result);
  };

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleImageChange} />
      {imageBase64 && <img src={imageBase64} alt="Preview" style={{width: '150px'}} />}
      <button onClick={handleUpdate}>Agregar Imagen</button>
    </div>
  );
}
```

---

## 📥 3. Obtener Venue con Imágenes

### React Example - Mostrar Venue con Galería

```jsx
import { useState, useEffect } from 'react';

function VenueDetail({ venueId }) {
  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVenue();
  }, [venueId]);

  const fetchVenue = async () => {
    try {
      const response = await fetch(
        `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/${venueId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      const data = await response.json();
      setVenue(data.venue);
      setLoading(false);
      
    } catch (error) {
      console.error('Error al obtener venue:', error);
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando...</div>;
  if (!venue) return <div>Venue no encontrado</div>;

  return (
    <div>
      <h1>{venue.name}</h1>
      <p>Capacidad: {venue.capacity}</p>
      
      {/* Imagen principal */}
      {venue.mainImage && (
        <div>
          <h3>Imagen Principal:</h3>
          <img 
            src={venue.mainImage}
            alt={venue.name}
            style={{ width: '100%', maxWidth: '600px', height: 'auto' }}
          />
        </div>
      )}

      {/* Galería de todas las imágenes */}
      {venue.imageUrls && venue.imageUrls.length > 0 && (
        <div>
          <h3>Galería ({venue.imageUrls.length} imágenes):</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {venue.imageUrls.map((url, index) => (
              <div key={index}>
                <img 
                  src={url}
                  alt={`${venue.name} - Imagen ${index + 1}`}
                  style={{ 
                    width: '100%', 
                    height: '200px', 
                    objectFit: 'cover',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                  onClick={() => window.open(url, '_blank')}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mostrar mensaje si no hay imágenes */}
      {(!venue.imageUrls || venue.imageUrls.length === 0) && (
        <p>Este venue no tiene imágenes aún.</p>
      )}
    </div>
  );
}

export default VenueDetail;
```

---

## 📋 4. Listar Venues con Imágenes

### React Example - Lista de Venues con Miniaturas

```jsx
function VenuesList() {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVenues();
  }, []);

  const fetchVenues = async () => {
    try {
      const response = await fetch(
        'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues?limit=50',
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      const data = await response.json();
      setVenues(data.venues || []);
      setLoading(false);
      
    } catch (error) {
      console.error('Error:', error);
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando venues...</div>;

  return (
    <div>
      <h1>Venues Disponibles</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {venues.map(venue => (
          <div 
            key={venue.venue_id}
            style={{ 
              border: '1px solid #ddd', 
              borderRadius: '12px', 
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            {/* Imagen principal del venue */}
            {venue.mainImage ? (
              <img 
                src={venue.mainImage}
                alt={venue.name}
                style={{ 
                  width: '100%', 
                  height: '200px', 
                  objectFit: 'cover' 
                }}
              />
            ) : (
              <div style={{ 
                width: '100%', 
                height: '200px', 
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span>Sin imagen</span>
              </div>
            )}

            {/* Información del venue */}
            <div style={{ padding: '16px' }}>
              <h3>{venue.name}</h3>
              <p>📍 {venue.city || 'Ciudad no especificada'}</p>
              <p>👥 Capacidad: {venue.capacity}</p>
              
              {/* Contador de imágenes */}
              {venue.imageUrls && venue.imageUrls.length > 1 && (
                <p style={{ fontSize: '14px', color: '#666' }}>
                  📸 {venue.imageUrls.length} imágenes
                </p>
              )}

              <button 
                onClick={() => window.location.href = `/venues/${venue.venue_id}`}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Ver detalles
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VenuesList;
```

---

## 🎨 5. Componente Reutilizable - Image Uploader

### React Component

```jsx
import { useState } from 'react';

function ImageUploader({ 
  multiple = true, 
  maxFiles = 10,
  maxSizeMB = 5,
  onImagesReady 
}) {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState(null);

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      // Validar tamaño
      if (file.size > maxSizeMB * 1024 * 1024) {
        reject(new Error(`${file.name} excede el tamaño máximo de ${maxSizeMB}MB`));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve({
          base64: base64,
          fileName: file.name,
          preview: reader.result
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    
    // Validar cantidad
    if (files.length > maxFiles) {
      setError(`Máximo ${maxFiles} imágenes permitidas`);
      return;
    }

    setError(null);
    
    try {
      const imagesData = await Promise.all(files.map(file => fileToBase64(file)));
      
      const imagesForUpload = imagesData.map(img => ({
        base64: img.base64,
        fileName: img.fileName
      }));
      
      const previewsData = imagesData.map(img => img.preview);
      
      setImages(imagesForUpload);
      setPreviews(previewsData);
      
      // Notificar al componente padre
      if (onImagesReady) {
        onImagesReady(imagesForUpload);
      }
      
    } catch (err) {
      setError(err.message);
    }
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
    
    if (onImagesReady) {
      onImagesReady(images.filter((_, i) => i !== index));
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
        Imágenes del Venue:
      </label>
      
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple={multiple}
        onChange={handleFileSelect}
        style={{
          padding: '8px',
          border: '2px dashed #ccc',
          borderRadius: '4px',
          width: '100%',
          cursor: 'pointer'
        }}
      />
      
      <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
        Formatos: JPG, PNG, GIF, WEBP • Máximo {maxFiles} imágenes • Máximo {maxSizeMB}MB por imagen
      </small>

      {error && (
        <div style={{ 
          marginTop: '8px', 
          padding: '8px', 
          backgroundColor: '#fee', 
          color: '#c00',
          borderRadius: '4px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {previews.length > 0 && (
        <div style={{ 
          marginTop: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '12px'
        }}>
          {previews.map((preview, index) => (
            <div 
              key={index}
              style={{ 
                position: 'relative',
                border: '2px solid #ddd',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <img 
                src={preview}
                alt={images[index].fileName}
                style={{ 
                  width: '100%', 
                  height: '120px', 
                  objectFit: 'cover' 
                }}
              />
              <button
                onClick={() => removeImage(index)}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  backgroundColor: 'rgba(255,0,0,0.8)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
              <div style={{ 
                padding: '4px', 
                fontSize: '10px', 
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {images[index].fileName}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ImageUploader;
```

### Uso del componente:

```jsx
function CreateVenueWithUploader() {
  const [venueData, setVenueData] = useState({
    name: '',
    capacity: 0,
    images: []
  });

  const handleImagesReady = (images) => {
    setVenueData(prev => ({
      ...prev,
      images: images
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const response = await fetch(
      'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...venueData,
          ownerUserId: 'user-123'
        })
      }
    );

    const result = await response.json();
    console.log('Venue creado:', result);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Nombre del venue"
        value={venueData.name}
        onChange={(e) => setVenueData({...venueData, name: e.target.value})}
      />
      
      <input
        type="number"
        placeholder="Capacidad"
        value={venueData.capacity}
        onChange={(e) => setVenueData({...venueData, capacity: parseInt(e.target.value)})}
      />

      <ImageUploader 
        multiple={true}
        maxFiles={10}
        maxSizeMB={5}
        onImagesReady={handleImagesReady}
      />

      <button type="submit">Crear Venue</button>
    </form>
  );
}
```

---

## 📊 6. Estructura de Respuestas del API

### Response al Crear Venue:

```json
{
  "message": "Venue created successfully",
  "venue": {
    "venueId": "venue_abc123",
    "name": "Estadio Nacional",
    "capacity": 50000,
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-2.png",
    "floorCount": 0,
    "entranceCount": 0
  }
}
```

### Response al Obtener Venue:

```json
{
  "venue": {
    "venue_id": "venue_abc123",
    "name": "Estadio Nacional",
    "capacity": 50000,
    "images": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-2.png",
    "imageUrls": [
      "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-1.jpg",
      "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-2.png"
    ],
    "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-1.jpg",
    "floors": [],
    "entrances": []
  }
}
```

### Response al Listar Venues:

```json
{
  "venues": [
    {
      "venue_id": "venue_abc123",
      "name": "Estadio Nacional",
      "capacity": 50000,
      "mainImage": "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-1.jpg",
      "imageUrls": [
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-1.jpg",
        "https://doevent-venue-images.s3.amazonaws.com/venues/venue_abc123/uuid-2.png"
      ]
    }
  ],
  "count": 1,
  "hasMore": false
}
```

---

## ⚡ 7. Optimizaciones y Mejores Prácticas

### Comprimir Imágenes Antes de Enviar

```jsx
import imageCompression from 'browser-image-compression';

async function compressAndConvert(file) {
  try {
    // Opciones de compresión
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true
    };
    
    const compressedFile = await imageCompression(file, options);
    
    // Convertir a base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve({
          base64: base64,
          fileName: file.name,
          originalSize: file.size,
          compressedSize: compressedFile.size
        });
      };
      reader.readAsDataURL(compressedFile);
    });
  } catch (error) {
    console.error('Error al comprimir:', error);
    throw error;
  }
}
```

### Loading States

```jsx
function VenueFormWithLoading() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setProgress(0);

    try {
      // Simular progreso
      setProgress(30);
      
      const response = await fetch(/* ... */);
      setProgress(70);
      
      const result = await response.json();
      setProgress(100);
      
      setTimeout(() => {
        setLoading(false);
        alert('✅ Venue creado exitosamente!');
      }, 500);
      
    } catch (error) {
      setLoading(false);
      alert('❌ Error al crear venue');
    }
  };

  return (
    <div>
      {loading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <p>Subiendo imágenes...</p>
            <div style={{
              width: '200px',
              height: '10px',
              backgroundColor: '#eee',
              borderRadius: '5px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: '#4CAF50',
                transition: 'width 0.3s'
              }} />
            </div>
            <p>{progress}%</p>
          </div>
        </div>
      )}
      
      {/* Formulario aquí */}
    </div>
  );
}
```

---

## 🔒 8. Manejo de Autenticación

### Axios Instance con Token

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para agregar token automáticamente
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Uso
export const createVenue = async (venueData) => {
  const response = await api.post('/venues', venueData);
  return response.data;
};

export const updateVenue = async (venueId, updateData) => {
  const response = await api.put(`/venues/${venueId}`, updateData);
  return response.data;
};

export const getVenue = async (venueId) => {
  const response = await api.get(`/venues/${venueId}`);
  return response.data;
};

export default api;
```

---

## 🐛 9. Manejo de Errores

### Error Handler Component

```jsx
function VenueFormWithErrorHandling() {
  const [error, setError] = useState(null);

  const handleSubmit = async (venueData) => {
    try {
      setError(null);
      
      const response = await fetch(
        'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(venueData)
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear venue');
      }

      const result = await response.json();
      console.log('Éxito:', result);
      
    } catch (err) {
      setError(err.message);
      console.error('Error:', err);
    }
  };

  return (
    <div>
      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c00'
        }}>
          <strong>❌ Error:</strong> {error}
        </div>
      )}
      
      {/* Formulario aquí */}
    </div>
  );
}
```

---

## 📱 10. Ejemplo Completo - Aplicación Full

```jsx
import React, { useState, useEffect } from 'react';
import ImageUploader from './components/ImageUploader';
import api from './services/api';

function VenueManagementApp() {
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [mode, setMode] = useState('list'); // 'list', 'create', 'update', 'view'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    capacity: 0,
    latitude: 0,
    longitude: 0,
    city: '',
    country: '',
    images: []
  });

  useEffect(() => {
    if (mode === 'list') {
      fetchVenues();
    }
  }, [mode]);

  const fetchVenues = async () => {
    setLoading(true);
    try {
      const data = await api.get('/venues');
      setVenues(data.venues || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await api.post('/venues', {
        ...formData,
        ownerUserId: localStorage.getItem('userId')
      });
      
      alert('✅ Venue creado exitosamente!');
      setMode('list');
      resetForm();
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.put(`/venues/${selectedVenue.venue_id}`, formData);
      alert('✅ Venue actualizado!');
      setMode('list');
      resetForm();
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      capacity: 0,
      latitude: 0,
      longitude: 0,
      city: '',
      country: '',
      images: []
    });
    setSelectedVenue(null);
  };

  const startEdit = (venue) => {
    setSelectedVenue(venue);
    setFormData({
      name: venue.name,
      capacity: venue.capacity,
      latitude: venue.latitude || 0,
      longitude: venue.longitude || 0,
      city: venue.city || '',
      country: venue.country || '',
      images: []
    });
    setMode('update');
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Cargando...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>🏟️ Gestión de Venues</h1>

      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '20px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c00'
        }}>
          ❌ {error}
        </div>
      )}

      {/* Botones de navegación */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => setMode('list')}>📋 Ver Todos</button>
        <button onClick={() => setMode('create')} style={{ marginLeft: '10px' }}>
          ➕ Crear Nuevo
        </button>
      </div>

      {/* Lista de venues */}
      {mode === 'list' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {venues.map(venue => (
            <div key={venue.venue_id} style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              {venue.mainImage && (
                <img 
                  src={venue.mainImage}
                  alt={venue.name}
                  style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                />
              )}
              <div style={{ padding: '16px' }}>
                <h3>{venue.name}</h3>
                <p>Capacidad: {venue.capacity}</p>
                <button onClick={() => startEdit(venue)}>✏️ Editar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulario crear/actualizar */}
      {(mode === 'create' || mode === 'update') && (
        <form onSubmit={mode === 'create' ? handleCreate : handleUpdate}>
          <div style={{ maxWidth: '600px' }}>
            <h2>{mode === 'create' ? 'Crear' : 'Actualizar'} Venue</h2>

            <input
              type="text"
              placeholder="Nombre"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              style={{ width: '100%', padding: '8px', marginBottom: '12px' }}
            />

            <input
              type="number"
              placeholder="Capacidad"
              value={formData.capacity}
              onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})}
              required
              style={{ width: '100%', padding: '8px', marginBottom: '12px' }}
            />

            <input
              type="text"
              placeholder="Ciudad"
              value={formData.city}
              onChange={(e) => setFormData({...formData, city: e.target.value})}
              style={{ width: '100%', padding: '8px', marginBottom: '12px' }}
            />

            <ImageUploader 
              onImagesReady={(images) => setFormData({...formData, images})}
            />

            <div style={{ marginTop: '20px' }}>
              <button type="submit" disabled={loading}>
                {loading ? 'Guardando...' : mode === 'create' ? 'Crear' : 'Actualizar'}
              </button>
              <button 
                type="button" 
                onClick={() => { setMode('list'); resetForm(); }}
                style={{ marginLeft: '10px' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default VenueManagementApp;
```

---

## ✅ Checklist de Integración

- [ ] Instalar dependencias necesarias (axios, browser-image-compression, etc.)
- [ ] Configurar la baseURL del API en tu código
- [ ] Implementar sistema de autenticación con tokens
- [ ] Crear componente ImageUploader reutilizable
- [ ] Implementar formulario de creación de venues
- [ ] Implementar formulario de actualización de venues
- [ ] Implementar vista de detalle con galería de imágenes
- [ ] Implementar lista de venues con miniaturas
- [ ] Agregar loading states
- [ ] Agregar manejo de errores
- [ ] Implementar compresión de imágenes
- [ ] Probar con imágenes reales
- [ ] Verificar que las URLs de S3 sean accesibles
- [ ] Optimizar para dispositivos móviles

---

## 🎯 Resumen de Endpoints

| Método | Endpoint | Propósito |
|--------|----------|-----------|
| `POST` | `/venues` | Crear venue (acepta images[] o imageBase64) |
| `PUT` | `/venues/{venueId}` | Actualizar venue (acepta images[] o imageBase64) |
| `POST` | `/venues/{venueId}/images` | Agregar imagen específica |
| `GET` | `/venues/{venueId}` | Obtener venue (incluye imageUrls y mainImage) |
| `GET` | `/venues` | Listar venues (incluye imageUrls y mainImage) |

---

**Estado:** ✅ Desplegado y funcionando  
**Última actualización:** 16 de enero de 2026  
**API Base URL:** `https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev`
