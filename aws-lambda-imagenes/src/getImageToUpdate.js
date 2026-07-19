const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { DEFAULT_BUCKET, buildPublicUrl, getS3Client, normalizeS3Key } = require("./mediaUtils");

const s3 = getS3Client();

exports.getImageToUpdate = async (event) => {
  let response;
  try {
    // Obtener el ID de la imagen
    const { id_evento } = event.pathParameters;

    if (!id_evento) {
      throw new Error("Es necesario el id de la imagen");
    }

    // Configuración de la consulta
    const params = {
      TableName: process.env.IMAGE_TABLE || "imagenes",
      IndexName: "eventIdIndex", // Nombre del índice secundario global (si aplica)
      KeyConditionExpression: "id_evento = :id_evento",
      ExpressionAttributeValues: {
        ":id_evento": id_evento,
      },
    };

    // Ejecutar consulta
    const result = await dynamodb.query(params).promise();

    if (!result.Items || result.Items.length === 0) {
      throw new Error("La imagen no ha sido encontrada");
    }
    const item = result.Items[0] || {};
    const bucketName = DEFAULT_BUCKET;

    const mergedKeys = [];
    const seenKeys = new Set();
    const pushKey = (rawValue) => {
      if (!rawValue) return;
      const key = normalizeS3Key(rawValue, bucketName);
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      mergedKeys.push(key);
    };

    (item.s3Keys || []).forEach(pushKey);
    (item.imagenesCargadas || []).forEach(pushKey);

    const getImageBase64 = async (bucketName, key) => {
      const params = {
        Bucket: bucketName,
        Key: key,
      };

      const data = await s3.getObject(params).promise();

      return data.Body.toString("base64");
    };
    const ImagenSecret = mergedKeys.map((key) => buildPublicUrl(key, bucketName));

    const ImagenB64 = await Promise.all(
      mergedKeys.map(async (key) => getImageBase64(bucketName, key)),
    );

    result.Items[0].imagenesCargadas = ImagenSecret;
    result.Items[0].imagenesCargadasB64 = ImagenB64;
    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result.Items),
    };
  } catch (error) {
    console.error("Error al consultar el id de la imagen:", error.message);

    // Manejo de errores
    let errorMessage = error.message;
    let statusCode = 500;

    if (error.message === "Es necesario el id de la imagen") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "La imagen no ha sido encontrada") {
      errorMessage = error.message;
      statusCode = 404;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statusDesc: errorMessage,
        statusCode,
      }),
    };
  }
  return response;
};
