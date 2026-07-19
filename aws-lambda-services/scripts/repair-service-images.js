/**
 * Repara servicios QA/prod cuyo profileImageUrl apunta al bucket privado de perfil.
 * Copia las imágenes al bucket público de entidades y actualiza DynamoDB.
 *
 * Uso:
 *   node scripts/repair-service-images.js --stage qa --dry-run
 *   node scripts/repair-service-images.js --stage qa
 */
const AWS = require("aws-sdk");

const stage = process.argv.includes("--stage")
  ? process.argv[process.argv.indexOf("--stage") + 1]
  : "qa";
const dryRun = process.argv.includes("--dry-run");

const suffix = stage === "qa" ? "-qa" : stage === "dev" ? "-dev" : "";
const region =
  stage === "dev" ? "sa-east-1" : stage === "qa" ? "us-east-2" : "us-east-1";
const TABLE = `ServiceProviders${suffix}`;

process.env.PROFILE_BUCKET =
  stage === "dev"
    ? "doevents-profile-media-dev"
    : stage === "qa"
      ? "doevents-profile-media-qa"
      : "doeventprofileimagesbucket";
process.env.PROFILE_BUCKET_REGION =
  stage === "dev" ? "sa-east-1" : stage === "qa" ? "us-east-2" : "us-east-1";
process.env.ENTITY_MEDIA_BUCKET = "doevent-venue-images";
process.env.ENTITY_MEDIA_REGION = "us-east-1";
process.env.DYNAMODB_REGION = region;
process.env.CLIENT_TABLE = `Client${suffix}`;

const {
  persistProfileImageToEntity,
  persistGalleryToEntity,
  isProfileBucketReference,
} = require("../src/entityMedia");

const dynamodb = new AWS.DynamoDB.DocumentClient({ region });

async function repairItem(item) {
  const serviceId = item.serviceId;
  const userId = item.userId;
  const entityPrefix = `services/${serviceId}`;
  const needsProfile = item.profileImageUrl && isProfileBucketReference(item.profileImageUrl);
  const gallery = Array.isArray(item.gallery) ? item.gallery : [];
  const needsGallery = gallery.some((url) => isProfileBucketReference(url));

  if (!needsProfile && !needsGallery) {
    return { serviceId, changed: false };
  }

  const profileImageUrl = needsProfile
    ? await persistProfileImageToEntity(userId, entityPrefix, item.profileImageUrl)
    : item.profileImageUrl;
  const nextGallery = needsGallery
    ? await persistGalleryToEntity(userId, entityPrefix, gallery)
    : gallery;

  if (dryRun) {
    console.log(`[dry-run] ${serviceId}: profile=${Boolean(needsProfile)} gallery=${Boolean(needsGallery)}`);
    return { serviceId, changed: true, dryRun: true };
  }

  await dynamodb
    .update({
      TableName: TABLE,
      Key: { serviceId },
      UpdateExpression: "SET profileImageUrl = :img, gallery = :gallery, updatedAt = :now",
      ExpressionAttributeValues: {
        ":img": profileImageUrl,
        ":gallery": nextGallery.length ? nextGallery : [profileImageUrl],
        ":now": new Date().toISOString(),
      },
    })
    .promise();

  console.log(`[fixed] ${serviceId} (${item.name || "sin nombre"})`);
  return { serviceId, changed: true };
}

async function main() {
  let lastKey;
  let fixed = 0;
  let scanned = 0;

  do {
    const page = await dynamodb
      .scan({
        TableName: TABLE,
        ExclusiveStartKey: lastKey,
      })
      .promise();

    for (const item of page.Items || []) {
      scanned += 1;
      if (item.status === "deleted") continue;
      const result = await repairItem(item);
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
