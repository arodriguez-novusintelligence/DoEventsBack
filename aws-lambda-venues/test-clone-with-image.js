const fs = require('fs');
const path = require('path');

/**
 * Script de prueba para clonar venue con imagen
 * 
 * Uso:
 * 1. Coloca una imagen de prueba en el mismo directorio con nombre "test-image.jpg"
 * 2. Actualiza los valores de baseVenueId y eventId
 * 3. node test-clone-with-image.js
 */

// Configuración
const API_ENDPOINT = 'https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/clone-for-event';
const BASE_VENUE_ID = '5f728a8a-299b-4541-9c2f-d22cb143d3ad'; // Teatro Metropolitan
const EVENT_ID = 'test-event-' + Date.now();

// Leer imagen y convertir a base64
function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).substring(1);
    return `data:image/${ext};base64,${base64Image}`;
  } catch (error) {
    console.error('Error leyendo imagen:', error.message);
    return null;
  }
}

// Crear una imagen de prueba simple (1x1 pixel rojo PNG)
const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// Request body
const requestBody = {
  baseVenueId: BASE_VENUE_ID,
  eventId: EVENT_ID,
  name: 'Teatro Test con Imagen',
  imageBase64: testImageBase64,
  ticketCategories: [
    {
      id: 'cat-test-1',
      categoria: 'VIP Test',
      cantidadTickets: 10,
      valor: 100000,
      costo: 30000,
      moneda: 'COP'
    }
  ]
};

console.log('🧪 Probando clonación de venue con imagen...');
console.log('📍 Base Venue ID:', BASE_VENUE_ID);
console.log('🎫 Event ID:', EVENT_ID);
console.log('🖼️ Imagen incluida:', requestBody.imageBase64 ? 'Sí (1x1 pixel rojo)' : 'No');

// Hacer request
fetch(API_ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestBody)
})
.then(response => response.json())
.then(data => {
  console.log('\n✅ Respuesta recibida:');
  console.log(JSON.stringify(data, null, 2));
  
  if (data.venue && data.venue.images) {
    console.log('\n🎉 ¡ÉXITO! Imagen generada:');
    console.log('URL:', data.venue.images);
  } else {
    console.log('\n❌ ERROR: No se generó URL de imagen');
    console.log('Campo images:', data.venue?.images || 'undefined');
  }
})
.catch(error => {
  console.error('\n❌ Error en request:', error.message);
});

// Alternativa: Si tienes una imagen real en el directorio
// const imageFromFile = imageToBase64('./test-image.jpg');
// if (imageFromFile) {
//   requestBody.imageBase64 = imageFromFile;
// }
