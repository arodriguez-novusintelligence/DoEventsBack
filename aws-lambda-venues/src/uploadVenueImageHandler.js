const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

const BUCKET_NAME = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId } = event.pathParameters;
    const body = JSON.parse(event.body);

    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    };

    if (!venueId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "venueId is required" }),
      };
    }

    if (!body.base64 || !body.fileName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "base64 and fileName are required" }),
      };
    }

    // Verificar que el venue existe
    const venueResult = await dynamodb
      .get({
        TableName: process.env.VENUE_TABLE || "Venues",
        Key: { venue_id: venueId },
      })
      .promise();

    if (!venueResult.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Venue not found" }),
      };
    }

    // Generar nombre único para la imagen
    const imageId = uuidv4();
    const fileExtension = body.fileName.split(".").pop();
    const s3Key = `venues/${venueId}/${imageId}.${fileExtension}`;

    // Decodificar base64
    const imageBuffer = Buffer.from(body.base64, "base64");

    // Determinar Content-Type
    const contentTypeMap = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const contentType =
      contentTypeMap[fileExtension.toLowerCase()] || "image/jpeg";

    // Subir imagen a S3 (sin ACL porque el bucket no lo permite)
    const s3Params = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: contentType,
    };

    await s3.upload(s3Params).promise();

    // Construir URL pública
    const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;

    // Actualizar el campo images del venue
    const currentImages = venueResult.Item.images || "";
    const imagesArray = currentImages ? currentImages.split(",") : [];
    imagesArray.push(imageUrl);
    const updatedImages = imagesArray.join(",");

    await dynamodb
      .update({
        TableName: process.env.VENUE_TABLE || "Venues",
        Key: { venue_id: venueId },
        UpdateExpression: "SET images = :images, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":images": updatedImages,
          ":updatedAt": new Date().toISOString(),
        },
      })
      .promise();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Image uploaded successfully",
        imageUrl,
        venueId,
      }),
    };
  } catch (error) {
    console.error("Error in uploadVenueImageHandler:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
