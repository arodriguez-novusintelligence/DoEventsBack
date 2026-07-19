const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

const tableName = (envKey, fallback) => process.env[envKey] || fallback;

const venueTable = () => tableName("VENUE_TABLE", "Venues");

module.exports = { dynamodb, tableName, venueTable };
