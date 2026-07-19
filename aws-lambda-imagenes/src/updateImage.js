const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const {
  DEFAULT_BUCKET,
  buildPublicUrl,
  getS3Client,
  normalizeS3Key,
  resolveIncomingMediaEntry,
} = require("./mediaUtils");

const s3 = getS3Client();

exports.getImage = async (event) => {
  let response;
  let imagenesCargadas = [];
  try {
    console.log("📥 Event received:", JSON.stringify(event, null, 2));

    // Obtener el ID de la imagen
    const { id_evento } = event.pathParameters;

    if (!id_evento) {
      throw new Error("Es necesario el id de la imagen");
    }

    const body = JSON.parse(event.body);
    console.log("📦 Body parsed:", JSON.stringify(body, null, 2));

    const { list_image, id_imagen, id_user, id_evento: bodyEventId } = body;

    if (bodyEventId && String(bodyEventId).trim() !== String(id_evento).trim()) {
      throw new Error("id_evento del body no coincide con el id_evento de la URL");
    }

    if (!list_image || !Array.isArray(list_image)) {
      throw new Error("list_image es requerido y debe ser un array");
    }

    // Si list_image está vacío, no cambiar nada en DynamoDB
    // Esto previene borrados silenciosos cuando la app envía actualizaciones vacías
    if (list_image.length === 0) {
      console.log("⚠️ list_image vacía - Sin cambios a DynamoDB");
      response = {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          success: true,
          message: "Sin cambios - list_image vacía",
        }),
      };
      return response;
    }

    console.log(`🎯 Updating event ${id_evento} with ${list_image.length} images`);

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

    console.log("🔍 Query result:", JSON.stringify(result, null, 2));

    const existingItem =
      result && result.Items && result.Items.length > 0 ? result.Items[0] : null;

    if (!existingItem) {
      console.log(
        "⚠️ No se encontró registro existente para este evento. Creando uno nuevo...",
      );
      // No hay registro existente, se creará uno nuevo
      var Imagenes = [];
      var id = `ImagenesEvento${Date.now()}`;
    } else {
      // Registro existente encontrado
      var Imagenes = existingItem.imagenesCargadas || [];
      var id = existingItem.id;
      console.log(`✅ Registro encontrado: ${id}`);
      console.log("📸 Imágenes existentes:", Imagenes);
    }
    const BUCKET = DEFAULT_BUCKET;
    const existingS3Keys = new Set();

    (existingItem && existingItem.s3Keys ? existingItem.s3Keys : []).forEach((rawKey) => {
      const key = normalizeS3Key(rawKey, BUCKET);
      if (key) existingS3Keys.add(key);
    });

    Imagenes.forEach((rawUrl) => {
      const key = normalizeS3Key(rawUrl, BUCKET);
      if (key) existingS3Keys.add(key);
    });

    const deleteImage = async (bucketName, key) => {
      await s3
        .deleteObject({
          Bucket: bucketName,
          Key: key,
        })
        .promise();
    };

    const uploadedS3Keys = [];
    const nextPublicUrls = [];

    if (list_image.length > 0) {
      console.log(`🖼️ Uploading ${list_image.length} images...`);
      for (let index = 0; index < list_image.length; index += 1) {
        const resolved = resolveIncomingMediaEntry({
          entry: list_image[index],
          eventId: id_evento,
          index,
          bucketName: BUCKET,
        });

        if (!resolved) {
          throw new Error(
            `Image ${index + 1} no contiene referencia S3/URL ni base64 valido`,
          );
        }

        if (resolved.type === "upload") {
          await s3
            .putObject({
              Bucket: BUCKET,
              Key: resolved.s3Key,
              Body: resolved.body,
              ContentType: resolved.contentType,
              Metadata: {
                eventId: String(id_evento),
              },
            })
            .promise();
        }

        if (resolved.s3Key) {
          uploadedS3Keys.push(resolved.s3Key);
          nextPublicUrls.push(buildPublicUrl(resolved.s3Key, BUCKET));
        } else if (resolved.publicUrl) {
          nextPublicUrls.push(resolved.publicUrl);
        }
      }

      console.log("✅ All images processed successfully");
    }

    const nextS3KeySet = new Set(uploadedS3Keys);
    const staleS3Keys = [...existingS3Keys].filter((key) => !nextS3KeySet.has(key));

    if (staleS3Keys.length) {
      console.log("🧹 Removing stale images:", staleS3Keys);
      await Promise.all(
        staleS3Keys.map(async (key) => {
          try {
            await deleteImage(BUCKET, key);
          } catch (deleteError) {
            console.warn(`⚠️ No se pudo eliminar ${key}:`, deleteError.message);
          }
        }),
      );
    }

    imagenesCargadas = nextPublicUrls;

    console.log("imagenesCargadas", imagenesCargadas);
    const actualizarImagenes = {
      imagenesCargadas: imagenesCargadas, // URLs públicas (compatibilidad con frontend)
      s3Keys: uploadedS3Keys, // Keys puras de S3 (uso interno)
      id_evento: id_evento,
    };
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    for (const [key, value] of Object.entries(actualizarImagenes)) {
      if (value !== undefined && value !== null) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }

    if (updateExpressions.length > 0) {
      const updateParams = {
        TableName: process.env.IMAGE_TABLE || "imagenes",
        Key: { id: id },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      };

      console.log(
        "💾 Updating DynamoDB with params:",
        JSON.stringify(updateParams, null, 2),
      );
      await dynamodb.update(updateParams).promise();
      console.log("✅ DynamoDB updated successfully");
    }

    const eventsTable = process.env.EVENTS_TABLE || process.env.EVENT_TABLE;
    if (eventsTable && imagenesCargadas[0]) {
      try {
        await dynamodb
          .update({
            TableName: eventsTable,
            Key: { id: id_evento },
            UpdateExpression: "SET imagen = :img",
            ExpressionAttributeValues: { ":img": imagenesCargadas[0] },
          })
          .promise();
        console.log(`✅ Evento ${id_evento} sincronizado con nueva portada`);
      } catch (syncError) {
        console.warn(`⚠️ No se pudo sincronizar portada en evento: ${syncError.message}`);
      }
    }

    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        rquid: id,
      },
      body: JSON.stringify({
        success: true,
        message: "Imagenes actualizadas correctamente",
      }),
    };
  } catch (error) {
    console.error("❌ Error al actualizar imágenes:", error);
    console.error("Error stack:", error.stack);
    console.error("Error message:", error.message);

    // Manejo de errores
    let errorMessage = error.message || "Error desconocido";
    let statusCode = 500;

    if (error.message === "Es necesario el id de la imagen") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "La imagen no ha sido encontrada") {
      errorMessage = error.message;
      statusCode = 404;
    } else if (
      error.message &&
      (error.message.includes("is missing") ||
        error.message.includes("base64 valido"))
    ) {
      statusCode = 400;
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
