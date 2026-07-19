/**
 * Repara lugares DEV cuyo campo images quedó vacío tras importar foto de galería.
 *
 * Uso:
 *   node scripts/repair-venue-images.js --stage dev --dry-run
 *   node scripts/repair-venue-images.js --stage dev
 */
const AWS = require("aws-sdk");
const { copyGalleryImagesToVenue } = require("../src/profileGalleryCopy");

const stage = process.argv.includes("--stage")
  ? process.argv[process.argv.indexOf("--stage") + 1]
  : "dev";
const dryRun = process.argv.includes("--dry-run");

const suffix = stage === "dev" ? "-dev" : stage === "qa" ? "-qa" : "";
const region = stage === "dev" ? "sa-east-1" : stage === "qa" ? "us-east-2" : "us-east-1";
const TABLE = `Venues${suffix}`;

process.env.PROFILE_BUCKET =
  stage === "dev" ? "doevents-profile-media-dev" : "doevents-profile-media-qa";
process.env.PROFILE_BUCKET_REGION =
  stage === "dev" ? "sa-east-1" : "us-east-2";
process.env.VENUE_IMAGES_BUCKET = "doevent-venue-images";
process.env.ENTITY_MEDIA_REGION = "us-east-1";
process.env.CLIENT_TABLE = `Client${suffix}`;
process.env.DYNAMODB_REGION = region;

const dynamodb = new AWS.DynamoDB.DocumentClient({ region });

async function repairVenue(item) {
  const venueId = item.venue_id;
  const ownerUserId = item.ownerUserId;
  const images = String(item.images || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (images.length || !ownerUserId) {
    return { venueId, changed: false };
  }

  const client = await dynamodb
    .get({ TableName: process.env.CLIENT_TABLE, Key: { id: ownerUserId } })
    .promise();
  const gallery = Array.isArray(client.Item?.profileGallery)
    ? client.Item.profileGallery
    : [];
  const cover = gallery.find((entry) => entry?.isCover) || gallery[0];
  if (!cover?.imageId) {
    return { venueId, changed: false, reason: "no-gallery" };
  }

  if (dryRun) {
    console.log(`[dry-run] ${venueId} import gallery image ${cover.imageId}`);
    return { venueId, changed: true, dryRun: true };
  }

  const copied = await copyGalleryImagesToVenue(ownerUserId, venueId, [
    {
      imageId: cover.imageId,
      key: cover.key,
      url: cover.url || cover.publicUrl,
    },
  ]);

  if (!copied.length) {
    return { venueId, changed: false, reason: "copy-failed" };
  }

  await dynamodb
    .update({
      TableName: TABLE,
      Key: { venue_id: venueId },
      UpdateExpression: "SET images = :images, updatedAt = :now",
      ExpressionAttributeValues: {
        ":images": copied.join(","),
        ":now": new Date().toISOString(),
      },
    })
    .promise();

  console.log(`[fixed] ${venueId} (${item.name || "sin nombre"}) -> ${copied[0]}`);
  return { venueId, changed: true };
}

async function main() {
  let lastKey;
  let fixed = 0;
  let scanned = 0;

  do {
    const page = await dynamodb
      .scan({ TableName: TABLE, ExclusiveStartKey: lastKey })
      .promise();

    for (const item of page.Items || []) {
      scanned += 1;
      if (String(item.status || "").toLowerCase() === "deleted") continue;
      const result = await repairVenue(item);
      if (result.changed) fixed += 1;
    }

    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Listo. Escaneados: ${scanned}. Reparados: ${fixed}. Stage: ${stage}. Dry-run: ${dryRun}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
