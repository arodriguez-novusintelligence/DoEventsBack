const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Obtiene la URL pública de la primera imagen de un evento.
 * El bucket doeventimageeventbucket es público, por lo que no se requiere firma.
 * @param {string} eventId - ID del evento
 * @returns {Promise<string|null>} URL pública de la imagen o null si no hay imagen
 */
const getEventImageUrl = async (eventId) => {
  if (!eventId) {
    console.log("⚠️ getEventImageUrl: eventId no proporcionado");
    return null;
  }

  try {
    console.log(`🖼️ Consultando imagen para evento ${eventId}...`);

    // Buscar imágenes del evento en la tabla imagenes
    const params = {
      TableName: "imagenes",
      IndexName: "eventIdIndex",
      KeyConditionExpression: "id_evento = :id_evento",
      ExpressionAttributeValues: {
        ":id_evento": eventId,
      },
    };

    const result = await dynamodb.query(params).promise();

    if (!result.Items || result.Items.length === 0) {
      console.log(`⚠️ No se encontraron imágenes para el evento ${eventId}`);
      return null;
    }

    const imageRecord = result.Items[0];
    const imagenesCargadas = imageRecord.imagenesCargadas;

    if (!imagenesCargadas || imagenesCargadas.length === 0) {
      console.log(`⚠️ El evento ${eventId} no tiene imágenes cargadas`);
      return null;
    }

    // Tomar la primera imagen
    const primeraImagen = imagenesCargadas[0];

    // Extraer la key del bucket (quitar el prefijo del dominio si existe)
    let key;
    const posicionInicial = primeraImagen.indexOf(".com/");
    if (posicionInicial === -1) {
      // Ya es solo la key
      key = primeraImagen;
    } else {
      // Extraer la key después de .com/
      key = primeraImagen.substring(posicionInicial + 5);
    }

    console.log(`🔑 Key extraída: ${key}`);

    // El bucket doeventimageeventbucket es público — usar URL pública directa
    // para que WhatsApp CDN y otros servicios puedan acceder sin restricciones
    const bucketName = process.env.IMAGE_BUCKET || "doeventimageeventbucket";
    const publicUrl = `https://${bucketName}.s3.amazonaws.com/${key}`;

    console.log(`✅ URL pública generada para evento ${eventId}`);
    return publicUrl;
  } catch (error) {
    console.error(
      `❌ Error obteniendo imagen del evento ${eventId}:`,
      error.message
    );
    return null;
  }
};

module.exports = { getEventImageUrl };
