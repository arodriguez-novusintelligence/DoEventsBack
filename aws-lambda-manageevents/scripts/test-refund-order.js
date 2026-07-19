const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

async function main() {
  const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "sa-east-1" }),
  );
  const lambda = new LambdaClient({ region: "sa-east-1" });

  const orderId = process.argv[2] || "c97b04fb-e72b-40a4-9c4b-d22fddf29a34";
  const order = (
    await ddb.send(
      new GetCommand({ TableName: "Orders-dev", Key: { order_id: orderId } }),
    )
  ).Item;

  if (!order) {
    console.log("order not found");
    return;
  }

  console.log(
    JSON.stringify(
      {
        order_id: order.order_id,
        user_id: order.user_id,
        event_id: order.event_id,
        payment_status: order.payment_status,
        total: order.total_amount ?? order.amount,
        payment_data: order.payment_data,
        payment_method: order.payment_method,
        refund_status: order.refund_status,
        tickets: (order.tickets || []).map((t) => ({
          id: t.ticket_id || t.ticketInstanceId || t.id,
          status: t.ticket_status || t.refund_status,
          price: t.price || t.purchasePrice,
        })),
      },
      null,
      2,
    ),
  );

  const now = new Date();
  const currentDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const canPayload = {
    pathParameters: { eventId: order.event_id },
    body: JSON.stringify({
      userId: order.user_id,
      orderId: order.order_id,
      currentDate,
    }),
  };
  const canInv = await lambda.send(
    new InvokeCommand({
      FunctionName: "aws-lambda-manageevent-dev-canRequestRefund",
      Payload: Buffer.from(JSON.stringify(canPayload)),
    }),
  );
  console.log(
    "canRequestRefund =>",
    Buffer.from(canInv.Payload || []).toString("utf8"),
  );

  if (process.argv.includes("--execute")) {
    const ticketIds = (order.tickets || [])
      .map((t) => t.ticket_id || t.ticketInstanceId || t.id)
      .filter(Boolean);
    const processPayload = {
      body: JSON.stringify({
        userId: order.user_id,
        orderId: order.order_id,
        ticketInstanceIds: ticketIds,
        reason: "Prueba automatica DEV - validacion flujo reembolso",
      }),
    };
    const procInv = await lambda.send(
      new InvokeCommand({
        FunctionName: "aws-lambda-manageevent-dev-processRefund",
        Payload: Buffer.from(JSON.stringify(processPayload)),
      }),
    );
    console.log(
      "processRefund =>",
      Buffer.from(procInv.Payload || []).toString("utf8"),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
