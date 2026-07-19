const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

const BUCKET_NAME = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
};

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId, floorId, elementId } = event.pathParameters;
    const body = JSON.parse(event.body);

    if (!venueId || !floorId || !elementId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "venueId, floorId and elementId are required" }),
      };
    }

    if (!body.base64 || !body.fileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "base64 and fileName are required" }),
      };
    }

    // Verificar que el elemento existe
    const elementResult = await dynamodb
      .get({
        TableName: "Venue_Element",
        Key: { elementId },
      })
      .promise();

    if (!elementResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Element not found" }),
      };
    }

    // Generar nombre único para la imagen
    const imageId = uuidv4();
    const fileExtension = body.fileName.split(".").pop().toLowerCase();
    const s3Key = `venues/${venueId}/elements/${elementId}/${imageId}.${fileExtension}`;

    // Decodificar base64 (soporta data URI o base64 puro)
    const normalizedBase64 = body.base64.includes(",")
      ? body.base64.split(",")[1]
      : body.base64;
    const imageBuffer = Buffer.from(normalizedBase64, "base64");

    // Determinar Content-Type
    const contentTypeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const contentType = contentTypeMap[fileExtension] || "image/jpeg";

    // Subir imagen a S3
    await s3
      .upload({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: contentType,
        Metadata: {
          venueId,
          floorId,
          elementId,
        },
      })
      .promise();

    // Construir URL pública
    const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;

    // Actualizar el campo image del elemento en DynamoDB
    await dynamodb
      .update({
        TableName: "Venue_Element",
        Key: { elementId },
        UpdateExpression: "SET #image = :imageUrl, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#image": "image" },
        ExpressionAttributeValues: {
          ":imageUrl": imageUrl,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Element image uploaded successfully",
        imageUrl,
        elementId,
        venueId,
        floorId,
      }),
    };
  } catch (error) {
    console.error("Error in uploadElementImageHandler:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
