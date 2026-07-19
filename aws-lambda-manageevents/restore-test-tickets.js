// Script para restaurar tickets de prueba a estado SOLD
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const dynamodb = DynamoDBDocumentClient.from(client);

const ORDER_ID = "test_yqD71A";
const TICKETS_TO_RESTORE = [
  {
    distId: "b691e1d0-616a-49de-886a-d882b0970fbf",
    createDate: "2025-09-23T23:59:05.539Z",
    ticketIds: [
      "3ef317f7-5683-4c4c-92c3-6d2bdeb64ad4",
      "2d74c3bc-1490-4762-8dd4-0a3c3c52f36a"
    ]
  },
  {
    distId: "d0de60fc-e7c5-4fbb-abd1-ae17ebba22fc",
    createDate: "2025-09-24T00:45:41.556Z",
    ticketIds: [
      "fb32f46c-a2ae-46c4-9572-d7b734d10844"
    ]
  }
];

async function restoreTickets() {
  console.log(`🔄 Restaurando tickets de la orden ${ORDER_ID} a estado SOLD...\n`);

  for (const dist of TICKETS_TO_RESTORE) {
    try {
      console.log(`📦 Procesando distribución: ${dist.distId}`);

      // Obtener la distribución actual
      const result = await dynamodb.send(
        new GetCommand({
          TableName: "TicketsDistribution",
          Key: {
            id: dist.distId,
            createDate: dist.createDate
          }
        })
      );

      if (!result.Item) {
        console.error(`❌ Distribución no encontrada: ${dist.distId}`);
        continue;
      }

      const distribution = result.Item;
      
      // Actualizar los tickets a SOLD
      const updatedTickets = distribution.tickets.map(ticket => {
        if (dist.ticketIds.includes(ticket.ticketInstanceId)) {
          console.log(`  ✓ Restaurando ticket ${ticket.ticketInstanceId} a SOLD`);
          return {
            ...ticket,
            ticketStatus: "SOLD",
            orderId: ORDER_ID,
            ownerId: "42c2e4a4-0",
            qrUrl: ticket.qrUrl || `https://ticket-qr-dev.s3.amazonaws.com/qrs/${ticket.qrCodeKey}.png`
          };
        }
        return ticket;
      });

      // Guardar la distribución actualizada
      await dynamodb.send(
        new PutCommand({
          TableName: "TicketsDistribution",
          Item: {
            ...distribution,
            tickets: updatedTickets
          }
        })
      );

      console.log(`✅ Distribución ${dist.distId} actualizada\n`);
    } catch (error) {
      console.error(`❌ Error procesando distribución ${dist.distId}:`, error.message);
    }
  }

  console.log("✅ Proceso de restauración completado!");
  console.log("\n🎫 Ahora puedes intentar el reembolso nuevamente desde la app.");
}

restoreTickets().catch(console.error);
