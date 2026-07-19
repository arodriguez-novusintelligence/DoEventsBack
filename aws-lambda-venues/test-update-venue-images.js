/**
 * Script de prueba para actualizar venue con imágenes en base64
 * Demuestra los diferentes métodos disponibles
 */

// Ejemplos de imágenes pequeñas en base64 para testing
const SAMPLE_JPG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const SAMPLE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// =============================================================================
// EJEMPLO 1: Actualizar venue con array de múltiples imágenes
// =============================================================================
async function updateVenueWithMultipleImages() {
  const venueId = "venue_abc123"; // Reemplazar con un ID real
  const apiUrl = `https://tu-api.com/venues/${venueId}`;

  const payload = {
    name: "Estadio Nacional Renovado 2026",
    capacity: 65000,
    description: "Estadio completamente renovado con nueva infraestructura",
    images: [
      {
        base64: SAMPLE_JPG_BASE64,
        fileName: "estadio-exterior-renovado.jpg"
      },
      {
        base64: SAMPLE_PNG_BASE64,
        fileName: "estadio-interior-moderno.png"
      },
      {
        base64: SAMPLE_JPG_BASE64,
        fileName: "estadio-vista-aerea.jpg"
      }
    ]
  };

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        // Agregar token de autenticación si es necesario
        // "Authorization": "Bearer YOUR_TOKEN"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("✅ Venue actualizado con múltiples imágenes:", result);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// =============================================================================
// EJEMPLO 2: Actualizar venue con imagen única (imageBase64)
// =============================================================================
async function updateVenueWithSingleImage() {
  const venueId = "venue_abc123"; // Reemplazar con un ID real
  const apiUrl = `https://tu-api.com/venues/${venueId}`;

  const payload = {
    name: "Teatro Municipal Modernizado",
    capacity: 1200,
    imageBase64: `data:image/jpeg;base64,${SAMPLE_JPG_BASE64}`
  };

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("✅ Venue actualizado con imagen única:", result);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// =============================================================================
// EJEMPLO 3: Actualizar solo campos, sin imágenes
// =============================================================================
async function updateVenueWithoutImages() {
  const venueId = "venue_abc123"; // Reemplazar con un ID real
  const apiUrl = `https://tu-api.com/venues/${venueId}`;

  const payload = {
    name: "Coliseo Cerrado",
    capacity: 15000,
    description: "Actualización solo de información, sin cambiar imágenes"
  };

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("✅ Venue actualizado sin imágenes:", result);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// =============================================================================
// EJEMPLO 4: Agregar imagen adicional sin modificar otros campos
// =============================================================================
async function addImageToVenue() {
  const venueId = "venue_abc123"; // Reemplazar con un ID real
  const apiUrl = `https://tu-api.com/venues/${venueId}/images`;

  const payload = {
    base64: SAMPLE_JPG_BASE64,
    fileName: "imagen-adicional.jpg"
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("✅ Imagen agregada al venue:", result);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// =============================================================================
// EJEMPLO 5: Convertir archivo a base64 desde el navegador
// =============================================================================
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remover el prefijo data:image/...;base64,
      const base64 = reader.result.split(',')[1];
      resolve({
        base64: base64,
        fileName: file.name
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Uso en el navegador:
async function handleFileUpload(event) {
  const file = event.target.files[0];
  const imageData = await fileToBase64(file);
  
  // Ahora puedes usar imageData en tus requests
  console.log("Imagen convertida:", imageData);
}

// =============================================================================
// EJEMPLO 6: Actualizar con imagen desde input file (frontend)
// =============================================================================
async function updateVenueFromFileInput() {
  const venueId = "venue_abc123";
  const apiUrl = `https://tu-api.com/venues/${venueId}`;
  
  // Obtener archivo del input
  const fileInput = document.getElementById('venueImage');
  const file = fileInput.files[0];
  
  if (!file) {
    console.error("No se seleccionó ningún archivo");
    return;
  }
  
  // Convertir a base64
  const imageData = await fileToBase64(file);
  
  // Crear payload
  const payload = {
    name: "Venue Actualizado",
    images: [imageData]
  };
  
  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log("✅ Venue actualizado desde archivo:", result);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// =============================================================================
// EJEMPLO 7: Reemplazar todas las imágenes con URLs directas
// =============================================================================
async function replaceAllVenueImages() {
  const venueId = "venue_abc123";
  const apiUrl = `https://tu-api.com/venues/${venueId}`;
  
  const payload = {
    name: "Venue con Nuevas Imágenes",
    // Enviar como string separado por comas reemplaza todas las imágenes
    images: "https://doevent-venue-images.s3.amazonaws.com/venues/venue_123/img1.jpg,https://doevent-venue-images.s3.amazonaws.com/venues/venue_123/img2.png"
  };
  
  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log("✅ Todas las imágenes reemplazadas:", result);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// =============================================================================
// EXPORTAR FUNCIONES
// =============================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    updateVenueWithMultipleImages,
    updateVenueWithSingleImage,
    updateVenueWithoutImages,
    addImageToVenue,
    fileToBase64,
    handleFileUpload,
    updateVenueFromFileInput,
    replaceAllVenueImages
  };
}

// =============================================================================
// RESUMEN DE COMPORTAMIENTOS
// =============================================================================
console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                   ACTUALIZAR VENUE CON IMÁGENES - GUÍA                     ║
╚════════════════════════════════════════════════════════════════════════════╝

📝 COMPORTAMIENTO AL ACTUALIZAR:

1️⃣ Enviar 'images' como ARRAY con base64:
   → Las nuevas imágenes se AGREGAN a las existentes
   → Ideal para: Agregar más fotos sin perder las anteriores

2️⃣ Enviar 'imageBase64' (string único):
   → La imagen se AGREGA a las existentes
   → Ideal para: Agregar una foto rápida

3️⃣ Enviar 'images' como STRING (URLs con comas):
   → REEMPLAZA todas las imágenes existentes
   → Ideal para: Renovar completamente las imágenes

4️⃣ Usar endpoint POST /venues/{id}/images:
   → Agrega una imagen sin modificar otros campos
   → Ideal para: Solo subir imágenes

5️⃣ No enviar campo 'images' ni 'imageBase64':
   → Las imágenes existentes se mantienen sin cambios
   → Ideal para: Actualizar otros campos del venue

📌 FORMATOS SOPORTADOS:
   jpg, jpeg, png, gif, webp, svg, bmp, tiff, ico

📌 UBICACIÓN EN S3:
   s3://doevent-venue-images/venues/{venueId}/{uuid}.{ext}

📌 URLS GENERADAS:
   https://doevent-venue-images.s3.amazonaws.com/venues/{venueId}/{uuid}.{ext}
`);
