const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

async function main() {
  const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "sa-east-1" }),
  );
  const lambda = new LambdaClient({ region: "sa-east-1" });

  // Find ticket order ~200k not refunded
  const scan = await ddb.send(
    new ScanCommand({
      TableName: "Orders-dev",
      FilterExpression:
        "payment_status = :a AND attribute_exists(event_id) AND (total_amount = :t OR amount = :t)",
      ExpressionAttributeValues: { ":a": "APPROVED", ":t": 200000 },
      Limit: 50,
    }),
  );

  const candidates = (scan.Items || []).filter(
    (o) =>
      !o.is_refunded &&
      String(o.refund_status || "").toUpperCase() !== "COMPLETED" &&
      String(o.refund_status || "").toUpperCase() !== "PENDING" &&
      !String(o.order_id || "").startsWith("SVC-") &&
      !String(o.order_id || "").startsWith("VEN-"),
  );

  console.log(
    "candidates200k",
    candidates.slice(0, 5).map((o) => ({
      order_id: o.order_id,
      user_id: o.user_id,
      total: o.total_amount ?? o.amount,
      tx: o.payment_data?.transactionId || null,
      payment_data_keys: Object.keys(o.payment_data || {}),
      tickets: (o.tickets || []).length,
    })),
  );

  // Smoke invoke API-shaped body for missing order => 404 after module load
  const payload = {
    body: JSON.stringify({
      userId: "test-user",
      orderId: "order-does-not-exist-123",
    }),
  };
  const inv = await lambda.send(
    new InvokeCommand({
      FunctionName: "aws-lambda-manageevent-dev-processRefund",
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  const raw = Buffer.from(inv.Payload || []).toString("utf8");
  console.log("invokeMissingOrder", {
    functionError: inv.FunctionError || null,
    response: raw.slice(0, 500),
  });

  // Free order soft test: canRequestRefund only (no writes)
  const free = (
    await ddb.send(
      new ScanCommand({
        TableName: "Orders-dev",
        FilterExpression: "payment_status = :a AND (total_amount = :z OR amount = :z)",
        ExpressionAttributeValues: { ":a": "APPROVED", ":z": 0 },
        Limit: 20,
      }),
    )
  ).Items?.[0];

  if (free) {
    const canPayload = {
      pathParameters: { eventId: free.event_id },
      body: JSON.stringify({ userId: free.user_id, orderId: free.order_id }),
    };
    const canInv = await lambda.send(
      new InvokeCommand({
        FunctionName: "aws-lambda-manageevent-dev-canRequestRefund",
        Payload: Buffer.from(JSON.stringify(canPayload)),
      }),
    );
    console.log("canRequestRefundFree", {
      functionError: canInv.FunctionError || null,
      response: Buffer.from(canInv.Payload || []).toString("utf8").slice(0, 800),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
