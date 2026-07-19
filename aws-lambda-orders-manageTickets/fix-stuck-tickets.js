const AWS = require("aws-sdk");
AWS.config.update({ region: "us-east-1" });
const doc = new AWS.DynamoDB.DocumentClient();

const DIST_ID = "90388e27-b32d-4ed8-a779-30e55f50e162";
const CREATE_DATE = "2026-02-10T17:04:15.343Z";
const SEAT_IDS = [
  "f5d49e0f-e8d0-4f93-890a-653780a152dc",
  "2c7b5559-0f04-416c-9c7c-24292c8945a5",
];

async function releaseTickets() {
  console.log("🔄 Obteniendo distribución...");

  const distRes = await doc
    .get({
      TableName: "TicketsDistribution",
      Key: { id: DIST_ID, createDate: CREATE_DATE },
    })
    .promise();

  if (!distRes.Item) {
    console.error("❌ Distribución no encontrada");
    return;
  }

  const dist = distRes.Item;
  console.log(`📊 Total tickets: ${dist.tickets.length}`);

  let updated = 0;
  const updatedTickets = dist.tickets.map((t) => {
    if (SEAT_IDS.includes(t.seatId) && t.ticketStatus === "RESERVED") {
      console.log(`  ✓ Liberando seatId: ${t.seatId}`);
      updated++;
      return {
        ...t,
        ticketStatus: "AVAILABLE",
        orderId: null,
        ownerId: null,
        reservationExpiry: null,
      };
    }
    return t;
  });

  if (updated === 0) {
    console.log("⚠️  No se encontraron tickets RESERVED con esos seatIds");
    return;
  }

  console.log("💾 Actualizando distribución...");

  await doc
    .put({
      TableName: "TicketsDistribution",
      Item: {
        ...dist,
        tickets: updatedTickets,
      },
    })
    .promise();

  console.log(`✅ ${updated} tickets liberados`);
}

releaseTickets().catch(console.error);
