const AWS = require("aws-sdk");

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const IMAGENES_TABLE = process.env.IMAGENES_TABLE || "imagenes";
const EVENT_IMAGE_BUCKET = process.env.EVENT_IMAGE_BUCKET || "doeventimageeventbucket";

async function resolveEventCoverImage(eventId) {
  const id = String(eventId || "").trim();
  if (!id) return "";

  const result = await dynamodb
    .query({
      TableName: IMAGENES_TABLE,
      IndexName: "eventIdIndex",
      KeyConditionExpression: "id_evento = :id_evento",
      ExpressionAttributeValues: { ":id_evento": id },
    })
    .promise();

  if (!result.Items?.length) return "";
  const images = result.Items[0].imagenesCargadas;
  if (!Array.isArray(images) || images.length === 0) return "";

  let imageRef = images[0];
  let key;
  const slashIndex = imageRef.indexOf(".com/");
  if (slashIndex === -1) {
    key = imageRef;
  } else {
    key = imageRef.substring(imageRef.indexOf(".com/") + 5);
  }

  return s3.getSignedUrl("getObject", {
    Bucket: EVENT_IMAGE_BUCKET,
    Key: key,
  });
}

module.exports = { resolveEventCoverImage };
