// INSTANCE AWS
const AWS = require("aws-sdk");
const { DYNAMODB_REGION } = require("./awsRegion");

// UUID
const { v4: uuidv4 } = require("uuid");

AWS.config.update({ region: DYNAMODB_REGION });

// INSTANCE DYNAMODB
const docClient = new AWS.DynamoDB.DocumentClient();

const saveNotificationToDb = async (item) => {

  // CREATE SANITIZED COPY
  const sanitized = {};

  // SANITIZE INPUT
  Object.keys(item).forEach((k) => {

    // SANITIZE VALUE
    const v = item[k];

    // VALIDATE VALUE
    if (v === null || v === undefined) return;
    if (k === "userId") {
      sanitized.userId = String(v);
      return;
    }
    sanitized[k] = v;
  });

  // ENSURE REQUIRED FIELDS
  if (!sanitized.id) sanitized.id = uuidv4();
  if (!sanitized.timestamp) sanitized.timestamp = new Date().toISOString();

  // PARAMS ITEM
  const params = {
    TableName: process.env.NOTIFICATIONS_TABLE || "Notifications",
    Item: sanitized,
  };

  // PUT ITEM
  await docClient.put(params).promise();

  console.log("Notification saved to DB:", sanitized);

  // RETURN SANITIZED ITEM
  return sanitized;
};

module.exports = { saveNotificationToDb };