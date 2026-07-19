const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const {
  DEFAULT_BUCKET,
  getS3Client,
  resolveIncomingMediaEntry,
} = require("./mediaUtils");

const s3 = getS3Client();

exports.addimagenes = async (event) => {
  const TableName = process.env.TABLE_NAME;
  const rquid = v4();
  const id = rquid.substring(0, 10);

  const { id_evento, id_imagen, list_image, id_user } = JSON.parse(event.body);
  const BUCKET = DEFAULT_BUCKET;

  let response;

  try {
    if (!id_evento) {
      throw new Error("id_evento es requerido");
    }

    if (!Array.isArray(list_image)) {
      throw new Error("list_image es requerido y debe ser un array");
    }

    // Subir imágenes a S3
    const imagenesCargadas = [];
    const s3Keys = [];

    for (let index = 0; index < list_image.length; index += 1) {
      const resolved = resolveIncomingMediaEntry({
        entry: list_image[index],
        eventId: id_evento,
        index,
        bucketName: BUCKET,
      });

      if (!resolved) {
        throw new Error(`Imagen ${index + 1} no contiene una referencia ni base64 valido`);
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
        s3Keys.push(resolved.s3Key);
      }

      if (resolved.publicUrl) {
        imagenesCargadas.push(resolved.publicUrl);
      }
    }

    const tableName = TableName || "imagenes";
    const existingQuery = await dynamoDb
      .query({
        TableName: tableName,
        IndexName: "eventIdIndex",
        KeyConditionExpression: "id_evento = :id_evento",
        ExpressionAttributeValues: { ":id_evento": id_evento },
        Limit: 1,
      })
      .promise();

    const existingItem = existingQuery.Items?.[0];
    if (existingItem) {
      const mergedUrls = [
        ...(existingItem.imagenesCargadas || []),
        ...imagenesCargadas,
      ];
      const mergedKeys = [...(existingItem.s3Keys || []), ...s3Keys];
      await dynamoDb
        .update({
          TableName: tableName,
          Key: { id: existingItem.id },
          UpdateExpression: "SET imagenesCargadas = :urls, s3Keys = :keys",
          ExpressionAttributeValues: {
            ":urls": mergedUrls,
            ":keys": mergedKeys,
          },
        })
        .promise();
    } else {
      const dbParams = {
        TableName: tableName,
        Item: {
          id,
          id_imagen,
          imagenesCargadas,
          s3Keys,
          id_evento,
          id_user,
        },
      };
      await dynamoDb.put(dbParams).promise();
    }

    response = {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Imagen cargada e información guardada correctamente",
        data: imagenesCargadas,
      }),
    };
  } catch (error) {
    let errorMessage = "Error interno del servidor";
    let errorDescription = error.message;
    let statusCode = 500;

    if (
      error.code === "InvalidParameter" ||
      error.message === "id_evento es requerido" ||
      error.message === "list_image es requerido y debe ser un array" ||
      error.message.includes("base64 valido")
    ) {
      errorMessage = "Parámetros inválidos";
      statusCode = 400;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: errorMessage,
        desc: errorDescription,
        data: [],
      }),
    };
  }
  return response;
};
