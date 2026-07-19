const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

async function main() {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "sa-east-1" }),
  );
  const res = await client.send(
    new ScanCommand({
      TableName: "Orders-dev",
      FilterExpression: "payment_status = :a",
      ExpressionAttributeValues: { ":a": "APPROVED" },
      ProjectionExpression:
        "order_id, user_id, event_id, payment_status, total_amount, amount, payment_data, payment_method, quantity, refund_status, is_refunded",
      Limit: 20,
    }),
  );
  const items = (res.Items || []).slice(0, 5).map((o) => ({
    order_id: o.order_id,
    user_id: o.user_id,
    event_id: o.event_id,
    payment_status: o.payment_status,
    total: o.total_amount ?? o.amount,
    quantity: o.quantity,
    refund_status: o.refund_status,
    is_refunded: o.is_refunded,
    tx:
      o.payment_data?.transactionId ||
      o.payment_data?.transaction_id ||
      null,
    gateway: o.payment_data?.gateway || null,
  }));
  console.log(JSON.stringify({ count: res.Count, scanned: res.ScannedCount, items }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
