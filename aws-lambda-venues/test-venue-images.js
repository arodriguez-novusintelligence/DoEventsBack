// Script de prueba para el sistema de imágenes de venues
// Ejecutar: node test-venue-images.js

const fs = require("fs");
const path = require("path");

// Configuración
const API_URL = "https://TU-API-GATEWAY-URL/dev"; // Cambiar después del deploy
const VENUE_ID = "test-venue-123"; // Cambiar por un venueId real

// Función para convertir imagen a base64
function imageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
}

// Test 1: Crear venue certificado con imágenes
async function testCreateCertifiedVenue() {
  console.log("\n🧪 Test 1: Crear Venue Certificado con Imágenes");
  console.log("=================================================");

  // Imagen de prueba 1x1 pixel en PNG (base64)
  const testImageBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  const venueData = {
    name: "Estadio Nacional Test",
    ownerUserId: "test-user-123",
    isCertified: true,
    city: "Santiago",
    country: "Chile",
    capacity: 50000,
    type: "stadium",
    address: "Av. Grecia 2001",
    images: [
      {
        fileName: "estadio-principal.png",
        base64: testImageBase64,
      },
      {
        fileName: "estadio-vista-aerea.png",
        base64: testImageBase64,
      },
    ],
  };

  console.log(
    "Request:",
    JSON.stringify(
      {
        ...venueData,
        images: [
          { fileName: "estadio-principal.png", base64: "base64-data..." },
          { fileName: "estadio-vista-aerea.png", base64: "base64-data..." },
        ],
      },
      null,
      2
    )
  );

  console.log("\nPara ejecutar:");
  console.log(`curl -X POST ${API_URL}/venues \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '${JSON.stringify(venueData)}'`);
  console.log("\n✅ El venue se creará con las imágenes ya cargadas en S3");
  console.log("✅ Copiar venueId del response para los siguientes tests\n");
}

// Test 2: Agregar imagen adicional a venue existente
async function testUploadImage() {
  console.log("\n🧪 Test 2: Agregar Imagen Adicional al Venue");
  console.log("=============================================");

  // Crear una imagen de prueba simple (1x1 pixel rojo en PNG)
  const testImageBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  const imageData = {
    fileName: "nueva-vista.png",
    base64: testImageBase64,
  };

  console.log(
    "Request:",
    JSON.stringify({ ...imageData, base64: "base64-data..." }, null, 2)
  );
  console.log("\nPara ejecutar:");
  console.log(`curl -X POST ${API_URL}/venues/${VENUE_ID}/images \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '${JSON.stringify(imageData)}'`);
  console.log("\n✅ El response contendrá la URL pública de la imagen");
  console.log('✅ La imagen se agregará al campo "images" del venue\n');
}

// Test 3: Crear venue con imagen desde archivo local
async function testUploadRealImage(imagePath) {
  console.log("\n🧪 Test 3: Crear Venue con Imagen Real desde Archivo");
  console.log("====================================================");

  if (!fs.existsSync(imagePath)) {
    console.log(`❌ Archivo no encontrado: ${imagePath}`);
    console.log("Proporciona una ruta válida a una imagen .jpg o .png");
    return;
  }

  const imageBase64 = imageToBase64(imagePath);
  const fileName = path.basename(imagePath);

  const venueData = {
    name: "Estadio con Imagen Real",
    ownerUserId: "test-user-123",
    isCertified: true,
    city: "Lima",
    country: "Peru",
    capacity: 40000,
    images: [
      {
        fileName: fileName,
        base64: imageBase64,
      },
    ],
  };

  console.log(`Imagen: ${fileName}`);
  console.log(`Tamaño base64: ${imageBase64.length} caracteres`);
  console.log(
    `Tamaño estimado: ${Math.round((imageBase64.length * 0.75) / 1024)} KB`
  );

  // Guardar en archivo para usar con curl
  const outputFile = "create-venue-with-image.json";
  fs.writeFileSync(outputFile, JSON.stringify(venueData, null, 2));

  console.log(`\n✅ Request guardado en: ${outputFile}`);
  console.log("\nPara ejecutar:");
  console.log(`curl -X POST ${API_URL}/venues \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d @${outputFile}`);
  console.log("");
}

// Test 4: Obtener venue con imágenes
async function testGetVenueWithImages() {
  console.log("\n🧪 Test 4: Obtener Venue con Imágenes");
  console.log("======================================");

  console.log("Para ejecutar:");
  console.log(`curl ${API_URL}/venues/${VENUE_ID}`);
  console.log('\nEl campo "images" contendrá las URLs separadas por comas');
  console.log("\nEjemplo de response:");
  console.log(
    JSON.stringify(
      {
        venueId: VENUE_ID,
        name: "Estadio Nacional Test",
        isCertified: true,
        images:
          "https://doevent-venue-images.s3.amazonaws.com/venues/test-venue-123/img1.png,https://doevent-venue-images.s3.amazonaws.com/venues/test-venue-123/img2.jpg",
      },
      null,
      2
    )
  );
  console.log("");
}

// Test 5: Actualizar certificación
async function testUpdateCertification() {
  console.log("\n🧪 Test 5: Actualizar Certificación");
  console.log("====================================");

  const updateData = {
    isCertified: true,
  };

  console.log("Request:", JSON.stringify(updateData, null, 2));
  console.log("\nPara ejecutar:");
  console.log(`curl -X PUT ${API_URL}/venues/${VENUE_ID} \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '${JSON.stringify(updateData)}'`);
  console.log("");
}

// Test 6: Verificar acceso público de imagen
async function testPublicImageAccess() {
  console.log("\n🧪 Test 6: Verificar Acceso Público");
  console.log("====================================");

  const exampleImageUrl = `https://doevent-venue-images.s3.amazonaws.com/venues/${VENUE_ID}/example-img-uuid.jpg`;

  console.log(
    "Después de subir una imagen, copiar la URL del response y probar:"
  );
  console.log(`\ncurl -I ${exampleImageUrl}`);
  console.log("\nDebe retornar HTTP 200 sin requerir autenticación");
  console.log("También puedes abrir la URL directamente en el navegador");
  console.log("");
}

// Función principal
function main() {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  Test Suite: Sistema de Imágenes de Venues     ║");
  console.log("╚══════════════════════════════════════════════════╝");

  console.log("\n📝 Configuración actual:");
  console.log(`   API URL: ${API_URL}`);
  console.log(`   Venue ID: ${VENUE_ID}`);
  console.log("\n⚠️  Recuerda actualizar API_URL después del deploy");
  console.log('   serverless deploy --verbose | grep "ServiceEndpoint"');

  // Ejecutar todos los tests
  testCreateCertifiedVenue();
  testUploadImage();

  // Obtener ruta de imagen desde argumentos
  const imagePath = process.argv[2];
  if (imagePath) {
    testUploadRealImage(imagePath);
  } else {
    console.log("\n💡 Para probar con una imagen real:");
    console.log("   node test-venue-images.js ruta/a/tu/imagen.jpg");
    console.log("");
  }

  testGetVenueWithImages();
  testUpdateCertification();
  testPublicImageAccess();

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  ✅ Todos los comandos de prueba generados      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
}

// Ejecutar
main();
