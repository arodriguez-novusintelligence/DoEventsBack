const DISPLAY_COUNTER_KEY = "__DISPLAY_ORDER_COUNTER__";

async function nextDisplayOrderId(doc, tableName) {
  try {
    const result = await doc
      .update({
        TableName: tableName,
        Key: { order_id: DISPLAY_COUNTER_KEY },
        UpdateExpression: "ADD display_counter :inc",
        ExpressionAttributeValues: { ":inc": 1 },
        ReturnValues: "UPDATED_NEW",
      })
      .promise();
    const value = Number(result.Attributes?.display_counter || 1);
    return String(value).padStart(10, "0");
  } catch (error) {
    if (error.code !== "ValidationException" && error.code !== "ResourceNotFoundException") {
      try {
        await doc
          .put({
            TableName: tableName,
            Item: {
              order_id: DISPLAY_COUNTER_KEY,
              display_counter: 1,
              record_type: "SYSTEM_COUNTER",
            },
            ConditionExpression: "attribute_not_exists(order_id)",
          })
          .promise();
        return "0000000001";
      } catch (putError) {
        if (putError.code !== "ConditionalCheckFailedException") throw putError;
        const retry = await doc
          .update({
            TableName: tableName,
            Key: { order_id: DISPLAY_COUNTER_KEY },
            UpdateExpression: "ADD display_counter :inc",
            ExpressionAttributeValues: { ":inc": 1 },
            ReturnValues: "UPDATED_NEW",
          })
          .promise();
        return String(Number(retry.Attributes?.display_counter || 1)).padStart(10, "0");
      }
    }
    throw error;
  }
}

function generateDisplayTicketId() {
  const ts = Date.now().toString();
  const rand = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `${ts}${rand}`.slice(-18).padStart(18, "0");
}

module.exports = {
  nextDisplayOrderId,
  generateDisplayTicketId,
};
